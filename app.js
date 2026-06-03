// 🌍 PODKŁADY MAPOWE
const baseLayers = {
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }),
    "Satelita (Esri)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri' }),
    "Topograficzna": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© OpenTopoMap' }),
    "Ciemny (CartoDB)": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' })
};

const map = L.map('map', {
    layers: [baseLayers["OpenStreetMap"]],
    attributionControl: true
}).setView([52.0689, 19.4797], 6);

map.attributionControl.addAttribution('Źródło danych: IMGW-PIB');

// 🗂️ GRUPY WARSTW POMIAROWYCH
const layers = {
    temperature: L.layerGroup(),
    ground_temp: L.layerGroup(),
    tmin: L.layerGroup(),
    tmax: L.layerGroup(),
    wind: L.layerGroup(),
    wind_max: L.layerGroup(),
    precipitation: L.layerGroup(),
    pressure: L.layerGroup(),
    humidity: L.layerGroup()
};
layers.temperature.addTo(map);

// PANEL WYBORU WARSTW Z PEŁNYMI I JAWNYMI NAZWAMI KLUCZY
L.control.layers(baseLayers, {
    "Temperatura powietrza (Ta)": layers.temperature,
    "Temperatura przy gruncie (Tg)": layers.ground_temp,
    "Temperatura minimalna (Tmin_hour)": layers.tmin,
    "Temperatura maksymalna (Tmax_hour)": layers.tmax,
    "Średnia prędkość wiatru": layers.wind,
    "Maksymalne porywy wiatru": layers.wind_max,
    "Suma opadu (24h)": layers.precipitation,
    "Ciśnienie atmosferyczne (Po)": layers.pressure,
    "Wilgotność względna (Rh)": layers.humidity
}, { collapsed: false }).addTo(map);

// 🎚️ PANEL PRZEZROCZYSTOŚCI
const opacityControl = L.control({ position: 'topright' });
opacityControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'opacity-control-panel');
    div.innerHTML = `
        <label for="bg-opacity-slider">Przeźroczystość: <span id="opacity-pct">100%</span></label>
        <input type="range" id="bg-opacity-slider" min="0" max="1" step="0.1" value="1">
    `;
    return div;
};
opacityControl.addTo(map);

document.getElementById('bg-opacity-slider').addEventListener('input', function(e) {
    const opacityValue = parseFloat(e.target.value);
    document.getElementById('opacity-pct').innerText = `${Math.round(opacityValue * 100)}%`;
    Object.values(baseLayers).forEach(layer => layer.setOpacity(opacityValue));
});

let imgwBazaDanych = {};
let dostepneKlucze = [];

// 🎨 UNIWERSALNA SKALA TERMICZNA OD -40°C DO 40°C CO 5°C
const tempScale = [
    { t: 40,  r: 145, g: 0,   b: 24  }, { t: 35,  r: 180, g: 25,  b: 45  }, { t: 30,  r: 255, g: 50,  b: 40  },
    { t: 25,  r: 255, g: 165, b: 40  }, { t: 20,  r: 255, g: 240, b: 60  }, { t: 15,  r: 190, g: 230, b: 80  },
    { t: 10,  r: 55,  g: 160, b: 50  }, { t: 5,   r: 130, g: 235, b: 165 }, { t: 0,   r: 215, g: 255, b: 255 },
    { t: -5,  r: 160, g: 215, b: 250 }, { t: -10, r: 90,  g: 155, b: 242 }, { t: -15, r: 45,  g: 85,  b: 220 },
    { t: -20, r: 40,  g: 30,  b: 200 }, { t: -25, r: 130, g: 40,  b: 225 }, { t: -30, r: 210, g: 100, b: 245 },
    { t: -35, r: 160, g: 110, b: 150 }, { t: -40, r: 120, g: 85,  b: 105 }
];

function getTemperatureStyle(temp) {
    let t = parseFloat(temp);
    if (isNaN(t)) return { bg: 'rgba(241, 245, 249, 0.95)' };
    
    const sortedScale = [...tempScale].sort((a, b) => a.t - b.t);
    if (t <= sortedScale[0].t) return { bg: `rgba(${sortedScale[0].r}, ${sortedScale[0].g}, ${sortedScale[0].b}, 0.95)` };
    if (t >= sortedScale[sortedScale.length - 1].t) return { bg: `rgba(${sortedScale[sortedScale.length - 1].r}, ${sortedScale[sortedScale.length - 1].g}, ${sortedScale[sortedScale.length - 1].b}, 0.95)` };

    let lower = sortedScale[0], upper = sortedScale[sortedScale.length - 1];
    for (let i = 0; i < sortedScale.length - 1; i++) {
        if (t >= sortedScale[i].t && t <= sortedScale[i+1].t) {
            lower = sortedScale[i]; upper = sortedScale[i+1]; break;
        }
    }
    const fraction = (t - lower.t) / (upper.t - lower.t);
    return { bg: `rgba(${Math.round(lower.r + fraction * (upper.r - lower.r))}, ${Math.round(lower.g + fraction * (upper.g - lower.g))}, ${Math.round(lower.b + fraction * (upper.b - lower.b))}, 0.95)` };
}

function getPrecipColor(p) {
    if (p === null || p === undefined || p === 0) return '#ffffff00';
    return p < 0.5 ? '#b3e5fc' : p < 2 ? '#4fc3f7' : p < 5 ? '#0288d1' : p < 15 ? '#01579b' : '#021a42';
}

function createRectMarker(latLng, value, unit, bgColor, popupText, layerGroup, isMax = false, isMin = false) {
    const formattedValue = parseFloat(value).toFixed(1);
    let boxClass = "gis-rect-box";
    if (isMax) boxClass += " extreme-max";
    if (isMin) boxClass += " extreme-min";
    
    L.circleMarker(latLng, { radius: 3.5, fillColor: '#24b14c', color: '#1b8539', weight: 1.5, fillOpacity: 1 }).bindPopup(popupText).addTo(layerGroup);

    L.marker(latLng, {
        icon: L.divIcon({
            className: 'gis-rect-label',
            html: `<div class="${boxClass}" style="background-color: ${bgColor};">${formattedValue}${unit}</div>`,
            iconAnchor: [19, 24]
        })
    }).bindPopup(popupText).addTo(layerGroup);
}

function budujPelnyPopup(props) {
    const name = props.Station_name || "Stacja synoptyczna";
    const elev = props.elevation != null ? `${props.elevation} m n.p.m.` : "brak danych";
    const f = (val, unit = '°C') => (val != null ? `${parseFloat(val).toFixed(1)}${unit}` : 'brak');

    return `
        <div style="font-family: Arial, sans-serif; font-size:11px; min-width:215px; color:#333;">
            <b style="font-size:13px; color:#000;">${name}</b><br>
            <span style="color:#666;">Wysokość stacji: ${elev}</span>
            <hr style="margin: 4px 0; border:0; border-top:1px solid #ddd;">
            <table class="meteo-popup-table">
                <tr><td><b>Temperatura (Ta):</b></td><td style="text-align:right; font-weight:bold;">${f(props.Ta)}</td></tr>
                <tr><td><b>Przy gruncie (Tg):</b></td><td style="text-align:right;">${f(props.Tg)}</td></tr>
                <tr><td><b>Minimalna (Tmin_hour):</b></td><td style="text-align:right; color:#1976d2;">${f(props.Tmin_hour)}</td></tr>
                <tr><td><b>Maksymalna (Tmax_hour):</b></td><td style="text-align:right; color:#d32f2f;">${f(props.Tmax_hour)}</td></tr>
                <tr><td><b>Średni wiatr:</b></td><td style="text-align:right;">${f(props.Wind_avg, ' m/s')}</td></tr>
                <tr><td><b>Maksymalny poryw:</b></td><td style="text-align:right; font-weight:bold; color:#c2410c;">${f(props.Wind_max, ' m/s')}</td></tr>
                <tr><td><b>Opad (24h):</b></td><td style="text-align:right; color:#0288d1;">${f(props.Precip_24h, ' mm')}</td></tr>
                <tr><td><b>Ciśnienie (Po):</b></td><td style="text-align:right;">${props.Po != null ? `${parseFloat(props.Po).toFixed(1)} hPa` : 'brak'}</td></tr>
                <tr><td><b>Wilgotność (Rh):</b></td><td style="text-align:right;">${props.Rh != null ? `${Math.round(props.Rh)}%` : 'brak'}</td></tr>
            </table>
        </div>
    `;
}

function wyswietlDaneDlaGodziny(klucz) {
    Object.values(layers).forEach(lg => lg.clearLayers());
    
    let stacje = imgwBazaDanych[klucz];
    if (!stacje) return;
    if (stacje.features) stacje = stacje.features;
    if (!Array.isArray(stacje)) return;

    let wszystkieTa = [], wszystkieTg = [], wszystkieTmin = [], wszystkieTmax = [];
    stacje.forEach(s => {
        if (s.properties.Ta != null) wszystkieTa.push(parseFloat(s.properties.Ta));
        if (s.properties.Tg != null) wszystkieTg.push(parseFloat(s.properties.Tg));
        if (s.properties.Tmin_hour != null) wszystkieTmin.push(parseFloat(s.properties.Tmin_hour));
        if (s.properties.Tmax_hour != null) wszystkieTmax.push(parseFloat(s.properties.Tmax_hour));
    });

    // 🌟 BEZBŁĘDNE, NAPRAWIONE WYLICZANIE EKSTREMÓW KRAJOWYCH
    const maxTa = wszystkieTa.length ? Math.max(...wszystkieTa) : null;
    const minTa = wszystkieTa.length ? Math.min(...wszystkieTa) : null;
    const maxTg = wszystkieTg.length ? Math.max(...wszystkieTg) : null;
    const minTg = wszystkieTg.length ? Math.min(...wszystkieTg) : null;
    const maxTmin = wszystkieTmin.length ? Math.max(...wszystkieTmin) : null;
    const minTmin = wszystkieTmin.length ? Math.min(...wszystkieTmin) : null;
    const maxTmax = wszystkieTmax.length ? Math.max(...wszystkieTmax) : null;
    const minTmax = wszystkieTmax.length ? Math.min(...wszystkieTmax) : null;

    stacje.forEach(stacja => {
        if (!stacja.geometry || !stacja.geometry.coordinates) return;
        const latLng = [stacja.geometry.coordinates[1], stacja.geometry.coordinates[0]];
        const props = stacja.properties;
        const popupContent = budujPelnyPopup(props);

        if (props.Ta != null) {
            const val = parseFloat(props.Ta);
            createRectMarker(latLng, props.Ta, '°C', getTemperatureStyle(props.Ta).bg, popupContent, layers.temperature, val === maxTa, val === minTa);
        }
        if (props.Tg != null) {
            const val = parseFloat(props.Tg);
            createRectMarker(latLng, props.Tg, '°C', getTemperatureStyle(props.Tg).bg, popupContent, layers.ground_temp, val === maxTg, val === minTg);
        }
        if (props.Tmin_hour != null) {
            const val = parseFloat(props.Tmin_hour);
            createRectMarker(latLng, props.Tmin_hour, '°C', getTemperatureStyle(props.Tmin_hour).bg, popupContent, layers.tmin, val === maxTmin, val === minTmin);
        }
        if (props.Tmax_hour != null) {
            const val = parseFloat(props.Tmax_hour);
            createRectMarker(latLng, props.Tmax_hour, '°C', getTemperatureStyle(props.Tmax_hour).bg, popupContent, layers.tmax, val === maxTmax, val === minTmax);
        }
        if (props.Wind_avg != null) createRectMarker(latLng, props.Wind_avg, ' m/s', '#e2e8f0', popupContent, layers.wind);
        if (props.Wind_max != null) createRectMarker(latLng, props.Wind_max, ' m/s', '#fca5a5', popupContent, layers.wind_max);
        if (props.Precip_24h != null && props.Precip_24h > 0) createRectMarker(latLng, props.Precip_24h, ' mm', getPrecipColor(props.Precip_24h), popupContent, layers.precipitation);
        if (props.Po != null) createRectMarker(latLng, props.Po, ' hPa', '#cbd5e1', popupContent, layers.pressure);
        if (props.Rh != null) createRectMarker(latLng, props.Rh, '%', '#bae6fd', popupContent, layers.humidity);
    });
}

// 🎨 PIONOWA UNIWERSALNA LEGENDA OD -40 DO 40 CO 5 STOPNI
function dodajLegende() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<h4>Temperatura</h4>';
        
        const displayPoints = [40, 35, 30, 25, 20, 15, 10, 5, 0, -5, -10, -15, -20, -25, -30, -35, -40];
        displayPoints.forEach(pt => {
            const style = getTemperatureStyle(pt);
            div.innerHTML += `
                <div class="legend-row">
                    <div class="legend-color-box" style="background: ${style.bg};"></div>
                    <span>${pt}°C</span>
                </div>
            `;
        });
        return div;
    };
    legend.addTo(map);
}

// 📅 INICJALIZACJA NOWEJ, CIĄGŁEJ OSI CZASU
function zainicjujCiaglaOsCzasu() {
    const slider = document.getElementById('timeline-slider');
    const label = document.getElementById('current-time-label');

    slider.min = 0;
    slider.max = dostepneKlucze.length - 1;
    slider.value = dostepneKlucze.length - 1; // Ustawienie na najnowszy rekord domyślnie

    function aktualizujWidokZTimeline() {
        const idx = parseInt(slider.value);
        const wybranyKlucz = dostepneKlucze[idx];
        if (!wybranyKlucz) return;

        // Ładne formatowanie etykiety (np. 2026-06-03 12:00)
        const parts = wybranyKlucz.split('_');
        const dataPart = parts[0];
        const godzinaPart = parts[1].padStart(2, '0');
        label.innerText = `${dataPart}  ${godzinaPart}:00`;

        wyswietlDaneDlaGodziny(wybranyKlucz);
    }

    slider.addEventListener('input', aktualizujWidokZTimeline);
    aktualizujWidokZTimeline(); // Pierwsze renderowanie najnowszych danych
}

fetch('imgw_baza.json')
    .then(res => res.json())
    .then(data => {
        imgwBazaDanych = data;
        dostepneKlucze = Object.keys(data).sort();
        if (dostepneKlucze.length === 0) return;
        dodajLegende();
        zainicjujCiaglaOsCzasu();
    })
    .catch(err => console.error("❌ Błąd parsowania bazy danych:", err));
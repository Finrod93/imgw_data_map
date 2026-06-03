// 🌍 PRZYWRÓCENIE WSZYSTKICH PODKŁADÓW MAPY
const baseLayers = {
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }),
    "Satelita (Esri)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri'
    }),
    "Topograficzna (Topo)": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap contributors'
    }),
    "Ciemny (CartoDB)": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB'
    })
};

const map = L.map('map', {
    layers: [baseLayers["OpenStreetMap"]]
}).setView([52.0689, 19.4797], 6);

const layers = {
    temperature: L.layerGroup(),
    ground_temp: L.layerGroup(),
    tmin: L.layerGroup(),
    tmax: L.layerGroup(),
    wind: L.layerGroup(),
    wind_max: L.layerGroup(),
    precipitation: L.layerGroup()
};
layers.temperature.addTo(map);

L.control.layers(baseLayers, {
    "Temperatura powietrza (Ta)": layers.temperature,
    "Temperatura przy gruncie (Tg)": layers.ground_temp,
    "Temperatura minimalna (Tmin)": layers.tmin,
    "Temperatura maksymalna (Tmax)": layers.tmax,
    "Średnia prędkość wiatru": layers.wind,
    "Maksymalne porywy wiatru": layers.wind_max,
    "Suma opadu (24h)": layers.precipitation
}, { collapsed: false }).addTo(map);

// 🎚️ PRZEŹROCZYSTOŚĆ PODKŁADU Z PROCENTAMI
const opacityControl = L.control({ position: 'topright' });
opacityControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'opacity-control-panel');
    div.innerHTML = `
        <label for="bg-opacity-slider">Przeźroczystość podkładu: <span id="opacity-pct">100%</span></label>
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

const tempScale = [
    { t: -40, r: 245, g: 242, b: 245 }, { t: -35, r: 212, g: 185, b: 204 }, { t: -30, r: 125, g: 90,  b: 110 }, 
    { t: -25, r: 214, g: 110, b: 247 }, { t: -20, r: 135, g: 45,  b: 230 }, { t: -15, r: 40,  g: 30,  b: 215 }, 
    { t: -10, r: 50,  g: 100, b: 230 }, { t: -5,  r: 120, g: 190, b: 245 }, { t: 0,   r: 195, g: 255, b: 250 }, 
    { t: 5,   r: 120, g: 235, b: 160 }, { t: 10,  r: 55,  g: 160, b: 50  }, { t: 15,  r: 175, g: 215, b: 65  }, 
    { t: 20,  r: 255, g: 245, b: 50  }, { t: 25,  r: 255, g: 165, b: 40  }, { t: 30,  r: 255, g: 50,  b: 40  }, 
    { t: 35,  r: 180, g: 25,  b: 45  }, { t: 40,  r: 245, g: 150, b: 180 }
];

function getTemperatureStyle(temp) {
    let t = parseFloat(temp);
    if (isNaN(t)) return { bg: 'rgba(230, 233, 234, 0.98)' };
    if (t <= tempScale[0].t) return { bg: `rgba(${tempScale[0].r}, ${tempScale[0].g}, ${tempScale[0].b}, 0.98)` };
    if (t >= tempScale[tempScale.length - 1].t) return { bg: `rgba(${tempScale[tempScale.length - 1].r}, ${tempScale[tempScale.length - 1].g}, ${tempScale[tempScale.length - 1].b}, 0.98)` };

    let lower = tempScale[0], upper = tempScale[tempScale.length - 1];
    for (let i = 0; i < tempScale.length - 1; i++) {
        if (t >= tempScale[i].t && t <= tempScale[i+1].t) {
            lower = tempScale[i]; upper = tempScale[i+1]; break;
        }
    }
    const fraction = (t - lower.t) / (upper.t - lower.t);
    return { bg: `rgba(${Math.round(lower.r + fraction * (upper.r - lower.r))}, ${Math.round(lower.g + fraction * (upper.g - lower.g))}, ${Math.round(lower.b + fraction * (upper.b - lower.b))}, 0.98)` };
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
    
    // 🟢 Zielony punkt stacji pod etykietą
    L.circleMarker(latLng, { 
        radius: 3.5, fillColor: '#24b14c', color: '#1b8539', weight: 1.5, fillOpacity: 1 
    }).bindPopup(popupText).addTo(layerGroup);

    // Prostokąt danych umieszczony symetrycznie i precyzyjnie NAD kropką
    L.marker(latLng, {
        icon: L.divIcon({
            className: 'gis-rect-label',
            html: `<div class="${boxClass}" style="background-color: ${bgColor};">${formattedValue}${unit}</div>`,
            iconAnchor: [19, 22]
        })
    }).bindPopup(popupText).addTo(layerGroup);
}

// 🗂️ KOMPLETNA BUDOWA POPUPU ZE WSZYSTKIMI ZMIENNYMI I ELEVATION
function budujPelnyPopup(props) {
    const name = props.Station_name || "Stacja synoptyczna";
    const elev = props.elevation != null ? `${props.elevation} m n.p.m.` : "brak danych";
    
    const f = (val, unit = '°C') => (val != null ? `${parseFloat(val).toFixed(1)}${unit}` : 'brak');

    return `
        <div style="font-family: Arial, sans-serif; font-size:11px; min-width:210px; color:#333;">
            <b style="font-size:13px; color:#000;">${name}</b><br>
            <span style="color:#666;">Wysokość: ${elev}</span>
            <hr style="margin: 5px 0; border:0; border-top:1px solid #ddd;">
            <table class="meteo-popup-table">
                <tr><td><b>Ta (Powietrze):</b></td><td style="text-align:right; font-weight:bold;">${f(props.Ta)}</td></tr>
                <tr><td><b>Tg (Przy gruncie):</b></td><td style="text-align:right;">${f(props.Tg)}</td></tr>
                <tr><td><b>Tmin_hour (Godzinowa):</b></td><td style="text-align:right; color:#1976d2;">${f(props.Tmin_hour)}</td></tr>
                <tr><td><b>Tmax_hour (Godzinowa):</b></td><td style="text-align:right; color:#d32f2f;">${f(props.Tmax_hour)}</td></tr>
                <tr><td><b>Średni wiatr:</b></td><td style="text-align:right;">${f(props.Wind_avg, ' m/s')}</td></tr>
                <tr><td><b>Poryw maksymalny:</b></td><td style="text-align:right; font-weight:bold; color:#c2410c;">${f(props.Wind_max, ' m/s')}</td></tr>
                <tr><td><b>Suma opadu (24h):</b></td><td style="text-align:right; color:#0288d1;">${f(props.Precip_24h, ' mm')}</td></tr>
                ${props.Po != null ? `<tr><td><b>Ciśnienie (Po):</b></td><td style="text-align:right;">${parseFloat(props.Po).toFixed(1)} hPa</td></tr>` : ''}
                ${props.Rh != null ? `<tr><td><b>Wilgotność (Rh):</b></td><td style="text-align:right;">${Math.round(props.Rh)}%</td></tr>` : ''}
            </table>
        </div>
    `;
}

function wyswietlDaneDlaGodziny(klucz) {
    Object.values(layers).forEach(lg => lg.clearLayers());
    const stacje = imgwBazaDanych[klucz];
    if (!stacje) return;

    // Obliczanie maksimów i minimów do obramowań
    let wszystkieTa = [], wszystkieTg = [], wszystkieTmin = [], wszystkieTmax = [];
    stacje.forEach(s => {
        if (s.properties.Ta != null) wszystkieTa.push(parseFloat(s.properties.Ta));
        if (s.properties.Tg != null) wszystkieTg.push(parseFloat(s.properties.Tg));
        if (s.properties.Tmin_hour != null) wszystkieTmin.push(parseFloat(s.properties.Tmin_hour));
        if (s.properties.Tmax_hour != null) wszystkieTmax.push(parseFloat(s.properties.Tmax_hour));
    });

    const maxTa = Math.max(...wszystkieTa), minTa = Math.min(...wszystkieTa);
    const maxTg = Math.max(...wszystkieTg), minTg = Math.min(...wszystkieTg);
    const maxTmin = Math.max(...wszystkieTmin), minTmin = Math.min(...wszystkieTmin);
    const maxTmax = Math.max(...wszystkieTmax), minTmax = Math.min(...wszystkieTmax);

    stacje.forEach(stacja => {
        if (!stacja.geometry || !stacja.geometry.coordinates) return;
        const latLng = [stacja.geometry.coordinates[1], stacja.geometry.coordinates[0]];
        const props = stacja.properties;
        const popupContent = budujPelnyPopup(props);

        if (props.Ta !== undefined && props.Ta !== null) {
            const val = parseFloat(props.Ta);
            createRectMarker(latLng, props.Ta, '°C', getTemperatureStyle(props.Ta).bg, popupContent, layers.temperature, val === maxTa, val === minTa);
        }
        if (props.Tg !== undefined && props.Tg !== null) {
            const val = parseFloat(props.Tg);
            createRectMarker(latLng, props.Tg, '°C', getTemperatureStyle(props.Tg).bg, popupContent, layers.ground_temp, val === maxTg, val === minTg);
        }
        if (props.Tmin_hour !== undefined && props.Tmin_hour !== null) {
            const val = parseFloat(props.Tmin_hour);
            createRectMarker(latLng, props.Tmin_hour, '°C', getTemperatureStyle(props.Tmin_hour).bg, popupContent, layers.tmin, val === maxTmin, val === minTmin);
        }
        if (props.Tmax_hour !== undefined && props.Tmax_hour !== null) {
            const val = parseFloat(props.Tmax_hour);
            createRectMarker(latLng, props.Tmax_hour, '°C', getTemperatureStyle(props.Tmax_hour).bg, popupContent, layers.tmax, val === maxTmax, val === minTmax);
        }
        if (props.Wind_avg !== undefined && props.Wind_avg !== null) {
            createRectMarker(latLng, props.Wind_avg, ' m/s', '#e2e8f0', popupContent, layers.wind);
        }
        if (props.Wind_max !== undefined && props.Wind_max !== null) {
            createRectMarker(latLng, props.Wind_max, ' m/s', '#fca5a5', popupContent, layers.wind_max);
        }
        if (props.Precip_24h !== undefined && props.Precip_24h !== null && props.Precip_24h > 0) {
            createRectMarker(latLng, props.Precip_24h, ' mm', getPrecipColor(props.Precip_24h), popupContent, layers.precipitation);
        }
    });
}

function dodajLegende() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<h4>Meteo Ta</h4>';
        const displayPoints = [35, 30, 25, 20, 15, 10, 5, 0, -5, -10, -20, -30];
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

// 🔧 LOGIKA DEKOUPLINGU MINIMALISTYCZNEJ OSI CZASU (Kalendarz + Suwak Godzin)
function zainicjujMinimalistycznaOs() {
    const calPicker = document.getElementById('calendar-picker');
    const hrSlider = document.getElementById('hour-slider');
    const hrLabel = document.getElementById('current-time-label');

    // Wyciągamy skrajne daty z bazy do zablokowania min/max w kalendarzu HTML
    const daty = dostepneKlucze.map(k => k.split('_')[0]);
    const unikalneDaty = [...new Set(daty)].sort();
    
    calPicker.min = unikalneDaty[0];
    calPicker.max = unikalneDaty[unikalneDaty.length - 1];

    // Ustawiamy startowo na najnowszy rekord w bazie
    const najnowszyKlucz = dostepneKlucze[dostepneKlucze.length - 1];
    const [startData, startGodzina] = najnowszyKlucz.split('_');

    calPicker.value = startData;
    hrSlider.value = parseInt(startGodzina);
    hrLabel.innerText = `${startGodzina.padStart(2, '0')}:00`;

    function zaladujZsynchronizowanyPunkt() {
        const wybranaData = calPicker.value;
        const wybranaGodzina = hrSlider.value;
        
        // Zabezpieczenie przed jedno/dwucyfrowym formatowaniem kluczy w bazie json
        const k1 = `${wybranaData}_${wybranaGodzina}`;
        const k2 = `${wybranaData}_${String(wybranaGodzina).padStart(2, '0')}`;
        
        let kluczDocelowy = imgwBazaDanych[k1] ? k1 : (imgwBazaDanych[k2] ? k2 : null);

        // Jeśli dla danego dnia nie ma dokładnie tej godziny, szukamy najbliższej dostępnej
        if (!kluczDocelowy) {
            const dostepneDlaDnia = dostepneKlucze.filter(k => k.startsWith(wybranaData));
            if (dostepneDlaDnia.length > 0) {
                kluczDocelowy = dostepneDlaDnia[0]; // Bierzemy pierwszą dostępną z brzegu
                const wyznaczonaGodzina = kluczDocelowy.split('_')[1];
                hrSlider.value = parseInt(wyznaczonaGodzina);
            }
        }

        if (kluczDocelowy) {
            const godzinaWyswietlana = kluczDocelowy.split('_')[1].padStart(2, '0');
            hrLabel.innerText = `${godzinaWyswietlana}:00`;
            wyswietlDaneDlaGodziny(kluczDocelowy);
        }
    }

    calPicker.addEventListener('change', zaladujZsynchronizowanyPunkt);
    hrSlider.addEventListener('input', function(e) {
        hrLabel.innerText = `${String(e.target.value).padStart(2, '0')}:00`;
        zaladujZsynchronizowanyPunkt();
    });

    wyswietlDaneDlaGodziny(najnowszyKlucz);
}

fetch('imgw_baza.json')
    .then(res => res.json())
    .then(data => {
        imgwBazaDanych = data;
        dostepneKlucze = Object.keys(data).sort();
        if (dostepneKlucze.length === 0) return;
        dodajLegende();
        zainicjujMinimalistycznaOs();
    })
    .catch(err => console.error("❌ Błąd krytyczny mapy:", err));
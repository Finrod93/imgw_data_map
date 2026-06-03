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

// 🗂️ PEŁNE WARSTWY POMIAROWE (9 WARSTW)
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
layers.temperature.addTo(map); // Aktywna na starcie

// PANEL STEROWANIA WARSTWAMI
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

// 🎨 ORYGINALNY PASZPORT KOLORYSTYCZNY (Z poprawionym 40°C na jasnoszary/lekkie bordo)
const tempScale = [
    { t: 40,  r: 212, g: 190, b: 198 }, // Jasnoszary wpadający w lekkie bordo
    { t: 35,  r: 163, g: 16,  b: 48  }, // Głębokie bordo
    { t: 30,  r: 220, g: 38,  b: 38  }, // Intensywna czerwień
    { t: 25,  r: 249, g: 115, b: 22  }, // Pomarańczowy
    { t: 20,  r: 253, g: 224, b: 71  }, // Żółty
    { t: 15,  r: 132, g: 204, b: 22  }, // Jasnozielony
    { t: 10,  r: 34,  g: 197, b: 94  }, // Zielony
    { t: 5,   r: 45,  g: 212, b: 191 }, // Seledynowy
    { t: 0,   r: 186, g: 230, b: 253 }, // Bardzo jasny błękit
    { t: -5,  r: 125, g: 211, b: 252 }, // Jasnobłękitny
    { t: -10, r: 56,  g: 189, b: 248 }, // Niebieski
    { t: -15, r: 59,  g: 130, b: 246 }, // Ciemnoniebieski
    { t: -20, r: 29,  g: 78,  b: 216 }, // Głęboki granat
    { t: -25, r: 109, g: 40,  b: 217 }, // Fioletowy
    { t: -30, r: 147, g: 51,  b: 234 }, // Jasnofioletowy
    { t: -35, r: 219, g: 39,  b: 119 }, // Amarantowy
    { t: -40, r: 244, g: 63,  b: 94  }  // Karminowy
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

function createRectMarker(latLng, value, unit, bgColor, popupText, layerGroup) {
    const formattedValue = parseFloat(value).toFixed(1);
    
    L.circleMarker(latLng, { radius: 3.5, fillColor: '#24b14c', color: '#1b8539', weight: 1.5, fillOpacity: 1 }).bindPopup(popupText).addTo(layerGroup);

    L.marker(latLng, {
        icon: L.divIcon({
            className: 'gis-rect-label',
            html: `<div class="gis-rect-box" style="background-color: ${bgColor};">${formattedValue}${unit}</div>`,
            iconAnchor: [19, 12]
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

function renderujDaneStacji(stacje) {
    Object.values(layers).forEach(lg => lg.clearLayers());

    stacje.forEach(stacja => {
        if (!stacja.geometry || !stacja.geometry.coordinates) return;
        const latLng = [stacja.geometry.coordinates[1], stacja.geometry.coordinates[0]];
        const props = stacja.properties;
        const popupContent = budujPelnyPopup(props);

        if (props.Ta != null) createRectMarker(latLng, props.Ta, '°C', getTemperatureStyle(props.Ta).bg, popupContent, layers.temperature);
        if (props.Tg != null) createRectMarker(latLng, props.Tg, '°C', getTemperatureStyle(props.Tg).bg, popupContent, layers.ground_temp);
        if (props.Tmin_hour != null) createRectMarker(latLng, props.Tmin_hour, '°C', getTemperatureStyle(props.Tmin_hour).bg, popupContent, layers.tmin);
        if (props.Tmax_hour != null) createRectMarker(latLng, props.Tmax_hour, '°C', getTemperatureStyle(props.Tmax_hour).bg, popupContent, layers.tmax);
        if (props.Wind_avg != null) createRectMarker(latLng, props.Wind_avg, ' m/s', '#e2e8f0', popupContent, layers.wind);
        if (props.Wind_max != null) createRectMarker(latLng, props.Wind_max, ' m/s', '#fca5a5', popupContent, layers.wind_max);
        if (props.Precip_24h != null && props.Precip_24h > 0) createRectMarker(latLng, props.Precip_24h, ' mm', getPrecipColor(props.Precip_24h), popupContent, layers.precipitation);
        if (props.Po != null) createRectMarker(latLng, props.Po, ' hPa', '#cbd5e1', popupContent, layers.pressure);
        if (props.Rh != null) createRectMarker(latLng, props.Rh, '%', '#bae6fd', popupContent, layers.humidity);
    });
}

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

// 🔄 INTELIGENTNE POBIERANIE (Wykrywa płaski GeoJSON lub strukturę bazodanową i ładuje najnowszą godzinę)
fetch('imgw_baza.json?t=' + Date.now())
    .then(res => {
        if (!res.ok) throw new Error("Błąd sieci: " + res.status);
        return res.json();
    })
    .then(data => {
        let stacjeDoWyswietlenia = [];

        if (data.features) {
            // Jeśli baza to czysty, pojedynczy GeoJSON
            stacjeDoWyswietlenia = data.features;
        } else {
            // Jeśli baza posiada klucze czasowe (np. "2026-06-03_14"), wybieramy najnowszy chronologicznie
            const klucze = Object.keys(data).sort((a, b) => {
                const partsA = a.split('_'); const partsB = b.split('_');
                if (partsA[0] !== partsB[0]) return partsA[0].localeCompare(partsB[0]);
                return parseInt(partsA[1], 10) - parseInt(partsB[1], 10);
            });

            if (klucze.length > 0) {
                const najnowszyKlucz = klucze[klucze.length - 1];
                let najnowszeDane = data[najnowszyKlucz];
                stacjeDoWyswietlenia = najnowszeDane.features ? najnowszeDane.features : najnowszeDane;
            }
        }

        if (!Array.isArray(stacjeDoWyswietlenia) || stacjeDoWyswietlenia.length === 0) {
            console.warn("Brak stacji do wyświetlenia.");
            return;
        }

        dodajLegende();
        renderujDaneStacji(stacjeDoWyswietlenia);
    })
    .catch(err => console.error("❌ Błąd ładowania danych IMGW:", err));
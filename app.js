// 🌍 INICJALIZACJA MAPY
const map = L.map('map').setView([52.0689, 19.4797], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

// 🗂️ GRUPY WARSTW POMIAROWYCH
const layers = {
    temperature: L.layerGroup().addTo(map), // Ta jest aktywna na starcie
    ground_temp: L.layerGroup(),
    tmin: L.layerGroup(),
    tmax: L.layerGroup(),
    wind: L.layerGroup(),
    precipitation: L.layerGroup()
};

// PANEL STEROWANIA WARSTWAMI
L.control.layers(null, {
    "Temperatura powietrza (Ta)": layers.temperature,
    "Temperatura przy gruncie (Tg)": layers.ground_temp,
    "Temperatura minimalna (Tmin_hour)": layers.tmin,
    "Temperatura maksymalna (Tmax_hour)": layers.tmax,
    "Prędkość wiatru": layers.wind,
    "Suma opadu (24h)": layers.precipitation
}, { collapsed: false }).addTo(map);

let imgwBazaDanych = {};
let dostepneKlucze = [];

// 🎨 PROSTA, SPRAWDZONA SKALA KOLORÓW DLA TEMPERATURY
function getSimpleTempColor(temp) {
    let t = parseFloat(temp);
    if (isNaN(t)) return '#ffffff';
    if (t >= 30)  return '#d73027'; // Czerwony (Upraw)
    if (t >= 20)  return '#fc8d59'; // Pomarańczowy
    if (t >= 10)  return '#fee090'; // Żółty
    if (t >= 0)   return '#e0f3f8'; // Bardzo jasny błękit
    if (t >= -10) return '#91bfdb'; // Jasnoniebieski
    return '#4575b4';               // Ciemnoniebieski (Mroz)
}

function createRectMarker(latLng, value, unit, bgColor, popupText, layerGroup) {
    const formattedValue = parseFloat(value).toFixed(1);
    
    // Mały punkt centralny stacji
    L.circleMarker(latLng, { radius: 3, fillColor: '#333', color: '#000', weight: 1, fillOpacity: 1 }).bindPopup(popupText).addTo(layerGroup);

    // Etykieta z wartością
    L.marker(latLng, {
        icon: L.divIcon({
            className: 'gis-rect-label',
            html: `<div class="gis-rect-box" style="background-color: ${bgColor};">${formattedValue}${unit}</div>`,
            iconAnchor: [18, 10]
        })
    }).bindPopup(popupText).addTo(layerGroup);
}

function budujPopup(props) {
    const name = props.Station_name || "Stacja";
    const f = (val, unit = '°C') => (val != null ? `${parseFloat(val).toFixed(1)}${unit}` : 'brak');

    return `
        <div style="font-family: Arial, sans-serif; font-size:11px; min-width:180px;">
            <b>${name}</b>
            <hr style="margin: 4px 0; border:0; border-top:1px solid #ccc;">
            <table class="meteo-popup-table">
                <tr><td>Ta (Powietrze):</td><td><b>${f(props.Ta)}</b></td></tr>
                <tr><td>Tg (Grunt):</td><td>${f(props.Tg)}</td></tr>
                <tr><td>Tmin_hour:</td><td>${f(props.Tmin_hour)}</td></tr>
                <tr><td>Tmax_hour:</td><td>${f(props.Tmax_hour)}</td></tr>
                <tr><td>Wiatr średni:</td><td>${f(props.Wind_avg, ' m/s')}</td></tr>
                <tr><td>Opad (24h):</td><td>${f(props.Precip_24h, ' mm')}</td></tr>
            </table>
        </div>
    `;
}

function wyswietlDaneDlaGodziny(klucz) {
    // Czyszczenie starych markerów przed narysowaniem nowej godziny
    Object.values(layers).forEach(lg => lg.clearLayers());
    
    let stacje = imgwBazaDanych[klucz];
    if (!stacje) return;
    if (stacje.features) stacje = stacje.features;
    if (!Array.isArray(stacje)) return;

    stacje.forEach(stacja => {
        if (!stacja.geometry || !stacja.geometry.coordinates) return;
        const latLng = [stacja.geometry.coordinates[1], stacja.geometry.coordinates[0]];
        const props = stacja.properties;
        const popupContent = budujPopup(props);

        if (props.Ta != null) {
            createRectMarker(latLng, props.Ta, '°C', getSimpleTempColor(props.Ta), popupContent, layers.temperature);
        }
        if (props.Tg != null) {
            createRectMarker(latLng, props.Tg, '°C', getSimpleTempColor(props.Tg), popupContent, layers.ground_temp);
        }
        if (props.Tmin_hour != null) {
            createRectMarker(latLng, props.Tmin_hour, '°C', getSimpleTempColor(props.Tmin_hour), popupContent, layers.tmin);
        }
        if (props.Tmax_hour != null) {
            createRectMarker(latLng, props.Tmax_hour, '°C', getSimpleTempColor(props.Tmax_hour), popupContent, layers.tmax);
        }
        if (props.Wind_avg != null) {
            createRectMarker(latLng, props.Wind_avg, ' m/s', '#e2e8f0', popupContent, layers.wind);
        }
        if (props.Precip_24h != null && props.Precip_24h > 0) {
            createRectMarker(latLng, props.Precip_24h, ' mm', '#3182ce', popupContent, layers.precipitation);
        }
    });
}

function dodajLegende() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<strong>Temperatura</strong><br>';
        
        const progi = [30, 20, 10, 0, -10];
        const etykiety = ['≥ 30°C', '20°C do 30°C', '10°C do 20°C', '0°C do 10°C', '< 0°C'];
        
        for (let i = 0; i < progi.length; i++) {
            div.innerHTML += `
                <div class="legend-row">
                    <div class="legend-color-box" style="background: ${getSimpleTempColor(progi[i])};"></div>
                    <span>${etykiety[i]}</span>
                </div>
            `;
        }
        return div;
    };
    legend.addTo(map);
}

function zainicjujOsCzasu() {
    const slider = document.getElementById('timeline-slider');
    const label = document.getElementById('current-time-label');
    if (!slider || !label) return;

    slider.min = 0;
    slider.max = dostepneKlucze.length - 1;
    slider.value = dostepneKlucze.length - 1; // Ustaw na najnowszą godzinę

    function aktualizujWidok() {
        const idx = parseInt(slider.value);
        const wybranyKlucz = dostepneKlucze[idx];
        if (!wybranyKlucz) return;

        // Zamiana klucza np. "2026-06-03_14" na ładny tekst "2026-06-03 14:00"
        const parts = wybranyKlucz.split('_');
        label.innerText = `${parts[0]}  ${parts[1] || '00'}:00`;

        wyswietlDaneDlaGodziny(wybranyKlucz);
    }

    slider.addEventListener('input', aktualizujWidok);
    aktualizujWidok();
}

// 🔄 PROSTE I PEWNE POBIERANIE JSON
fetch('imgw_baza.json')
    .then(res => res.json())
    .then(data => {
        imgwBazaDanych = data;
        dostepneKlucze = Object.keys(data).sort();

        if (dostepneKlucze.length === 0) {
            document.getElementById('current-time-label').innerText = "Baza jest pusta";
            return;
        }

        dodajLegende();
        zainicjujOsCzasu();
    })
    .catch(err => {
        console.error("Błąd ładowania danych:", err);
        document.getElementById('current-time-label').innerText = "Błąd pobierania!";
    });
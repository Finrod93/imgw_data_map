// Inicjalizacja mapy Leaflet na Polskę
const map = L.map('map').setView([52.0689, 19.4797], 6);

// Podkład mapy
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Kompletna wczorajsza lista warstw pomiarowych
const layers = {
    temperature: L.layerGroup(),
    ground_temp: L.layerGroup(),
    tmin: L.layerGroup(),
    tmax: L.layerGroup(),
    wind: L.layerGroup(),
    wind_max: L.layerGroup(),
    precipitation: L.layerGroup()
};

// Startowa warstwa
layers.temperature.addTo(map);

// Menu wyboru warstw z zachowaniem wczorajszych nazw i struktur
L.control.layers(null, {
    "Temperatura powietrza (Ta)": layers.temperature,
    "Temperatura przy gruncie (Tg)": layers.ground_temp,
    "Temperatura minimalna (Tmin)": layers.tmin,
    "Temperatura maksymalna (Tmax)": layers.tmax,
    "Średnia prędkość wiatru": layers.wind,
    "Maksymalne porywy wiatru": layers.wind_max,
    "Suma opadu (24h)": layers.precipitation
}, { collapsed: false }).addTo(map);

let imgwBazaDanych = {};
let dostepneKlucze = [];

// Oryginalna wczorajsza paleta barw (Felt/QGIS style)
function getTempColor(t) {
    if (t === null || t === undefined) return '#808080';
    return t < -15 ? '#03022c' :
           t < -10 ? '#00008b' :
           t < -5  ? '#2a52be' :
           t < 0   ? '#4169e1' :
           t < 3   ? '#6baed6' :
           t < 7   ? '#add8e6' :
           t < 12  ? '#90ee90' :
           t < 17  ? '#228b22' :
           t < 22  ? '#ffa500' :
           t < 27  ? '#ff4500' : '#b22222';
}

// Oryginalna wczorajsza paleta opadów
function getPrecipColor(p) {
    if (p === null || p === undefined || p === 0) return '#ffffff00';
    return p < 0.5 ? '#b3e5fc' :
           p < 2   ? '#4fc3f7' :
           p < 5   ? '#0288d1' :
           p < 15  ? '#01579b' : '#021a42';
}

// Sprawdzenie kontrastu tekstu
function useLightText(color) {
    const darkColors = ['#03022c', '#00008b', '#2a52be', '#01579b', '#021a42', '#b22222'];
    return darkColors.includes(color);
}

// Wczorajsza funkcja rysująca: mały punkt-kotwica + prostokąt z offsetem i 1 miejscem po przecinku
function createRectMarker(latLng, value, unit, bgColor, popupText, layerGroup) {
    const formattedValue = parseFloat(value).toFixed(1);
    const textClass = useLightText(bgColor) ? 'gis-rect-box light-text' : 'gis-rect-box';
    
    // Wczorajsza mała kropka bazowa stacji
    L.circleMarker(latLng, { radius: 3, fillColor: '#111', color: '#111', weight: 1, fillOpacity: 1 })
        .bindPopup(popupText)
        .addTo(layerGroup);

    // Wczorajszy prostokąt z dokładnie dobranym odsunieciem [-6, 12]
    L.marker(latLng, {
        icon: L.divIcon({
            className: 'gis-rect-label',
            html: `<div class="${textClass}" style="background-color: ${bgColor};">${formattedValue}${unit}</div>`,
            iconAnchor: [-6, 12]
        })
    }).bindPopup(popupText).addTo(layerGroup);
}

// Mapowanie danych z bazy zbiorczej
function wyswietlDaneDlaGodziny(klucz) {
    Object.values(layers).forEach(lg => lg.clearLayers());
    const stacje = imgwBazaDanych[klucz];
    if (!stacje) return;

    stacje.forEach(stacja => {
        if (!stacja.geometry || !stacja.geometry.coordinates) return;
        const latLng = [stacja.geometry.coordinates[1], stacja.geometry.coordinates[0]];
        const props = stacja.properties;
        const name = props.Station_name || "Stacja synoptyczna";

        // 1. Temperatura powietrza (Ta)
        if (props.Ta !== undefined && props.Ta !== null) {
            createRectMarker(latLng, props.Ta, '°', getTempColor(props.Ta), `<b>${name}</b><br>Temperatura powietrza: ${parseFloat(props.Ta).toFixed(1)}°C`, layers.temperature);
        }

        // 2. Temperatura przy gruncie (Tg)
        if (props.Tg !== undefined && props.Tg !== null) {
            createRectMarker(latLng, props.Tg, '°', getTempColor(props.Tg), `<b>${name}</b><br>Temperatura przy gruncie: ${parseFloat(props.Tg).toFixed(1)}°C`, layers.ground_temp);
        }

        // 3. Temperatura minimalna (Tmin)
        if (props.Tmin_hour !== undefined && props.Tmin_hour !== null) {
            createRectMarker(latLng, props.Tmin_hour, '°', getTempColor(props.Tmin_hour), `<b>${name}</b><br>Temperatura minimalna: ${parseFloat(props.Tmin_hour).toFixed(1)}°C`, layers.tmin);
        }

        // 4. Temperatura maksymalna (Tmax)
        if (props.Tmax_hour !== undefined && props.Tmax_hour !== null) {
            createRectMarker(latLng, props.Tmax_hour, '°', getTempColor(props.Tmax_hour), `<b>${name}</b><br>Temperatura maksymalna: ${parseFloat(props.Tmax_hour).toFixed(1)}°C`, layers.tmax);
        }

        // 5. Średnia prędkość wiatru
        if (props.Wind_avg !== undefined && props.Wind_avg !== null) {
            createRectMarker(latLng, props.Wind_avg, ' <span style="font-size:7px">m/s</span>', '#e2e8f0', `<b>${name}</b><br>Średnia prędkość wiatru: ${parseFloat(props.Wind_avg).toFixed(1)} m/s`, layers.wind);
        }

        // 6. Porywy wiatru
        if (props.Wind_max !== undefined && props.Wind_max !== null) {
            createRectMarker(latLng, props.Wind_max, ' <span style="font-size:7px">m/s</span>', '#fca5a5', `<b>${name}</b><br>Maksymalny poryw wiatru: ${parseFloat(props.Wind_max).toFixed(1)} m/s`, layers.wind_max);
        }

        // 7. Suma opadu (24h)
        if (props.Precip_24h !== undefined && props.Precip_24h !== null && props.Precip_24h > 0) {
            createRectMarker(latLng, props.Precip_24h, ' <span style="font-size:7px">mm</span>', getPrecipColor(props.Precip_24h), `<b>${name}</b><br>Suma opadu (24h): ${parseFloat(props.Precip_24h).toFixed(1)} mm`, layers.precipitation);
        }
    });
}

// Przywrócenie wczorajszej legendy w prawym dolnym rogu
function dodajLegende() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        const grades = [-15, -10, -5, 0, 3, 7, 12, 17, 22, 27];
        div.innerHTML = '<h4>Temperatura powietrza</h4>';
        
        for (let i = 0; i < grades.length; i++) {
            const color = getTempColor(grades[i] + 0.5);
            const labelText = grades[i] + (grades[i + 1] !== undefined ? ' do ' + grades[i + 1] + '°C' : '+°C');
            
            div.innerHTML += `
                <div style="margin-bottom: 3px;">
                    <div class="legend-color-box" style="background: ${color};"></div>
                    <span>${labelText}</span>
                </div>
            `;
        }
        return div;
    };
    legend.addTo(map);
}

// Współpraca suwaka z poprawną chronologią kluczy bazy danych
function ustawSuwakCzasu() {
    const slider = document.getElementById('date-picker');
    const label = document.getElementById('current-time-label');
    
    if (!slider || !label) return;

    slider.min = 0;
    slider.max = dostepneKlucze.length - 1;
    slider.value = dostepneKlucze.length - 1;

    function aktualizujEtykiete(indeks) {
        const klucz = dostepneKlucze[indeks];
        if (!klucz) return;
        const czesci = klucz.split('_');
        label.innerText = `${czesci[0]} godz. ${czesci[1]}:00`;
    }

    aktualizujEtykiete(dostepneKlucze.length - 1);
    wyswietlDaneDlaGodziny(dostepneKlucze[dostepneKlucze.length - 1]);

    slider.addEventListener('input', function(e) {
        const indeks = parseInt(e.target.value);
        aktualizujEtykiete(indeks);
        wyswietlDaneDlaGodziny(dostepneKlucze[indeks]);
    });
}

// Pobieranie stabilnej bazy godzinowej JSON
console.log("Rozpoczynam pobieranie pliku imgw_baza.json...");
fetch('imgw_baza.json')
    .then(res => {
        if (!res.ok) throw new Error(`Brak pliku bazy (Status: ${res.status})`);
        return res.json();
    })
    .then(data => {
        imgwBazaDanych = data;
        dostepneKlucze = Object.keys(data).sort();
        if (dostepneKlucze.length === 0) return;

        dodajLegende();
        ustawSuwakCzasu();
    })
    .catch(err => console.error("❌ Błąd krytyczny front-endu:", err));
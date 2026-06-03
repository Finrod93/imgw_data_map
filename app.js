// Inicjalizacja mapy Leaflet na Polskę
const map = L.map('map').setView([52.0689, 19.4797], 6);

// Podkład mapy
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Przywrócenie kompletnej listy warstw pomiarowych
const layers = {
    temperature: L.layerGroup(),
    ground_temp: L.layerGroup(),
    tmin: L.layerGroup(),
    tmax: L.layerGroup(),
    wind: L.layerGroup(),
    wind_max: L.layerGroup(),
    precipitation: L.layerGroup()
};

// Domyślnie na start włączamy temperaturę powietrza
layers.temperature.addTo(map);

// Kompletne menu wyboru warstw (po prawej stronie)
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

// Oryginalna paleta kolorów dla temperatur
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

// Kolory dla warstwy opadów
function getPrecipColor(p) {
    if (p === null || p === undefined || p === 0) return '#ffffff00';
    return p < 0.5 ? '#b3e5fc' :
           p < 2   ? '#4fc3f7' :
           p < 5   ? '#0288d1' :
           p < 15  ? '#01579b' : '#021a42';
}

// Funkcja nanosząca punkty i ETYKIETY tekstowe bezpośrednio na mapę
function wyswietlDaneDlaGodziny(klucz) {
    // Czyszczenie wszystkich warstw przed nowym rysowaniem
    Object.values(layers).forEach(lg => lg.clearLayers());

    const stacje = imgwBazaDanych[klucz];
    if (!stacje) return;

    stacje.forEach(stacja => {
        if (!stacja.geometry || !stacja.geometry.coordinates) return;
        const latLng = [stacja.geometry.coordinates[1], stacja.geometry.coordinates[0]];
        const props = stacja.properties;
        const name = props.Station_name || "Stacja synoptyczna";

        // 1. Warstwa: Temperatura powietrza (Ta) + Etykieta tekstowa na mapie
        if (props.Ta !== undefined && props.Ta !== null) {
            L.circleMarker(latLng, { radius: 7, fillColor: getTempColor(props.Ta), color: '#000', weight: 1, fillOpacity: 0.85 })
                .bindPopup(`<b>${name}</b><br>Temperatura powietrza: ${props.Ta}°C`)
                .addTo(layers.temperature);
            
            // Wyświetlanie wartości bezpośrednio na mapie (jak w QGIS/Felt)
            L.marker(latLng, {
                icon: L.divIcon({ className: 'station-value-label', html: `${props.Ta}°`, iconAnchor: [-10, 10] })
            }).addTo(layers.temperature);
        }

        // 2. Warstwa: Temperatura przy gruncie (Tg) + Etykieta
        if (props.Tg !== undefined && props.Tg !== null) {
            L.circleMarker(latLng, { radius: 7, fillColor: getTempColor(props.Tg), color: '#5c4033', weight: 1, fillOpacity: 0.85 })
                .bindPopup(`<b>${name}</b><br>Temperatura przy gruncie: ${props.Tg}°C`)
                .addTo(layers.ground_temp);

            L.marker(latLng, {
                icon: L.divIcon({ className: 'station-value-label', html: `${props.Tg}°`, iconAnchor: [-10, 10] })
            }).addTo(layers.ground_temp);
        }

        // 3. Warstwa: Temperatura minimalna (Tmin_hour) + Etykieta
        if (props.Tmin_hour !== undefined && props.Tmin_hour !== null) {
            L.circleMarker(latLng, { radius: 6, fillColor: getTempColor(props.Tmin_hour), color: '#0000ff', weight: 1, fillOpacity: 0.8 })
                .bindPopup(`<b>${name}</b><br>Temperatura minimalna z godziny: ${props.Tmin_hour}°C`)
                .addTo(layers.tmin);

            L.marker(latLng, {
                icon: L.divIcon({ className: 'station-value-label', html: `${props.Tmin_hour}°`, iconAnchor: [-10, 10] })
            }).addTo(layers.tmin);
        }

        // 4. Warstwa: Temperatura maksymalna (Tmax_hour) + Etykieta
        if (props.Tmax_hour !== undefined && props.Tmax_hour !== null) {
            L.circleMarker(latLng, { radius: 6, fillColor: getTempColor(props.Tmax_hour), color: '#ff0000', weight: 1, fillOpacity: 0.8 })
                .bindPopup(`<b>${name}</b><br>Temperatura maksymalna z godziny: ${props.Tmax_hour}°C`)
                .addTo(layers.tmax);

            L.marker(latLng, {
                icon: L.divIcon({ className: 'station-value-label', html: `${props.Tmax_hour}°`, iconAnchor: [-10, 10] })
            }).addTo(layers.tmax);
        }

        // 5. Warstwa: Średnia prędkość wiatru
        if (props.Wind_avg !== undefined && props.Wind_avg !== null) {
            L.circleMarker(latLng, { radius: 6, fillColor: '#cbd5e1', color: '#475569', weight: 1, fillOpacity: 0.8 })
                .bindPopup(`<b>${name}</b><br>Średnia prędkość wiatru: ${props.Wind_avg} m/s`)
                .addTo(layers.wind);

            L.marker(latLng, {
                icon: L.divIcon({ className: 'station-value-label', html: `${props.Wind_avg}<span style="font-size:8px">m/s</span>`, iconAnchor: [-10, 10] })
            }).addTo(layers.wind);
        }

        // 6. Warstwa: Porywy wiatru
        if (props.Wind_max !== undefined && props.Wind_max !== null) {
            L.circleMarker(latLng, { radius: 6, fillColor: '#fca5a5', color: '#b91c1c', weight: 1, fillOpacity: 0.8 })
                .bindPopup(`<b>${name}</b><br>Maksymalny poryw wiatru: ${props.Wind_max} m/s`)
                .addTo(layers.wind_max);

            L.marker(latLng, {
                icon: L.divIcon({ className: 'station-value-label', html: `${props.Wind_max}<span style="font-size:8px">m/s</span>`, iconAnchor: [-10, 10] })
            }).addTo(layers.wind_max);
        }

        // 7. Warstwa: Suma opadu (24h)
        if (props.Precip_24h !== undefined && props.Precip_24h !== null && props.Precip_24h > 0) {
            L.circleMarker(latLng, { radius: 7, fillColor: getPrecipColor(props.Precip_24h), color: '#0369a1', weight: 1, fillOpacity: 0.85 })
                .bindPopup(`<b>${name}</b><br>Suma opadu (24h): ${props.Precip_24h} mm`)
                .addTo(layers.precipitation);

            L.marker(latLng, {
                icon: L.divIcon({ className: 'station-value-label', html: `${props.Precip_24h}<span style="font-size:8px">mm</span>`, iconAnchor: [-10, 10] })
            }).addTo(layers.precipitation);
        }
    });
}

// Przywrócenie czytelnej, poprawnej Legendy w prawym dolnym rogu
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

// Konfiguracja suwaka czasu
function ustawSuwakCzasu() {
    const slider = document.getElementById('date-picker');
    const label = document.getElementById('current-time-label');
    
    if (!slider || !label) return;

    slider.min = 0;
    slider.max = dostepneKlucze.length - 1;
    const najnowszyIndeks = dostepneKlucze.length - 1;
    slider.value = najnowszyIndeks;

    function aktualizujEtykiete(indeks) {
        const klucz = dostepneKlucze[indeks];
        if (!klucz) return;
        const czesci = klucz.split('_');
        label.innerText = `${czesci[0]} godz. ${czesci[1]}:00`;
    }

    aktualizujEtykiete(najnowszyIndeks);
    wyswietlDaneDlaGodziny(dostepneKlucze[najnowszyIndeks]);

    slider.addEventListener('input', function(e) {
        const indeks = parseInt(e.target.value);
        aktualizujEtykiete(indeks);
        wyswietlDaneDlaGodziny(dostepneKlucze[indeks]);
    });
}

// Pobieranie bazy danych
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
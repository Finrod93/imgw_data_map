// Inicjalizacja mapy Leaflet na Polskę
const map = L.map('map').setView([52.0689, 19.4797], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Wczorajsze warstwy pomiarowe
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

// 🎨 WCZORAJSZA 17-PUNKTOWA SKALA Z QGIS DO LINIOWEJ INTERPOLACJI KOŁORÓW
const tempScale = [
    { t: -40, r: 245, g: 242, b: 245 }, { t: -35, r: 212, g: 185, b: 204 }, { t: -30, r: 125, g: 90,  b: 110 }, 
    { t: -25, r: 214, g: 110, b: 247 }, { t: -20, r: 135, g: 45,  b: 230 }, { t: -15, r: 40,  g: 30,  b: 215 }, 
    { t: -10, r: 50,  g: 100, b: 230 }, { t: -5,  r: 120, g: 190, b: 245 }, { t: 0,   r: 195, g: 255, b: 250 }, 
    { t: 5,   r: 120, g: 235, b: 160 }, { t: 10,  r: 55,  g: 160, b: 50  }, { t: 15,  r: 175, g: 215, b: 65  }, 
    { t: 20,  r: 255, g: 245, b: 50  }, { t: 25,  r: 255, g: 165, b: 40  }, { t: 30,  r: 255, g: 50,  b: 40  }, 
    { t: 35,  r: 180, g: 25,  b: 45  }, { t: 40,  r: 245, g: 150, b: 180 }
];

// Wczorajsza funkcja wyliczająca płynne przejścia kolorystyczne RGB (zgodnie z obrazkiem z QGIS)
function getTemperatureStyle(temp) {
    let t = parseFloat(temp);
    if (isNaN(t)) return { bg: 'rgba(230, 233, 234, 0.98)' };
    
    if (t <= tempScale[0].t) {
        return { bg: `rgba(${tempScale[0].r}, ${tempScale[0].g}, ${tempScale[0].b}, 0.98)` };
    }
    if (t >= tempScale[tempScale.length - 1].t) {
        return { bg: `rgba(${tempScale[tempScale.length - 1].r}, ${tempScale[tempScale.length - 1].g}, ${tempScale[tempScale.length - 1].b}, 0.98)` };
    }

    let lower = tempScale[0], upper = tempScale[tempScale.length - 1];
    for (let i = 0; i < tempScale.length - 1; i++) {
        if (t >= tempScale[i].t && t <= tempScale[i+1].t) {
            lower = tempScale[i];
            upper = tempScale[i+1];
            break;
        }
    }
    
    const fraction = (t - lower.t) / (upper.t - lower.t);
    const r = Math.round(lower.r + fraction * (upper.r - lower.r));
    const g = Math.round(lower.g + fraction * (upper.g - lower.g));
    const b = Math.round(lower.b + fraction * (upper.b - lower.b));
    
    return { bg: `rgba(${r}, ${g}, ${b}, 0.98)` };
}

// Skala opadów
function getPrecipColor(p) {
    if (p === null || p === undefined || p === 0) return '#ffffff00';
    return p < 0.5 ? '#b3e5fc' :
           p < 2   ? '#4fc3f7' :
           p < 5   ? '#0288d1' :
           p < 15  ? '#01579b' : '#021a42';
}

// Generowanie markerów: mała kropka + prostokąt z offsetem [-6, 12] i wymuszonym .toFixed(1)
function createRectMarker(latLng, value, unit, bgColor, popupText, layerGroup) {
    const formattedValue = parseFloat(value).toFixed(1);
    
    // Punkt bazowy stacji
    L.circleMarker(latLng, { radius: 3, fillColor: '#111', color: '#111', weight: 1, fillOpacity: 1 })
        .bindPopup(popupText)
        .addTo(layerGroup);

    // Etykieta prostokątna Felt style
    L.marker(latLng, {
        icon: L.divIcon({
            className: 'gis-rect-label',
            html: `<div class="gis-rect-box" style="background-color: ${bgColor};">${formattedValue}${unit}</div>`,
            iconAnchor: [-6, 12] // Dokładny wczorajszy offset od kropki
        })
    }).bindPopup(popupText).addTo(layerGroup);
}

// Renderowanie danych z bazy imgw_baza.json
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
            const style = getTemperatureStyle(props.Ta);
            createRectMarker(latLng, props.Ta, '°', style.bg, `<b>${name}</b><br>Temperatura powietrza: ${parseFloat(props.Ta).toFixed(1)}°C`, layers.temperature);
        }

        // 2. Temperatura przy gruncie (Tg)
        if (props.Tg !== undefined && props.Tg !== null) {
            const style = getTemperatureStyle(props.Tg);
            createRectMarker(latLng, props.Tg, '°', style.bg, `<b>${name}</b><br>Temperatura przy gruncie: ${parseFloat(props.Tg).toFixed(1)}°C`, layers.ground_temp);
        }

        // 3. Temperatura minimalna (Tmin)
        if (props.Tmin_hour !== undefined && props.Tmin_hour !== null) {
            const style = getTemperatureStyle(props.Tmin_hour);
            createRectMarker(latLng, props.Tmin_hour, '°', style.bg, `<b>${name}</b><br>Temperatura minimalna: ${parseFloat(props.Tmin_hour).toFixed(1)}°C`, layers.tmin);
        }

        // 4. Temperatura maksymalna (Tmax)
        if (props.Tmax_hour !== undefined && props.Tmax_hour !== null) {
            const style = getTemperatureStyle(props.Tmax_hour);
            createRectMarker(latLng, props.Tmax_hour, '°', style.bg, `<b>${name}</b><br>Temperatura maksymalna: ${parseFloat(props.Tmax_hour).toFixed(1)}°C`, layers.tmax);
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

// Generowanie wczorajszej pionowej legendy termicznej na bazie punktów węzłowych skali
function dodajLegende() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<h4>Meteo Ta</h4>';
        
        // Wybieramy kluczowe punkty węzłowe do legendy co 5/10 stopni, żeby była czytelna i pionowa
        const displayPoints = [-30, -20, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35];
        
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

// Powiązanie suwaka z chronologicznymi wpisami bazy danych
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

// Inicjalizacja pobierania danych
console.log("Wczytywanie zintegrowanej bazy godzinowej...");
fetch('imgw_baza.json')
    .then(res => {
        if (!res.ok) throw new Error(`Błąd ładowania bazy`);
        return res.json();
    })
    .then(data => {
        imgwBazaDanych = data;
        dostepneKlucze = Object.keys(data).sort();
        if (dostepneKlucze.length === 0) return;

        dodajLegende();
        ustawSuwakCzasu();
    })
    .catch(err => console.error("❌ Błąd front-endu:", err));
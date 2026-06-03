// Konfiguracja podkładów mapowych (Wybór bazy)
const baseLayers = {
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }),
    "Satelita (Esri)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri'
    })
};

// Inicjalizacja mapy z domyślnym podkładem OSM
const map = L.map('map', {
    layers: [baseLayers["OpenStreetMap"]]
}).setView([52.0689, 19.4797], 6);

// Warstwy pomiarowe
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

// Menu wyboru podkładów oraz warstw danych pogodowych
L.control.layers(baseLayers, {
    "Temperatura powietrza (Ta)": layers.temperature,
    "Temperatura przy gruncie (Tg)": layers.ground_temp,
    "Temperatura minimalna (Tmin)": layers.tmin,
    "Temperatura maksymalna (Tmax)": layers.tmax,
    "Średnia prędkość wiatru": layers.wind,
    "Maksymalne porywy wiatru": layers.wind_max,
    "Suma opadu (24h)": layers.precipitation
}, { collapsed: false }).addTo(map);

// Kontrola przeźroczystości podkładu mapy
const opacityControl = L.control({ position: 'topright' });
opacityControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'opacity-control-panel');
    div.innerHTML = `
        <label>Podkład:</label>
        <input type="range" id="bg-opacity-slider" min="0" max="1" step="0.1" value="1" style="width: 70px;">
    `;
    return div;
};
opacityControl.addTo(map);

document.getElementById('bg-opacity-slider').addEventListener('input', function(e) {
    const opacityValue = parseFloat(e.target.value);
    Object.values(baseLayers).forEach(layer => {
        layer.setOpacity(opacityValue);
    });
});

let imgwBazaDanych = {};
let dostepneKlucze = [];

// 17-punktowa skala z QGIS do płynnej interpolacji barw
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

// Rysowanie z uwzględnieniem pozycjonowania NAD kropką i klasami ekstremów krajowych
function createRectMarker(latLng, value, unit, bgColor, popupText, layerGroup, isMax = false, isMin = false) {
    const formattedValue = parseFloat(value).toFixed(1);
    
    // Budowanie klas dla ramki prostokąta
    let boxClass = "gis-rect-box";
    if (isMax) boxClass += " extreme-max";
    if (isMin) boxClass += " extreme-min";
    
    // 🟢 Zielony punkt stacji zakotwiczony na współrzędnych
    L.circleMarker(latLng, { 
        radius: 3.5, fillColor: '#24b14c', color: '#1b8539', weight: 1.5, fillOpacity: 1 
    }).bindPopup(popupText).addTo(layerGroup);

    // Prostokąt danych umieszczony symetrycznie NAD zieloną kropką
    L.marker(latLng, {
        icon: L.divIcon({
            className: 'gis-rect-label',
            html: `<div class="${boxClass}" style="background-color: ${bgColor};">${formattedValue}${unit}</div>`,
            iconAnchor: [19, 22] // 19px (połowa szerokości), 22px (wysokość + margines nad punktem)
        })
    }).bindPopup(popupText).addTo(layerGroup);
}

function wyswietlDaneDlaGodziny(klucz) {
    Object.values(layers).forEach(lg => lg.clearLayers());
    const stacje = imgwBazaDanych[klucz];
    if (!stacje) return;

    // 🔍 DYNAMICZNE WYSZUKIWANIE REKORDÓW MIN/MAX W TEJ GODZINIE
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
        const name = props.Station_name || "Stacja synoptyczna";

        if (props.Ta !== undefined && props.Ta !== null) {
            const val = parseFloat(props.Ta);
            createRectMarker(latLng, props.Ta, '°C', getTemperatureStyle(props.Ta).bg, `<b>${name}</b><br>Ta: ${val.toFixed(1)}°C`, layers.temperature, val === maxTa, val === minTa);
        }
        if (props.Tg !== undefined && props.Tg !== null) {
            const val = parseFloat(props.Tg);
            createRectMarker(latLng, props.Tg, '°C', getTemperatureStyle(props.Tg).bg, `<b>${name}</b><br>Tg: ${val.toFixed(1)}°C`, layers.ground_temp, val === maxTg, val === minTg);
        }
        if (props.Tmin_hour !== undefined && props.Tmin_hour !== null) {
            const val = parseFloat(props.Tmin_hour);
            createRectMarker(latLng, props.Tmin_hour, '°C', getTemperatureStyle(props.Tmin_hour).bg, `<b>${name}</b><br>Tmin: ${val.toFixed(1)}°C`, layers.tmin, val === maxTmin, val === minTmin);
        }
        if (props.Tmax_hour !== undefined && props.Tmax_hour !== null) {
            const val = parseFloat(props.Tmax_hour);
            createRectMarker(latLng, props.Tmax_hour, '°C', getTemperatureStyle(props.Tmax_hour).bg, `<b>${name}</b><br>Tmax: ${val.toFixed(1)}°C`, layers.tmax, val === maxTmax, val === minTmax);
        }
        if (props.Wind_avg !== undefined && props.Wind_avg !== null) {
            createRectMarker(latLng, props.Wind_avg, ' m/s', '#e2e8f0', `<b>${name}</b><br>Wiatr średni: ${parseFloat(props.Wind_avg).toFixed(1)} m/s`, layers.wind);
        }
        if (props.Wind_max !== undefined && props.Wind_max !== null) {
            createRectMarker(latLng, props.Wind_max, ' m/s', '#fca5a5', `<b>${name}</b><br>Poryw: ${parseFloat(props.Wind_max).toFixed(1)} m/s`, layers.wind_max);
        }
        if (props.Precip_24h !== undefined && props.Precip_24h !== null && props.Precip_24h > 0) {
            createRectMarker(latLng, props.Precip_24h, ' mm', getPrecipColor(props.Precip_24h), `<b>${name}</b><br>Opad: ${parseFloat(props.Precip_24h).toFixed(1)} mm`, layers.precipitation);
        }
    });
}

// 🔄 ODWRÓCONA LEGENDA - Ciepłe na górze, zimne na dole
function dodajLegende() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<h4>Meteo Ta</h4>';
        
        // Tablica ułożona malejąco, by wysokie temperatury były u góry
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

function ustawSuwakCzasu() {
    const slider = document.getElementById('date-picker');
    const label = document.getElementById('current-time-label');
    if (!slider || !label) return;

    slider.min = 0; slider.max = dostepneKlucze.length - 1; slider.value = dostepneKlucze.length - 1;

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

fetch('imgw_baza.json')
    .then(res => res.json())
    .then(data => {
        imgwBazaDanych = data;
        dostepneKlucze = Object.keys(data).sort();
        if (dostepneKlucze.length === 0) return;
        dodajLegende();
        ustawSuwakCzasu();
    });
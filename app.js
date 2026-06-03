// Inicjalizacja mapy Leaflet
const map = L.map('map').setView([52.0689, 19.4797], 6);

// Dodanie podkładu mapy (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Warstwy dla różnych typów danych
const layers = {
    temperature: L.layerGroup(),
    ground_temp: L.layerGroup(),
    wind: L.layerGroup(),
    precipitation: L.layerGroup()
};

// Domyślnie włączamy warstwę temperatury powietrza
layers.temperature.addTo(map);

// Przełącznik warstw na mapie
L.control.layers(null, {
    "Temperatura powietrza (Ta)": layers.temperature,
    "Temperatura gruntu (Tg)": layers.ground_temp,
    "Prędkość wiatru": layers.wind,
    "Opad atmosferyczny (24h)": layers.precipitation
}, { collapsed: false }).addTo(map);

// Globalne zmienne na dane i strukturę bazy
let imgwBazaDanych = {};
let dostepneKlucze = [];

// Funkcja określająca kolor dla temperatury powietrza
function getTempColor(t) {
    if (t === null || t === undefined) return '#808080';
    return t < -10 ? '#00008b' :
           t < 0   ? '#4169e1' :
           t < 5   ? '#add8e6' :
           t < 15  ? '#90ee90' :
           t < 25  ? '#ffa500' : '#ff4500';
}

// Funkcja określająca kolor dla opadu
function getPrecipColor(p) {
    if (p === null || p === undefined || p === 0) return '#ffffff00'; // przezroczysty dla braku opadu
    return p < 1  ? '#e0f7fa' :
           p < 5  ? '#80deea' :
           p < 15 ? '#26c6da' :
           p < 30 ? '#0097a7' : '#006064';
}

// Funkcja aktualizująca punkty na mapie dla wybranego klucza (RRRR-MM-DD_HH)
function wyswietlDaneDlaGodziny(klucz) {
    // Czyszczenie starych punktów ze wszystkich warstw
    Object.values(layers).forEach(layerGroup => layerGroup.clearLayers());

    const stacje = imgwBazaDanych[klucz];
    if (!stacje || stacje.length === 0) {
        console.warn(`Brak danych dla klucza: ${klucz}`);
        return;
    }

    stacje.forEach(stacja => {
        const coords = stacja.geometry.coordinates;
        const props = stacja.properties;
        
        // Odwracamy współrzędne GeoJSON [lon, lat] na format Leafleta [lat, lon]
        const latLng = [coords[1], coords[0]];

        // 1. Warstwa: Temperatura powietrza (Ta)
        if (props.Ta !== undefined && props.Ta !== null) {
            L.circleMarker(latLng, {
                radius: 8,
                fillColor: getTempColor(props.Ta),
                color: '#000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).bindPopup(`<b>${props.Station_name}</b><br>Temperatura: ${props.Ta}°C`)
              .addTo(layers.temperature);
        }

        // 2. Warstwa: Temperatura gruntu (Tg)
        if (props.Tg !== undefined && props.Tg !== null) {
            L.circleMarker(latLng, {
                radius: 8,
                fillColor: getTempColor(props.Tg),
                color: '#8b4513',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).bindPopup(`<b>${props.Station_name}</b><br>Temp. gruntu: ${props.Tg}°C`)
              .addTo(layers.ground_temp);
        }

        // 3. Warstwa: Wiatr (Wind_avg)
        if (props.Wind_avg !== undefined && props.Wind_avg !== null) {
            L.circleMarker(latLng, {
                radius: 6,
                fillColor: '#87ceeb',
                color: '#4682b4',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.7
            }).bindPopup(`<b>${props.Station_name}</b><br>Wiatr średni: ${props.Wind_avg} m/s<br>Wiatr max: ${props.Wind_max || 'brak'} m/s`)
              .addTo(layers.wind);
        }

        // 4. Warstwa: Opad (Precip_24h)
        if (props.Precip_24h !== undefined && props.Precip_24h !== null && props.Precip_24h > 0) {
            L.circleMarker(latLng, {
                radius: 7,
                fillColor: getPrecipColor(props.Precip_24h),
                color: '#00008b',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).bindPopup(`<b>${props.Station_name}</b><br>Opad 24h: ${props.Precip_24h} mm`)
              .addTo(layers.precipitation);
        }
    });
}

// Dynamiczne tworzenie i dodawanie Legendy do mapy
function dodajLegende() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        const grades = [-15, -10, 0, 5, 15, 25];
        div.innerHTML = '<h4>Temperatura (°C)</h4>';
        for (let i = 0; i < grades.length; i++) {
            div.innerHTML +=
                '<i style="background:' + getTempColor(grades[i] + 1) + '; width: 18px; height: 18px; float: left; margin-right: 8px; opacity: 0.8;"></i> ' +
                grades[i] + (grades[i + 1] ? ' do ' + grades[i + 1] + '<br>' : '+');
        }
        return div;
    };
    legend.addTo(map);
}

// Inicjalizacja suwaka na podstawie kluczy z bazy danych JSON
function ustawSuwakCzasu() {
    const slider = document.getElementById('date-picker');
    const label = document.getElementById('current-time-label');
    
    if (!slider || !label) {
        console.error("Nie znaleziono elementów suwaka w index.html");
        return;
    }

    // Ustawienia suwaka: od 0 do liczby dostępnych godzin minus 1
    slider.min = 0;
    slider.max = dostepneKlucze.length - 1;
    
    // Ustawiamy suwak na najnowszą godzinę (ostatni element tablicy)
    const najnowszyIndeks = dostepneKlucze.length - 1;
    slider.value = najnowszyIndeks;

    // Formatowanie wyświetlania etykiety nad suwakiem
    function aktualizujEtykiete(indeks) {
        const klucz = dostepneKlucze[indeks];
        if (!klucz) return;
        // Zamiana "2026-06-03_14" na ładne "2026-06-03 godz. 14:00"
        const czesci = klucz.split('_');
        label.innerText = `${czesci[0]} godz. ${czesci[1]}:00`;
    }

    // Pierwsze uruchomienie dla najnowszych danych
    aktualizujEtykiete(najnowszyIndeks);
    wyswietlDaneDlaGodziny(dostepneKlucze[najnowszyIndeks]);

    // Reakcja na przesuwanie suwaka przez użytkownika
    slider.addEventListener('input', function(e) {
        const indeks = parseInt(e.target.value);
        aktualizujEtykiete(indeks);
        wyswietlDaneDlaGodziny(dostepneKlucze[indeks]);
    });
}

// 🌐 GŁÓWNE POBIERANIE BAZY DANYCH JSON
console.log("Rozpoczynam pobieranie pliku imgw_baza.json...");
fetch('imgw_baza.json')
    .then(response => {
        if (!response.ok) {
            throw new Error(`Nie można wczytać pliku bazy danych (Status: ${response.status})`);
        }
        return response.json();
    })
    .then(data => {
        imgwBazaDanych = data;
        // Sortujemy klucze alfabetycznie/chronologicznie, żeby suwak szedł od najstarszych do najnowszych
        dostepneKlucze = Object.keys(data).sort();

        if (dostepneKlucze.length === 0) {
            console.error("Baza danych imgw_baza.json jest pusta (brak kluczy godzinowych).");
            return;
        }

        console.log(`Baza wczytana! Znaleziono ${dostepneKlucze.length} godzin danych.`);
        
        // Skoro mamy dane, budujemy elementy interfejsu
        dodajLegende();
        ustawSuwakCzasu();
    })
    .catch(error => {
        console.error("❌ BŁĄD SKRYPTU JAVASCRIPT:", error);
        alert("Wystąpił problem z załadowaniem bazy danych pogodowych. Sprawdź konsolę (F12).");
    });
    
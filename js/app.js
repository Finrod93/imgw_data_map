// Inicjalizacja mapy - centrum Polski
const map = L.map('map').setView([52.0, 19.5], 6);

// Definiuj warstwy bazowe OpenStreetMap
const baseLayers = {
    "Standard": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        minZoom: 4
    }),
    "Cycle Map": L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 20,
        minZoom: 4
    }),
    "Transport": L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
        minZoom: 4
    }),
    "Humanitarian": L.tileLayer('https://{s}.tile-{switch:cycle,humanitarian}.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 20,
        minZoom: 4
    })
};

// Dodaj domyślną warstwę (Standard)
baseLayers["Standard"].addTo(map);

// Dodaj kontrolkę wyboru warstw
L.control.layers(baseLayers).addTo(map);

// Załaduj dane GeoJSON
fetch('data/imgw_data.geojson')
    .then(response => response.json())
    .then(data => {
        // Parsuj GeoJSON i dodaj markery
        data.features.forEach(feature => {
            const coords = feature.geometry.coordinates;
            const lat = coords[1];
            const lon = coords[0];
            const props = feature.properties;

            // Ustaw kolor w zależności od temperatury
            let color = '#2196F3';
            let fillColor = '#2196F3';

            if (props.Ta) {
                if (props.Ta > 20) {
                    color = '#FF5722';
                    fillColor = '#FF5722';
                } else if (props.Ta > 15) {
                    color = '#FF9800';
                    fillColor = '#FF9800';
                } else if (props.Ta > 10) {
                    color = '#2196F3';
                    fillColor = '#2196F3';
                } else {
                    color = '#1565C0';
                    fillColor = '#1565C0';
                }
            }

            // Utwórz marker
            L.circleMarker([lat, lon], {
                radius: 7,
                fillColor: fillColor,
                color: color,
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            })
                .bindPopup(`
                <strong>${props.Station_name}</strong><br>
                ID: ${props.Station_id}<br>
                Status: ${props.Status}<br>
                Wysokość: ${props.Elevation} m<br>
                <hr>
                ${props.Ta ? `Temperatura: ${props.Ta}°C<br>` : ''}
                ${props.RH ? `Wilgotność: ${props.RH}%<br>` : ''}
                ${props.Wind_avg ? `Wiatr: ${props.Wind_avg} m/s<br>` : ''}
                ${props.Precip_24h ? `Opady 24h: ${props.Precip_24h} mm` : ''}
            `)
                .addTo(map);
        });
    })
    .catch(error => {
        console.error('Błąd wczytywania GeoJSON:', error);
        alert('Nie udało się wczytać danych IMGW');
    });

// Obsługa kliknięcia na mapę
map.on('click', function(e) {
    console.log(`Lat: ${e.latlng.lat.toFixed(4)}, Lng: ${e.latlng.lng.toFixed(4)}`);
});

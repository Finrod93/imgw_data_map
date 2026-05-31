// 1. Inicjalizacja mapy i wycentrowanie na obszar Polski
const map = L.map('map').setView([52.068811, 19.479699], 6.5);

// Podkład bazowy mapy - OpenStreetMap
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Grupa warstw dedykowana wyłącznie dla stacji zamkniętych
const stacjeZamkniete = L.layerGroup();

// Deklaracja grup warstw dla wszystkich 12 parametrów
const etykietyTa = L.layerGroup();
const etykietyTmin = L.layerGroup();
const etykietyTmax = L.layerGroup();
const etykietyTminHour = L.layerGroup();
const etykietyTmaxHour = L.layerGroup();
const etykietyTg = L.layerGroup();

const etykietyOpady24h = L.layerGroup();
const etykietyOpady10min = L.layerGroup();

const etykietyWindAvg = L.layerGroup();
const etykietyWindMax = L.layerGroup();

const etykietyElevation = L.layerGroup();
const etykietyStationName = L.layerGroup();

// Domyślnie po otwarciu mapy włączamy tylko warstwę temperatury aktualnej (Ta)
etykietyTa.addTo(map); 

// 3. Funkcja określająca wygląd punktu stacji (Promień kropki ustawiony na 3)
function getMarkerStyle(feature) {
    const status = feature.properties.Status;
    return {
        radius: 3, 
        fillColor: status === 'ACTIVE' ? '#2ecc71' : '#e74c3c',
        color: '#000',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
    };
}

// Funkcja pomocnicza do formatowania wartości numerycznych z określoną liczbą miejsc po przecinku
function formatValue(value, decimals = 1) {
    if (value !== undefined && value !== null && value !== "") {
        if (!isNaN(value) && typeof value !== 'string') {
            return Number(value).toFixed(decimals);
        }
        return value;
    }
    return null;
}

// Funkcja przeliczająca m/s na km/h (m/s * 3.6)
function convertMetersPerSecondToKilometersPerHour(value) {
    if (value !== undefined && value !== null && value !== "") {
        if (!isNaN(value)) {
            return Number(value) * 3.6;
        }
    }
    return null;
}

// Funkcja pomocnicza generująca punkt oraz etykietę o idealnych wymiarach
function addDataToParamGroup(rawValue, suffix, className, positionClass, latlng, popupContent, feature, group, isElevation = false, extraClass = '') {
    const decimals = isElevation ? 0 : 1;
    const formatted = formatValue(rawValue, decimals);
    
    if (formatted !== null) {
        // Tworzymy małą kropkę stacji
        const marker = L.circleMarker(latlng, getMarkerStyle(feature));
        marker.bindPopup(popupContent);
        
        // Tworzymy etykietę tekstową z dodatkową klasą pozycji i ewentualną klasą wyróżnienia wartości ekstremalnej
        const direction = positionClass === 'etykieta-dol' ? 'bottom' : 'top';
        const fullClassName = 'stacja-etykieta ' + className + ' ' + positionClass + (extraClass ? ' ' + extraClass : '');
        
        const lbl = L.tooltip({
            permanent: true, 
            direction: direction, 
            offset: [0, 0], 
            className: fullClassName
        }).setContent(`${formatted}${suffix}`).setLatLng(latlng);
        
        group.addLayer(marker);
        group.addLayer(lbl);
    }
}

// 4. Pobranie pliku z danymi GeoJSON
fetch('imgw_data.geojson')
    .then(response => {
        if (!response.ok) throw new Error('Nie udało się wczytać pliku imgw_data.geojson');
        return response.json();
    })
    .then(data => {
        // --- LOGIKA WYSZUKIWANIA WARTOŚCI EKSTREMALNYCH DLA CAŁEGO KRAJU ---
        let maxTmax = -Infinity;
        let maxTmaxHour = -Infinity;
        let minTmin = Infinity;
        let minTminHour = Infinity;

        // Pierwszy przebieg: szukamy wartości rekordowych wśród aktywnych stacji
        data.features.forEach(f => {
            const p = f.properties;
            if (p.Status === 'ACTIVE') {
                if (p.Tmax !== undefined && p.Tmax !== null && !isNaN(p.Tmax)) maxTmax = Math.max(maxTmax, Number(p.Tmax));
                if (p.Tmax_hour !== undefined && p.Tmax_hour !== null && !isNaN(p.Tmax_hour)) maxTmaxHour = Math.max(maxTmaxHour, Number(p.Tmax_hour));
                if (p.Tmin !== undefined && p.Tmin !== null && !isNaN(p.Tmin)) minTmin = Math.min(minTmin, Number(p.Tmin));
                if (p.Tmin_hour !== undefined && p.Tmin_hour !== null && !isNaN(p.Tmin_hour)) minTminHour = Math.min(minTminHour, Number(p.Tmin_hour));
            }
        });

        // Drugi przebieg: rysowanie punktów i nadawanie klas dynamicznych
        L.geoJSON(data, {
            pointToLayer: function (feature, latlng) {
                const props = feature.properties;

                // Przeliczenie wiatru z m/s na km/h
                const windAvgKmh = convertMetersPerSecondToKilometersPerHour(props.Wind_avg);
                const windMaxKmh = convertMetersPerSecondToKilometersPerHour(props.Wind_max);

                // Formatowanie parametrów pod popup
                const fTa = formatValue(props.Ta, 1);
                const fTmin = formatValue(props.Tmin, 1);
                const fTmax = formatValue(props.Tmax, 1);
                const fTminHour = formatValue(props.Tmin_hour, 1);
                const fTmaxHour = formatValue(props.Tmax_hour, 1);
                const fTg = formatValue(props.Tg, 1);
                const fPrecip24h = formatValue(props.Precip_24h, 1);
                const fPrecip10min = formatValue(props.Precip_10min, 1);
                const fWindAvg = formatValue(windAvgKmh, 1);
                const fWindMax = formatValue(windMaxKmh, 1);
                const fElevation = formatValue(props.Elevation, 0);

                // Przygotowanie jednolitej zawartości popupu
                let popupContent = `<h3>${props.Station_name || 'Stacja pomiarowa'}</h3><hr>`;
                popupContent += `<p><strong>ID Stacji:</strong> ${props.Station_id}</p>`;
                popupContent += `<p><strong>Status:</strong> <span style="color:${props.Status === 'ACTIVE' ? '#2ecc71' : '#e74c3c'}; font-weight:bold;">${props.Status === 'ACTIVE' ? 'Aktywna' : 'Zamknięta'}</span></p>`;
                if (fElevation !== null) popupContent += `<p><strong>Wysokość (Elevation):</strong> ${fElevation} m n.p.m.</p>`;
                
                if (fTa !== null) popupContent += `<p><strong>Temperatura aktualna (Ta):</strong> ${fTa}°C</p>`;
                if (fTmin !== null) popupContent += `<p><strong>Temperatura min (Tmin):</strong> ${fTmin}°C</p>`;
                if (fTmax !== null) popupContent += `<p><strong>Temperatura max (Tmax):</strong> ${fTmax}°C</p>`;
                if (fTminHour !== null) popupContent += `<p><strong>Temperatura min. godz. (Tmin_hour):</strong> ${fTminHour}°C</p>`;
                if (fTmaxHour !== null) popupContent += `<p><strong>Temperatura max. godz. (Tmax_hour):</strong> ${fTmaxHour}°C</p>`;
                if (fTg !== null) popupContent += `<p><strong>Temperatura przy gruncie (Tg):</strong> ${fTg}°C</p>`;
                
                if (fPrecip24h !== null) popupContent += `<p><strong>Opad dobowy (Precip_24h):</strong> ${fPrecip24h} mm</p>`;
                if (fPrecip10min !== null) popupContent += `<p><strong>Opad 10 min (Precip_10min):</strong> ${fPrecip10min} mm</p>`;
                
                if (fWindAvg !== null) popupContent += `<p><strong>Średnia prędkość wiatru (Wind_avg):</strong> ${fWindAvg} km/h</p>`;
                if (fWindMax !== null) popupContent += `<p><strong>Maksymalny poryw wiatru (Wind_max):</strong> ${fWindMax} km/h</p>`;

                // Rozdzielanie aktywnych i zamkniętych stacji
                if (props.Status === 'ACTIVE') {
                    // Standardowo na górze
                    addDataToParamGroup(props.Ta, '°C', 'temp-aktualna', 'etykieta-gora', latlng, popupContent, feature, etykietyTa, false, '');
                    
                    // Tmin i Tmin_hour na dół (sprawdzanie czy wartość jest absolutnie najniższa w kraju)
                    const isMinTmin = (props.Tmin !== undefined && props.Tmin !== null && Number(props.Tmin) === minTmin) ? 'najnizsza-temp' : '';
                    const isMinTminHour = (props.Tmin_hour !== undefined && props.Tmin_hour !== null && Number(props.Tmin_hour) === minTminHour) ? 'najnizsza-temp' : '';
                    
                    addDataToParamGroup(props.Tmin, '°C', 'temp-min', 'etykieta-dol', latlng, popupContent, feature, etykietyTmin, false, isMinTmin);
                    addDataToParamGroup(props.Tmin_hour, '°C', 'temp-min-hour', 'etykieta-dol', latlng, popupContent, feature, etykietyTminHour, false, isMinTminHour);
                    
                    // Tmax i Tmax_hour na górę (sprawdzanie czy wartość jest absolutnie najwyższa w kraju)
                    const isMaxTmax = (props.Tmax !== undefined && props.Tmax !== null && Number(props.Tmax) === maxTmax) ? 'najwyzsza-temp' : '';
                    const isMaxTmaxHour = (props.Tmax_hour !== undefined && props.Tmax_hour !== null && Number(props.Tmax_hour) === maxTmaxHour) ? 'najwyzsza-temp' : '';
                    
                    addDataToParamGroup(props.Tmax, '°C', 'temp-max', 'etykieta-gora', latlng, popupContent, feature, etykietyTmax, false, isMaxTmax);
                    addDataToParamGroup(props.Tmax_hour, '°C', 'temp-max-hour', 'etykieta-gora', latlng, popupContent, feature, etykietyTmaxHour, false, isMaxTmaxHour);
                    
                    // Pozostałe parametry standardowo na górze
                    addDataToParamGroup(props.Tg, '°C', 'temp-grunt', 'etykieta-gora', latlng, popupContent, feature, etykietyTg, false, '');
                    addDataToParamGroup(props.Precip_24h, ' mm', 'opad-dobowy', 'etykieta-gora', latlng, popupContent, feature, etykietyOpady24h, false, '');
                    addDataToParamGroup(props.Precip_10min, ' mm', 'opad-10min', 'etykieta-gora', latlng, popupContent, feature, etykietyOpady10min, false, '');
                    
                    // Wiatr zaktualizowany do km/h
                    addDataToParamGroup(windAvgKmh, ' km/h', 'wiatr-avg', 'etykieta-gora', latlng, popupContent, feature, etykietyWindAvg, false, '');
                    addDataToParamGroup(windMaxKmh, ' km/h', 'wiatr-max', 'etykieta-gora', latlng, popupContent, feature, etykietyWindMax, false, '');
                    
                    addDataToParamGroup(props.Elevation, ' m n.p.m.', 'wysokosc', 'etykieta-gora', latlng, popupContent, feature, etykietyElevation, true, '');
                    addDataToParamGroup(props.Station_name, '', 'nazwa-stacji', 'etykieta-gora', latlng, popupContent, feature, etykietyStationName, false, '');
                } else if (props.Status === 'CLOSED') {
                    const markerZamkniety = L.circleMarker(latlng, getMarkerStyle(feature));
                    markerZamkniety.bindPopup(popupContent);
                    stacjeZamkniete.addLayer(markerZamkniety);
                }
                
                return null;
            }
        });

        // 5. Powiązanie z panelem wyboru warstw (Overlays)
        const overlayMaps = {
            "Stacje zamknięte (Status: CLOSED)": stacjeZamkniete,
            "<div class='leaflet-control-layers-separator'></div><div class='leaflet-menu-section-title'>Aktywne stacje według parametru:</div>": L.layerGroup(),
            "Nazwa stacji (Station_name)": etykietyStationName,
            "Wysokość (Elevation)": etykietyElevation,
            "Temperatura aktualna (Ta)": etykietyTa,
            "Temperatura minimalna (Tmin)": etykietyTmin,
            "Temperatura maksymalna (Tmax)": etykietyTmax,
            "Temperatura min. godzinowa (Tmin_hour)": etykietyTminHour,
            "Temperatura max. godzinowa (Tmax_hour)": etykietyTmaxHour,
            "Temperatura przy gruncie (Tg)": etykietyTg,
            "Suma opadów (Precip_24h)": etykietyOpady24h,
            "Opad 10 minutowy (Precip_10min)": etykietyOpady10min,
            "Średni wiatr (Wind_avg)": etykietyWindAvg,
            "Porywy wiatru (Wind_max)": etykietyWindMax
        };

        const baseMaps = {
            "OpenStreetMap": osmLayer
        };

        L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);

        // Czyszczenie pustego checkboxa przy nagłówku sekcji
        const labels = document.querySelectorAll('.leaflet-control-layers-overlays label');
        labels.forEach(label => {
            if (label.innerHTML.includes('leaflet-menu-section-title')) {
                const checkbox = label.querySelector('input');
                if (checkbox) checkbox.remove();
            }
        });
    })
    .catch(error => {
        console.error('Błąd aplikacji:', error);
        alert('Problem z wczytaniem danych GeoJSON.');
    });
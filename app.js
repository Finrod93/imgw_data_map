const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
const esriSatelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });

const map = L.map('map', { center: [52.068811, 19.479699], zoom: 6.5, layers: [osmLayer] });

let bazaDanych = null;

const grupyWarstw = {
    stacjeZamkniete: L.layerGroup(), etykietyTa: L.layerGroup(), etykietyTmin: L.layerGroup(), etykietyTmax: L.layerGroup(),
    etykietyTg: L.layerGroup(), etykietyOpady24h: L.layerGroup(), etykietyWindAvg: L.layerGroup(),
    etykietyElevation: L.layerGroup(), etykietyStationName: L.layerGroup()
};

grupyWarstw.etykietyTa.addTo(map);

function addDataToParamGroup(rawValue, suffix, className, positionClass, latlng, popupContent, group) {
    if (rawValue === undefined || rawValue === null) return;
    const formatted = typeof rawValue === 'number' ? rawValue.toFixed(1) : rawValue;
    const direction = positionClass === 'etykieta-dol' ? 'bottom' : 'top';
    
    const marker = L.circleMarker(latlng, { radius: 3, fillColor: '#2ecc71', color: '#000', weight: 1, fillOpacity: 0.8 });
    marker.bindPopup(popupContent);

    const lbl = L.tooltip({ permanent: true, direction: direction, className: `stacja-etykieta ${className} ${positionClass}` }).setContent(`${formatted}${suffix}`).setLatLng(latlng);
    group.addLayer(marker);
    group.addLayer(lbl);
}

function zaladujDaneDlaWybranejGodziny() {
    const dataOkreslana = document.getElementById('date-picker').value;
    const godzinaOkreslana = String(document.getElementById('time-slider').value).padStart(2, '0');
    document.getElementById('current-time-display').innerText = `${godzinaOkreslana}:00`;

    const kluczCzasowy = `${dataOkreslana}_${godzinaOkreslana}`;
    
    // Zawsze czyść mapę, nawet jeśli nie ma danych
    Object.values(grupyWarstw).forEach(g => g.clearLayers());

    // 🔒 ZABEZPIECZENIE: Jeśli nie ma danych, przerwij bez wyrzucania błędu
    if (!bazaDanych || !bazaDanych[kluczCzasowy] || !Array.isArray(bazaDanych[kluczCzasowy])) {
        console.warn("Brak danych dla godziny: " + kluczCzasowy);
        return;
    }

    bazaDanych[kluczCzasowy].forEach(f => {
        if (!f.geometry || !f.geometry.coordinates) return;
        const p = f.properties;
        const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
        let popup = `<h3>${p.Station_name || 'Stacja'}</h3><hr><p>ID: ${p.Station_id}</p>`;

        if (p.Status === 'ACTIVE') {
            addDataToParamGroup(p.Ta, '°C', 'temp-aktualna', 'etykieta-gora', latlng, popup, grupyWarstw.etykietyTa);
            addDataToParamGroup(p.Tmin_hour, '°C', 'temp-min', 'etykieta-dol', latlng, popup, grupyWarstw.etykietyTmin);
            addDataToParamGroup(p.Tmax_hour, '°C', 'temp-max', 'etykieta-gora', latlng, popup, grupyWarstw.etykietyTmax);
            addDataToParamGroup(p.Tg, '°C', 'temp-grunt', 'etykieta-gora', latlng, popup, grupyWarstw.etykietyTg);
            addDataToParamGroup(p.Wind_avg, ' km/h', 'wiatr-avg', 'etykieta-gora', latlng, popup, grupyWarstw.etykietyWindAvg);
            addDataToParamGroup(p.Elevation, 'm', 'wysokosc', 'etykieta-gora', latlng, popup, grupyWarstw.etykietyElevation);
            addDataToParamGroup(p.Station_name, '', 'nazwa-stacji', 'etykieta-gora', latlng, popup, grupyWarstw.etykietyStationName);
        } else {
            const mZ = L.circleMarker(latlng, { radius: 3, fillColor: '#e74c3c', color: '#000', weight: 1 }).bindPopup(popup);
            grupyWarstw.stacjeZamkniete.addLayer(mZ);
        }
    });
}

// Ustawienia początkowe kontrolek czasu
const dzis = new Date().toISOString().split('T')[0];
document.getElementById('date-picker').value = dzis;
document.getElementById('date-picker').max = dzis;

// Domyślnie ustawiamy suwak na JEDNĄ GODZINĘ WSTECZ, żeby zwiększyć szansę na gotowe dane
let domyslnaGodzina = new Date().getHours() - 1;
if (domyslnaGodzina < 0) domyslnaGodzina = 23;
document.getElementById('time-slider').value = domyslnaGodzina;

const cacheBuster = new Date().getTime();

fetch(`imgw_baza.json?t=${cacheBuster}`)
    .then(r => {
        if (!r.ok) throw new Error("Nie można pobrać pliku bazy");
        return r.json();
    })
    .then(data => {
        bazaDanych = data;
        zaladujDaneDlaWybranejGodziny();

        const baseMaps = { "OpenStreetMap": osmLayer, "Satelita": esriSatelite };
        const overlayMaps = {
            "Nazwa stacji": grupyWarstw.etykietyStationName, "Wysokość": grupyWarstw.etykietyElevation,
            "Temperatura aktualna (Ta)": grupyWarstw.etykietyTa, "Temperatura min (Tmin_h)": grupyWarstw.etykietyTmin,
            "Temperatura max (Tmax_h)": grupyWarstw.etykietyTmax, "Przy gruncie (Tg)": grupyWarstw.etykietyTg,
            "Średni wiatr": grupyWarstw.etykietyWindAvg, "Zamknięte": grupyWarstw.stacjeZamkniete
        };

        L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);
    })
    .catch(err => {
        console.error(err);
        // Nawet w przypadku błędu ładowania bazy, pozwól zinicjalizować interfejs
        zaladujDaneDlaWybranejGodziny();
    });

document.getElementById('time-slider').addEventListener('input', zaladujDaneDlaWybranejGodziny);
document.getElementById('date-picker').addEventListener('change', zaladujDaneDlaWybranejGodziny);
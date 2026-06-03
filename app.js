const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

const esriSatelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBL, and the GIS User Community'
});

const cartoDbDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
});

const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
});

let activeBaseLayer = osmLayer;

const map = L.map('map', {
    center: [52.068811, 19.479699],
    zoom: 6.5,
    layers: [osmLayer]
});

const stacjeZamkniete = L.layerGroup();
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

etykietyTa.addTo(map); 

let globalDatabase = null;
let controlsInitialized = false;

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

function formatValue(value, decimals = 1) {
    if (value !== undefined && value !== null && value !== "") {
        if (!isNaN(value) && typeof value !== 'string') {
            return Number(value).toFixed(decimals);
        }
        return value;
    }
    return null;
}

function convertMetersPerSecondToKilometersPerHour(value) {
    if (value !== undefined && value !== null && value !== "") {
        if (!isNaN(value)) {
            return Number(value) * 3.6;
        }
    }
    return null;
}

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
        if (t >= tempScale[i].t && t <= tempScale[i+1].t) { lower = tempScale[i]; upper = tempScale[i+1]; break; }
    }
    const fraction = (t - lower.t) / (upper.t - lower.t);
    return { bg: `rgba(${Math.round(lower.r + fraction * (upper.r - lower.r))}, ${Math.round(lower.g + fraction * (upper.g - lower.g))}, ${Math.round(lower.b + fraction * (upper.b - lower.b))}, 0.98)` };
}

function addDataToParamGroup(rawValue, suffix, className, positionClass, latlng, popupContent, feature, group, isElevation = false, extremeType = '') {
    const decimals = isElevation ? 0 : 1;
    const formatted = formatValue(rawValue, decimals);
    
    if (formatted !== null) {
        const marker = L.circleMarker(latlng, getMarkerStyle(feature));
        marker.bindPopup(popupContent);
        const direction = positionClass === 'etykieta-dol' ? 'bottom' : 'top';
        
        let extraClass = '';
        if (extremeType === 'max') extraClass = ' ramka-max';
        if (extremeType === 'min') extraClass = ' ramka-min';
        
        const fullClassName = 'stacja-etykieta ' + className + ' ' + positionClass + extraClass;
        const isTemperatureLayer = ['temp-aktualna', 'temp-min', 'temp-min-hour', 'temp-max', 'temp-max-hour', 'temp-grunt'].includes(className);
        
        let tooltipContent;
        if (isTemperatureLayer) {
            let borderStyle = '1px solid #666'; 
            if (extremeType === 'max') borderStyle = '2px solid #ff0000';
            if (extremeType === 'min') borderStyle = '2px solid #0000ff';
            
            const tStyle = getTemperatureStyle(rawValue);
            tooltipContent = `<div style="background: ${tStyle.bg} !important; border: ${borderStyle} !important; width: 100%; height: 100%; display: inline-flex; align-items: center; justify-content: center; margin: -1px -3px; padding: 1px 3px; border-radius: 2px;">${formatted}${suffix}</div>`;
        } else {
            tooltipContent = `${formatted}${suffix}`;
        }
        
        const lbl = L.tooltip({ permanent: true, direction: direction, offset: [0, 0], className: fullClassName })
                     .setContent(tooltipContent)
                     .setLatLng(latlng);
        group.addLayer(marker);
        group.addLayer(lbl);
    }
}

function clearAllTimeLayers() {
    stacjeZamkniete.clearLayers();
    etykietyTa.clearLayers();
    etykietyTmin.clearLayers();
    etykietyTmax.clearLayers();
    etykietyTminHour.clearLayers();
    etykietyTmaxHour.clearLayers();
    etykietyTg.clearLayers();
    etykietyOpady24h.clearLayers();
    etykietyOpady10min.clearLayers();
    etykietyWindAvg.clearLayers();
    etykietyWindMax.clearLayers();
    etykietyElevation.clearLayers();
    etykietyStationName.clearLayers();
}

function renderDataForTimestamp(targetDateStr, targetHourInt) {
    if (!globalDatabase) return;

    clearAllTimeLayers();

    const hourPad = targetHourInt < 10 ? '0' + targetHourInt : targetHourInt;
    const timeKey = `${targetDateStr} ${hourPad}:00`;

    let extremes = { 
        Ta: { min: Infinity, max: -Infinity }, 
        Tmin: { min: Infinity, max: -Infinity }, 
        Tmax: { min: Infinity, max: -Infinity }, 
        Tmin_hour: { min: Infinity, max: -Infinity }, 
        Tmax_hour: { min: Infinity, max: -Infinity }, 
        Tg: { min: Infinity, max: -Infinity }, 
        Wind_avg: { min: Infinity, max: -Infinity }, 
        Wind_max: { min: Infinity, max: -Infinity }, 
        Precip_24h: { max: -Infinity }, 
        Precip_10min: { max: -Infinity } 
    };

    globalDatabase.features.forEach(f => {
        const p = f.properties;
        if (p.Status === 'ACTIVE' && p.Measurements && p.Measurements[timeKey]) {
            const m = p.Measurements[timeKey];
            const wAvg = convertMetersPerSecondToKilometersPerHour(m.Wind_avg);
            const wMax = convertMetersPerSecondToKilometersPerHour(m.Wind_max);
            
            if (m.Ta != null) { extremes.Ta.min = Math.min(extremes.Ta.min, m.Ta); extremes.Ta.max = Math.max(extremes.Ta.max, m.Ta); }
            if (m.Tmin != null) { extremes.Tmin.min = Math.min(extremes.Tmin.min, m.Tmin); extremes.Tmin.max = Math.max(extremes.Tmin.max, m.Tmin); }
            if (m.Tmax != null) { extremes.Tmax.min = Math.min(extremes.Tmax.min, m.Tmax); extremes.Tmax.max = Math.max(extremes.Tmax.max, m.Tmax); }
            if (m.Tmin_hour != null) { extremes.Tmin_hour.min = Math.min(extremes.Tmin_hour.min, m.Tmin_hour); extremes.Tmin_hour.max = Math.max(extremes.Tmin_hour.max, m.Tmin_hour); }
            if (m.Tmax_hour != null) { extremes.Tmax_hour.min = Math.min(extremes.Tmax_hour.min, m.Tmax_hour); extremes.Tmax_hour.max = Math.max(extremes.Tmax_hour.max, m.Tmax_hour); }
            if (m.Tg != null) { extremes.Tg.min = Math.min(extremes.Tg.min, m.Tg); extremes.Tg.max = Math.max(extremes.Tg.max, m.Tg); }
            if (wAvg != null) { extremes.Wind_avg.min = Math.min(extremes.Wind_avg.min, wAvg); extremes.Wind_avg.max = Math.max(extremes.Wind_avg.max, wAvg); }
            if (wMax != null) { extremes.Wind_max.min = Math.min(extremes.Wind_max.min, wMax); extremes.Wind_max.max = Math.max(extremes.Wind_max.max, wMax); }
            if (m.Precip_24h != null) extremes.Precip_24h.max = Math.max(extremes.Precip_24h.max, m.Precip_24h);
            if (m.Precip_10min != null) extremes.Precip_10min.max = Math.max(extremes.Precip_10min.max, m.Precip_10min);
        }
    });

    globalDatabase.features.forEach(feature => {
        const props = feature.properties;
        const latlng = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
        
        const hasMeasurement = props.Measurements && props.Measurements[timeKey];
        const m = hasMeasurement ? props.Measurements[timeKey] : {};

        const wAvgKmh = convertMetersPerSecondToKilometersPerHour(m.Wind_avg);
        const wMaxKmh = convertMetersPerSecondToKilometersPerHour(m.Wind_max);

        const fTa = formatValue(m.Ta, 1);
        const fTmin = formatValue(m.Tmin, 1);
        const fTmax = formatValue(m.Tmax, 1);
        const fTminHour = formatValue(m.Tmin_hour, 1);
        const fTmaxHour = formatValue(m.Tmax_hour, 1);
        const fTg = formatValue(m.Tg, 1);
        const fPrecip24h = formatValue(m.Precip_24h, 1);
        const fPrecip10min = formatValue(m.Precip_10min, 1);
        const fWindAvg = formatValue(wAvgKmh, 1);
        const fWindMax = formatValue(wMaxKmh, 1);
        const fElevation = formatValue(props.Elevation, 0);

        let popupContent = `<h3>${props.Station_name || 'Stacja pomiarowa'}</h3><hr><p><strong>ID:</strong> ${props.Station_id}</p><p><strong>Status:</strong> <span style="color:${props.Status === 'ACTIVE' ? '#2ecc71' : '#e74c3c'}; font-weight:bold;">${props.Status === 'ACTIVE' ? 'Aktywna' : 'Zamknięta'}</span></p>`;
        if (fElevation !== null) popupContent += `<p><strong>Wysokość:</strong> ${fElevation} m n.p.m.</p>`;
        if (fTa !== null) popupContent += `<p><strong>Ta:</strong> ${fTa}°C</p>`;
        if (fTmin !== null) popupContent += `<p><strong>Tmin:</strong> ${fTmin}°C</p>`;
        if (fTmax !== null) popupContent += `<p><strong>Tmax:</strong> ${fTmax}°C</p>`;
        if (fPrecip24h !== null) popupContent += `<p><strong>Opad 24h:</strong> ${fPrecip24h} mm</p>`;
        if (fWindAvg !== null) popupContent += `<p><strong>Wiatr średni:</strong> ${fWindAvg} km/h</p>`;

        if (props.Status === 'ACTIVE') {
            const getEx = (val, field) => {
                if (val == null || isNaN(val)) return '';
                const parsed = parseFloat(val);
                if (extremes[field].max !== undefined && parsed === extremes[field].max) return 'max';
                if (extremes[field].min !== undefined && parsed === extremes[field].min) return 'min';
                return '';
            };

            addDataToParamGroup(m.Ta, '°C', 'temp-aktualna', 'etykieta-gora', latlng, popupContent, feature, etykietyTa, false, getEx(m.Ta, 'Ta'));
            addDataToParamGroup(m.Tmin, '°C', 'temp-min', 'etykieta-dol', latlng, popupContent, feature, etykietyTmin, false, getEx(m.Tmin, 'Tmin'));
            addDataToParamGroup(m.Tmin_hour, '°C', 'temp-min-hour', 'etykieta-dol', latlng, popupContent, feature, etykietyTminHour, false, getEx(m.Tmin_hour, 'Tmin_hour'));
            addDataToParamGroup(m.Tmax, '°C', 'temp-max', 'etykieta-gora', latlng, popupContent, feature, etykietyTmax, false, getEx(m.Tmax, 'Tmax'));
            addDataToParamGroup(m.Tmax_hour, '°C', 'temp-max-hour', 'etykieta-gora', latlng, popupContent, feature, etykietyTmaxHour, false, getEx(m.Tmax_hour, 'Tmax_hour'));
            addDataToParamGroup(m.Tg, '°C', 'temp-grunt', 'etykieta-gora', latlng, popupContent, feature, etykietyTg, false, getEx(m.Tg, 'Tg'));
            addDataToParamGroup(m.Precip_24h, ' mm', 'opad-dobowy', 'etykieta-gora', latlng, popupContent, feature, etykietyOpady24h, false, getEx(m.Precip_24h, 'Precip_24h'));
            addDataToParamGroup(m.Precip_10min, ' mm', 'opad-10min', 'etykieta-gora', latlng, popupContent, feature, etykietyOpady10min, false, getEx(m.Precip_10min, 'Precip_10min'));
            addDataToParamGroup(wAvgKmh, ' km/h', 'wiatr-avg', 'etykieta-gora', latlng, popupContent, feature, etykietyWindAvg, false, getEx(wAvgKmh, 'Wind_avg'));
            addDataToParamGroup(wMaxKmh, ' km/h', 'wiatr-max', 'etykieta-gora', latlng, popupContent, feature, etykietyWindMax, false, getEx(wMaxKmh, 'Wind_max'));
            addDataToParamGroup(props.Elevation, ' m n.p.m.', 'wysokosc', 'etykieta-gora', latlng, popupContent, feature, etykietyElevation, true, '');
            addDataToParamGroup(props.Station_name, '', 'nazwa-stacji', 'etykieta-gora', latlng, popupContent, feature, etykietyStationName, false, '');
        } else {
            const mZ = L.circleMarker(latlng, getMarkerStyle(feature)).bindPopup(popupContent);
            stacjeZamkniete.addLayer(mZ);
        }
    });

    updateLegendVisibility();
}

function loadDataForDate(dateStr) {
    const filePath = `imgw_baza/${dateStr}.json`;

    fetch(filePath)
        .then(response => { 
            if (!response.ok) throw new Error("Brak danych dla wybranej daty."); 
            return response.json(); 
        })
        .then(data => {
            globalDatabase = data;
            
            if (!controlsInitialized) {
                initLeafletControls();
                controlsInitialized = true;
            }

            updateTimelineView();
        })
        .catch(err => {
            alert(`Nie znaleziono pliku archiwalnego dla daty: ${dateStr}. Wyświetlam puste warstwy.`);
            clearAllTimeLayers();
        });
}

function initLeafletControls() {
    const baseMaps = { "Standardowy (OpenStreetMap)": osmLayer, "Satelita (Esri)": esriSatelite, "Ciemny (CartoDB)": cartoDbDark, "Topograficzny": openTopo };
    const overlayMaps = {
        "Stacje zamknięte (Status: CLOSED)": stacjeZamkniete,
        "<div class='leaflet-control-layers-separator'></div><div class='leaflet-menu-section-title'>Aktywne stacje według parametru:</div>": L.layerGroup(),
        "Nazwa stacji (Station_name)": etykietyStationName, "Wysokość (Elevation)": etykietyElevation, "Temperatura aktualna (Ta)": etykietyTa, "Temperatura minimalna (Tmin)": etykietyTmin, "Temperatura maksymalna (Tmax)": etykietyTmax, "Temperatura min. godzinowa (Tmin_hour)": etykietyTminHour, "Temperatura max. godzinowa (Tmax_hour)": etykietyTmaxHour, "Temperatura przy gruncie (Tg)": etykietyTg, "Suma opadów (Precip_24h)": etykietyOpady24h, "Opad 10 minutowy (Precip_10min)": etykietyOpady10min, "Średni wiatr (Wind_avg)": etykietyWindAvg, "Porywy wiatru (Wind_max)": etykietyWindMax
    };

    L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);

    document.querySelectorAll('.leaflet-control-layers-overlays label').forEach(label => {
        if (label.innerHTML.includes('leaflet-menu-section-title')) { const cb = label.querySelector('input'); if (cb) cb.remove(); }
    });

    map.on('baselayerchange', function(e) { activeBaseLayer = e.layer; document.getElementById('opacitySlider').value = activeBaseLayer.options.opacity ?? 1; });
    map.on('layeradd layerremove', updateLegendVisibility);
}

function updateTimelineView() {
    const dateStr = document.getElementById('datePicker').value;
    const hourVal = parseInt(document.getElementById('hourSlider').value);
    
    const displayHour = hourVal < 10 ? '0' + hourVal : hourVal;
    document.getElementById('currentTimeLabel').innerHTML = `Godzina: <span style="color:#2ecc71; font-weight:bold;">${displayHour}:00</span>`;
    
    renderDataForTimestamp(dateStr, hourVal);
}

document.addEventListener("DOMContentLoaded", () => {
    const datePicker = document.getElementById('datePicker');
    const hourSlider = document.getElementById('hourSlider');
    
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    datePicker.value = todayStr;

    const ticksContainer = document.getElementById('ticksContainer');
    for (let h = 0; h <= 23; h++) {
        const span = document.createElement('span');
        span.className = 'timeline-tick-label';
        span.innerText = h % 2 === 0 ? (h < 10 ? '0' + h : h) : '·';
        ticksContainer.appendChild(span);
    }

    loadDataForDate(todayStr);

    datePicker.addEventListener('change', (e) => {
        loadDataForDate(e.target.value);
    });

    hourSlider.addEventListener('input', updateTimelineView);
});

const opacityControl = L.control({ position: 'topright' });
opacityControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'slider-opacity-container');
    div.innerHTML = `<label for="opacitySlider">Przezroczystość mapy:</label><input type="range" id="opacitySlider" min="0" max="1" step="0.1" value="1">`;
    L.DomEvent.disableClickPropagation(div); L.DomEvent.disableScrollPropagation(div);
    setTimeout(() => {
        document.getElementById('opacitySlider').addEventListener('input', function(e) { if (activeBaseLayer?.setOpacity) activeBaseLayer.setOpacity(parseFloat(e.target.value)); });
    }, 100);
    return div;
};
opacityControl.addTo(map);

const legendControl = L.control({ position: 'bottomleft' });
legendControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-legend-container');
    const reversedScale = [...tempScale].reverse();
    let html = `<div class='legend-title'>Temperatura (°C)</div><div class='legend-body'><div class='legend-bar' style='background: linear-gradient(to bottom, ${reversedScale.map(i => `rgb(${i.r},${i.g},${i.b})`).join(', ')});'></div><div class='legend-labels'>`;
    reversedScale.forEach(i => { html += `<div class='legend-label-row'><span class='legend-tick'>—</span><span class='legend-value'>${i.t > 0 ? '+' + i.t : i.t}</span></div>`; });
    div.innerHTML = html + `</div></div>`;
    return div;
};
legendControl.addTo(map);

function updateLegendVisibility() {
    const legend = document.querySelector('.map-legend-container');
    if (!legend) return;
    const activeLayers = [etykietyTa, etykietyTmin, etykietyTmax, etykietyTminHour, etykietyTmaxHour, etykietyTg];
    const isAnyVisible = activeLayers.some(layer => map.hasLayer(layer));
    legend.style.display = isAnyVisible ? 'block' : 'none';
}
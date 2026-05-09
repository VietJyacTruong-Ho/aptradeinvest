/* ── map.js ──────────────────────────────────────────────────────────────────
   Indiana presence map — Leaflet.
   Reads data/city_coords.json + uses globals: investmentData, presenceData,
   CC, sel, formatValue, sCls, normalizeStatus (all from app.js / charts.js).
   Expects Leaflet to be loaded before this script.
   ──────────────────────────────────────────────────────────────────────── */

var _map          = null;
var _eventLayer   = null;
var _presLayer    = null;
var _haloLayer    = null;
var _cityCoords   = null;
var _mapReady     = false;

/* ── Simple deterministic hash from a string ─────────────────────────────── */
function hashStr(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/* ── Seeded scatter: deterministic but non-geometric jitter ──────────────── */
/* Uses company name + city as seed so positions are stable across reloads    */
function scatterCoords(baseLat, baseLng, seed, maxR) {
  var h1 = hashStr(seed + '_angle');
  var h2 = hashStr(seed + '_radius');
  var angle = (h1 % 10000) / 10000 * 2 * Math.PI;
  /* sqrt for uniform disk distribution — avoids centre clumping */
  var r = maxR * Math.sqrt((h2 % 10000) / 10000);
  return {
    lat: baseLat + r * Math.cos(angle),
    lng: baseLng + r * Math.sin(angle)
  };
}

/* ── Log-scaled radius for investment event circles ──────────────────────── */
function evRadius(valueMillion) {
  if (!valueMillion || isNaN(valueMillion) || valueMillion <= 0) return 7;
  /* log10 scale: $1M→7px, $10M→10.5px, $100M→14px, $1B→17.5px */
  var r = 7 + Math.log10(valueMillion) * 3.5;
  return Math.max(7, Math.min(r, 26));
}

/* ── Popup HTML — investment event ───────────────────────────────────────── */
function evPopup(r) {
  var val  = parseFloat(r.announced_value_usd_m);
  var jobs = parseFloat(r.jobs);
  var loc  = (r.city || '') + ', ' + (r.county ? r.county + ' Co.' : '');
  return (
    '<div class="mp-wrap mp-ev">' +
      '<div class="mp-name">' + (r.company_name || '') + '</div>' +
      '<div class="mp-loc">'  + loc + ' &middot; ' + (r.announcement_year || '') + '</div>' +
      '<div class="mp-sec">'  + (r.sector || '') + '</div>' +
      '<div class="mp-row">' +
        '<strong>' + (isNaN(val) ? 'N/D' : formatValue(val)) + '</strong>' +
        (isNaN(jobs) ? '' : '<span>' + Math.round(jobs).toLocaleString() + ' jobs</span>') +
        '<span>' + (r.investment_type || '') + '</span>' +
      '</div>' +
      '<span class="mp-badge sbadge ' + sCls(r.operational_status) + '">' +
        normalizeStatus(r.operational_status) +
      '</span>' +
    '</div>'
  );
}

/* ── Popup HTML — presence record ────────────────────────────────────────── */
function prPopup(r) {
  var loc = (r.city || '') + ', ' + (r.county ? r.county + ' Co.' : '');
  return (
    '<div class="mp-wrap mp-pr">' +
      '<div class="mp-name">' + (r.company_name || '') + '</div>' +
      '<div class="mp-loc">'  + loc + '</div>' +
      '<div class="mp-sec">'  + (r.sector || '') + '</div>' +
      '<span class="mp-badge sbadge ' + sCls(r.operational_status) + '">' +
        normalizeStatus(r.operational_status) +
      '</span>' +
    '</div>'
  );
}

/* ── updateMap — rebuild layers on every selection change ────────────────── */
function updateMap(currentSel) {
  if (!_mapReady || !_cityCoords) return;

  var showEv = document.getElementById('mapShowEvents')
    ? document.getElementById('mapShowEvents').checked : true;
  var showPr = document.getElementById('mapShowPresence')
    ? document.getElementById('mapShowPresence').checked : true;

  /* Tear down old layers */
  if (_haloLayer)  { _map.removeLayer(_haloLayer);  }
  if (_presLayer)  { _map.removeLayer(_presLayer);  }
  if (_eventLayer) { _map.removeLayer(_eventLayer); }
  _haloLayer  = L.layerGroup();
  _presLayer  = L.layerGroup();
  _eventLayer = L.layerGroup();

  /* Filter to selected countries */
  var evRows = (window.investmentData || []).filter(function(r) {
    return currentSel.indexOf(r.parent_country) !== -1;
  });
  var prRows = (window.presenceData || []).filter(function(r) {
    return currentSel.indexOf(r.parent_country) !== -1 &&
           (r.confidence || '').toLowerCase() !== 'low';
  });

  /* Plot investment events */
  if (showEv) {
    evRows.forEach(function(r) {
      var cityKey = (r.city || '') + '||' + (r.county || '');
      var coords  = _cityCoords[cityKey];
      if (!coords) return;

      var seed  = (r.company_name || '') + cityKey;
      var pos   = scatterCoords(coords.lat, coords.lng, seed, 0.025);
      var color = CC[r.parent_country] || '#536070';
      var val   = parseFloat(r.announced_value_usd_m);
      var rad   = evRadius(val);

      /* Halo — communicates city-level accuracy, non-interactive */
      L.circleMarker([pos.lat, pos.lng], {
        radius:      rad + 9,
        fillColor:   color,
        fillOpacity: 0.10,
        color:       color,
        weight:      0,
        pane:        'shadowPane',
        interactive: false
      }).addTo(_haloLayer);

      /* Main event marker — solid filled circle */
      L.circleMarker([pos.lat, pos.lng], {
        radius:      rad,
        fillColor:   color,
        color:       '#fff',
        weight:      1.5,
        fillOpacity: 0.88,
        pane:        'markerPane'
      })
      .bindPopup(evPopup(r), { maxWidth: 290, className: 'mp-popup' })
      .addTo(_eventLayer);
    });
  }

  /* Plot presence records — hollow rings, scatter spread, overlayPane */
  if (showPr) {
    prRows.forEach(function(r) {
      var cityKey = (r.city || '') + '||' + (r.county || '');
      var coords  = _cityCoords[cityKey];
      if (!coords) return;

      var seed  = (r.company_name || '') + cityKey;
      /* Smaller scatter radius than events — spread enough to avoid stacking,
         not so far as to misrepresent location */
      var pos   = scatterCoords(coords.lat, coords.lng, seed, 0.018);
      var color = CC[r.parent_country] || '#536070';

      /* Hollow ring — visually distinct from solid event circles */
      L.circleMarker([pos.lat, pos.lng], {
        radius:      5,
        fillColor:   color,
        fillOpacity: 0,
        color:       color,
        weight:      1.5,
        opacity:     0.65,
        pane:        'overlayPane'   /* renders below markerPane events */
      })
      .bindPopup(prPopup(r), { maxWidth: 260, className: 'mp-popup' })
      .addTo(_presLayer);
    });
  }

  /* Render order: halos (bottom) → presence rings → event circles (top) */
  _haloLayer.addTo(_map);
  _presLayer.addTo(_map);
  _eventLayer.addTo(_map);

  /* Update legend */
  updateMapLegend(currentSel, evRows, prRows);
}

/* ── updateMapLegend — small inline country legend ───────────────────────── */
function updateMapLegend(currentSel, evRows, prRows) {
  var el = document.getElementById('mapLegend');
  if (!el) return;

  /* Only show countries that actually have markers in the current view */
  var present = {};
  evRows.forEach(function(r) { present[r.parent_country] = true; });
  prRows.forEach(function(r) { present[r.parent_country] = true; });

  var countries = currentSel.filter(function(c) { return present[c]; });
  if (countries.length <= 1) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = countries.map(function(c) {
    return '<span class="ml-item">' +
      '<span class="ml-dot" style="background:' + (CC[c] || '#888') + '"></span>' +
      c +
    '</span>';
  }).join('');
}

/* ── initMap — called once after CSV data finishes loading ───────────────── */
function initMap() {
  if (_map) return;

  _map = L.map('map', {
    center:          [39.78, -86.20],
    zoom:            7,
    scrollWheelZoom: false,
    touchZoom:       true,
    zoomControl:     true
  });

  /* CartoDB Positron — clean light basemap, city labels intact */
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a> &copy; <a href="https://carto.com/" target="_blank">CARTO</a>',
      subdomains:  'abcd',
      maxZoom:     15
    }
  ).addTo(_map);

  /* Accuracy disclaimer */
  var noteEl = document.createElement('div');
  noteEl.className = 'map-accuracy-note';
  noteEl.textContent = 'Locations are city-level approximations';
  var mapEl = document.getElementById('map');
  if (mapEl && mapEl.parentNode) {
    mapEl.parentNode.insertBefore(noteEl, mapEl.nextSibling);
  }

  /* Load coordinates then render */
  fetch('data/city_coords.json')
    .then(function(res) { return res.json(); })
    .then(function(coords) {
      _cityCoords = coords;
      _mapReady   = true;
      updateMap(window.sel || ['Japan']);
    })
    .catch(function(e) {
      console.warn('map: could not load city_coords.json', e);
    });

  /* Wire layer toggles */
  ['mapShowEvents', 'mapShowPresence'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function() { updateMap(window.sel || []); });
  });
}

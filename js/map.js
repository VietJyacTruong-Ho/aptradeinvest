/* ── map.js ──────────────────────────────────────────────────────────────────
   Indiana presence map — Leaflet.
   Reads data/city_coords.json + uses globals: investmentData, presenceData,
   CC, sel, formatValue, sCls, normalizeStatus (all from app.js / charts.js).
   Expects Leaflet to be loaded before this script.
   ──────────────────────────────────────────────────────────────────────── */

var _map          = null;
var _eventLayer   = null;
var _presLayer    = null;
var _cityCoords   = null;
var _mapReady     = false;

/* ── Deterministic jitter: arrange N markers in a circle around centroid ── */
function jitterCoords(baseLat, baseLng, idx, total) {
  if (total <= 1) return { lat: baseLat, lng: baseLng };
  var angle  = (2 * Math.PI * idx) / total;
  /* Radius grows slightly with crowd size so markers don't overlap */
  var r = total <= 3 ? 0.016 : total <= 6 ? 0.022 : total <= 10 ? 0.028 : 0.034;
  return {
    lat: baseLat + r * Math.cos(angle),
    lng: baseLng + r * Math.sin(angle)
  };
}

/* ── Log-scaled radius for investment event circles ──────────────────────── */
function evRadius(valueMillion) {
  if (!valueMillion || isNaN(valueMillion) || valueMillion <= 0) return 7;
  /* log10 scale: $1M→7px, $10M→10.5px, $100M→14px, $1B→17.5px, $3.87B→19.6px */
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

/* ── Group rows by "city||county" key ────────────────────────────────────── */
function groupByCity(rows) {
  var g = {};
  rows.forEach(function(r) {
    var k = (r.city || '') + '||' + (r.county || '');
    if (!g[k]) g[k] = [];
    g[k].push(r);
  });
  return g;
}

/* ── updateMap — rebuild layers on every selection change ────────────────── */
function updateMap(currentSel) {
  if (!_mapReady || !_cityCoords) return;

  var showEv = document.getElementById('mapShowEvents')
    ? document.getElementById('mapShowEvents').checked : true;
  var showPr = document.getElementById('mapShowPresence')
    ? document.getElementById('mapShowPresence').checked : true;

  /* Tear down old layers */
  if (_eventLayer) { _map.removeLayer(_eventLayer); }
  if (_presLayer)  { _map.removeLayer(_presLayer);  }
  _eventLayer = L.layerGroup();
  _presLayer  = L.layerGroup();

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
    var evGroups = groupByCity(evRows);
    Object.keys(evGroups).forEach(function(cityKey) {
      var coords = _cityCoords[cityKey];
      if (!coords) return;
      var cityRows = evGroups[cityKey];
      cityRows.forEach(function(r, idx) {
        var pos   = jitterCoords(coords.lat, coords.lng, idx, cityRows.length);
        var color = CC[r.parent_country] || '#536070';
        var val   = parseFloat(r.announced_value_usd_m);
        L.circleMarker([pos.lat, pos.lng], {
          radius:      evRadius(val),
          fillColor:   color,
          color:       '#fff',
          weight:      1.5,
          fillOpacity: 0.88,
          pane:        'markerPane'
        })
        .bindPopup(evPopup(r), { maxWidth: 290, className: 'mp-popup' })
        .addTo(_eventLayer);
      });
    });
  }

  /* Plot presence records */
  if (showPr) {
    var prGroups = groupByCity(prRows);
    Object.keys(prGroups).forEach(function(cityKey) {
      var coords = _cityCoords[cityKey];
      if (!coords) return;
      var cityRows = prGroups[cityKey];
      cityRows.forEach(function(r, idx) {
        var pos   = jitterCoords(coords.lat, coords.lng, idx, cityRows.length);
        var color = CC[r.parent_country] || '#536070';
        L.circleMarker([pos.lat, pos.lng], {
          radius:      5,
          fillColor:   color,
          color:       color,
          weight:      0.8,
          fillOpacity: 0.50,
          pane:        'shadowPane'   /* render below event circles */
        })
        .bindPopup(prPopup(r), { maxWidth: 260, className: 'mp-popup' })
        .addTo(_presLayer);
      });
    });
  }

  _eventLayer.addTo(_map);
  _presLayer.addTo(_map);

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

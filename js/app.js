/* ── app.js ─────────────────────────────────────────────────────────────────
   Dashboard logic: state, pill rendering, stats, investment cards, CSV load.
   All variables and functions are global (no ES module syntax).
   Loaded last — after charts.js and country-chart.js.
   ──────────────────────────────────────────────────────────────────────── */

/* ── Country name mapping ────────────────────────────────────────────────
   Display name → CSV country column value in indiana_trade.csv
   ──────────────────────────────────────────────────────────────────────── */
var COUNTRY_MAP = {
  'Japan':       'Japan',
  'South Korea': 'South Korea',
  'China':       'China',
  'India':       'India',
  'Australia':   'Australia',
  'Taiwan':      'Taiwan',
  'Singapore':   'Singapore',
  'Vietnam':     'Vietnam',
  'Thailand':    'Thailand',
  'Indonesia':   'Indonesia',
  'Malaysia':    'Malaysia',
  'Philippines': 'Philippines',
  'Hong Kong':   'Hong Kong',
  'New Zealand': 'New Zealand',
  'Sri Lanka':   'Sri Lanka'
};

/* ── Country colour map (used by charts.js and pill rendering) ──────────── */
var CC = {
  'Japan':       '#378ADD',
  'South Korea': '#7F77DD',
  'China':       '#E24B4A',
  'India':       '#BA7517',
  'Australia':   '#1D9E75',
  'Taiwan':      '#639922',
  'Singapore':   '#D4537E',
  'Vietnam':     '#D85A30',
  'Thailand':    '#534AB7',
  'Indonesia':   '#0F6E56',
  'Malaysia':    '#993C1D',
  'Philippines': '#185FA5',
  'Hong Kong':   '#993556',
  'New Zealand': '#2A8C6E',
  'Sri Lanka':   '#B5600F'
};

/* ── Region grouping ─────────────────────────────────────────────────────── */
var REGIONS = {
  'Northeast Asia':    ['Japan', 'South Korea', 'China', 'Taiwan', 'Hong Kong'],
  'Southeast Asia':    ['Vietnam', 'Thailand', 'Indonesia', 'Malaysia', 'Philippines', 'Singapore'],
  'South Asia & Pacific': ['India', 'Australia', 'New Zealand', 'Sri Lanka']
};

/* ── Selection state ─────────────────────────────────────────────────────── */
var sel         = ['Japan'];
var compareMode = false;
var regionMode  = false;

/* ── Global data stores ──────────────────────────────────────────────────── */
var tradeData      = [];
var investmentData = [];
var presenceData   = [];

/* ── Year range state — shared by slider UI and chart scale ─────────────── */
var yrState = { min: 2014, max: 2026 };

/* ── Marker year selection state ─────────────────────────────────────────── */
var selectedMarkerYear = null;

/* ── formatValue — $M / $B formatter ────────────────────────────────────── */
function formatValue(millionsFloat) {
  if (millionsFloat == null || isNaN(millionsFloat)) return 'N/D';
  if (millionsFloat >= 1000) return '$' + (millionsFloat / 1000).toFixed(1) + 'B';
  return '$' + Math.round(millionsFloat) + 'M';
}

/* ── sCls — status string → badge CSS class ─────────────────────────────── */
function sCls(s) {
  if (!s) return 's-n';
  var sl = s.toLowerCase();
  if (sl.indexOf('operational') !== -1 || sl.indexOf('active') !== -1) return 's-a';
  if (sl.indexOf('under construction') !== -1) return 's-b';
  if (sl.indexOf('announced') !== -1) return 's-n';
  if (sl.indexOf('planned') !== -1) return 's-p';
  if (sl.indexOf('closed') !== -1) return 's-c';
  return 's-n';
}

/* ── normalizeStatus — condenses verbose CSV statuses for badge display ──── */
function normalizeStatus(s) {
  if (!s) return 'Unknown';
  if (s.toLowerCase().startsWith('closed')) return 'Closed';
  if (s.toLowerCase().indexOf('operational') !== -1) return 'Active';
  return s;
}

/* ── Overlay helpers — loading / error states ────────────────────────────── */
function showOverlay(html) {
  var ov = document.getElementById('mcOverlay');
  if (!ov) return;
  ov.innerHTML = html;
  ov.style.display = 'flex';
}

function hideOverlay() {
  var ov = document.getElementById('mcOverlay');
  if (ov) ov.style.display = 'none';
}

function showErrorOverlay(detail) {
  showOverlay(
    '<div class="ov-error">' +
      '<div class="ov-error-icon">⚠</div>' +
      '<div class="ov-error-title">Data failed to load</div>' +
      '<div class="ov-error-msg">' +
        (detail ? detail + ' — ' : '') +
        'Check your connection and try again.' +
      '</div>' +
      '<button class="ov-retry" onclick="location.reload()">Retry</button>' +
    '</div>'
  );
}

/* ── Year-range slider ───────────────────────────────────────────────────────
   A vertical two-handle slider that controls the visible x-axis range.
   Injected into .tc (trade chart container) on init.
   ──────────────────────────────────────────────────────────────────────── */
var _markerRebuildTimer = null;

function yearToPct(yr) {
  return (yr - 2014) / 12 * 100;
}

function updateSliderUI() {
  var fill = document.getElementById('yrFill');
  var topH = document.getElementById('yrTop');
  var botH = document.getElementById('yrBot');
  if (!fill || !topH || !botH) return;
  var tp = yearToPct(yrState.min);
  var bp = yearToPct(yrState.max);
  topH.style.top    = tp + '%';
  botH.style.top    = bp + '%';
  fill.style.top    = tp + '%';
  fill.style.height = (bp - tp) + '%';
  topH.setAttribute('title', 'Start year: ' + yrState.min + ' (drag to change)');
  botH.setAttribute('title', 'End year: '   + yrState.max + ' (drag to change)');

  /* Update dynamic year range display in chart subtitle */
  var rangeEl = document.getElementById('yrRangeDisplay');
  if (rangeEl) {
    var isDefault = (yrState.min === 2014 && yrState.max === 2026);
    rangeEl.innerHTML = yrState.min + '\u2013' + yrState.max +
      (!isDefault
        ? ' \u00b7 <button class="yr-reset" onclick="resetYearRange()" title="Reset to full range (2014\u20132026)">reset</button>'
        : '');
  }
}

/* ── resetYearRange — restores default 2014–2026 range ──────────────────── */
function resetYearRange() {
  yrState.min = 2014;
  yrState.max = 2026;
  updateSliderUI();
  applyYearRange();
}

function applyYearRange() {
  if (!tChart) return;
  tChart.options.scales.x.min = yrState.min;
  tChart.options.scales.x.max = yrState.max;
  tChart.update('none');
  /* Debounce marker rebuild so DOM isn't thrashed on every drag tick */
  clearTimeout(_markerRebuildTimer);
  _markerRebuildTimer = setTimeout(function() {
    var invRows = investmentData.filter(function(r) {
      return sel.indexOf(r.parent_country) !== -1;
    });
    buildMarkers(invRows, sel, compareMode && sel.length > 1);
  }, 80);
}

function attachHandleDrag(handle, isTop) {
  /* Shared drag logic for both mouse and touch */
  function performDrag(clientY) {
    var track = document.getElementById('yrTrack');
    var rect  = track.getBoundingClientRect();
    var frac  = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    var yr    = Math.round(2014 + frac * 12);
    yr = Math.max(2014, Math.min(2026, yr));
    if (isTop) {
      yrState.min = Math.min(yr, yrState.max - 1);
    } else {
      yrState.max = Math.max(yr, yrState.min + 1);
    }
    updateSliderUI();
    applyYearRange();
  }

  /* Mouse */
  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    handle.classList.add('dragging');
    function onMove(mv) { performDrag(mv.clientY); }
    function onUp() {
      handle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  /* Touch */
  handle.addEventListener('touchstart', function(e) {
    e.preventDefault();
    handle.classList.add('dragging');
    var t = e.touches[0];
    if (t) performDrag(t.clientY);
    function onMove(mv) {
      var touch = mv.touches[0];
      if (touch) performDrag(touch.clientY);
    }
    function onUp() {
      handle.classList.remove('dragging');
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend',  onUp);
    }
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend',  onUp);
  }, { passive: false });
}

function initYearSlider() {
  var tc = document.querySelector('.tc');
  if (!tc) return;
  var sl = document.createElement('div');
  sl.className = 'yr-range-slider';
  sl.setAttribute('title', 'Drag handles to filter the visible year range');
  sl.setAttribute('aria-label', 'Year range filter');
  sl.innerHTML =
    '<div class="yr-track" id="yrTrack">' +
      '<div class="yr-range-fill" id="yrFill"></div>' +
      '<div class="yr-handle" id="yrTop" title="Start year: ' + yrState.min + ' (drag to change)"></div>' +
      '<div class="yr-handle" id="yrBot" title="End year: '   + yrState.max + ' (drag to change)"></div>' +
    '</div>';
  tc.insertBefore(sl, tc.firstChild);
  updateSliderUI();
  attachHandleDrag(document.getElementById('yrTop'), true);
  attachHandleDrag(document.getElementById('yrBot'), false);
}

/* ── setSelectedMarkerYear — called by buildMarkers dot click ────────────── */
function setSelectedMarkerYear(yr) {
  selectedMarkerYear = yr;
  var invRows = investmentData.filter(function(r) {
    return sel.indexOf(r.parent_country) !== -1;
  });
  buildMarkers(invRows, sel, compareMode && sel.length > 1);
  if (yr != null) scrollCardsToYear(yr);
}

/* ── scrollCardsToYear — scrolls right panel to the year's card group ────── */
function scrollCardsToYear(yr) {
  var cont = document.getElementById('cards');
  if (!cont) return;
  var labels = cont.querySelectorAll('.ylbl');
  for (var i = 0; i < labels.length; i++) {
    if (String(labels[i].textContent).trim() === String(yr)) {
      /* Use getBoundingClientRect so the offset is relative to the visible
         top of #cards, not the document — offsetTop alone overshoots because
         .cards-wrap has no position set and isn't the offsetParent. */
      var labelRect = labels[i].getBoundingClientRect();
      var contRect  = cont.getBoundingClientRect();
      cont.scrollTop += labelRect.top - contRect.top - 8;
      return;
    }
  }
}

/* ── renderPills ──────────────────────────────────────────────────────────── */
function renderPills() {
  var w = document.getElementById('pillsWrap');
  w.innerHTML = '';
  if (regionMode) {
    Object.entries(REGIONS).forEach(function(pair) {
      var rn = pair[0], cs = pair[1];
      var l = document.createElement('span');
      l.className   = 'rlbl';
      l.textContent = rn;
      w.appendChild(l);
      cs.forEach(function(c) { w.appendChild(mkPill(c)); });
    });
  } else {
    Object.keys(CC).forEach(function(c) { w.appendChild(mkPill(c)); });
  }
}

function mkPill(c) {
  var b = document.createElement('button');
  b.className = 'pill' + (sel.indexOf(c) !== -1 ? ' on' : '');
  b.style.setProperty('--pc', CC[c]);
  b.innerHTML = '<span class="pdot"></span>' + c;
  b.onclick   = function() { pick(c); };
  return b;
}

function pick(c) {
  if (compareMode) {
    if (sel.indexOf(c) !== -1) {
      if (sel.length > 1) sel = sel.filter(function(x) { return x !== c; });
    } else {
      sel.push(c);
    }
  } else {
    sel = [c];
  }
  renderPills();
  update();
}

/* ── handleCompare — compare mode checkbox ──────────────────────────────── */
function handleCompare() {
  compareMode = document.getElementById('cmprChk').checked;
  if (!compareMode) { sel = [sel[0]]; renderPills(); }
  update();
}

/* ── toggleRegion — "Group by Region" button ────────────────────────────── */
function toggleRegion() {
  regionMode = !regionMode;
  document.getElementById('regionBtn').classList.toggle('on', regionMode);
  renderPills();
}

/* ── updateHeadlineStats — recalculates stats bar from filtered CSV rows ───
   Dynamically rebuilds the Trade/FDI split bar on every selection change.
   ──────────────────────────────────────────────────────────────────────── */
function updateHeadlineStats(tradeRows, investmentRows, presenceRows) {
  var totalExports = 0;
  var exports2014  = 0;
  var exports2025  = 0;

  for (var i = 0; i < tradeRows.length; i++) {
    var v = Number(tradeRows[i].export_value_usd) || 0;
    totalExports += v;
    if (tradeRows[i].year === 2014) exports2014 += v;
    if (tradeRows[i].year === 2025) exports2025 += v;
  }

  var growthText = (exports2014 > 0 && exports2025 > 0)
    ? (exports2025 / exports2014).toFixed(1) + 'x'
    : 'N/A';

  var totalInvestment = 0;
  var totalJobs = 0;
  for (var j = 0; j < investmentRows.length; j++) {
    var iv = parseFloat(investmentRows[j].announced_value_usd_m);
    if (!isNaN(iv)) totalInvestment += iv;
    var jv = parseFloat(investmentRows[j].jobs);
    if (!isNaN(jv)) totalJobs += jv;
  }

  var investDisplay    = investmentRows.length === 0 ? '\u2014' : formatValue(totalInvestment);
  var jobsDisplay      = totalJobs > 0 ? Math.round(totalJobs).toLocaleString() : '\u2014';
  var facilitiesDisplay = presenceRows.length || '\u2014';

  document.querySelector('.sbar').innerHTML =
    '<div class="hstat-section">' +
      '<span class="hstat-lbl hstat-trade">Trade</span>' +
      '<div class="hstat-item"><span class="headline-stat-value">' + fmtAxis(totalExports) + '</span><span class="headline-stat-label">Total Exports (2014\u20132025)</span></div>' +
      '<div class="hstat-item"><span class="headline-stat-value">' + growthText + '</span><span class="headline-stat-label">Export Growth</span><span class="headline-stat-sublabel">vs. 2014 baseline</span></div>' +
    '</div>' +
    '<div class="hstat-div"></div>' +
    '<div class="hstat-section">' +
      '<span class="hstat-lbl hstat-fdi" title="Foreign Direct Investment \u2014 Asia-Pacific company investment into Indiana">FDI</span>' +
      '<div class="hstat-item"><span class="headline-stat-value">' + investDisplay + '</span><span class="headline-stat-label">Announced Investment</span></div>' +
      '<div class="hstat-item"><span class="headline-stat-value">' + investmentRows.length + '</span><span class="headline-stat-label">Announcements</span></div>' +
      '<div class="hstat-item"><span class="headline-stat-value">' + jobsDisplay + '</span><span class="headline-stat-label">Announced Jobs</span></div>' +
      '<div class="hstat-item hstat-item-last"><span class="headline-stat-value">' + facilitiesDisplay + '</span><span class="headline-stat-label" title="Verified Asia-Pacific company facilities currently operating in Indiana">Known Facilities</span></div>' +
    '</div>';
}

/* ── buildCards — renders investment card panel ──────────────────────────── */
function buildCards(filteredInvestment) {
  var multi = sel.length > 1;
  document.getElementById('rpSub').textContent = 'Showing: ' + (multi ? sel.join(', ') : sel[0]);

  var cont = document.getElementById('cards');

  if (!filteredInvestment.length) {
    cont.innerHTML =
      '<div class="empty">' +
        '<p>No investment announcements recorded</p>' +
        '<p class="empty-sub">Strong trade partner with no traceable FDI above the $2M threshold. ' +
        'This asymmetry may represent an investment attraction opportunity for APBAI.</p>' +
      '</div>';
    return;
  }

  /* Sort newest first; attach country colour */
  var all = filteredInvestment.map(function(r) {
    return Object.assign({}, r, { clr: CC[r.parent_country] || '#536070' });
  }).sort(function(a, b) {
    return (b.announcement_year || 0) - (a.announcement_year || 0);
  });

  /* Group by year */
  var byY = {}, order = [];
  all.forEach(function(inv) {
    var yr = inv.announcement_year || 'Unknown';
    if (!byY[yr]) { byY[yr] = []; order.push(yr); }
    byY[yr].push(inv);
  });

  cont.innerHTML = '';
  order.forEach(function(yr, gi) {
    var g = document.createElement('div');
    g.className = 'yg';
    g.innerHTML = '<div class="ylbl">' + yr + '</div>';

    byY[yr].forEach(function(inv, ci) {
      var v   = parseFloat(inv.announced_value_usd_m);
      var j   = parseFloat(inv.jobs);
      var loc = [inv.city, inv.county ? inv.county + ' Co.' : ''].filter(Boolean).join(', ');

      /* Flag: notes field starts with or contains "FLAG" */
      var flagText = '';
      if (inv.notes && inv.notes.toUpperCase().indexOf('FLAG') !== -1) {
        /* Strip the FLAG prefix and any leading punctuation */
        flagText = inv.notes.replace(/.*FLAG\s*[—\-–:]\s*/i, '').trim();
        /* If the flag text is long, take only the flagged sentence */
        var flagIdx = inv.notes.toUpperCase().indexOf('FLAG');
        if (flagIdx !== -1) {
          var afterFlag = inv.notes.slice(flagIdx).replace(/^FLAG\s*[—\-–:]\s*/i, '');
          /* Take up to the next period or end */
          var period = afterFlag.indexOf('. ');
          flagText = period !== -1 ? afterFlag.slice(0, period + 1) : afterFlag;
        }
      }

      var card = document.createElement('div');
      card.className = 'icard';
      card.style.borderLeftColor = inv.clr;
      card.style.animationDelay  = (gi * 3 + ci) * 25 + 'ms';
      card.innerHTML =
        '<div class="ic-name">' + (inv.company_name || '') + '</div>' +
        '<div class="ic-loc">'  + loc                         + '</div>' +
        '<div class="ic-sec">'  + (inv.sector || '')           + '</div>' +
        '<div class="ic-meta">' +
          '<span class="ic-type">' + (inv.investment_type || '') + '</span>' +
          '<span class="ic-val">'  + formatValue(isNaN(v) ? null : v) + '</span>' +
          '<span class="ic-jobs">' + (isNaN(j) ? 'N/D' : Math.round(j).toLocaleString()) + ' jobs</span>' +
        '</div>' +
        '<span class="sbadge ' + sCls(inv.operational_status) + '">' + normalizeStatus(inv.operational_status) + '</span>' +
        (flagText ? '<div class="ic-flag">' + flagText + '</div>' : '');

      g.appendChild(card);
    });

    cont.appendChild(g);
  });
}

/* ── update — single entry point for all view updates ───────────────────── */
function update() {
  selectedMarkerYear = null;
  var multi = compareMode && sel.length > 1;
  var lbl   = multi ? sel.length + ' Countries' : sel[0];

  document.getElementById('chartLbl').textContent = lbl;
  document.getElementById('chartLbl').style.color = CC[sel[0]];
  document.getElementById('comLbl').textContent   = multi ? sel.length + ' Countries' : sel[0];

  /* Filter CSV data to selected countries */
  var filteredTrade = tradeData.filter(function(row) {
    return sel.some(function(c) { return row.country === COUNTRY_MAP[c]; });
  });
  var filteredInvestment = investmentData.filter(function(row) {
    return sel.indexOf(row.parent_country) !== -1;
  });
  var filteredPresence = presenceData.filter(function(row) {
    return sel.indexOf(row.parent_country) !== -1;
  });

  updateHeadlineStats(filteredTrade, filteredInvestment, filteredPresence);
  buildTrade(filteredTrade, filteredInvestment, sel, multi);
  applyYearRange();
  buildCom(filteredTrade, sel, multi);
  buildCards(filteredInvestment);
  renderCountryCharts(sel, tradeData, investmentData);
}

/* ── Bootstrap on DOMContentLoaded ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {

  function parseCSV(url) {
    return new Promise(function(resolve, reject) {
      Papa.parse(url, {
        download:      true,
        header:        true,
        dynamicTyping: true,
        complete: function(results) { resolve(results.data || []); },
        error:    function(err)     { reject(err); }
      });
    });
  }

  Promise.all([
    parseCSV('https://docs.google.com/spreadsheets/d/e/2PACX-1vS-s3m8pLsJvLN-NaLFS8a6fWIzk2Pm2m7-RQJK7obDmgtYKPLI6EnsrpBlQz6meJf0RES80I2vbz7R/pub?gid=1699162206&single=true&output=csv'),
    parseCSV('https://docs.google.com/spreadsheets/d/e/2PACX-1vS-s3m8pLsJvLN-NaLFS8a6fWIzk2Pm2m7-RQJK7obDmgtYKPLI6EnsrpBlQz6meJf0RES80I2vbz7R/pub?gid=1791453676&single=true&output=csv'),
    parseCSV('https://docs.google.com/spreadsheets/d/e/2PACX-1vS-s3m8pLsJvLN-NaLFS8a6fWIzk2Pm2m7-RQJK7obDmgtYKPLI6EnsrpBlQz6meJf0RES80I2vbz7R/pub?gid=1379744098&single=true&output=csv')
  ])
  .then(function(results) {
    tradeData      = results[0];
    investmentData = results[1];
    presenceData   = results[2];

    renderPills();
    initYearSlider();

    document.getElementById('regionBtn').addEventListener('click', toggleRegion);
    document.getElementById('cmprChk').addEventListener('change', handleCompare);

    window.addEventListener('resize', function() {
      clearTimeout(window._rt);
      window._rt = setTimeout(function() {
        if (tChart) {
          var invRows = investmentData.filter(function(r) {
            return r.parent_country === sel[0];
          });
          buildMarkers(invRows, sel, compareMode && sel.length > 1);
        }
      }, 300);
    });

    update();
    hideOverlay();
  })
  .catch(function(err) {
    console.error('Failed to load CSV data:', err);
    showErrorOverlay(err && err.message ? err.message : null);
  });
});

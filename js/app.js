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
  'South Korea': 'Korea, South',
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
  'Hong Kong':   'Hong Kong'
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
  'Hong Kong':   '#993556'
};

/* ── Region grouping ─────────────────────────────────────────────────────── */
var REGIONS = {
  'Northeast Asia':    ['Japan', 'South Korea', 'China', 'Taiwan', 'Hong Kong'],
  'Southeast Asia':    ['Vietnam', 'Thailand', 'Indonesia', 'Malaysia', 'Philippines', 'Singapore'],
  'South Asia & Pacific': ['India', 'Australia']
};

/* ── Selection state ─────────────────────────────────────────────────────── */
var sel         = ['Japan'];
var compareMode = false;
var regionMode  = false;

/* ── Global data stores ──────────────────────────────────────────────────── */
var tradeData      = [];
var investmentData = [];
var presenceData   = [];

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

/* ── updateStats — recalculates sbar stats from filtered CSV rows ─────────
   All six values are computed live from the current selection.
   ──────────────────────────────────────────────────────────────────────── */
function updateStats(filteredTrade, filteredInvestment, filteredPresence) {
  /* Trade */
  var grand = 0, baseSum = 0, lastSum = 0;
  filteredTrade.forEach(function(row) {
    var v = Number(row.export_value_usd) || 0;
    grand += v;
    if (row.year === 2014) baseSum += v;
    if (row.year === 2025) lastSum += v;
  });
  var grandB  = grand / 1e9;
  var growth  = baseSum > 0 ? (lastSum / baseSum).toFixed(1) + 'x' : '—';
  document.getElementById('sTotalEx').textContent = grandB >= 0.01 ? '$' + grandB.toFixed(1) + 'B' : '—';
  document.getElementById('sGrowth').textContent  = growth;

  /* FDI */
  var tv = 0, tj = 0;
  filteredInvestment.forEach(function(i) {
    var v = parseFloat(i.announced_value_usd_m);
    if (!isNaN(v)) tv += v;
    var j = parseFloat(i.jobs);
    if (!isNaN(j)) tj += j;
  });
  document.getElementById('sTotalInv').textContent = tv > 0 ? formatValue(tv) : '—';
  document.getElementById('sEvents').textContent   = filteredInvestment.length || '0';
  document.getElementById('sJobs').textContent     = tj > 0 ? Math.round(tj).toLocaleString() : '0';
  document.getElementById('sFac').textContent      = filteredPresence.length || '0';
}

/* ── buildCards — renders investment card panel ──────────────────────────── */
function buildCards(filteredInvestment) {
  var multi = sel.length > 1;

  /* Mini stats in right-panel header */
  var tv = 0, tj = 0;
  filteredInvestment.forEach(function(i) {
    var v = parseFloat(i.announced_value_usd_m);
    if (!isNaN(v)) tv += v;
    var j = parseFloat(i.jobs);
    if (!isNaN(j)) tj += j;
  });
  document.getElementById('ipT').textContent = tv > 0 ? formatValue(tv) : '—';
  document.getElementById('ipE').textContent = filteredInvestment.length || '—';
  document.getElementById('ipJ').textContent = tj > 0 ? Math.round(tj).toLocaleString() : '—';
  document.getElementById('rpSub').textContent = 'Showing: ' + (multi ? sel.join(', ') : sel[0]);

  var cont = document.getElementById('cards');

  if (!filteredInvestment.length) {
    cont.innerHTML =
      '<div class="empty">' +
        '<p>No investment events recorded</p>' +
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

  updateStats(filteredTrade, filteredInvestment, filteredPresence);
  buildTrade(filteredTrade, filteredInvestment, sel, multi);
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
    parseCSV('data/indiana_trade.csv'),
    parseCSV('data/investment_events.csv'),
    parseCSV('data/presence_records.csv')
  ])
  .then(function(results) {
    tradeData      = results[0];
    investmentData = results[1];
    presenceData   = results[2];

    renderPills();

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
  })
  .catch(function(err) {
    console.error('Failed to load CSV data:', err);
  });
});

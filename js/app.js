/* ── app.js ───────────────────────────────────────────────────────────────
   All variables and functions are global (no ES module syntax).
   Loaded last — after charts.js.
   ──────────────────────────────────────────────────────────────────────── */

/* ── Country name mapping ─────────────────────────────────────────────────
   Keys  = display names / parent_country values in investment_events.csv
   Values = country names as they appear in indiana_trade.csv
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

/* ── Region definitions ───────────────────────────────────────────────────
   Keys = region display names
   Values = arrays of display-name country strings (must match COUNTRY_MAP keys)
   ──────────────────────────────────────────────────────────────────────── */
const REGIONS = {
  'Northeast Asia':  ['Japan', 'South Korea', 'China', 'Hong Kong', 'Taiwan'],
  'South & SE Asia': ['India', 'Vietnam', 'Thailand', 'Indonesia', 'Malaysia',
                      'Philippines', 'Singapore'],
  'Oceania':         ['Australia']
};

/* ── Selection state ─────────────────────────────────────────────────────── */
var selectedCountries = new Set(['Japan']);
var regionMode        = false;

/* ── Global data stores ──────────────────────────────────────────────────── */
var tradeData      = [];
var investmentData = [];
var presenceData   = [];

/* ── formatValue ─────────────────────────────────────────────────────────
   Shared formatter for $M / $B values.
   Used in summary stats AND individual timeline card metadata.
   Also called by buildAnnotations() in charts.js (global).
   ──────────────────────────────────────────────────────────────────────── */
function formatValue(millionsFloat) {
  if (millionsFloat == null || isNaN(millionsFloat)) return 'N/D';
  if (millionsFloat >= 1000) return '$' + (millionsFloat / 1000).toFixed(1) + 'B';
  return '$' + Math.round(millionsFloat) + 'M';
}

/* ── countryColor ────────────────────────────────────────────────────────
   Maps a display-name country to a consistent colour from PALETTE.
   PALETTE is defined in charts.js (global).
   Used by both the timeline cards and updateCharts() in charts.js.
   ──────────────────────────────────────────────────────────────────────── */
function countryColor(countryName) {
  var keys = Object.keys(COUNTRY_MAP);
  var idx  = keys.indexOf(countryName);
  return PALETTE[idx % PALETTE.length];
}

/* ── shortCompanyName ────────────────────────────────────────────────────
   Trims verbose suffixes for compact annotation labels.
   Called by buildAnnotations() in charts.js (global).
   ──────────────────────────────────────────────────────────────────────── */
function shortCompanyName(name) {
  return (name || '')
    .replace(/Motor Manufacturing Indiana/gi, '')
    .replace(/Manufacturing of Indiana/gi, '')
    .replace(/\u2014\s*\d{4}.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 22);
}

/* ── badgeClass ──────────────────────────────────────────────────────────── */
function badgeClass(status) {
  if (!status) return 'badge-grey';
  var s = status.toLowerCase();
  if (s.indexOf('operational') !== -1 || s.indexOf('active') !== -1) return 'badge-green';
  if (s.indexOf('under construction') !== -1 || s.indexOf('announced') !== -1 || s.indexOf('planned') !== -1) return 'badge-amber';
  if (s.indexOf('closed') !== -1) return 'badge-red';
  return 'badge-grey';
}

/* ── updateHeadlineStats ─────────────────────────────────────────────────
   Populates the four stat boxes in #headline-stats.
   fmtAxis() is defined in charts.js (global).
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

  /* Export growth multiplier */
  var growthText;
  if (exports2014 === 0 || exports2025 === 0) {
    growthText = 'N/A';
  } else {
    growthText = (exports2025 / exports2014).toFixed(1) + 'x';
  }

  /* Announced investment */
  var totalInvestment = 0;
  for (var j = 0; j < investmentRows.length; j++) {
    var iv = parseFloat(investmentRows[j].announced_value_usd_m);
    if (!isNaN(iv)) totalInvestment += iv;
  }
  var investmentDisplay = investmentRows.length === 0 ? '\u2014' : formatValue(totalInvestment);

  /* Known facilities */
  var facilities = presenceRows.length;

  document.getElementById('headline-stats').innerHTML =
    '<div class="headline-stat-box">' +
      '<span class="headline-stat-value">' + fmtAxis(totalExports) + '</span>' +
      '<span class="headline-stat-label">Total Exports (2014\u20132025)</span>' +
    '</div>' +
    '<div class="headline-stat-box">' +
      '<span class="headline-stat-value">' + growthText + '</span>' +
      '<span class="headline-stat-label">Export Growth</span>' +
      '<span class="headline-stat-sublabel">vs. 2014 baseline</span>' +
    '</div>' +
    '<div class="headline-stat-box">' +
      '<span class="headline-stat-value">' + investmentDisplay + '</span>' +
      '<span class="headline-stat-label">Announced Investment</span>' +
    '</div>' +
    '<div class="headline-stat-box">' +
      '<span class="headline-stat-value">' + facilities + '</span>' +
      '<span class="headline-stat-label">Known Facilities</span>' +
      '<span class="headline-stat-sublabel">operating in Indiana</span>' +
    '</div>';
}

/* ── renderInvestmentPanel ───────────────────────────────────────────────
   Renders the summary stats row and the vertical investment timeline.
   ──────────────────────────────────────────────────────────────────────── */
function renderInvestmentPanel(rows, label) {
  var summaryEl = document.getElementById('investment-summary');
  var cardsEl   = document.getElementById('investment-cards');

  /* ── No records ──────────────────────────────────────────────────────── */
  if (!rows || rows.length === 0) {
    summaryEl.innerHTML = '';
    cardsEl.innerHTML =
      '<div class="no-data-msg">' +
        '<p>No investment records found for <strong>' + label + '</strong>.</p>' +
        '<span class="muted">Strong trade relationship with no traceable direct investment above $5M \u2014 ' +
        'this may represent an investment attraction opportunity for APBAI.</span>' +
      '</div>';
    return;
  }

  /* ── Summary stats (unchanged structure) ────────────────────────────── */
  var totalValue = 0;
  var totalJobs  = 0;

  for (var i = 0; i < rows.length; i++) {
    var val = parseFloat(rows[i].announced_value_usd_m);
    if (!isNaN(val)) totalValue += val;
    var jobs = parseFloat(rows[i].jobs);
    if (!isNaN(jobs)) totalJobs += jobs;
  }

  summaryEl.innerHTML =
    '<div class="stats-row">' +
      '<div class="stat-box">' +
        '<span class="stat-value">' + formatValue(totalValue) + '</span>' +
        '<span class="stat-label">Total Announced</span>' +
      '</div>' +
      '<div class="stat-box">' +
        '<span class="stat-value">' + rows.length + '</span>' +
        '<span class="stat-label">Events</span>' +
      '</div>' +
      '<div class="stat-box">' +
        '<span class="stat-value">' + Math.round(totalJobs).toLocaleString() + '</span>' +
        '<span class="stat-label">Announced Jobs</span>' +
      '</div>' +
    '</div>';

  /* ── Timeline — group rows by year (sorted descending) ───────────────── */
  var sorted = rows.slice().sort(function(a, b) {
    return (b.announcement_year || 0) - (a.announcement_year || 0);
  });

  var yearGroups = {};
  var yearOrder  = [];
  for (var j = 0; j < sorted.length; j++) {
    var yr = sorted[j].announcement_year || 'Unknown';
    if (!yearGroups[yr]) {
      yearGroups[yr] = [];
      yearOrder.push(yr);
    }
    yearGroups[yr].push(sorted[j]);
  }

  var multiCountry = selectedCountries.size > 1;
  var html = '';

  for (var k = 0; k < yearOrder.length; k++) {
    var year     = yearOrder[k];
    var yearRows = yearGroups[year];
    var eventsHtml = '';

    for (var m = 0; m < yearRows.length; m++) {
      var r     = yearRows[m];
      var color = countryColor(r.parent_country);

      /* Card header — country dot only when multiple countries selected */
      var dotHtml = multiCountry
        ? '<span class="country-dot" style="background:' + color + '"></span>'
        : '';
      var headerHtml =
        '<div class="card-header">' + dotHtml +
          '<span class="card-company">' + (r.company_name || '') + '</span>' +
        '</div>';

      /* Badge */
      var bClass    = badgeClass(r.operational_status);
      var badgeHtml = '<span class="' + bClass + '">' + (r.operational_status || 'Unknown') + '</span>';

      /* Verify tag */
      var verifyHtml = '';
      if (r.confidence === 'Medium' || r.confidence === 'Low') {
        verifyHtml = '<span class="verify-tag">&#9888; verify before citing</span>';
      }

      /* Flag tag */
      var flagHtml = '';
      if (r.notes && r.notes.indexOf('FLAG') !== -1) {
        flagHtml = '<span class="flag-tag">&#9873; flagged</span>';
      }

      /* Source link */
      var sourceHtml = '';
      if (r.source_url && r.source_url.trim() !== '') {
        sourceHtml = '<a href="' + r.source_url + '" target="_blank" rel="noopener" class="source-link">Source &#8599;</a>';
      }

      eventsHtml +=
        '<div class="timeline-card" style="border-left-color:' + color + '">' +
          headerHtml +
          '<div class="card-sub">' +
            (r.city || '') + ', ' + (r.county || '') + ' County &mdash; ' + (r.sector || '') +
          '</div>' +
          '<div class="card-meta">' +
            (r.investment_type || '') + ' &middot; ' + (r.announcement_year || '') +
            ' &middot; ' + formatValue(parseFloat(r.announced_value_usd_m)) +
          '</div>' +
          '<div class="card-footer">' +
            badgeHtml + verifyHtml + flagHtml + sourceHtml +
          '</div>' +
        '</div>';
    }

    html +=
      '<div class="timeline-year-group">' +
        '<div class="timeline-year-label">' + year + '</div>' +
        '<div class="timeline-events">' + eventsHtml + '</div>' +
      '</div>';
  }

  cardsEl.innerHTML = html;
}

/* ── renderAll — single entry point for all data updates ─────────────────── */
function renderAll() {
  var countriesArray = Array.from(selectedCountries);

  /* Filter trade: combine rows matching any selected country via COUNTRY_MAP */
  var filteredTrade = tradeData.filter(function(row) {
    return countriesArray.some(function(c) {
      return row.country === COUNTRY_MAP[c];
    });
  });

  /* Filter investment: direct match on parent_country */
  var filteredInvestment = investmentData.filter(function(row) {
    return selectedCountries.has(row.parent_country);
  });

  /* Filter presence: direct match on parent_country */
  var filteredPresence = presenceData.filter(function(row) {
    return selectedCountries.has(row.parent_country);
  });

  /* Determine display label */
  var label = countriesArray.length === 1
    ? countriesArray[0]
    : 'Combined Selection';

  /* Update trade panel title */
  document.getElementById('trade-panel-title').textContent = 'Indiana Exports \u2014 ' + label;

  /* Run all updates */
  updateHeadlineStats(filteredTrade, filteredInvestment, filteredPresence);
  updateCharts(filteredTrade, filteredInvestment, countriesArray);
  renderInvestmentPanel(filteredInvestment, label);
}

/* ── renderPills — redraws the pill bar and reattaches listeners ──────────── */
function renderPills() {
  var pillsContainer = document.getElementById('country-pills');

  if (regionMode) {
    /* ── Region mode: 3 region pills ────────────────────────────────────── */
    var regionNames = Object.keys(REGIONS);
    var html = '';

    for (var i = 0; i < regionNames.length; i++) {
      var regionName      = regionNames[i];
      var regionCountries = REGIONS[regionName];
      var allActive  = regionCountries.every(function(c) { return selectedCountries.has(c); });
      var someActive = regionCountries.some(function(c) { return selectedCountries.has(c); });

      var cls = 'country-pill';
      if (allActive)       cls += ' active';
      else if (someActive) cls += ' partial';

      html += '<button class="' + cls + '" data-region="' + regionName + '">' + regionName + '</button>';
    }

    pillsContainer.innerHTML = html;

    /* Attach region pill listeners */
    var regionPills = pillsContainer.querySelectorAll('[data-region]');
    for (var rj = 0; rj < regionPills.length; rj++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var rName       = btn.dataset.region;
          var rCountries  = REGIONS[rName];
          var allActive2  = rCountries.every(function(c) { return selectedCountries.has(c); });
          var someActive2 = rCountries.some(function(c) { return selectedCountries.has(c); });

          if (allActive2 || someActive2) {
            /* Deselect all countries in this region, but keep at least 1 globally */
            var hasCountryOutsideRegion = false;
            selectedCountries.forEach(function(c) {
              if (rCountries.indexOf(c) === -1) hasCountryOutsideRegion = true;
            });
            if (!hasCountryOutsideRegion) return; /* would empty the set — do nothing */
            for (var n = 0; n < rCountries.length; n++) {
              selectedCountries.delete(rCountries[n]);
            }
          } else {
            /* Select all countries in this region */
            for (var n2 = 0; n2 < rCountries.length; n2++) {
              selectedCountries.add(rCountries[n2]);
            }
          }
          renderPills();
          renderAll();
        });
      })(regionPills[rj]);
    }

  } else {
    /* ── Country mode: 13 individual country pills ───────────────────────── */
    var countryKeys = Object.keys(COUNTRY_MAP);
    var html2 = '';

    for (var ci = 0; ci < countryKeys.length; ci++) {
      var country  = countryKeys[ci];
      var isActive = selectedCountries.has(country);
      html2 += '<button class="country-pill' + (isActive ? ' active' : '') +
               '" data-country="' + country + '">' + country + '</button>';
    }

    pillsContainer.innerHTML = html2;

    /* Attach individual country pill listeners */
    var countryPills = pillsContainer.querySelectorAll('[data-country]');
    for (var cj = 0; cj < countryPills.length; cj++) {
      (function(btn2) {
        btn2.addEventListener('click', function() {
          var c2 = btn2.dataset.country;
          if (selectedCountries.has(c2)) {
            if (selectedCountries.size === 1) return; /* minimum 1 country */
            selectedCountries.delete(c2);
          } else {
            selectedCountries.add(c2);
          }
          renderPills();
          renderAll();
        });
      })(countryPills[cj]);
    }
  }
}

/* ── Bootstrap on DOMContentLoaded ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {

  function parseCSV(url) {
    return new Promise(function(resolve, reject) {
      Papa.parse(url, {
        download:      true,
        header:        true,
        dynamicTyping: true,
        complete: function(results) { resolve(results.data); },
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
    tradeData      = results[0] || [];
    investmentData = results[1] || [];
    presenceData   = results[2] || [];

    /* Render pills with correct initial active state */
    renderPills();

    /* Region toggle button */
    var toggleBtn = document.getElementById('region-toggle-btn');
    toggleBtn.addEventListener('click', function() {
      regionMode = !regionMode;
      toggleBtn.textContent = regionMode ? 'Show Countries' : 'Group by Region';
      renderPills();
      renderAll();
    });

    /* Initial render — Japan selected by default */
    renderAll();
  })
  .catch(function(err) {
    console.error('Failed to load CSV data:', err);
  });
});

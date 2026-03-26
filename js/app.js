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

/* ── Global data stores ──────────────────────────────────────────────────── */
var tradeData      = [];
var investmentData = [];

/* ── Shared value formatter ───────────────────────────────────────────────
   Used in summary stats AND individual investment cards.
   ──────────────────────────────────────────────────────────────────────── */
function formatValue(millionsFloat) {
  if (millionsFloat == null || isNaN(millionsFloat)) return 'N/D';
  if (millionsFloat >= 1000) return '$' + (millionsFloat / 1000).toFixed(1) + 'B';
  return '$' + Math.round(millionsFloat) + 'M';
}

/* ── Badge class helper ──────────────────────────────────────────────────── */
function badgeClass(status) {
  if (!status) return 'badge-grey';
  var s = status.toLowerCase();
  if (s.indexOf('operational') !== -1 || s.indexOf('active') !== -1) return 'badge-green';
  if (s.indexOf('under construction') !== -1 || s.indexOf('announced') !== -1 || s.indexOf('planned') !== -1) return 'badge-amber';
  if (s.indexOf('closed') !== -1) return 'badge-red';
  return 'badge-grey';
}

/* ── Render investment panel ─────────────────────────────────────────────── */
function renderInvestmentPanel(rows, country) {
  var summaryEl = document.getElementById('investment-summary');
  var cardsEl   = document.getElementById('investment-cards');

  /* ── No records ──────────────────────────────────────────────────────── */
  if (!rows || rows.length === 0) {
    summaryEl.innerHTML = '';
    cardsEl.innerHTML =
      '<div class="no-data-msg">' +
        '<p>No investment records found for <strong>' + country + '</strong>.</p>' +
        '<span class="muted">Strong trade relationship with no traceable direct investment above $5M — ' +
        'this may represent an investment attraction opportunity for APBAI.</span>' +
      '</div>';
    return;
  }

  /* ── Summary stats ───────────────────────────────────────────────────── */
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

  /* ── Investment cards — sorted by year descending ─────────────────────── */
  var sorted = rows.slice().sort(function(a, b) {
    return (b.announcement_year || 0) - (a.announcement_year || 0);
  });

  var html = '';
  for (var j = 0; j < sorted.length; j++) {
    var r = sorted[j];

    /* Badge */
    var bClass = badgeClass(r.operational_status);
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

    html +=
      '<div class="investment-card">' +
        '<div class="card-company">' + (r.company_name || '') + '</div>' +
        '<div class="card-sub">' + (r.city || '') + ', ' + (r.county || '') + ' County &mdash; ' + (r.sector || '') + '</div>' +
        '<div class="card-meta">' + (r.investment_type || '') + ' &middot; ' + (r.announcement_year || '') + ' &middot; ' + formatValue(parseFloat(r.announced_value_usd_m)) + '</div>' +
        '<div class="card-footer">' +
          badgeHtml +
          verifyHtml +
          flagHtml +
          sourceHtml +
        '</div>' +
      '</div>';
  }

  cardsEl.innerHTML = html;
}

/* ── Select country ──────────────────────────────────────────────────────── */
function selectCountry(country) {
  /* Update pill active state */
  var pills = document.querySelectorAll('.country-pill');
  for (var i = 0; i < pills.length; i++) {
    pills[i].classList.remove('active');
    if (pills[i].dataset.country === country) {
      pills[i].classList.add('active');
    }
  }

  /* Filter trade data using COUNTRY_MAP */
  var tradeKey = COUNTRY_MAP[country];
  var filteredTrade = tradeData.filter(function(row) {
    return row.country === tradeKey;
  });

  /* Filter investment data using display name directly */
  var filteredInvestment = investmentData.filter(function(row) {
    return row.parent_country === country;
  });

  /* Update trade panel title */
  document.getElementById('trade-panel-title').textContent = 'Indiana Exports to ' + country;

  /* Render */
  updateCharts(filteredTrade, country);
  renderInvestmentPanel(filteredInvestment, country);
}

/* ── Bootstrap on DOMContentLoaded ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {

  var tradeUrl      = 'data/indiana_trade.csv';
  var investmentUrl = 'data/investment_events.csv';

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

  Promise.all([parseCSV(tradeUrl), parseCSV(investmentUrl)])
    .then(function(results) {
      tradeData      = results[0] || [];
      investmentData = results[1] || [];

      /* Attach click listeners to pills */
      var pills = document.querySelectorAll('.country-pill');
      for (var i = 0; i < pills.length; i++) {
        (function(btn) {
          btn.addEventListener('click', function() {
            selectCountry(btn.dataset.country);
          });
        })(pills[i]);
      }

      /* Default selection */
      selectCountry('Japan');
    })
    .catch(function(err) {
      console.error('Failed to load CSV data:', err);
    });
});

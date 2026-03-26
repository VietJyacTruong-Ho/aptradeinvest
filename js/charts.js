/* ── charts.js ───────────────────────────────────────────────────────────
   All variables and functions are global (no ES module syntax).
   Loaded after Chart.js CDN, before app.js.
   ──────────────────────────────────────────────────────────────────────── */

var lineChart = null;
var barChart  = null;

/* ── Colour palette ──────────────────────────────────────────────────────── */
var PALETTE = [
  '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#d97706',
  '#65a30d', '#0891b2', '#0f766e', '#1d4ed8', '#6d28d9'
];

/* ── Axis / tooltip formatter ─────────────────────────────────────────────
   Defined BEFORE the chart-creation functions that reference it.
   ──────────────────────────────────────────────────────────────────────── */
function fmtAxis(value) {
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(0) + 'M';
  return '$' + value.toLocaleString();
}

/* ── Main entry point called from app.js ─────────────────────────────────── */
function updateCharts(tradeRows, countryName) {

  var noDataEl          = document.getElementById('trade-no-data');
  var lineContainerEl   = document.getElementById('line-chart-container');
  var barContainerEl    = document.getElementById('bar-chart-container');

  /* ── No data path ──────────────────────────────────────────────────────── */
  if (!tradeRows || tradeRows.length === 0) {
    noDataEl.textContent = 'No trade data available for ' + countryName;
    noDataEl.style.display = 'block';
    lineContainerEl.style.display = 'none';
    barContainerEl.style.display  = 'none';

    if (lineChart) { lineChart.destroy(); lineChart = null; }
    if (barChart)  { barChart.destroy();  barChart  = null; }
    return;
  }

  /* ── Data is present — show charts ────────────────────────────────────── */
  noDataEl.style.display        = 'none';
  lineContainerEl.style.display = 'block';
  barContainerEl.style.display  = 'block';

  /* ════════════════════════════════════════════════════════════════════════
     LINE CHART — total exports by year
     ════════════════════════════════════════════════════════════════════════ */
  var yearRange = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

  /* Aggregate: sum export_value_usd per year */
  var yearTotals = {};
  for (var i = 0; i < tradeRows.length; i++) {
    var row = tradeRows[i];
    var yr  = row.year;
    var val = Number(row.export_value_usd) || 0;
    yearTotals[yr] = (yearTotals[yr] || 0) + val;
  }

  var yearLabels  = yearRange.map(function(y) { return String(y); });
  var yearlyValues = yearRange.map(function(y) { return yearTotals[y] || 0; });

  var lineTitle = 'Indiana Exports to ' + countryName + ' (USD)';

  if (lineChart) {
    /* Update existing chart */
    lineChart.data.labels            = yearLabels;
    lineChart.data.datasets[0].data  = yearlyValues;
    lineChart.options.plugins.title.text = lineTitle;
    lineChart.update();
  } else {
    /* Create new chart */
    var lineCtx = document.getElementById('lineChart').getContext('2d');
    lineChart = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels: yearLabels,
        datasets: [{
          data:            yearlyValues,
          borderColor:     '#2563eb',
          borderWidth:     2,
          fill:            true,
          backgroundColor: 'rgba(37,99,235,0.08)',
          pointRadius:     3,
          tension:         0.3
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text:    lineTitle
          },
          tooltip: {
            callbacks: {
              label: function(ctx) { return fmtAxis(ctx.parsed.y); }
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback: fmtAxis
            }
          }
        }
      }
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     BAR CHART — top 10 export commodities (all years combined)
     ════════════════════════════════════════════════════════════════════════ */

  /* Aggregate by commodity */
  var commodityTotals = {};
  for (var j = 0; j < tradeRows.length; j++) {
    var r   = tradeRows[j];
    var com = r.commodity || '(unknown)';
    var v   = Number(r.export_value_usd) || 0;
    commodityTotals[com] = (commodityTotals[com] || 0) + v;
  }

  /* Sort descending, take top 10 */
  var commodityEntries = Object.keys(commodityTotals).map(function(k) {
    return { label: k, value: commodityTotals[k] };
  });
  commodityEntries.sort(function(a, b) { return b.value - a.value; });
  var top10 = commodityEntries.slice(0, 10);

  /* Strip leading chapter number (e.g. "84 Nuclear Reactors..." → "Nuclear Reactors...") */
  var strippedLabels = top10.map(function(e) {
    return e.label.replace(/^\d+\s+/, '');
  });
  var topValues = top10.map(function(e) { return e.value; });

  /* Reverse so highest value appears at top in horizontal bar chart */
  strippedLabels = strippedLabels.slice().reverse();
  topValues      = topValues.slice().reverse();

  var barTitle = 'Top Export Commodities to ' + countryName + ' (all years, USD)';

  if (barChart) {
    /* Update existing chart */
    barChart.data.labels                      = strippedLabels;
    barChart.data.datasets[0].data            = topValues;
    barChart.data.datasets[0].backgroundColor = PALETTE;
    barChart.options.plugins.title.text       = barTitle;
    barChart.update();
  } else {
    /* Create new chart */
    var barCtx = document.getElementById('barChart').getContext('2d');
    barChart = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: strippedLabels,
        datasets: [{
          data:            topValues,
          backgroundColor: PALETTE
        }]
      },
      options: {
        indexAxis:           'y',
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text:    barTitle
          },
          tooltip: {
            callbacks: {
              label: function(ctx) { return fmtAxis(ctx.parsed.x); }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              callback: fmtAxis
            }
          }
        }
      }
    });
  }
}

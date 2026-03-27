/* ── charts.js ───────────────────────────────────────────────────────────
   All variables and functions are global (no ES module syntax).
   Loaded after Chart.js CDN + annotation plugin, before app.js.
   ──────────────────────────────────────────────────────────────────────── */

var lineChart = null;
var barChart  = null;

/* ── Colour palette (global — used by countryColor() in app.js too) ──────── */
var PALETTE = [
  '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#d97706',
  '#65a30d', '#0891b2', '#0f766e', '#1d4ed8', '#6d28d9'
];

/* ── Axis / tooltip formatter ─────────────────────────────────────────────
   Defined BEFORE the chart-creation functions that reference it.
   Also used by updateHeadlineStats() in app.js (global).
   ──────────────────────────────────────────────────────────────────────── */
function fmtAxis(value) {
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(0) + 'M';
  return '$' + value.toLocaleString();
}

/* ── buildAnnotations ────────────────────────────────────────────────────
   Returns a chartjs-plugin-annotation annotations object.
   Only produces annotations when exactly 1 country is selected.
   shortCompanyName() and formatValue() are defined in app.js (global).
   ──────────────────────────────────────────────────────────────────────── */
function buildAnnotations(investmentRows, selectedCountriesArray) {
  if (!selectedCountriesArray || selectedCountriesArray.length !== 1) return {};
  if (!investmentRows || investmentRows.length === 0) return {};

  /* Sort by announced value descending, take top 3 */
  var sorted = investmentRows.slice().sort(function(a, b) {
    var av = parseFloat(a.announced_value_usd_m) || 0;
    var bv = parseFloat(b.announced_value_usd_m) || 0;
    return bv - av;
  });
  var top3 = sorted.slice(0, 3);

  /* Group by announcement_year (two top-3 events may share a year) */
  var yearMap = {};
  for (var i = 0; i < top3.length; i++) {
    var row = top3[i];
    var yr  = row.announcement_year;
    if (!yearMap[yr]) yearMap[yr] = [];
    yearMap[yr].push(row);
  }

  var annotations = {};
  var yearKeys = Object.keys(yearMap);

  for (var j = 0; j < yearKeys.length; j++) {
    var year     = yearKeys[j];
    var yearRows = yearMap[year];

    /* Combine label text if multiple events share the same year */
    var labelParts = yearRows.map(function(r) {
      return shortCompanyName(r.company_name) +
             ' \u00b7 ' +
             formatValue(parseFloat(r.announced_value_usd_m));
    });
    var labelText = labelParts.join(' / ');

    annotations['annotation_' + year] = {
      type:        'line',
      xMin:        String(year),
      xMax:        String(year),
      borderColor: '#94a3b8',
      borderWidth: 1,
      borderDash:  [4, 4],
      label: {
        display:         true,
        content:         labelText,
        position:        'start',
        backgroundColor: 'rgba(255,255,255,0.9)',
        color:           '#1a1a2e',
        font:            { size: 10 },
        padding:         { x: 6, y: 3 }
      }
    };
  }

  return annotations;
}

/* ── Main entry point called from renderAll() in app.js ──────────────────
   Signature: updateCharts(tradeRows, investmentRows, selectedCountriesArray)
   - tradeRows: all filtered trade rows across selected countries (combined)
   - investmentRows: all filtered investment event rows
   - selectedCountriesArray: Array.from(selectedCountries)
   countryColor() is defined in app.js (global).
   ──────────────────────────────────────────────────────────────────────── */
function updateCharts(tradeRows, investmentRows, selectedCountriesArray) {

  var noDataEl        = document.getElementById('trade-no-data');
  var lineContainerEl = document.getElementById('line-chart-container');
  var barContainerEl  = document.getElementById('bar-chart-container');

  /* Derive display label */
  var countryLabel = selectedCountriesArray.length === 1
    ? selectedCountriesArray[0]
    : 'Combined Selection';

  /* ── No data path ──────────────────────────────────────────────────────── */
  if (!tradeRows || tradeRows.length === 0) {
    noDataEl.textContent       = 'No trade data available for ' + countryLabel;
    noDataEl.style.display     = 'block';
    lineContainerEl.style.display = 'none';
    barContainerEl.style.display  = 'none';

    if (lineChart) { lineChart.destroy(); lineChart = null; }
    if (barChart)  { barChart.destroy();  barChart  = null; }
    return;
  }

  /* ── Data present — show charts ──────────────────────────────────────── */
  noDataEl.style.display        = 'none';
  lineContainerEl.style.display = 'block';
  barContainerEl.style.display  = 'block';

  /* ════════════════════════════════════════════════════════════════════════
     LINE CHART — multi-dataset when >1 country selected
     ════════════════════════════════════════════════════════════════════════ */
  var yearRange  = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  var yearLabels = yearRange.map(function(y) { return String(y); });

  var newDatasets = [];

  if (selectedCountriesArray.length === 1) {
    /* Single country — one filled dataset */
    var singleCountry = selectedCountriesArray[0];
    var yearTotals = {};
    for (var i = 0; i < tradeRows.length; i++) {
      var row = tradeRows[i];
      yearTotals[row.year] = (yearTotals[row.year] || 0) + (Number(row.export_value_usd) || 0);
    }
    newDatasets.push({
      label:           singleCountry,
      data:            yearRange.map(function(y) { return yearTotals[y] || 0; }),
      borderColor:     countryColor(singleCountry),
      backgroundColor: 'rgba(37,99,235,0.08)',
      borderWidth:     2,
      fill:            true,
      pointRadius:     3,
      tension:         0.3
    });
  } else {
    /* Multiple countries — one line per country */
    for (var ci = 0; ci < selectedCountriesArray.length; ci++) {
      var c        = selectedCountriesArray[ci];
      var tradeKey = COUNTRY_MAP[c];
      var countryYearTotals = {};

      for (var ri = 0; ri < tradeRows.length; ri++) {
        var rr = tradeRows[ri];
        if (rr.country === tradeKey) {
          countryYearTotals[rr.year] = (countryYearTotals[rr.year] || 0) + (Number(rr.export_value_usd) || 0);
        }
      }

      newDatasets.push({
        label:           c,
        data:            yearRange.map(function(y) { return countryYearTotals[y] || 0; }),
        borderColor:     countryColor(c),
        backgroundColor: 'transparent',
        borderWidth:     2,
        fill:            false,
        pointRadius:     3,
        tension:         0.3
      });
    }
  }

  var lineTitle  = 'Indiana Exports \u2014 ' + countryLabel + ' (USD)';
  var showLegend = selectedCountriesArray.length > 1;
  var annotations = buildAnnotations(investmentRows, selectedCountriesArray);

  if (lineChart) {
    /* Update existing chart */
    lineChart.data.labels                         = yearLabels;
    lineChart.data.datasets                       = newDatasets;
    lineChart.options.plugins.legend.display      = showLegend;
    lineChart.options.plugins.title.text          = lineTitle;
    lineChart.options.plugins.annotation          = { annotations: annotations };
    lineChart.update();
  } else {
    /* Create new chart — always use datasets array structure */
    var lineCtx = document.getElementById('lineChart').getContext('2d');
    lineChart = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels:   yearLabels,
        datasets: newDatasets
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: showLegend },
          title: {
            display: true,
            text:    lineTitle
          },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                var prefix = ctx.dataset.label ? ctx.dataset.label + ': ' : '';
                return prefix + fmtAxis(ctx.parsed.y);
              }
            }
          },
          annotation: { annotations: annotations }
        },
        scales: {
          y: {
            ticks: { callback: fmtAxis }
          }
        }
      }
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     BAR CHART — top 10 commodities across all selected countries combined
     ════════════════════════════════════════════════════════════════════════ */

  var commodityTotals = {};
  for (var j = 0; j < tradeRows.length; j++) {
    var r2  = tradeRows[j];
    var com = r2.commodity || '(unknown)';
    commodityTotals[com] = (commodityTotals[com] || 0) + (Number(r2.export_value_usd) || 0);
  }

  var commodityEntries = Object.keys(commodityTotals).map(function(k) {
    return { label: k, value: commodityTotals[k] };
  });
  commodityEntries.sort(function(a, b) { return b.value - a.value; });
  var top10 = commodityEntries.slice(0, 10);

  /* Strip leading HS chapter number */
  var strippedLabels = top10.map(function(e) { return e.label.replace(/^\d+\s+/, ''); });
  var topValues      = top10.map(function(e) { return e.value; });

  /* Reverse so highest value appears at top in horizontal bar */
  strippedLabels = strippedLabels.slice().reverse();
  topValues      = topValues.slice().reverse();

  var barTitle = 'Top Export Commodities \u2014 ' + countryLabel + ' (all years, USD)';

  if (barChart) {
    barChart.data.labels                      = strippedLabels;
    barChart.data.datasets[0].data            = topValues;
    barChart.data.datasets[0].backgroundColor = PALETTE;
    barChart.options.plugins.title.text       = barTitle;
    barChart.update();
  } else {
    var barCtx = document.getElementById('barChart').getContext('2d');
    barChart = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels:   strippedLabels,
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
            ticks: { callback: fmtAxis }
          }
        }
      }
    });
  }
}

/* ── charts.js ─────────────────────────────────────────────────────────────
   Prototype-based chart functions adapted for CSV data pipeline.
   Loaded before app.js and country-chart.js.
   Globals used from app.js at call-time: CC, COUNTRY_MAP
   ──────────────────────────────────────────────────────────────────────── */

var tChart = null;
var cChart = null;

const YRS = [2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];

/* ── Stable categorical colors for the commodity bar chart ──────────────────
   Keyed by the display category names defined in HS_GROUPS (country-chart.js).
   Using stable names means colors persist across country switches and year
   range changes, so users can track categories visually.
   ──────────────────────────────────────────────────────────────────────── */
var CC_CAT = {
  'Pharmaceuticals':   '#1655a2',  /* institutional blue — Indiana's dominant sector */
  'Chemicals':         '#2D7D54',  /* teal-green */
  'Plastics & Rubber': '#9A6B1F',  /* warm amber-brown */
  'Electronics':       '#5E4FA0',  /* violet */
  'Metals':            '#566F7D',  /* steel blue-gray */
  'Agric. & Food':     '#3A7A48',  /* forest green */
  'Machinery':         '#2B80B5',  /* sky blue */
  'Other':             '#8E9EAD',  /* cool gray */
};

/* ── fmtAxis — kept for country-chart.js compatibility ───────────────────── */
function fmtAxis(value) {
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(0) + 'M';
  return '$' + value.toLocaleString();
}

/* ── h2r — hex color to rgb components ──────────────────────────────────── */
function h2r(h) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  return r
    ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) }
    : { r: 55, g: 138, b: 221 };
}

/* ── mSz — dot size scaled to investment value (in $M) ──────────────────── */
function mSz(v) {
  if (!v || isNaN(v)) return 5;
  return Math.min(16, Math.max(6, Math.round(Math.sqrt(v / 9) * 1.9)));
}

/* ── getYearlyTotals ─────────────────────────────────────────────────────
   Returns a 13-element array (2014–2026) of export totals in USD billions.
   2026 is always null (no trade data). Values are null if year is missing.
   ──────────────────────────────────────────────────────────────────────── */
function getYearlyTotals(country, tradeRows) {
  const totals = {};
  tradeRows.forEach(row => {
    if (row.country === COUNTRY_MAP[country]) {
      totals[row.year] = (totals[row.year] || 0) + (Number(row.export_value_usd) || 0);
    }
  });
  return YRS.map(y => {
    if (y === 2026) return null;
    const v = totals[y];
    return v ? v / 1e9 : null;
  });
}

/* ── buildTrade ──────────────────────────────────────────────────────────
   Creates the main trade line chart.
   tradeRows:      filtered CSV rows for selected countries
   investmentRows: filtered CSV investment rows (passed through for marker timeout)
   countriesArray: ordered array of selected country names
   isMulti:        true when compare mode with >1 country
   ──────────────────────────────────────────────────────────────────────── */
function buildTrade(tradeRows, investmentRows, countriesArray, isMulti) {
  const ctx = document.getElementById('tradeC').getContext('2d');
  if (tChart) { tChart.destroy(); tChart = null; }

  const single = countriesArray.length === 1;

  const datasets = countriesArray.map(c => {
    const clr = CC[c] || '#378ADD';
    const { r, g, b } = h2r(clr);
    const vals = getYearlyTotals(c, tradeRows);
    return {
      label: c,
      data: YRS.map((y, i) => ({ x: y, y: vals[i] })),
      borderColor: clr,
      backgroundColor: single ? `rgba(${r},${g},${b},0.07)` : 'transparent',
      fill: single,
      borderWidth: 2,
      pointRadius: YRS.map(y => y === 2026 ? 0 : (single ? 3 : 2.5)),
      pointHoverRadius: 6,
      pointBackgroundColor: clr,
      tension: 0.3,
      spanGaps: false
    };
  });

  tChart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'linear',
          min: 2014,
          max: 2026,
          ticks: {
            stepSize: 1,
            callback: v => String(v),
            font: { family: 'IBM Plex Mono', size: 10 },
            color: '#96a1ae'
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
          border: { display: false }
        },
        y: {
          ticks: {
            callback: v => '$' + (Math.round(v * 100) / 100) + 'B',
            font: { family: 'IBM Plex Mono', size: 10 },
            color: '#96a1ae'
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
          border: { display: false }
        }
      },
      plugins: {
        legend: {
          display: !single,
          position: 'top',
          labels: {
            font: { family: 'IBM Plex Sans', size: 10 },
            boxWidth: 10, boxHeight: 10, padding: 12,
            usePointStyle: true, pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(13,27,42,0.9)',
          titleFont: { family: 'IBM Plex Sans', size: 11, weight: '600' },
          bodyFont:  { family: 'IBM Plex Mono', size: 11 },
          padding: 10,
          callbacks: {
            title: i => String(i[0].parsed.x),
            label: i => {
              const v = i.parsed.y;
              return v != null
                ? ` ${i.dataset.label}: $${v.toFixed(2)}B`
                : ` ${i.dataset.label}: no trade data`;
            }
          }
        }
      }
    }
  });

  /* Delay marker render until Chart.js has computed chartArea */
  const rowsSnap = investmentRows, arrSnap = countriesArray, multiSnap = isMulti;
  setTimeout(() => buildMarkers(rowsSnap, arrSnap, multiSnap), 480);
}

/* ── buildMarkers ────────────────────────────────────────────────────────
   Renders proportional year-bars onto the marker strip below the trade chart.
   Each bar grows downward from the baseline; height is proportional to total
   investment value for that year. A dot sits at the bottom of each bar.
   Clicking a dot selects that year: bars to the right are hidden and an
   inline investment list appears in the freed space.
   Only shown in single-country mode.
   ──────────────────────────────────────────────────────────────────────── */
function buildMarkers(investmentRows, countriesArray, isMulti) {
  var inner = document.getElementById('msInner');
  var dt    = document.getElementById('msDt');
  inner.innerHTML = '';

  if (!tChart || !tChart.chartArea) {
    dt.textContent = '';
    return;
  }

  if (isMulti) {
    dt.textContent = 'Switch to a single country to explore investment markers';
    dt.style.color = '';
    return;
  }

  var country = countriesArray[0];
  var invs = investmentRows.filter(function(r) { return r.parent_country === country; });

  if (!invs.length) {
    dt.textContent = 'No investment announcements recorded for this country.';
    dt.style.color = '';
    return;
  }

  var ca   = tChart.chartArea;
  var pw   = ca.right - ca.left;
  var ox   = ca.left;
  var xMin = tChart.options.scales.x.min != null ? tChart.options.scales.x.min : 2014;
  var xMax = tChart.options.scales.x.max != null ? tChart.options.scales.x.max : 2026;
  var xPos = function(yr) { return ox + (yr - xMin) / (xMax - xMin) * pw; };
  var clr  = CC[country] || '#536070';

  /* Group investments by year, summing values */
  var byY = {};
  invs.forEach(function(inv) {
    var y = parseInt(inv.announcement_year);
    if (isNaN(y) || y < xMin || y > xMax) return;
    if (!byY[y]) byY[y] = { total: 0, invs: [] };
    var v = parseFloat(inv.announced_value_usd_m);
    if (!isNaN(v)) byY[y].total += v;
    byY[y].invs.push(inv);
  });

  var years = Object.keys(byY).map(Number).sort(function(a, b) { return a - b; });

  if (!years.length) {
    dt.textContent = 'No investment announcements in this date range.';
    dt.style.color = '';
    return;
  }

  var maxTotal  = Math.max.apply(null, years.map(function(y) { return byY[y].total || 1; }));
  var innerH    = inner.offsetHeight || 68;
  var maxBarH   = innerH - 12;  /* reserve 12px at bottom for dot overflow */
  var minBarH   = 6;            /* minimum visible bar even for zero-value events */
  var selYr     = typeof selectedMarkerYear !== 'undefined' ? selectedMarkerYear : null;

  /* Update detail text */
  if (selYr && byY[selYr]) {
    dt.textContent = selYr + ' selected \u2014 click dot again to clear';
    dt.style.color = clr;
  } else {
    dt.textContent = 'Click a dot to filter investments by year';
    dt.style.color = '';
  }

  /* Horizontal baseline at top */
  var baseline = document.createElement('div');
  baseline.style.cssText = 'position:absolute;top:0;left:' + ox + 'px;width:' + pw + 'px;height:1px;background:#dde2ea;';
  inner.appendChild(baseline);

  /* Draw bars and dots for each year */
  years.forEach(function(yr) {
    /* When a year is selected, hide bars strictly to the right */
    if (selYr !== null && yr > selYr) return;

    var xp   = xPos(yr);
    var data = byY[yr];
    var barH = data.total > 0
      ? Math.max(minBarH, Math.round(data.total / maxTotal * maxBarH))
      : minBarH;
    var isSelected = (selYr === yr);

    /* Vertical bar — starts at top (baseline), grows downward */
    var bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:' + xp + 'px;top:0;width:2px;height:' + barH + 'px;'
      + 'background:' + clr + ';transform:translateX(-50%);border-radius:0 0 2px 2px;'
      + 'opacity:' + (isSelected ? '1' : '0.55') + ';';
    inner.appendChild(bar);

    /* Dot at the bottom of the bar */
    var dotSz  = isSelected ? 10 : 8;
    var dotTop = barH;
    var dot    = document.createElement('div');
    dot.style.cssText = 'position:absolute;left:' + xp + 'px;top:' + dotTop + 'px;'
      + 'width:' + dotSz + 'px;height:' + dotSz + 'px;border-radius:50%;'
      + 'background:' + (isSelected ? clr : '#fff') + ';border:2px solid ' + clr + ';'
      + 'transform:translate(-50%,-50%);cursor:pointer;z-index:4;'
      + 'box-shadow:0 1px 4px rgba(0,0,0,.18);transition:transform .12s;';

    /* Tooltip on hover */
    var totalStr = data.total > 0
      ? (data.total >= 1000 ? '$' + (data.total / 1000).toFixed(1) + 'B' : '$' + Math.round(data.total) + 'M')
      : 'N/D';
    dot.title = yr + ' \u2014 ' + data.invs.length + ' announcement' + (data.invs.length > 1 ? 's' : '') + ', ' + totalStr;

    dot.onmouseenter = function() { this.style.transform = 'translate(-50%,-50%) scale(1.4)'; };
    dot.onmouseleave = function() { this.style.transform = 'translate(-50%,-50%) scale(1)'; };

    var capturedYr = yr;
    dot.onclick = function() {
      setSelectedMarkerYear(selYr === capturedYr ? null : capturedYr);
    };

    inner.appendChild(dot);
  });

  /* When a year is selected, show inline investment list beside the dot.
     Flip to the left side when there's more room there (avoids right-edge cutoff). */
  if (selYr !== null && byY[selYr]) {
    var selXp      = xPos(selYr);
    var spaceRight = (ox + pw) - selXp - 14;
    var spaceLeft  = selXp - ox - 14;
    var flipLeft   = spaceLeft > spaceRight;
    var listWidth  = Math.max(0, flipLeft ? spaceLeft : spaceRight);

    if (listWidth > 60) {
      var listData   = byY[selYr];
      var listBarH   = listData.total > 0
        ? Math.max(minBarH, Math.round(listData.total / maxTotal * maxBarH))
        : minBarH;
      var listLeft   = flipLeft ? (selXp - 14 - listWidth) : (selXp + 14);

      var list = document.createElement('div');
      list.style.cssText = 'position:absolute;left:' + listLeft + 'px;top:2px;'
        + 'width:' + listWidth + 'px;max-height:' + (listBarH + 8) + 'px;'
        + 'overflow:hidden;font-family:IBM Plex Mono;font-size:10px;color:' + clr + ';line-height:1.5;';

      var rows = listData.invs.map(function(inv) {
        var v      = parseFloat(inv.announced_value_usd_m);
        var valStr = isNaN(v) ? 'N/D' : (v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'B' : '$' + Math.round(v) + 'M');
        var label  = inv.company_name + ' \u00b7 ' + valStr;
        var inner  = inv.source_url
          ? '<a href="' + inv.source_url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;border-bottom:1px dotted currentColor;">' + label + '</a>'
          : label;
        return '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + inner + '</div>';
      });

      list.innerHTML = rows.join('');
      inner.appendChild(list);
    }
  }
}

/* ── buildCom ────────────────────────────────────────────────────────────
   Creates the horizontal commodity bar chart.
   Uses HS_GROUPS (defined in country-chart.js) to group raw HS categories.
   Falls back to stripped raw commodity name if no HS group match found.
   ──────────────────────────────────────────────────────────────────────── */
function buildCom(tradeRows, countriesArray, isMulti) {
  const ctx = document.getElementById('comC').getContext('2d');
  if (cChart) { cChart.destroy(); cChart = null; }

  /* Aggregate commodity totals (in USD billions) across selected countries */
  const cats = {};
  tradeRows.forEach(row => {
    const raw = row.commodity || '(unknown)';

    /* Try HS_GROUPS grouping if available (defined in country-chart.js) */
    let cat;
    if (typeof HS_GROUPS !== 'undefined') {
      const hsNum = parseInt(raw, 10);
      cat = HS_GROUPS[hsNum] || raw.replace(/^\d+\s+/, '') || '(unknown)';
    } else {
      cat = raw.replace(/^\d+\s+/, '') || '(unknown)';
    }

    cats[cat] = (cats[cat] || 0) + (Number(row.export_value_usd) || 0) / 1e9;
  });

  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const labels = sorted.map(x => x[0]);
  const vals   = sorted.map(x => +x[1].toFixed(3));

  cChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: vals,
        backgroundColor: labels.map(function(lbl) {
          return CC_CAT[lbl] || '#96a1ae';
        }),
        borderRadius: 3,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13,27,42,0.9)',
          callbacks: {
            label: i => {
              const v = i.parsed.x;
              return v >= 1 ? ` $${v.toFixed(2)}B` : ` $${(v * 1000).toFixed(0)}M`;
            }
          },
          titleFont: { family: 'IBM Plex Sans', size: 11 },
          bodyFont:  { family: 'IBM Plex Mono', size: 11 },
          padding: 10
        }
      },
      scales: {
        x: {
          ticks: {
            callback: v => v >= 1 ? '$' + v.toFixed(1) + 'B' : '$' + (v * 1000).toFixed(0) + 'M',
            font:  { family: 'IBM Plex Mono', size: 10 },
            color: '#96a1ae'
          },
          grid:   { color: 'rgba(0,0,0,0.05)' },
          border: { display: false }
        },
        y: {
          ticks: {
            font: { family: 'IBM Plex Sans', size: 11 },
            color: '#536070',
            callback: function(val) {
              var lbl = this.getLabelForValue(val);
              return lbl && lbl.length > 22 ? lbl.slice(0, 22) + '\u2026' : lbl;
            }
          },
          grid:   { display: false },
          border: { display: false }
        }
      }
    }
  });
}

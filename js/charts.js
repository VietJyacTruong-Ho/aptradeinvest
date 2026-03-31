/* ── charts.js ─────────────────────────────────────────────────────────────
   Prototype-based chart functions adapted for CSV data pipeline.
   Loaded before app.js and country-chart.js.
   Globals used from app.js at call-time: CC, COUNTRY_MAP
   ──────────────────────────────────────────────────────────────────────── */

var tChart = null;
var cChart = null;

const YRS = [2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];

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
   Renders investment event dots onto the marker strip below the trade chart.
   Only shown in single-country mode.
   ──────────────────────────────────────────────────────────────────────── */
function buildMarkers(investmentRows, countriesArray, isMulti) {
  const inner = document.getElementById('msInner');
  inner.innerHTML = '';

  if (!tChart || !tChart.chartArea) {
    document.getElementById('msDt').textContent = '';
    return;
  }

  if (isMulti) {
    document.getElementById('msDt').textContent = 'Investment markers shown in single-country view';
    return;
  }

  const country = countriesArray[0];
  const invs = investmentRows.filter(r => r.parent_country === country);

  if (!invs.length) {
    document.getElementById('msDt').textContent = 'No investment events recorded for this country.';
    return;
  }

  document.getElementById('msDt').textContent = 'Hover a marker to see investment details';

  const ca   = tChart.chartArea;
  const pw   = ca.right - ca.left;
  const ox   = ca.left;
  const xMin = tChart.options.scales.x.min != null ? tChart.options.scales.x.min : 2014;
  const xMax = tChart.options.scales.x.max != null ? tChart.options.scales.x.max : 2026;
  const xPos = yr => ox + (yr - xMin) / (xMax - xMin) * pw;
  const clr  = CC[country] || '#536070';

  /* Horizontal baseline */
  const al = document.createElement('div');
  al.style.cssText = `position:absolute;top:16px;left:${ox}px;width:${pw}px;height:1px;background:#dde2ea`;
  inner.appendChild(al);

  /* Tick marks and year labels — only within visible range */
  [2014,2016,2018,2020,2022,2024,2026].filter(yr => yr >= xMin && yr <= xMax).forEach(yr => {
    const xp = xPos(yr);

    const tk = document.createElement('div');
    tk.style.cssText = `position:absolute;top:11px;left:${xp}px;width:1px;height:5px;background:#c8d3de;transform:translateX(-50%)`;
    inner.appendChild(tk);

    const lb = document.createElement('div');
    lb.style.cssText = `position:absolute;top:19px;left:${xp}px;transform:translateX(-50%);font-family:IBM Plex Mono;font-size:9px;color:${yr===2026?'#BA7517':'#96a1ae'};white-space:nowrap`;
    lb.textContent = yr === 2026 ? '2026*' : yr;
    inner.appendChild(lb);
  });

  /* Group events by year */
  const byY = {};
  invs.forEach(inv => {
    const y = inv.announcement_year;
    if (!byY[y]) byY[y] = [];
    byY[y].push(inv);
  });

  Object.entries(byY).forEach(([yr, arr]) => {
    const yrN = parseInt(yr);
    if (yrN < xMin || yrN > xMax) return;
    const xp = xPos(yrN);
    arr.forEach((inv, i) => {
      const v  = parseFloat(inv.announced_value_usd_m);
      const sz = mSz(isNaN(v) ? 0 : v);

      const el  = document.createElement('div');
      el.className  = 'mmarker';
      el.style.left = xp + 'px';
      el.style.top  = '1px';

      const dot = document.createElement('div');
      dot.className   = 'mdot';
      dot.style.cssText = `width:${sz}px;height:${sz}px;background:${clr};margin-top:${i * 13}px`;
      el.appendChild(dot);

      const loc    = [inv.city, inv.county ? inv.county + ' Co.' : ''].filter(Boolean).join(', ');
      const valStr = isNaN(v) ? 'N/D' : (v >= 1000 ? '$' + (v/1000).toFixed(1) + 'B' : '$' + Math.round(v) + 'M');

      el.onmouseenter = () => {
        const dt = document.getElementById('msDt');
        dt.textContent = `${inv.company_name} — ${valStr} — ${loc} — ${inv.operational_status || ''}`;
        dt.style.color  = clr;
      };
      el.onmouseleave = () => {
        const dt = document.getElementById('msDt');
        dt.textContent = 'Hover a marker to see investment details';
        dt.style.color  = '';
      };

      inner.appendChild(el);
    });
  });
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

  const clr = isMulti ? '#536070' : (CC[countriesArray[0]] || '#536070');
  const { r, g, b } = h2r(clr);

  cChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: vals,
        backgroundColor: vals.map((_, i) =>
          i === 0 ? clr : `rgba(${r},${g},${b},${Math.max(0.22, 0.65 - i * 0.07)})`
        ),
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

/* ── country-chart.js ──────────────────────────────────────────────────────
   Per-country chart component for the APBAI Indiana–Asia Pacific dashboard.
   Creates one self-contained chart unit per country, consisting of:
     · Vertical year-range slider (left side, 46px)
     · Chart.js line chart (Indiana export trend)
     · Investment flag strip (below chart, value-scaled dots)
     · Event detail row (on flag click)
     · Commodity breakdown panel (always visible, updates on year click)

   Entry point: renderCountryCharts(countriesArray, allTradeData, allInvestData)
   Called from renderAll() in app.js on every filter change.

   All variables/functions are global (no ES module syntax).
   Loaded after Chart.js CDN and before or after app.js — order doesn't matter
   as long as COUNTRY_MAP (app.js) and Chart (CDN) are already defined.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── parseM ────────────────────────────────────────────────────────────────
   Converts a formatted value string to millions (float).
   '$803M' → 803 | '$1.4B' → 1400 | anything else → 0.
   Shared utility — defined once, used by every country instance.
   ─────────────────────────────────────────────────────────────────────────── */
function parseM(valStr) {
  if (!valStr) return 0;
  var s = String(valStr).replace('$', '').replace(',', '');
  if (s.slice(-1) === 'B') return parseFloat(s) * 1000;
  if (s.slice(-1) === 'M') return parseFloat(s);
  return 0;
}

/* ── fmtM ──────────────────────────────────────────────────────────────────
   Converts millions (float) to a compact display string.
   1076 → '$1.1B' | 172 → '$172M'.
   Threshold at 950 (not 1000) to avoid '$1.0B' for values just under $1B.
   ─────────────────────────────────────────────────────────────────────────── */
function fmtM(num) {
  if (!num || isNaN(num)) return '$0M';
  if (num >= 950) return '$' + (num / 1000).toFixed(1) + 'B';
  return '$' + Math.round(num) + 'M';
}

/* ── HS_GROUPS ─────────────────────────────────────────────────────────────
   PROPOSED COMMODITY GROUPING — CONFIRM BEFORE SHIPPING TO PRODUCTION
   ─────────────────────────────────────────────────────────────────────────
   Maps HS chapter number (integer) → display category (string).
   Any HS chapter not listed here defaults to 'Other'.

   Based on inspection of indiana_trade.csv for Japan, South Korea, China,
   and India — the countries with significant trade volume.

   Indiana's Asia-Pacific export profile (2014-2025 cumulative, top chapters):
     HS 30  Pharmaceuticals     $12–14B each for Japan & Korea (Eli Lilly, etc.)
     HS 85  Electronics          $0.9–2.2B
     HS 39  Plastics             $0.8–1.8B
     HS 38  Misc Chemicals       $1.4–1.7B
     HS 29  Organic Chemicals    $0.4–0.7B
     HS 44  Wood                 $0.1–0.5B
     HS 73  Iron/Steel Articles  $0.2B
     HS 28  Inorganic Chemicals  $0.1–0.2B
     HS 75  Nickel               $0.1–0.3B
     HS 2   Meat                 $1.4B (Japan only — major ag export)
     HS 35  Albuminoidal/Enzymes $0.1–0.3B (grouped into Chemicals — industrial)

   Proposed 8 categories:
     1. Pharmaceuticals  — HS 30
     2. Chemicals        — HS 28, 29, 35, 38
     3. Plastics & Rubber— HS 39, 40
     4. Electronics      — HS 85, 90, 91
     5. Metals           — HS 72–76, 78–83
     6. Agric. & Food    — HS 01–24
     7. Machinery        — HS 84, 86, 87, 88, 89
     8. Other            — all remaining chapters (44, 47, 48, 92, 94–98, etc.)

   DECISION POINT — Color consistency:
   Current: positional (color assigned by sort rank — may shift between years).
   Alternative: named mapping (stable color per category — switch CC_CATEGORY_COLORS
   to a key→color object and look up by category name instead of array index).
   ─────────────────────────────────────────────────────────────────────────── */
var HS_GROUPS = (function() {
  var g = {};
  g[30] = 'Pharmaceuticals';
  [28, 29, 35, 38].forEach(function(h) { g[h] = 'Chemicals'; });
  [39, 40].forEach(function(h) { g[h] = 'Plastics & Rubber'; });
  [85, 90, 91].forEach(function(h) { g[h] = 'Electronics'; });
  [72, 73, 74, 75, 76, 78, 79, 80, 81, 82, 83].forEach(function(h) { g[h] = 'Metals'; });
  for (var h = 1; h <= 24; h++) { g[h] = 'Agric. & Food'; }
  [84, 86, 87, 88, 89].forEach(function(h) { g[h] = 'Machinery'; });
  /* NOTE: HS 44 (Wood), 47/48 (Paper), 92 (Instruments), 94–98 fall into 'Other' */
  return g;
})();

/* ── CC_CATEGORY_COLORS ─────────────────────────────────────────────────────
   Positional — index 0 = highest-value bar in sorted order.
   Color may shift when sort order changes between years / range slices.
   Replace with named map if stable per-category color is required.
   ─────────────────────────────────────────────────────────────────────────── */
var CC_CATEGORY_COLORS = [
  '#378ADD',  /* position 0 — typically Pharmaceuticals */
  '#1D9E75',  /* position 1 */
  '#BA7517',  /* position 2 */
  '#D85A30',  /* position 3 */
  '#7F77DD',  /* position 4 */
  '#E85A9B',  /* position 5 */
  '#2FB3B3',  /* position 6 */
  '#888780',  /* position 7 — often 'Other' / smallest */
];

/* ── toSlug ─────────────────────────────────────────────────────────────────
   Converts a country display name to a DOM-safe slug.
   'South Korea' → 'south-korea'
   ─────────────────────────────────────────────────────────────────────────── */
function toSlug(country) {
  return country.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/* ═══════════════════════════════════════════════════════════════════════════
   createCountryChart
   ═══════════════════════════════════════════════════════════════════════════
   Factory function: creates one self-contained country chart component.
   Appends HTML to `container`, initialises Chart.js, slider, strip,
   event detail row, and breakdown panel.

   Parameters:
     country     — display name string (e.g. 'Japan')
     tradeRows   — rows from indiana_trade.csv filtered to this country
     investRows  — rows from investment_events.csv for this country (all confidences;
                   High-only filter applied internally)
     container   — DOM element to append the component into

   Zero-investment countries (Australia, Taiwan, etc.) are handled gracefully:
   the strip and event row show empty states without errors.

   Flag: if a country has no High-confidence investment records, a comment is
   logged to console so it can be confirmed before production.
   ─────────────────────────────────────────────────────────────────────────── */
function createCountryChart(country, tradeRows, investRows, container) {
  var slug     = toSlug(country);
  var MIN_YEAR = 2014;
  var MAX_YEAR = 2025;

  /* ── Component state ──────────────────────────────────────────────────── */
  var selStart    = MIN_YEAR;
  var selEnd      = MAX_YEAR;
  var selYear     = null;       /* null = aggregate view; integer = year drill-down */
  var sliderBuilt = false;
  var chart       = null;
  var activeStripYear = null;  /* which flag group is highlighted */

  /* ── Build TRADE_YEARS / TRADE_TOTALS (billions USD) ─────────────────── */
  var TRADE_YEARS = [];
  for (var ty = MIN_YEAR; ty <= MAX_YEAR; ty++) TRADE_YEARS.push(ty);

  var rawByYear = {};
  for (var ti = 0; ti < tradeRows.length; ti++) {
    var tr = tradeRows[ti];
    var yr = Number(tr.year);
    rawByYear[yr] = (rawByYear[yr] || 0) + (Number(tr.export_value_usd) || 0);
  }
  /* Round to 2 decimal places in billions */
  var TRADE_TOTALS = TRADE_YEARS.map(function(y) {
    return Math.round((rawByYear[y] || 0) / 1e7) / 100;
  });

  /* ── Build BREAKDOWN (category totals per year, in billions) ─────────── */
  var BREAKDOWN = {};
  for (var byi = 0; byi < TRADE_YEARS.length; byi++) {
    var byr = TRADE_YEARS[byi];
    var cats = {};
    for (var bri = 0; bri < tradeRows.length; bri++) {
      var br = tradeRows[bri];
      if (Number(br.year) !== byr) continue;
      var cat = HS_GROUPS[Number(br.hs_chapter)] || 'Other';
      cats[cat] = (cats[cat] || 0) + (Number(br.export_value_usd) || 0);
    }
    BREAKDOWN[byr] = Object.keys(cats).map(function(c) {
      return [c, Math.round(cats[c] / 1e7) / 100];
    });
  }

  /* ── Build INVESTMENTS (High-confidence only, flag closed records) ────── */
  var INVESTMENTS = [];
  var highCount = 0;
  for (var ii = 0; ii < investRows.length; ii++) {
    var inv = investRows[ii];
    if (inv.confidence !== 'High') continue;
    highCount++;
    var valM     = parseFloat(inv.announced_value_usd_m) || 0;
    var isClosed = (inv.operational_status || '').toLowerCase().indexOf('closed') !== -1;
    INVESTMENTS.push({
      year:     Number(inv.announcement_year),
      co:       inv.company_name || '',
      detail:   inv.sector || '',
      val:      fmtM(valM),       /* stored as string per spec — parseM() reads it back */
      jobs:     inv.jobs ? String(Math.round(Number(inv.jobs))) : '',
      isClosed: isClosed
    });
  }

  /* Flag countries with investment records but zero High-confidence ones */
  if (investRows.length > 0 && highCount === 0) {
    console.warn('[country-chart] ' + country +
      ' has ' + investRows.length + ' investment record(s) but zero with confidence=High.' +
      ' Strip will be empty. Confirm this is intentional before production.');
  }

  /* ── Build DOM structure ──────────────────────────────────────────────── */
  var wrap = document.createElement('div');
  wrap.className = 'cc-wrap';
  wrap.innerHTML =
    '<div class="cc-header">' +
      '<span class="cc-header-name">' + country + '</span>' +
      '<span class="cc-header-hint">drag slider \u00b7 click point for breakdown \u00b7 click flag for detail</span>' +
    '</div>' +
    '<div class="cc-body">' +
      '<div id="vsl-' + slug + '" class="cc-vslider"></div>' +
      '<div class="cc-chart-col">' +
        '<canvas id="tc-' + slug + '"></canvas>' +
        '<div id="strip-' + slug + '" class="cc-strip"></div>' +
        '<div id="evtrow-' + slug + '" class="cc-evt-row">' +
          '<span class="cc-evt-hint">click a marker to see investments</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div id="bd-' + slug + '" class="cc-bd-panel"></div>';

  container.appendChild(wrap);

  /* ── Grab element references ──────────────────────────────────────────── */
  var canvasEl = document.getElementById('tc-'     + slug);
  var sliderEl = document.getElementById('vsl-'    + slug);
  var stripEl  = document.getElementById('strip-'  + slug);
  var evtRowEl = document.getElementById('evtrow-' + slug);
  var bdEl     = document.getElementById('bd-'     + slug);

  /* ── calcYMin ─────────────────────────────────────────────────────────────
     Dynamic y-axis minimum: one step below the visible data's minimum value.
  ─────────────────────────────────────────────────────────────────────────── */
  function calcYMin(totals) {
    var pos = totals.filter(function(v) { return v > 0; });
    if (!pos.length) return 0;
    var minVal = Math.min.apply(null, pos);
    return Math.floor((minVal - 0.15) * 10) / 10;
  }

  /* ── getFilteredData ──────────────────────────────────────────────────────
     Returns {years, totals} arrays filtered to [selStart, selEnd].
  ─────────────────────────────────────────────────────────────────────────── */
  function getFilteredData() {
    var years  = TRADE_YEARS.filter(function(y) { return y >= selStart && y <= selEnd; });
    var totals = years.map(function(y) { return TRADE_TOTALS[TRADE_YEARS.indexOf(y)]; });
    return { years: years, totals: totals };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LINE CHART (Chart.js)
  ═══════════════════════════════════════════════════════════════════════ */

  var initData = getFilteredData();

  /* Creates the Chart.js instance. aspectRatio:2.5, no legend, custom tooltip.
     onClick toggles selYear for commodity drill-down.
     animation.onComplete wires the slider and rebuilds the strip. */
  chart = new Chart(canvasEl, {
    type: 'line',
    data: {
      labels:   initData.years.map(String),
      datasets: [{
        data:                 initData.totals,
        borderColor:          '#378ADD',
        backgroundColor:      'rgba(55,138,221,0.07)',
        fill:                 true,
        borderWidth:          2,
        pointRadius:          4,
        pointHoverRadius:     6,
        pointBackgroundColor: '#fff',
        pointBorderColor:     '#378ADD',
        pointBorderWidth:     2,
        tension:              0.15
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      aspectRatio:         2.5,
      plugins: {
        legend:  { display: false },
        tooltip: {
          callbacks: {
            label: function(c) { return '$' + c.raw.toFixed(2) + 'B'; }
          }
        }
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { font: { size: 11 } }
        },
        y: {
          min:   calcYMin(initData.totals),
          ticks: {
            callback:     function(v) { return '$' + v + 'B'; },
            font:         { size: 11 },
            maxTicksLimit: 5
          },
          grid: { color: 'rgba(128,128,128,0.07)' }
        }
      },
      /* Click a data point → toggle year drill-down in breakdown panel */
      onClick: function(_, els) {
        if (!els.length) return;
        var yr = parseInt(chart.data.labels[els[0].index], 10);
        selYear = (selYear === yr) ? null : yr;
        buildBreakdown();
      },
      animation: {
        /* After first render: size slider, build it once, rebuild strip.
           On subsequent renders: reposition slider handles, rebuild strip. */
        onComplete: function() {
          var h = chart.canvas.offsetHeight;
          sliderEl.style.height = h + 'px';
          if (!sliderBuilt) { buildSlider(h); sliderBuilt = true; }
          else updateSliderUI();
          buildStrip();
        }
      }
    }
  });

  /* ── updateChart ──────────────────────────────────────────────────────────
     Called on slider drag. Filters data to [selStart, selEnd], updates the
     chart without animation, then cascades to breakdown and strip.
  ─────────────────────────────────────────────────────────────────────────── */
  function updateChart() {
    var fd = getFilteredData();
    chart.data.labels            = fd.years.map(String);
    chart.data.datasets[0].data  = fd.totals;
    chart.options.scales.y.min   = calcYMin(fd.totals);
    chart.update('none');
    buildBreakdown();
    requestAnimationFrame(buildStrip);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     VERTICAL RANGE SLIDER
  ═══════════════════════════════════════════════════════════════════════ */

  /* ── buildSlider ──────────────────────────────────────────────────────────
     Creates the slider DOM (track, highlighted segment, two handles, labels).
     Called exactly once, inside animation.onComplete on first chart render.
     trackH: chart canvas offsetHeight in px.
  ─────────────────────────────────────────────────────────────────────────── */
  function buildSlider(trackH) {
    sliderEl.innerHTML = '';

    /* Track line — full height */
    var track = document.createElement('div');
    track.style.cssText =
      'position:absolute; left:50%; transform:translateX(-50%);' +
      'top:0; bottom:0; width:2px;' +
      'background:var(--border); border-radius:1px;';
    sliderEl.appendChild(track);

    /* Highlighted segment between handles */
    var seg = document.createElement('div');
    seg.className = 'cc-vsl-seg';
    seg.style.cssText =
      'position:absolute; left:50%; transform:translateX(-50%);' +
      'width:2px; background:#378ADD; border-radius:1px;';
    sliderEl.appendChild(seg);

    /* Start handle — hollow (white fill, #378ADD border) */
    var sh = document.createElement('div');
    sh.className = 'cc-vsl-handle cc-vsl-start';
    sh.style.cssText =
      'position:absolute; left:50%; transform:translateX(-50%);' +
      'width:14px; height:14px; border-radius:50%;' +
      'background:white; border:2px solid #378ADD;' +
      'cursor:grab; touch-action:none; z-index:2;';
    sliderEl.appendChild(sh);

    /* Start year label */
    var sl = document.createElement('span');
    sl.className = 'cc-vsl-lbl cc-vsl-start-lbl';
    sl.style.cssText =
      'position:absolute; left:calc(50% + 10px);' +
      'font-size:10px; color:#378ADD; white-space:nowrap; pointer-events:none; line-height:1;';
    sliderEl.appendChild(sl);

    /* End handle — filled (#378ADD) */
    var eh = document.createElement('div');
    eh.className = 'cc-vsl-handle cc-vsl-end';
    eh.style.cssText =
      'position:absolute; left:50%; transform:translateX(-50%);' +
      'width:14px; height:14px; border-radius:50%;' +
      'background:#378ADD; border:2px solid #378ADD;' +
      'cursor:grab; touch-action:none; z-index:2;';
    sliderEl.appendChild(eh);

    /* End year label */
    var el = document.createElement('span');
    el.className = 'cc-vsl-lbl cc-vsl-end-lbl';
    el.style.cssText =
      'position:absolute; left:calc(50% + 10px);' +
      'font-size:10px; color:#378ADD; white-space:nowrap; pointer-events:none; line-height:1;';
    sliderEl.appendChild(el);

    updateSliderUI();
    attachDrag(sh, 'start');
    attachDrag(eh, 'end');
  }

  /* ── updateSliderUI ─────────────────────────────────────────────────────
     Repositions handles, labels, and segment to match selStart/selEnd.
     Called on every state change that affects the slider appearance.
  ─────────────────────────────────────────────────────────────────────────── */
  function updateSliderUI() {
    var seg = sliderEl.querySelector('.cc-vsl-seg');
    var sh  = sliderEl.querySelector('.cc-vsl-start');
    var eh  = sliderEl.querySelector('.cc-vsl-end');
    var sl  = sliderEl.querySelector('.cc-vsl-start-lbl');
    var elb = sliderEl.querySelector('.cc-vsl-end-lbl');
    if (!seg || !sh || !eh) return;

    var trackH = sliderEl.offsetHeight;
    var range  = MAX_YEAR - MIN_YEAR;

    var startY = ((selStart - MIN_YEAR) / range) * trackH;
    var endY   = ((selEnd   - MIN_YEAR) / range) * trackH;

    /* Handles: center (7px = half of 14px) on the year's pixel position */
    sh.style.top = (startY - 7) + 'px';
    eh.style.top = (endY   - 7) + 'px';

    /* Labels: aligned with handle top edge */
    if (sl) { sl.style.top = (startY - 7) + 'px'; sl.textContent = String(selStart); }
    if (elb){ elb.style.top = (endY   - 7) + 'px'; elb.textContent = String(selEnd); }

    /* Segment: from startY to endY */
    seg.style.top    = startY + 'px';
    seg.style.height = (endY - startY) + 'px';
  }

  /* ── attachDrag ───────────────────────────────────────────────────────────
     Attaches Pointer Events drag to a slider handle element.
     Uses setPointerCapture for reliable cross-device (mouse + touch) drag.
     `which`: 'start' or 'end'.
  ─────────────────────────────────────────────────────────────────────────── */
  function attachDrag(el, which) {
    var active = false;

    el.addEventListener('pointerdown', function(e) {
      active = true;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
      e.preventDefault();
    });

    el.addEventListener('pointermove', function(e) {
      if (!active) return;
      var rect   = sliderEl.getBoundingClientRect();
      var trackH = sliderEl.offsetHeight;
      var y      = Math.max(0, Math.min(e.clientY - rect.top, trackH));
      var year   = Math.round(MIN_YEAR + (y / trackH) * (MAX_YEAR - MIN_YEAR));

      if (which === 'start') {
        selStart = Math.max(MIN_YEAR, Math.min(year, selEnd - 1));
      } else {
        selEnd = Math.min(MAX_YEAR, Math.max(year, selStart + 1));
      }
      updateSliderUI();
      updateChart();
    });

    el.addEventListener('pointerup', function() {
      active = false;
      el.style.cursor = 'grab';
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     INVESTMENT FLAG STRIP
  ═══════════════════════════════════════════════════════════════════════ */

  /* ── buildStrip ───────────────────────────────────────────────────────────
     Clears and rebuilds investment flag markers for the current [selStart, selEnd].
     Called in animation.onComplete (covers initial render) and via
     requestAnimationFrame after chart.update('none') (covers range changes).

     Uses chart.chartArea.left / .right for x-positioning — valid because the
     strip div and the canvas share the same left edge as flex siblings.

     Graceful empty state: if no High-confidence investments exist for a country
     (Australia, Taiwan, etc.), the strip is left blank without error.
  ─────────────────────────────────────────────────────────────────────────── */
  function buildStrip() {
    /* Clear existing markers */
    var existing = stripEl.querySelectorAll('.cc-ie');
    for (var ei = 0; ei < existing.length; ei++) {
      stripEl.removeChild(existing[ei]);
    }

    /* Empty state — no markers, no layout breakage */
    if (!INVESTMENTS || !INVESTMENTS.length) return;

    var ca = chart.chartArea;
    if (!ca) return;

    var chartWidth    = ca.right - ca.left;
    var visibleLabels = chart.data.labels.map(Number);
    var nLabels       = visibleLabels.length;
    if (nLabels < 2) return;

    /* Group investments by year, filtering to [selStart, selEnd] */
    var groups = {};
    for (var ii = 0; ii < INVESTMENTS.length; ii++) {
      var inv = INVESTMENTS[ii];
      if (inv.year < selStart || inv.year > selEnd) continue;
      if (!groups[inv.year]) groups[inv.year] = [];
      groups[inv.year].push(inv);
    }

    var groupYears = Object.keys(groups).map(Number).sort(function(a, b) { return a - b; });
    if (!groupYears.length) return;

    /* Compute total investment per group (for dot sizing) */
    var groupTotals = {};
    for (var gi = 0; gi < groupYears.length; gi++) {
      var gyr = groupYears[gi];
      groupTotals[gyr] = groups[gyr].reduce(function(sum, inv) {
        return sum + parseM(inv.val);
      }, 0);
    }
    var allTotals    = groupYears.map(function(y) { return groupTotals[y]; });
    var maxGroupTotal = Math.max.apply(null, allTotals);

    var MIN_R = 5, MAX_R = 13;

    for (var gIdx = 0; gIdx < groupYears.length; gIdx++) {
      var gYear  = groupYears[gIdx];
      var events = groups[gYear];
      var gTotal = groupTotals[gYear];
      /* sqrt compression: prevents large-investment years from dwarfing small ones */
      var r = Math.round(MIN_R + (MAX_R - MIN_R) * Math.sqrt(gTotal / maxGroupTotal));

      /* X position: find index of this year in chart's current visible labels */
      var labelIdx = visibleLabels.indexOf(gYear);
      if (labelIdx === -1) continue;
      var xPx = ca.left + (labelIdx / (nLabels - 1)) * chartWidth;

      /* Dot colour: grey if ALL events in group are closed, amber otherwise */
      var allClosed = events.every(function(e) { return e.isClosed; });
      var dotColor  = allClosed ? '#888780' : '#BA7517';
      var isActive  = (activeStripYear === gYear);

      /* Label text (spec: single → 'Company $Value', multi → '$TotalValue') */
      var labelHtml;
      if (events.length === 1) {
        var shortCo      = events[0].co.split(' ')[0];
        var closedSuffix = events[0].isClosed ? ' (closed)' : '';
        labelHtml =
          '<span style="color:var(--muted);">' + shortCo + closedSuffix + '</span> ' +
          '<span style="color:' + dotColor + ';font-weight:500;">' + fmtM(gTotal) + '</span>';
      } else {
        labelHtml =
          '<span style="color:' + dotColor + ';font-weight:500;">' + fmtM(gTotal) + '</span>';
      }

      /* Alternate label height to reduce overlap (idx % 2) */
      var isLong   = (gIdx % 2 === 1);
      /* Clamp label top so it never overlaps the dot itself */
      var labelTop = isLong ? 50 : Math.max(28, r * 2 + 6);
      var tickH    = Math.max(0, labelTop - r * 2 - 4);

      /* Wrapper: width:0; overflow:visible — children use translateX(-r) to centre */
      var wrapper = document.createElement('div');
      wrapper.className    = 'cc-ie';
      wrapper.dataset.year = gYear;
      wrapper.style.cssText =
        'position:absolute; left:' + xPx + 'px; top:0; width:0; overflow:visible;';

      /* Dot */
      var dot = document.createElement('div');
      dot.className = 'cc-ie-dot';
      dot.style.cssText =
        'position:absolute; top:2px;' +
        'width:' + (r * 2) + 'px; height:' + (r * 2) + 'px;' +
        'border-radius:50%;' +
        'background:' + (isActive ? dotColor : 'rgba(186,117,23,0.25)') + ';' +
        'border:2px solid ' + dotColor + ';' +
        'transform:translateX(' + (-r) + 'px);' +
        'cursor:pointer; transition:transform 0.12s, background 0.12s;' +
        'box-sizing:border-box;';

      /* Tick line */
      var tick = document.createElement('div');
      tick.style.cssText =
        'position:absolute; top:' + (r * 2 + 4) + 'px;' +
        'left:0; width:1px; height:' + tickH + 'px;' +
        'background:rgba(186,117,23,0.4); transform:translateX(-0.5px);';

      /* Label */
      var labelEl = document.createElement('div');
      labelEl.className = 'cc-ie-label';
      labelEl.style.cssText =
        'position:absolute; top:' + labelTop + 'px;' +
        'font-size:10px; white-space:nowrap; transform:translateX(-50%);';
      labelEl.innerHTML = labelHtml;

      wrapper.appendChild(dot);
      wrapper.appendChild(tick);
      wrapper.appendChild(labelEl);
      stripEl.appendChild(wrapper);

      /* Hover and click interactions — closed over r so we can translate correctly */
      (function(w, d, evts, yr, dc, radius) {
        d.addEventListener('mouseenter', function() {
          if (activeStripYear !== yr) {
            d.style.transform = 'translateX(' + (-radius) + 'px) scale(1.25)';
          }
        });
        d.addEventListener('mouseleave', function() {
          if (activeStripYear !== yr) {
            d.style.transform = 'translateX(' + (-radius) + 'px)';
          }
        });
        w.addEventListener('click', function() {
          if (activeStripYear === yr) {
            activeStripYear = null;
            resetEvtRow();
          } else {
            activeStripYear = yr;
            showEvts(evts, yr);
          }
          buildStrip(); /* rebuild to update dot fill states */
        });
      })(wrapper, dot, events, gYear, dotColor, r);
    }
  }

  /* ── showEvts ─────────────────────────────────────────────────────────────
     Populates the event detail row below the strip.
     Single event: inline layout with company, detail, value, jobs, close.
     Multi-event: header row with aggregate + close; table of individual rows.
  ─────────────────────────────────────────────────────────────────────────── */
  function showEvts(events, year) {
    var html;

    if (events.length === 1) {
      var ev     = events[0];
      var totalM = parseM(ev.val);
      html =
        '<div class="cc-evt-single">' +
          '<span class="cc-evt-co">' + ev.co + '</span>' +
          '<span class="cc-evt-det">' + ev.detail + ' \u00b7 ' + year + '</span>' +
          '<span class="cc-evt-val">' + fmtM(totalM) + '</span>' +
          (ev.jobs ? '<span class="cc-evt-jobs">' + ev.jobs + ' jobs</span>' : '') +
          '<button class="cc-evt-close" aria-label="close">\u00d7</button>' +
        '</div>';
    } else {
      var total = events.reduce(function(s, e) { return s + parseM(e.val); }, 0);
      var rows  = events.map(function(ev) {
        var co = ev.co.length > 32 ? ev.co.slice(0, 32) + '\u2026' : ev.co;
        return '<tr>' +
          '<td class="cc-et-co">'  + co + '</td>' +
          '<td class="cc-et-det">' + ev.detail + '</td>' +
          '<td class="cc-et-val">' + ev.val + '</td>' +
          '<td class="cc-et-job">' + (ev.jobs || '') + '</td>' +
        '</tr>';
      }).join('');
      html =
        '<div class="cc-evt-multi">' +
          '<div class="cc-evt-mhdr">' +
            '<span>' + year + ' \u00b7 ' + events.length + ' investments \u00b7 ' + fmtM(total) + '</span>' +
            '<button class="cc-evt-close" aria-label="close">\u00d7</button>' +
          '</div>' +
          '<hr class="cc-evt-div">' +
          '<table class="cc-evt-tbl"><tbody>' + rows + '</tbody></table>' +
        '</div>';
    }

    evtRowEl.innerHTML = html;

    /* Wire close button — resets row to default state and clears active dot */
    var closeBtn = evtRowEl.querySelector('.cc-evt-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        activeStripYear = null;
        resetEvtRow();
        buildStrip();
      });
    }
  }

  /* ── resetEvtRow ──────────────────────────────────────────────────────────
     Resets the event detail row to its default "idle" hint state.
  ─────────────────────────────────────────────────────────────────────────── */
  function resetEvtRow() {
    evtRowEl.innerHTML =
      '<span class="cc-evt-hint">click a marker to see investments</span>';
  }

  /* ═══════════════════════════════════════════════════════════════════════
     COMMODITY BREAKDOWN PANEL
  ═══════════════════════════════════════════════════════════════════════ */

  /* ── buildBreakdown ────────────────────────────────────────────────────────
     Renders horizontal bar chart of commodity categories.
     Uses selYear for drill-down if set and valid; otherwise aggregates
     all years within [selStart, selEnd].
     Called on: chart point click, slider drag (via updateChart), initial render.
  ─────────────────────────────────────────────────────────────────────────── */
  function buildBreakdown() {
    var catTotals  = {};
    var title;
    var showBack   = false;

    if (selYear && BREAKDOWN[selYear]) {
      /* Year drill-down */
      var yd = BREAKDOWN[selYear];
      for (var yi = 0; yi < yd.length; yi++) {
        catTotals[yd[yi][0]] = (catTotals[yd[yi][0]] || 0) + yd[yi][1];
      }
      var yearSum = Object.keys(catTotals).reduce(function(s, k) { return s + catTotals[k]; }, 0);
      title    = selYear + ' \u00b7 $' + yearSum.toFixed(2) + 'B';
      showBack = true;
    } else {
      /* Aggregate over [selStart, selEnd] */
      for (var ay = selStart; ay <= selEnd; ay++) {
        var bd = BREAKDOWN[ay];
        if (!bd) continue;
        for (var bi = 0; bi < bd.length; bi++) {
          catTotals[bd[bi][0]] = (catTotals[bd[bi][0]] || 0) + bd[bi][1];
        }
      }
      title = selStart + '\u2013' + selEnd + ' aggregate';
    }

    /* Sort descending by value */
    var entries = Object.keys(catTotals)
      .map(function(cat) { return { cat: cat, val: catTotals[cat] }; })
      .filter(function(e) { return e.val > 0; })
      .sort(function(a, b) { return b.val - a.val; });

    var maxVal = entries.length ? entries[0].val : 1;

    /* Build bar rows — color is positional (index in sorted order) */
    var barsHtml = '';
    for (var ei = 0; ei < entries.length; ei++) {
      var e     = entries[ei];
      var pct   = (e.val / maxVal * 100).toFixed(1);
      var color = CC_CATEGORY_COLORS[ei % CC_CATEGORY_COLORS.length];
      barsHtml +=
        '<div class="cc-bd-row">' +
          '<span class="cc-bd-lbl">' + e.cat + '</span>' +
          '<div class="cc-bd-bar-wrap">' +
            '<div class="cc-bd-bar" style="width:' + pct + '%;background:' + color + ';"></div>' +
          '</div>' +
          '<span class="cc-bd-val">$' + e.val.toFixed(2) + 'B</span>' +
        '</div>';
    }
    if (!barsHtml) {
      barsHtml = '<span class="cc-evt-hint">No commodity data for this selection.</span>';
    }

    bdEl.innerHTML =
      '<div class="cc-bd-hdr">' +
        (showBack
          ? '<button class="cc-bd-back">\u2190 full range</button>'
          : '') +
        '<span class="cc-bd-title">' + title + '</span>' +
      '</div>' +
      '<div class="cc-bd-bars">' + barsHtml + '</div>';

    /* Wire "← full range" button */
    if (showBack) {
      var backBtn = bdEl.querySelector('.cc-bd-back');
      if (backBtn) {
        backBtn.addEventListener('click', function() {
          selYear = null;
          buildBreakdown();
        });
      }
    }
  }

  /* Initial breakdown render */
  buildBreakdown();
}

/* ═══════════════════════════════════════════════════════════════════════════
   renderCountryCharts
   ═══════════════════════════════════════════════════════════════════════════
   Top-level entry point called from renderAll() in app.js.

   Destroys any existing Chart.js instances inside the section (to avoid
   canvas reuse warnings), clears the section, then creates one chart
   component per selected country.

   Countries with no investment records (Australia, Taiwan, Singapore, etc.)
   receive an empty INVESTMENTS array and render gracefully.
   ─────────────────────────────────────────────────────────────────────────── */
function renderCountryCharts(countriesArray, allTradeData, allInvestData) {
  var section = document.getElementById('country-charts-section');
  if (!section) return;

  /* Destroy any live Chart.js instances before clearing the DOM */
  var oldCanvases = section.querySelectorAll('canvas');
  for (var oc = 0; oc < oldCanvases.length; oc++) {
    var existing = Chart.getChart(oldCanvases[oc]);
    if (existing) existing.destroy();
  }
  section.innerHTML = '';

  for (var ci = 0; ci < countriesArray.length; ci++) {
    var country    = countriesArray[ci];
    var tradeKey   = COUNTRY_MAP[country]; /* CSV country name via app.js global */

    var tradeRows  = allTradeData.filter(function(r) { return r.country === tradeKey; });
    var investRows = allInvestData.filter(function(r) { return r.parent_country === country; });

    createCountryChart(country, tradeRows, investRows, section);
  }
}

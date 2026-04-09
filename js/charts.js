/* ── charts.js ─────────────────────────────────────────────────────────────
   Prototype-based chart functions adapted for CSV data pipeline.
   Loaded before app.js and country-chart.js.
   Globals used from app.js at call-time: CC, COUNTRY_MAP
   ──────────────────────────────────────────────────────────────────────── */

var tChart = null;

/* Treemap state — replaces cChart */
var cState          = null;   /* { items, tiles, hoveredLabel, W, H, dpr } */
var _comEventsReady = false;
var _comResizeObs   = null;

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
      onClick: function(e, elements) {
        if (!elements.length) return;
        var yr = YRS[elements[0].index];
        if (!yr || yr === 2026) return;
        var current = typeof selectedMarkerYear !== 'undefined' ? selectedMarkerYear : null;
        setSelectedMarkerYear(current === yr ? null : yr);
      },
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
      },
      onHover: function(e, elements) {
        e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
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

  /* Pre-compute flip direction so bar hiding and list placement stay in sync */
  var flipLeft = false;
  if (selYr !== null && byY[selYr]) {
    var selXpPre = xPos(selYr);
    flipLeft = (selXpPre - ox - 14) > ((ox + pw) - selXpPre - 14);
  }

  /* Draw bars and dots for each year */
  years.forEach(function(yr) {
    /* Hide bars on whichever side the list will render into */
    if (selYr !== null && (flipLeft ? yr < selYr : yr > selYr)) return;

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
        + 'overflow:hidden;font-family:IBM Plex Mono;font-size:10px;color:' + clr + ';line-height:1.5;'
        + (flipLeft ? 'text-align:right;' : '');

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
   Renders the commodity section as a squarified treemap (Bruls et al.).
   Uses HS_GROUPS (defined in country-chart.js) to group raw HS categories.
   Falls back to stripped raw commodity name if no HS group match found.
   ──────────────────────────────────────────────────────────────────────── */
function buildCom(tradeRows, countriesArray, isMulti) {
  /* Aggregate commodity totals (in USD billions) across selected countries */
  const cats = {};
  tradeRows.forEach(row => {
    const raw = row.commodity || '(unknown)';
    let cat;
    if (typeof HS_GROUPS !== 'undefined') {
      const hsNum = parseInt(raw, 10);
      cat = HS_GROUPS[hsNum] || raw.replace(/^\d+\s+/, '') || '(unknown)';
    } else {
      cat = raw.replace(/^\d+\s+/, '') || '(unknown)';
    }
    cats[cat] = (cats[cat] || 0) + (Number(row.export_value_usd) || 0) / 1e9;
  });

  const sorted = Object.entries(cats)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  cState = {
    items: sorted.map(([label, value]) => ({
      label,
      value,
      color: CC_CAT[label] || '#96a1ae'
    })),
    tiles:        [],
    hoveredLabel: null,
    W: 0, H: 0, dpr: 1
  };

  _comUpdate();

  /* Wire up events and resize observer once */
  if (!_comEventsReady) { _comSetupEvents(); _comEventsReady = true; }
  if (!_comResizeObs)   { _comSetupResize(); }
}

/* ── _comUpdate — recomputes layout dimensions + tile positions + redraws ─── */
function _comUpdate() {
  if (!cState) return;
  const canvas = document.getElementById('comC');
  if (!canvas) return;

  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  if (!W || !H) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  cState.W   = W;
  cState.H   = H;
  cState.dpr = dpr;
  cState.tiles = _squarify(cState.items, 0, 0, W, H);

  _comDraw();
}

/* ── _comDraw — redraws all tiles (called on data change and on hover) ──────── */
function _comDraw() {
  if (!cState || !cState.tiles.length) return;
  const canvas = document.getElementById('comC');
  if (!canvas) return;

  const { dpr, W, H, tiles, hoveredLabel } = cState;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  tiles.forEach(t => _comDrawTile(ctx, t, 2.5, t.label === hoveredLabel));
}

/* ── _comDrawTile — draws a single treemap tile ──────────────────────────── */
function _comDrawTile(ctx, tile, gap, highlighted) {
  const { x, y, w, h, color, label, value } = tile;
  const rx = x + gap / 2, ry = y + gap / 2;
  const rw = w - gap,     rh = h - gap;
  if (rw <= 0 || rh <= 0) return;

  const radius = Math.min(4, rw / 2, rh / 2);

  /* Background fill */
  ctx.fillStyle = highlighted ? _lightenColor(color, 0.22) : color;
  _fillRoundRect(ctx, rx, ry, rw, rh, radius);

  /* Subtle white border on hover for tactile feel */
  if (highlighted) {
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth   = 1.5;
    _strokeRoundRect(ctx, rx, ry, rw, rh, radius);
  }

  /* Skip text on very small tiles */
  if (rw < 28 || rh < 18) return;

  const PAD      = 7;
  const maxTextW = rw - PAD * 2;
  const fontSize = Math.max(9, Math.min(12, rw / 7, rh / 3));

  ctx.textBaseline = 'top';

  /* Category label */
  ctx.font      = `500 ${fontSize}px 'IBM Plex Sans', sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.93)';

  let lbl = label;
  while (ctx.measureText(lbl).width > maxTextW && lbl.length > 2) {
    lbl = lbl.slice(0, -1);
  }
  if (lbl !== label) lbl += '\u2026';
  ctx.fillText(lbl, rx + PAD, ry + PAD);

  /* Value — only rendered when tile is tall enough to avoid crowding (threshold: 40px) */
  if (rh >= 40) {
    const valStr = value >= 1
      ? `$${value.toFixed(2)}B`
      : `$${(value * 1000).toFixed(0)}M`;
    ctx.font      = `400 10px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.60)';
    ctx.fillText(valStr, rx + PAD, ry + PAD + fontSize + 3);
  }
}

/* ── _comSetupEvents — mousemove/mouseleave for highlight + tooltip ────────── */
function _comSetupEvents() {
  const canvas = document.getElementById('comC');
  if (!canvas) return;

  /* Create tooltip element once, appended to body */
  let tip = document.getElementById('com-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'com-tip';
    tip.style.cssText = [
      'position:fixed',
      'background:rgba(13,27,42,0.92)',
      'color:#fff',
      'padding:7px 12px',
      'border-radius:5px',
      'font-family:IBM Plex Mono,monospace',
      'font-size:11px',
      'line-height:1.65',
      'pointer-events:none',
      'z-index:9999',
      'display:none',
      'box-shadow:0 2px 10px rgba(0,0,0,.22)'
    ].join(';');
    document.body.appendChild(tip);
  }

  canvas.addEventListener('mousemove', function(e) {
    if (!cState || !cState.tiles) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    const hit = cState.tiles.find(t =>
      mx >= t.x && mx < t.x + t.w && my >= t.y && my < t.y + t.h
    );

    const prev = cState.hoveredLabel;
    cState.hoveredLabel = hit ? hit.label : null;

    if (cState.hoveredLabel !== prev) _comDraw();

    if (hit) {
      const valStr = hit.value >= 1
        ? `$${hit.value.toFixed(2)}B`
        : `$${(hit.value * 1000).toFixed(0)}M`;
      tip.innerHTML =
        `<span style="font-family:IBM Plex Sans,sans-serif;font-weight:600">${hit.label}</span>` +
        `<br>${valStr}`;
      tip.style.display = 'block';
      /* Keep tooltip on-screen: flip left if near right edge */
      const tipW = 160;
      const left = e.clientX + 14 + tipW > window.innerWidth
        ? e.clientX - tipW - 6
        : e.clientX + 14;
      tip.style.left = left + 'px';
      tip.style.top  = (e.clientY - 10) + 'px';
    } else {
      tip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', function() {
    const tip = document.getElementById('com-tip');
    if (tip) tip.style.display = 'none';
    if (cState && cState.hoveredLabel) {
      cState.hoveredLabel = null;
      _comDraw();
    }
  });
}

/* ── _comSetupResize — ResizeObserver so treemap redraws on container resize ── */
function _comSetupResize() {
  const container = document.querySelector('.comc');
  if (!container || typeof ResizeObserver === 'undefined') return;

  let raf = null;
  _comResizeObs = new ResizeObserver(function() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(_comUpdate);
  });
  _comResizeObs.observe(container);
}

/* ── _squarify — Bruls et al. squarified treemap layout algorithm ─────────────
   Reference: Bruls, M., Huizing, K., van Wijk, J.J. (2000).
   "Squarified Treemaps." Proc. of Joint Eurographics/IEEE TCVG Symposium on
   Visualization, pp. 33-42.

   Items are placed into rows along the shorter dimension of the available
   rectangle. Each item is added to the current row as long as doing so
   improves (or maintains) the worst aspect ratio in the row. When adding
   the next item would worsen the worst ratio, the current row is finalised
   and a new row starts in the remaining rectangle.

   Returns an array of tile descriptors: { ...item, x, y, w, h }
   ──────────────────────────────────────────────────────────────────────── */
function _squarify(items, x, y, w, h) {
  if (!items.length || !w || !h) return [];

  const totalVal = items.reduce((s, i) => s + i.value, 0);
  if (!totalVal) return [];

  /* Scale values so their sum equals the total pixel area */
  const totalArea = w * h;
  const nodes = [...items]
    .sort((a, b) => b.value - a.value)
    .map(i => ({ ...i, area: i.value / totalVal * totalArea }));

  const results = [];

  /* worst — maximum aspect ratio for a given row configuration.
     side: the fixed dimension shared by all items in this row. */
  function worst(row, side) {
    if (!row.length) return Infinity;
    const rowArea = row.reduce((s, n) => s + n.area, 0);
    const maxA    = Math.max(...row.map(n => n.area));
    const minA    = Math.min(...row.map(n => n.area));
    const s2  = side * side;
    const ra2 = rowArea * rowArea;
    /* Both orientations of the potential rectangle must be checked */
    return Math.max(s2 * maxA / ra2, ra2 / (s2 * minA));
  }

  function layout(nodes, rx, ry, rw, rh) {
    if (!nodes.length) return;
    if (!rw || !rh)   return;

    /* Degenerate case: last item fills remaining space */
    if (nodes.length === 1) {
      results.push({ ...nodes[0], x: rx, y: ry, w: rw, h: rh });
      return;
    }

    /* Place rows along the shorter dimension (minimises worst aspect ratio) */
    const vertical = rw >= rh;  /* true → row stacks along height (items left-to-right within column) */
    const side     = vertical ? rh : rw;

    /* Greedily build the current row */
    let row      = [];
    let breakIdx = nodes.length;   /* default: all items fit one row */

    for (let i = 0; i < nodes.length; i++) {
      const candidate = [...row, nodes[i]];
      if (row.length === 0 || worst(row, side) >= worst(candidate, side)) {
        row = candidate;
      } else {
        breakIdx = i;
        break;
      }
    }

    const rowArea = row.reduce((s, n) => s + n.area, 0);

    if (vertical) {
      /* Column: occupies full height rh; width proportional to row's share of area */
      const colW = rowArea / rh;
      let curY   = ry;
      row.forEach(n => {
        const itemH = n.area / colW;
        results.push({ ...n, x: rx, y: curY, w: colW, h: itemH });
        curY += itemH;
      });
      layout(nodes.slice(breakIdx), rx + colW, ry, rw - colW, rh);
    } else {
      /* Row: occupies full width rw; height proportional to row's share of area */
      const rowH = rowArea / rw;
      let curX   = rx;
      row.forEach(n => {
        const itemW = n.area / rowH;
        results.push({ ...n, x: curX, y: ry, w: itemW, h: rowH });
        curX += itemW;
      });
      layout(nodes.slice(breakIdx), rx, ry + rowH, rw, rh - rowH);
    }
  }

  layout(nodes, x, y, w, h);
  return results;
}

/* ── Canvas geometry helpers ─────────────────────────────────────────────── */
function _fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
  ctx.fill();
}

function _strokeRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
  ctx.stroke();
}

/* _lightenColor — mix hex color toward white by `amt` (0–1) */
function _lightenColor(hex, amt) {
  const { r, g, b } = h2r(hex);
  const mix = c => Math.min(255, Math.round(c + (255 - c) * amt));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

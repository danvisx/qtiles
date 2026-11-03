'use strict';
/* qtiles drawing: rasterizers, flood fill, preview layer, and the canvas renderer. */

/* ---------- rasterizers: each takes plot(x, y, value) ---------- */
function lineP(x0, y0, x1, y1, plot, v) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0, v);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
/* A snapped iso line, in stair steps of the edge style. Other angles, and runs of 2, which Bresenham already gives, stay plain lines. */
function edgeLineP(x0, y0, x1, y1, plot, v) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), r = S.edgeRun;
  if (r === 2 || !dy || dx !== 2 * dy) return lineP(x0, y0, x1, y1, plot, v);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let was = 0;
  for (let n = 0; n <= dx; n++) {
    const y = n === dx ? dy : Math.min(dy, Math.round(Math.floor(n / r) * r / 2));
    for (let q = was; q <= y; q++) plot(x0 + sx * n, y0 + sy * q, v);
    was = y;
  }
}
/* The one definition of the brush: n x n pixels, with the pointer's pixel at the center for an odd n and the upper left of the center four for an even n. */
function brushBox(x, y, n) {
  const x0 = x - Math.floor((n - 1) / 2), y0 = y - Math.floor((n - 1) / 2);
  return { x0, y0, x1: x0 + n - 1, y1: y0 + n - 1 };
}
/* Snap = Cell paints whole cells, so n counts cells: the same box, worked out in cells. */
const cellBrush = () => S.mode !== 'iso' && S.snap === 'cell';
function stampBox(x, y, n) {
  if (!cellBrush()) return brushBox(x, y, n);
  const c = S.cell, b = brushBox(Math.floor(x / c), Math.floor(y / c), n);
  return { x0: b.x0 * c, y0: b.y0 * c, x1: (b.x1 + 1) * c - 1, y1: (b.y1 + 1) * c - 1 };
}
function brushP(x, y, n, plot, v) {
  const b = stampBox(x, y, n);
  for (let j = b.y0; j <= b.y1; j++) for (let i = b.x0; i <= b.x1; i++) plot(i, j, v);
}
/* Stamps along a path of pixels. A run of pixels in one cell is one stamp, or a long line would repaint a big cell thousands of times. */
function stamper(n, plot) {
  if (!cellBrush()) return (x, y, v) => brushP(x, y, n, plot, v);
  const c = S.cell; let li = NaN, lj = NaN;
  return (x, y, v) => { const i = Math.floor(x / c), j = Math.floor(y / c); if (i !== li || j !== lj) { li = i; lj = j; brushP(x, y, n, plot, v); } };
}
function strokeP(x0, y0, x1, y1, n, plot, v) {
  if (n === 1 && !cellBrush()) return lineP(x0, y0, x1, y1, plot, v);
  lineP(x0, y0, x1, y1, stamper(n, plot), v);
}
function rectP(x0, y0, x1, y1, filled, plot, v) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  if (filled) { for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) plot(x, y, v); return; }
  for (let x = ax; x <= bx; x++) { plot(x, ay, v); plot(x, by, v); }
  for (let y = ay; y <= by; y++) { plot(ax, y, v); plot(bx, y, v); }
}
/* Symmetry: every tool plots through mirrored(), so previews, commits and canvas growth always agree. */
function mirrored(plot) {
  const mx = S.mirrorX, my = S.mirrorY, ax = S.axisX, ay = S.axisY;
  if (!mx && !my) return plot;
  return (x, y, v) => { plot(x, y, v); if (mx) plot(ax - x, y, v); if (my) plot(x, ay - y, v); if (mx && my) plot(ax - x, ay - y, v); };
}
function mirrorPoints(x, y) {
  const pts = [[x, y]];
  if (S.mirrorX) pts.push([S.axisX - x, y]);
  if (S.mirrorY) for (const p of pts.slice()) pts.push([p[0], S.axisY - p[1]]);
  return pts;
}
/* n is a brush size, or 0 for the single pixel of a tool with no brush. */
function mirrorBox(x, y, n = 0) {
  const b = n ? stampBox(x, y, n) : { x0: x, y0: y, x1: x, y1: y }, pts = mirrorPoints(b.x0, b.y0).concat(mirrorPoints(b.x1, b.y1)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
/* Half-width in pixels of a 2:1 ellipse, on a row whose center lies `v` from the ellipse's center. A pixel is inside if its center is. */
const isoHalf = (rx, v) => { const q = 1 - (2 * v / rx) ** 2; return q > 0 ? Math.floor(rx * Math.sqrt(q) + 0.5) : 0; };
/* A 2:1 ellipse, rx * 2 wide and rx tall. (cx, cy) is a pixel corner, so the width is even and the two halves mirror exactly. Each row is one span, which rules out stray pixels. */
function isoEllipseP(plot, cx, cy, rx, v) {
  const top = cy - (rx >> 1);
  for (let k = 0; k < rx; k++) { const n = isoHalf(rx, k + 0.5 - rx / 2); for (let x = cx - n; x < cx + n; x++) plot(x, top + k, v); }
}
/* The contact shadow: solid, or solid with an outer ring in checker, which counts from the tile-grid origin like the dither patterns. */
function shadowEllipseP(plot, cx, cy, rx, v, checker) {
  if (!checker) return isoEllipseP(plot, cx, cy, rx, v);
  const inner = rx - Math.max(2, rx >> 2), top = cy - (rx >> 1);
  isoEllipseP((x, y) => { const r = y - top + 0.5 - rx / 2, d = x + 0.5 - cx; if (Math.abs(d) < isoHalf(inner, r) || DITHERS.checker.on(x - S.gox, y - S.goy)) plot(x, y, v); }, cx, cy, rx);
}
/* A pixel to the nearest cell corner under Snap = Cell corners. Otherwise it stays, as it does on cells of 1 px, where a corner is no closer than the pixel. */
const cornerSnap = v => S.mode !== 'iso' && S.snap === 'corner' && S.cell > 1 ? Math.round((v + 0.5) / S.cell) * S.cell : v;
/* A corner lies between pixels, so each end of a span takes the pixel on the span's side of it, and a span with no length takes the one inside the canvas. */
const cornerSpan = (a, b, max) => a === b ? Array(2).fill(a === max ? a - 1 : a) : a < b ? [a, b - 1] : [a - 1, b];
function tileCornerNear(x, y) {
  const o = isoOrigin(), a = (x + 0.5 - o.x) / (S.tile / 2), b = (y + 0.5 - o.y) / (S.tile / 4), p = cellCorner(Math.round((a + b) / 2), Math.round((b - a) / 2));
  return [p.x, p.y];
}
/* The pixels a line or rectangle runs between, for a drag from (x0, y0) to (x1, y1). The live shape and the finished one both read this. */
function shapeEnds(x0, y0, x1, y1, t) {
  if (S.mode === 'iso') {
    const tile = S.snap === 'tile', a = tile ? tileCornerNear(x0, y0) : [x0, y0]; let e = t === 'line' && S.lineSnap ? snapLine(a[0], a[1], x1, y1) : [x1, y1];
    if (tile) e = tileCornerNear(e[0], e[1]);
    return [a[0], a[1], e[0], e[1]];
  }
  if (S.snap !== 'corner' || S.cell === 1) return [x0, y0, x1, y1];
  const [ax, ex] = cornerSpan(cornerSnap(x0), cornerSnap(x1), S.w), [ay, ey] = cornerSpan(cornerSnap(y0), cornerSnap(y1), S.h);
  return [ax, ay, ex, ey];
}
function snapLine(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0; if (!dx && !dy) return [x1, y1];
  const dirs = [[0, 1], [1, 0], [2, 1], [2, -1]]; let best = null, bc = -1;
  for (const d of dirs) {
    const c = Math.abs(dx * d[0] + dy * d[1]) / (Math.hypot(d[0], d[1]) * Math.hypot(dx, dy));
    if (c > bc) { bc = c; best = d; }
  }
  const t = Math.round((dx * best[0] + dy * best[1]) / (best[0] * best[0] + best[1] * best[1]));
  return [x0 + best[0] * t, y0 + best[1] * t];
}
function floodFill(sx, sy) {
  beginStroke(activeLayer());
  for (const p of mirrorPoints(sx, sy)) fillFrom(p[0], p[1]);
  endStroke();
}
function fillFrom(sx, sy) {
  if (sx < 0 || sy < 0 || sx >= S.w || sy >= S.h) return;
  const src = S.fillAll ? flatten() : stroke.L.px, color = inkV();
  if (S.fillAll && src[sy * S.w + sx] === color) return;
  floodScan(src, sx, sy, (x, y) => plotLayer(x, y, color));
}
/* Calls visit for every contiguous pixel equal to the start pixel. Fill and the magic wand share it. */
function floodScan(src, sx, sy, visit) {
  const W = S.w, Hh = S.h, target = src[sy * W + sx];
  const seen = new Uint8Array(W * Hh), stack = [sx, sy], ok = (x, y) => !seen[y * W + x] && src[y * W + x] === target;
  while (stack.length) {
    const y = stack.pop(); let x = stack.pop();
    while (x >= 0 && ok(x, y)) x--;
    x++; let up = false, dn = false;
    while (x < W && ok(x, y)) {
      seen[y * W + x] = 1; visit(x, y);
      if (y > 0) { const k = ok(x, y - 1); if (k && !up) stack.push(x, y - 1); up = k; }
      if (y < Hh - 1) { const k = ok(x, y + 1); if (k && !dn) stack.push(x, y + 1); dn = k; }
      x++;
    }
  }
}

/* Shade tool plot. `seen` lasts one stroke, so dragging back over a pixel never steps it twice. Nothing is created, so the canvas never needs to grow. */
function shadeP(map, seen) {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= S.w || y >= S.h) return;
    const i = y * S.w + x; if (seen.has(i)) return; seen.add(i);
    const n = map.get(stroke.L.px[i]); if (n !== undefined) plotLayer(x, y, n);
  };
}

/* ---------- dither patterns: on(u, v, level) is true where the first color goes ---------- */
const BAYER2 = [[0, 2], [3, 1]], BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
/* Ordered dither: each level adds pixels to the one before it, which is what keeps a gradient monotonic. Level runs 0 to 16. */
const bayerOn = (u, v, level) => BAYER4[v & 3][u & 3] < level;
const DITHERS = {
  checker: { name: 'Checker 50%', on: (u, v) => !((u + v) & 1) },
  bayer25: { name: 'Bayer 2x2, 25%', on: (u, v) => BAYER2[v & 1][u & 1] < 1 },
  bayer75: { name: 'Bayer 2x2, 75%', on: (u, v) => BAYER2[v & 1][u & 1] < 3 },
  bayer4: { name: 'Bayer 4x4, by density', on: bayerOn, density: true },
  lines: { name: 'Horizontal lines', on: (u, v) => !(v & 1) },
  iso: { name: 'Iso diagonal', on: (u, v) => !(((u >> 1) + v) & 3) },
  checkerL: { name: 'Checker, left wall', on: (u, v) => !((u + v - (u >> 1)) & 1) },
  checkerR: { name: 'Checker, right wall', on: (u, v) => !((u + v + (u >> 1)) & 1) },
  linesL: { name: 'Lines, left wall', on: (u, v) => !((v - (u >> 1)) & 1) },
  linesR: { name: 'Lines, right wall', on: (u, v) => !((v + (u >> 1)) & 1) }
};
/* Returns the value for a pixel, or null to leave it alone. Patterns count from the tile-grid origin, not the stroke or the canvas corner:
   strokes tile with each other, and growing the canvas (which shifts pixel coordinates and the origin together) cannot break the pattern.
   Under symmetry both sides read the same source side, so a stroke on either side of the line gives the same result. */
function ditherPainter(levelAt) {
  const on = inkV(), off = S.ditherClear ? null : packHex(S.color2), pat = DITHERS[S.ditherPat], level = S.ditherLevel;
  return (x, y) => {
    const u = (S.mirrorX ? Math.min(x, S.axisX - x) : x) - S.gox, v = (S.mirrorY ? Math.min(y, S.axisY - y) : y) - S.goy;
    return (levelAt ? bayerOn(u, v, levelAt(x, y)) : pat.on(u, v, level)) ? on : off;
  };
}
/* Dithered fade over a rectangle: density goes from 0 at the start of the line to 16 at its end. */
function gradientP(area, line, plot) {
  const dx = line.bx - line.ax, dy = line.by - line.ay, len = dx * dx + dy * dy; if (!len) return;
  const paint = ditherPainter((x, y) => Math.round(16 * Math.max(0, Math.min(1, ((x - line.ax) * dx + (y - line.ay) * dy) / len)))), m = mirrored(plot);
  for (let y = area.y0; y <= area.y1; y++) for (let x = area.x0; x <= area.x1; x++) { const v = paint(x, y); if (v !== null) m(x, y, v); }
}
const GR = { area: null, line: null };   // the gradient's rectangle and drag line, in art coordinates, while they are on screen

/* ---------- preview layer: shapes show here until the pointer lifts ---------- */
/* `out` holds what a preview plots past the edge, in a Map as it costs nothing while a ghost fits. `S` is a ghost's shadow, which belongs lower in the stack than the ghost (`pvCast`). `fit` is the box and actions of a ghost that adds art, for the notice in scene.js. */
const PV = { L: null, box: null, out: new Map(), outBox: null, cv: null, stale: false, fit: null, S: null, sBox: null, sOp: 1, sTop: false };
const OUT_OFF = 1 << 14, OUT_ROW = 1 << 15, OUT_AREA = 4e6, OUT_MAX = 2e6;
const pvShown = () => !!PV.box || PV.out.size > 0;
function pvEnsure() { if (!PV.L || PV.L.w !== S.w || PV.L.h !== S.h) { PV.L = makeLayer('preview'); PV.box = null; pvOutClear(); } }
function pvOutClear() { PV.fit = null; if (PV.out.size) { PV.out.clear(); PV.outBox = null; PV.stale = true; } }
function pvOut(x, y, v) {
  if (x < -OUT_OFF || y < -OUT_OFF || x >= OUT_OFF || y >= OUT_OFF) return;
  if (PV.out.size < OUT_MAX) PV.out.set((y + OUT_OFF) * OUT_ROW + x + OUT_OFF, v);
  PV.outBox = joinBox(PV.outBox, { x0: x, y0: y, x1: x, y1: y }); PV.stale = true;
}
/* An image of the part outside. A box too big to hold as an image gets the hatch alone. */
function pvOutImage() {
  if (!PV.stale) return PV.cv;
  PV.stale = false; const b = PV.outBox; if (!b) return null;
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1; if (w * h > OUT_AREA) return PV.cv = null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), img = x.createImageData(w, h), px = new Uint32Array(img.data.buffer);
  for (const [k, v] of PV.out) px[(Math.floor(k / OUT_ROW) - OUT_OFF - b.y0) * w + (k % OUT_ROW) - OUT_OFF - b.x0] = v;
  x.putImageData(img, 0, 0); return PV.cv = c;
}
function pvClear() {
  pvOutClear(); pvCastClear();
  if (!PV.L || !PV.box) return; const b = PV.box;
  for (let y = b.y0; y <= b.y1; y++) PV.L.px.fill(0, y * S.w + b.x0, y * S.w + b.x1 + 1);
  flush(PV.L, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1); PV.box = null;
}
function pvDraw(fn) { pvEnsure(); pvClear(); pvAdd(fn); }
/* Adds to what is already shown, for a brush stroke, where redrawing the whole path on every move would slow down as it gets longer. */
function pvAdd(fn) {
  pvEnsure(); let b = null;
  fn((x, y, v) => {
    if (x < 0 || y < 0 || x >= S.w || y >= S.h) { if (!SEL.mask) pvOut(x, y, v); return; }
    if (SEL.mask && !SEL.mask[y * S.w + x]) return;
    PV.L.px[y * S.w + x] = v;
    if (!b) b = { x0: x, y0: y, x1: x, y1: y };
    else { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
  });
  if (!b) return;
  flush(PV.L, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
  const p = PV.box;
  PV.box = p ? { x0: Math.min(p.x0, b.x0), y0: Math.min(p.y0, b.y0), x1: Math.max(p.x1, b.x1), y1: Math.max(p.y1, b.y1) } : b;
}

/* ---------- renderer ---------- */
const view = document.getElementById('view'), vctx = view.getContext('2d');
const TH = {}, GRID_MIN_PX = 6; let vw = 0, vh = 0, dpr = 1, hover = null;   // a grid finer than GRID_MIN_PX on screen is only a tint
const pxSnap = v => Math.round(v * dpr) / dpr;   // the art's edges sit on device pixels, so the pointer and the cursor must read the same origin
const RULER_PX = 15, RULER_CELLS = 64, CURSOR_MAX = 4096;   // a footprint over CURSOR_MAX pixels is too many to walk every frame
/* A checker square in art pixels: one, or the smallest power of two that keeps it CHECK_MIN screen px wide, as finer squares turn to a gray haze. */
const CHECK_MIN = 4;
function checkPx(z) { let n = 1; while (n * z < CHECK_MIN) n *= 2; return n; }
function readTheme() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  TH.stage = g('--stage'); TH.panel = g('--panel'); TH.fg = g('--fg'); TH.brushLine = g('--brush-line'); TH.brushHalo = g('--brush-halo'); TH.grid = g('--grid'); TH.gridHalo = g('--grid-halo'); TH.gridMajor = g('--grid-major'); TH.gridMajorHalo = g('--grid-major-halo'); TH.canvasEdge = g('--canvas-edge'); TH.muted = g('--muted'); TH.accentFill = g('--accent'); TH.accent = g('--accent-line'); TH.mono = g('--font-mono'); TH.ghost = g('--ghost'); TH.guide = g('--guide'); TH.guideHalo = g('--guide-halo'); TH.danger = g('--danger'); TH.onionPrev = g('--onion-prev'); TH.onionNext = g('--onion-next');
  const t = document.createElement('canvas'); t.width = t.height = 2; const x = t.getContext('2d');
  x.fillStyle = g('--check-b'); x.fillRect(0, 0, 2, 2); x.fillStyle = g('--check-a'); x.fillRect(0, 0, 1, 1); x.fillRect(1, 1, 1, 1);
  TH.check = vctx.createPattern(t, 'repeat');
  const d = document.createElement('canvas'); d.width = d.height = HATCH; const q = d.getContext('2d');
  q.fillStyle = g('--danger'); q.globalAlpha = 0.25; q.fillRect(0, 0, HATCH, HATCH); q.globalAlpha = 1; for (let k = 0; k < HATCH; k++) q.fillRect(k, HATCH - 1 - k, 2, 1);
  TH.hatch = vctx.createPattern(d, 'repeat'); MM.key = ''; requestRender();
}
function resizeView() {
  const r = view.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
  vw = Math.max(1, Math.round(r.width)); vh = Math.max(1, Math.round(r.height));
  view.width = Math.round(vw * dpr); view.height = Math.round(vh * dpr); requestRender();
}
const FIT_ROOM = 140, EDGE_SMALL = 64;
const edgeSmall = () => Math.min(S.w, S.h) < EDGE_SMALL;
function fitView() {
  /* A small canvas fills the stage, so it leaves room for its 44 px handles on both sides, or they would fall off a phone's stage. A locked one has none. */
  const least = Math.min(vw, vh), m = Math.max(Math.min(64, Math.round(least * 0.12)), edgeSmall() && !S.sizeLock && least > 2 * FIT_ROOM ? FIT_ROOM : 0), z = Math.min((vw - m) / S.w, (vh - m) / S.h);
  S.z = z >= 1 ? Math.min(ZOOM_MAX, Math.floor(z)) : Math.max(ZOOM_MIN, 2 ** Math.floor(Math.log2(z)));
  S.ox = Math.round((vw - S.w * S.z) / 2); S.oy = Math.round((vh - S.h * S.z) / 2); requestRender(); hooks.zoom && hooks.zoom();
}
const ZOOM_MIN = 0.125, ZOOM_MAX = 32, ZOOMS = [ZOOM_MIN, 0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, ZOOM_MAX];
/* The step a pinch settles on: a whole number from 1 up, a power of two below. */
function zoomSnap(z) { return z >= 1 ? Math.min(ZOOM_MAX, Math.round(z)) : Math.max(ZOOM_MIN, 2 ** Math.round(Math.log2(z))); }
function zoomTo(nz, cx, cy) {
  nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nz)); if (cx === undefined) { cx = vw / 2; cy = vh / 2; }
  const ax = (cx - S.ox) / S.z, ay = (cy - S.oy) / S.z;
  S.z = nz; S.ox = cx - ax * nz; S.oy = cy - ay * nz; requestRender(); hooks.zoom && hooks.zoom();
}
function zoomStep(dir, cx, cy) {
  let k = ZOOMS.findIndex(v => v >= S.z - 1e-6); if (k < 0) k = ZOOMS.length - 1;
  if (dir > 0) k = (Math.abs(ZOOMS[k] - S.z) < 1e-6 ? k : k - 1) + 1; else k = k - 1;
  zoomTo(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, k))], cx, cy);
}

let glide = 0;
/* A pinch lets go at any scale and eases onto a step around the same point, so the art does not jump. */
function zoomGlide(nz, cx, cy) {
  cancelAnimationFrame(glide); const z0 = S.z, t0 = performance.now(), T = 120, still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = t => {
    const u = still ? 1 : Math.min(1, (t - t0) / T); zoomTo(z0 * (nz / z0) ** u, cx, cy);
    if (u < 1) glide = requestAnimationFrame(step); else { S.ox = Math.round(S.ox); S.oy = Math.round(S.oy); }
  };
  if (still) step(t0); else glide = requestAnimationFrame(step);
}

function brushed(t) { return t === 'pencil' || t === 'eraser' || t === 'line' || t === 'shade' || (t === 'dither' && S.ditherMode === 'brush'); }
/* These read a point rather than paint, so symmetry and clipping mean nothing to them. */
const pointTool = t => t === 'picker' || t === 'pivot' || selTool(t);
/* The pixels a press paints with the pointer on `a`, keyed "x,y". It runs the stroke's own path, so the outline cannot disagree with the paint. What cuts a stroke cuts this too: shade and fill never grow the canvas, the size lock stops the rest, and a selection limits all of it. */
function brushPixels(a, t) {
  const n = brushed(t) ? S.brush : 1, out = new Map(), put = (x, y) => out.set(x + ',' + y, [x, y]), stays = S.sizeLock || t === 'shade' || t === 'fill';
  if (t === 'line' || t === 'rect') { const e = shapeEnds(a.x, a.y, a.x, a.y, t); a = { x: e[0], y: e[1] }; }
  else if (t === 'shadow') a = { x: cornerSnap(a.x), y: cornerSnap(a.y) };
  if (pointTool(t)) { strokeP(a.x, a.y, a.x, a.y, n, put); return out; }
  strokeP(a.x, a.y, a.x, a.y, n, mirrored((x, y) => {
    const on = x >= 0 && y >= 0 && x < S.w && y < S.h;
    if (SEL.mask ? on && SEL.mask[y * S.w + x] : on || !stays) put(x, y);
  }));
  return out;
}
/* One screen pixel wide, just inside the art pixels' edges. Corners are closed by the square line cap. */
function pixelOutline(c, px, x, y, z) {
  for (const [i, j] of px.values()) {
    const x0 = pxSnap(x + i * z), x1 = pxSnap(x + (i + 1) * z), y0 = pxSnap(y + j * z), y1 = pxSnap(y + (j + 1) * z);
    if (!px.has(i - 1 + ',' + j)) { c.moveTo(x0 + 0.5, y0 + 0.5); c.lineTo(x0 + 0.5, y1 - 0.5); }
    if (!px.has(i + 1 + ',' + j)) { c.moveTo(x1 - 0.5, y0 + 0.5); c.lineTo(x1 - 0.5, y1 - 0.5); }
    if (!px.has(i + ',' + (j - 1))) { c.moveTo(x0 + 0.5, y0 + 0.5); c.lineTo(x1 - 0.5, y0 + 0.5); }
    if (!px.has(i + ',' + (j + 1))) { c.moveTo(x0 + 0.5, y1 - 0.5); c.lineTo(x1 - 0.5, y1 - 0.5); }
  }
}
function crossMark(c, sx, sy) {
  sx = Math.round(sx) + 0.5; sy = Math.round(sy) + 0.5;
  for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(sx + 2 * u, sy + 2 * v); c.lineTo(sx + 6 * u, sy + 6 * v); }
}
/* An outline of plain boxes, for a footprint too big to walk by pixel. Each mirror image is its own box, cut to the canvas when the stroke would be. */
function boxOutline(c, a, n, stays, x, y, z) {
  const b = stampBox(a.x, a.y, n), p = mirrorPoints(b.x0, b.y0), q = mirrorPoints(b.x1, b.y1);
  p.forEach((u, k) => {
    const v = q[k]; let x0 = Math.min(u[0], v[0]), y0 = Math.min(u[1], v[1]), x1 = Math.max(u[0], v[0]) + 1, y1 = Math.max(u[1], v[1]) + 1;
    if (stays) { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(S.w, x1); y1 = Math.min(S.h, y1); }
    if (x0 < x1 && y0 < y1) c.rect(pxSnap(x + x0 * z) + 0.5, pxSnap(y + y0 * z) + 0.5, pxSnap(x + x1 * z) - pxSnap(x + x0 * z) - 1, pxSnap(y + y1 * z) - pxSnap(y + y0 * z) - 1);
  });
}
/* The size and, in 2D, the cell above a finger, which covers the outline itself. */
function brushTag(c, a, x, y, z, t) {
  const n = brushed(t) ? S.brush : 1, b = stampBox(a.x, a.y, n), size = !brushed(t) ? '' : cellBrush() ? n + (n > 1 ? ' cells' : ' cell') : n + ' px';
  const text = [S.mode === 'iso' ? '' : Math.floor(a.x / S.cell) + ', ' + Math.floor(a.y / S.cell), size].filter(Boolean).join('  ');
  const W = Math.round(text.length * 7.3) + 14, Ht = 22, sx = Math.max(W / 2, Math.min(vw - W / 2, x + (b.x0 + b.x1 + 1) / 2 * z)), sy = Math.max(Ht / 2, y + b.y0 * z - 56);
  c.fillStyle = TH.panel; c.fillRect(sx - W / 2, sy - Ht / 2, W, Ht); c.strokeStyle = TH.grid; c.lineWidth = 1; c.strokeRect(sx - W / 2 + 0.5, sy - Ht / 2 + 0.5, W - 1, Ht - 1);
  c.fillStyle = TH.fg; c.font = '12px ' + TH.mono; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, sx, sy);
}
function brushCursor(c, x, y, z) {
  const t = drawId !== null && drawTool === 'eraser' ? 'eraser' : S.tool, finger = drawId !== null && drawFinger && (brushed(t) || S.mode !== 'iso'), a = finger ? lastArt : hover;   // a Pencil's eraser end erases whatever tool is chosen
  if (!a || objTool(t) || t === 'terrain' || t === 'scatter' || t === 'hand') return;
  const big = cellBrush() && brushed(t) && (S.brush * S.cell) ** 2 > CURSOR_MAX;
  if (big && SEL.mask) return;   // its shape under a selection cannot be had in a frame. The cell tint stays
  const px = big ? null : brushPixels(a, t); if (px && !px.size) return;
  c.beginPath();
  if (z > 1 && big) boxOutline(c, a, S.brush, S.sizeLock || t === 'shade', x, y, z);
  else if (z > 1) pixelOutline(c, px, x, y, z);
  else for (const p of pointTool(t) ? [[a.x, a.y]] : mirrorPoints(a.x, a.y)) crossMark(c, x + (p[0] + 0.5) * z, y + (p[1] + 0.5) * z);
  c.lineCap = 'square'; c.strokeStyle = TH.brushHalo; c.lineWidth = 3; c.stroke(); c.strokeStyle = TH.brushLine; c.lineWidth = 1; c.stroke(); c.lineCap = 'butt';
  if (finger) brushTag(c, a, x, y, z, t);
}
/* What the grid draws at a zoom, as the art pixels between lines, or 0 for none. Only what is wide enough on screen to read. */
function gridSteps(z) {
  const on = S.gridShow !== 'off', flat = S.mode !== 'iso', c = S.cell, m = S.major * c;
  return { cell: on && flat && c * z >= GRID_MIN_PX ? c : 0, major: on && flat && m && m * z >= GRID_MIN_PX ? m : 0, pixel: S.gridShow === 'pixels' && z >= 8 && !(flat && c === 1) ? 1 : 0,
    tile: on && !flat && S.tile * z >= GRID_MIN_PX ? 1 : 0, tileMajor: on && !flat && S.major && S.major * S.tile * z >= GRID_MIN_PX ? S.major : 0 };   // these two count tiles, not pixels
}
/* One set of lines, each a screen pixel wide whatever the zoom, leaving out those on `skip`. Each has a halo beside it, so one or the other reads on dark art and on light. */
function gridPass(c, x, y, z, W, Ht, step, skip, line, halo) {
  const s = step * z, i0 = Math.max(1, Math.floor(-x / s)), j0 = Math.max(1, Math.floor(-y / s)), i1 = Math.min(Math.ceil(S.w / step) - 1, Math.ceil((vw - x) / s)), j1 = Math.min(Math.ceil(S.h / step) - 1, Math.ceil((vh - y) / s));
  c.lineWidth = 1;
  for (const [off, style] of [[1, halo], [0, line]]) {
    c.strokeStyle = style; c.beginPath();
    for (let i = i0; i <= i1; i++) { if (skip && (i * step) % skip === 0) continue; const sx = pxSnap(x + i * s) + 0.5 + off; c.moveTo(sx, y); c.lineTo(sx, y + Ht); }
    for (let j = j0; j <= j1; j++) { if (skip && (j * step) % skip === 0) continue; const sy = pxSnap(y + j * s) + 0.5 + off; c.moveTo(x, sy); c.lineTo(x + W, sy); }
    c.stroke();
  }
}
/* gridPass for the diagonals of the tile grid, every `step` tiles. Only the lines crossing the view: a big canvas of small tiles has thousands. */
function isoPass(c, x, y, z, step, skip, line, halo) {
  const o = isoOrigin(), hw = S.tile / 2, hh = S.tile / 4, P = (i, j) => [x + (o.x + (i - j) * hw) * z, y + (o.y + (i + j) * hh) * z];
  const seen = [[0, 0], [vw, 0], [0, vh], [vw, vh]].map(p => { const u = ((p[0] - x) / z - o.x) / hw, v = ((p[1] - y) / z - o.y) / hh; return [(u + v) / 2, (v - u) / 2]; });
  const i0 = Math.floor(Math.min(...seen.map(s => s[0]))) - 1, i1 = Math.ceil(Math.max(...seen.map(s => s[0]))) + 1, j0 = Math.floor(Math.min(...seen.map(s => s[1]))) - 1, j1 = Math.ceil(Math.max(...seen.map(s => s[1]))) + 1;
  c.lineWidth = 1;
  for (const [off, style] of [[1, halo], [0, line]]) {
    c.strokeStyle = style; c.beginPath();
    for (let i = Math.ceil(i0 / step) * step; i <= i1; i += step) { if (skip && i % skip === 0) continue; const a = P(i, j0), b = P(i, j1); c.moveTo(a[0], a[1] + off); c.lineTo(b[0], b[1] + off); }
    for (let j = Math.ceil(j0 / step) * step; j <= j1; j += step) { if (skip && j % skip === 0) continue; const a = P(i0, j), b = P(i1, j); c.moveTo(a[0], a[1] + off); c.lineTo(b[0], b[1] + off); }
    c.stroke();
  }
}
/* The cell or tile under a hovering pen or mouse, or a finger that is down. Off the canvas there is none. A tile is the one the Tile tool would stamp. */
function cellHover() {
  const a = drawId !== null && drawFinger ? lastArt : hover;
  if (!a || !S.guideHover || S.gridShow === 'off' || S.tool === 'hand' || a.x < 0 || a.y < 0 || a.x >= S.w || a.y >= S.h) return null;
  return S.mode === 'iso' ? tileCell(a.x, a.y) : { i: Math.floor(a.x / S.cell), j: Math.floor(a.y / S.cell) };
}
function cellTint(c, x, y, z) {
  const h = cellHover(), iso = S.mode === 'iso', k = (iso ? S.tile : S.cell) * z; if (!h || k < 2) return;
  if (iso) {
    const p = cellCorner(h.i, h.j), tx = x + p.x * z, ty = y + p.y * z;
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + k / 2, ty + k / 4); c.lineTo(tx, ty + k / 2); c.lineTo(tx - k / 2, ty + k / 4); c.closePath();
    c.globalAlpha = 0.12; c.fillStyle = TH.accentFill; c.fill(); c.globalAlpha = 1; c.strokeStyle = TH.accent; c.lineWidth = 1; c.stroke();
    return;
  }
  const x0 = pxSnap(x + h.i * k), y0 = pxSnap(y + h.j * k), x1 = pxSnap(x + (h.i + 1) * k), y1 = pxSnap(y + (h.j + 1) * k);
  c.globalAlpha = 0.12; c.fillStyle = TH.accentFill; c.fillRect(x0, y0, x1 - x0, y1 - y0); c.globalAlpha = 1;
  c.strokeStyle = TH.accent; c.lineWidth = 1; c.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
}
const rulerCells = () => [Math.ceil(S.w / S.cell), Math.ceil(S.h / S.cell)];
const rulersShown = () => S.mode !== 'iso' && S.rulers && S.gridShow !== 'off' && Math.max(...rulerCells()) <= RULER_CELLS;
/* Every cell when its number fits, otherwise every 2nd, 4th or 8th. */
function rulerStep(k, room) { let n = 1; while (n * k < room) n *= 2; return n; }
/* Cell numbers, outside the canvas on its top and left. With the canvas panned past the stage's edge they stay on the stage, so a number is never out of reach. */
function drawRulers(c, x, y, z) {
  if (!rulersShown()) return;
  const k = S.cell * z, [nx, ny] = rulerCells(), h = cellHover(), top = Math.max(0, y - RULER_PX), left = Math.max(0, x - RULER_PX), W = S.w * z, Ht = S.h * z;
  c.fillStyle = TH.stage; c.fillRect(x, top, W, RULER_PX); c.fillRect(left, y, RULER_PX, Ht);
  if (h) { c.globalAlpha = 0.3; c.fillStyle = TH.accentFill; c.fillRect(x + h.i * k, top, k, RULER_PX); c.fillRect(left, y + h.j * k, RULER_PX, k); c.globalAlpha = 1; }
  c.fillStyle = TH.muted; c.font = '10px ' + TH.mono; c.textAlign = 'center'; c.textBaseline = 'middle';
  const sx = rulerStep(k, String(nx - 1).length * 6 + 4), sy = rulerStep(k, 12);
  for (let i = Math.ceil(Math.max(0, -x / k - 1) / sx) * sx, e = Math.min(nx - 1, (vw - x) / k); i <= e; i += sx) c.fillText(String(i), x + (i + 0.5) * k, top + RULER_PX / 2);
  for (let j = Math.ceil(Math.max(0, -y / k - 1) / sy) * sy, e = Math.min(ny - 1, (vh - y) / k); j <= e; j += sy) c.fillText(String(j), left + RULER_PX / 2, y + (j + 0.5) * k);
}
/* The part of an image outside the canvas, under the hatch. It takes a screen-sized canvas so the hatch stops at the art's own outline and keeps its width at any zoom. With no image the hatch fills the box. */
const HATCH = 8, HC = { cv: null };
function hatchOut(c, src, dx, dy, dw, dh, x, y, W, Ht) {
  if (dx >= x && dy >= y && dx + dw <= x + W && dy + dh <= y + Ht) return;
  const cv = HC.cv || (HC.cv = document.createElement('canvas')); if (cv.width !== view.width || cv.height !== view.height) { cv.width = view.width; cv.height = view.height; }
  const h = cv.getContext('2d'); h.setTransform(dpr, 0, 0, dpr, 0, 0); h.clearRect(0, 0, vw, vh); h.imageSmoothingEnabled = false; h.fillStyle = TH.hatch;
  if (src) { h.drawImage(src, dx, dy, dw, dh); h.globalCompositeOperation = 'source-atop'; h.fillRect(0, 0, vw, vh); h.globalCompositeOperation = 'source-over'; } else h.fillRect(dx, dy, dw, dh);
  c.save(); c.beginPath(); c.rect(0, 0, vw, vh); c.rect(x, y, W, Ht); c.clip('evenodd'); c.drawImage(cv, 0, 0, vw, vh); c.restore();
}
function render() {
  needRender = false; pickStep(); const c = vctx, z = S.z, x = S.ox, y = S.oy, W = S.w * z, Ht = S.h * z;
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.imageSmoothingEnabled = false;
  c.fillStyle = TH.stage; c.fillRect(0, 0, vw, vh);
  /* The checker starts where the art does, so its squares and the art's pixels share their edges at any device pixel ratio. */
  const ax = pxSnap(x), ay = pxSnap(y), aw = pxSnap(x + W) - ax, ah = pxSnap(y + Ht) - ay, sq = checkPx(z) * z;
  c.save(); c.beginPath(); c.rect(ax, ay, aw, ah); c.clip();
  TH.check.setTransform({ a: sq, b: 0, c: 0, d: sq, e: ax, f: ay }); c.fillStyle = TH.check; c.fillRect(ax, ay, aw, ah);
  cpDraw(c, x, y, z);
  drawGhosts(c, x, y, z); c.globalAlpha = 1;
  const g = gridSteps(z);
  if (g.pixel) gridPass(c, x, y, z, W, Ht, 1, g.cell, TH.grid, TH.gridHalo);
  if (g.cell) gridPass(c, x, y, z, W, Ht, g.cell, g.major, TH.grid, TH.gridHalo);
  if (g.major) gridPass(c, x, y, z, W, Ht, g.major, 0, TH.gridMajor, TH.gridMajorHalo);
  if (g.tile) isoPass(c, x, y, z, g.tile, g.tileMajor, TH.grid, TH.gridHalo);
  if (g.tileMajor) isoPass(c, x, y, z, g.tileMajor, 0, TH.gridMajor, TH.gridMajorHalo);
  sceneDraw(c, x, y, z);
  if ((S.mirrorX || S.mirrorY) && S.guideMirror) {
    c.strokeStyle = TH.accent; c.lineWidth = 1.5; c.setLineDash([6, 4]); c.beginPath();
    if (S.mirrorX) { const sx = Math.round(x + (S.axisX + 1) / 2 * z) + 0.5; c.moveTo(sx, y); c.lineTo(sx, y + Ht); }
    if (S.mirrorY) { const sy = Math.round(y + (S.axisY + 1) / 2 * z) + 0.5; c.moveTo(x, sy); c.lineTo(x + W, sy); }
    c.stroke(); c.setLineDash([]);
  }
  if (GR.area) {
    const a = GR.area; c.strokeStyle = TH.accent; c.lineWidth = 1.5; c.setLineDash([6, 4]);
    c.strokeRect(x + a.x0 * z + 0.5, y + a.y0 * z + 0.5, (a.x1 - a.x0 + 1) * z - 1, (a.y1 - a.y0 + 1) * z - 1); c.setLineDash([]);
  }
  if (GR.line) {
    const l = GR.line; c.strokeStyle = TH.accent; c.lineWidth = 1.5; c.beginPath();
    c.moveTo(x + (l.ax + 0.5) * z, y + (l.ay + 0.5) * z); c.lineTo(x + (l.bx + 0.5) * z, y + (l.by + 0.5) * z); c.stroke();
  }
  asmDim(c, x, y, z);
  cellTint(c, x, y, z);
  c.restore();
  if (FL) {   // outside the clip, as a float can sit past the edge
    c.save(); c.globalAlpha = opacityOf(FL.L); c.drawImage(FL.canvas, x + FL.x * z, y + FL.y * z, FL.w * z, FL.h * z); c.restore();
    hatchOut(c, FL.canvas, x + FL.x * z, y + FL.y * z, FL.w * z, FL.h * z, x, y, W, Ht);
  }
  if (PV.outBox) { const b = PV.outBox; hatchOut(c, pvOutImage(), x + b.x0 * z, y + b.y0 * z, (b.x1 - b.x0 + 1) * z, (b.y1 - b.y0 + 1) * z, x, y, W, Ht); }
  c.strokeStyle = TH.canvasEdge; c.lineWidth = 1; c.strokeRect(ax - 0.5, ay - 0.5, aw + 1, ah + 1);   // after what sticks out, so the edge shows across it
  if (SEL.edges || SEL.rect || OB.edges) {
    const ex = x + (FL ? FL.x * z : 0), ey = y + (FL ? FL.y * z : 0), e = SEL.edges || [], o = OB.edges || [], ox = x + OB.x * z, oy = y + OB.y * z;
    c.beginPath(); c.lineWidth = 1;
    for (let k = 0; k < e.length; k += 4) { c.moveTo(ex + e[k] * z, ey + e[k + 1] * z); c.lineTo(ex + e[k + 2] * z, ey + e[k + 3] * z); }
    for (let k = 0; k < o.length; k += 4) { c.moveTo(ox + o[k] * z, oy + o[k + 1] * z); c.lineTo(ox + o[k + 2] * z, oy + o[k + 3] * z); }
    if (SEL.rect) { const r = SEL.rect; c.rect(x + r.x0 * z, y + r.y0 * z, (r.x1 - r.x0 + 1) * z, (r.y1 - r.y0 + 1) * z); }
    c.strokeStyle = TH.panel; c.stroke();
    c.setLineDash([4, 4]); c.lineDashOffset = -SEL.phase; c.strokeStyle = TH.accent; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
  }
  drawRulers(c, x, y, z);
  brushCursor(c, x, y, z);
  objFootprints(c, x, y, z); castMarks(c, x, y, z); objArrows(c, x, y, z); objRuler(c, x, y, z); pivotMark(c, x, y, z); hgDraw(c, x, y, z);
  fitSync();
  hooks.view && hooks.view();
}

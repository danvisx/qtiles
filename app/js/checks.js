'use strict';
/* qtiles art checks (046): a scan, on demand, that points at likely problems. They are hints: nothing is per frame but drawing the marks, and no pixel changes unless a person asks for a fix.
   A scan copies its scope into a buffer with a ring of CK_PAD real neighbors (empty past the canvas), so no check tests bounds. Each check is a generator that yields once a row, so the same code runs at once in a test and in pieces under xpJob.
   A mark holds the value its pixel had, and is gone once that pixel changes. Marks are drawn only from render, so they never reach pixels, exports or the minimap. */

const CK_MAX = 2000, CK_COLORS = 32, CK_TWIN = 0.03, CK_TWIN_LIST = 512, CK_ZOOM = 8, CK_PAD = 2, CK_BAND = 4, CK_BIG = [2, 3, 4, 6, 8];
const CK = { scope: 'layer', res: null, kind: null, cur: null, ask: false, hide: new Set(), shown: true };   // hide: kinds ignored for the session, across projects
/* `fix` says what Fix does, and only kinds with one offer it. `tick` is the finishing checklist item the kind reports to. */
const CK_KINDS = [
  { k: 'stray', name: 'Stray pixels', what: 'A pixel unlike all eight around it, inside an area.', fix: 'Sets each to its most common neighbor.', tick: 'pixels' },
  { k: 'corner', name: 'Doubled corners', what: 'An L of three pixels on a 1 px line, which Pixel-perfect would take out.', fix: 'Removes the middle pixel of each.', tick: 'pixels' },
  { k: 'runs', name: 'Uneven runs', what: 'A run on a 1 px line that breaks its rhythm, such as the 1 in 2-3-1-3-2.' },
  { k: 'band', name: 'Banding', what: 'A 1 px band between a lighter and a darker color that follows both edges for ' + CK_BAND + ' pixels or more.' },
  { k: 'soft', name: 'Soft edges', what: 'A partly transparent pixel, often from imported art.', fix: 'Makes each opaque from 50 percent up and empty below.', tick: 'pixels' },
  { k: 'off', name: 'Off palette', what: 'A color that is not in the project palette.', fix: 'Changes each to the nearest palette color, by how alike they look.', tick: 'palette' },
  { k: 'twin', name: 'Near twins', what: 'Two colors used that look almost the same (OKLab distance under ' + CK_TWIN + '), not next to each other on a ramp. The rarer one is marked.' },
  { k: 'colors', name: 'Colors used', what: 'Opaque colors in what was checked.', tick: 'palette' },
  { k: 'big', name: 'Drawn big', what: 'Every pixel matches its aligned square of 2 x 2 or more: the art was likely drawn or imported at a larger scale.' }
];
const ckKind = k => CK_KINDS.find(K => K.k === k);
const ckLuma = v => 0.2126 * (v & 255) + 0.7152 * (v >>> 8 & 255) + 0.0722 * (v >>> 16 & 255);

/* ---------- what is checked ---------- */
/* The active layer, the shown layers together, or the active layer inside the selection. Layers are kept by id, as a resize replaces the objects. */
function ckSource(scope) {
  const L = activeLayer();
  if (scope === 'shown') {
    const list = S.layers.filter(shownSet()); let box = null;
    for (const M of list) { const q = layerBox(M); if (q) box = joinBox(box, q); }
    return { scope, ids: list.map(M => M.id), box, layer: null };
  }
  if (scope === 'sel') return SEL.mask && { scope, ids: [L.id], box: SEL.box, layer: L.id, mask: SEL.mask };
  return { scope, ids: [L.id], box: layerBox(L), layer: L.id };
}
/* The pixel as a check saw it: layers laid at full opacity, as layer opacity is a composite setting, not soft art. */
function ckAt(R, x, y, list) {
  if (x < 0 || y < 0 || x >= S.w || y >= S.h) return -1;
  const i = y * S.w + x; let v = 0;
  for (const L of list) { const s = L.px[i]; if (s >>> 24) v = s >>> 24 === 255 || !v ? s : over(v, s, 1); }
  return v >>> 24 ? v : 0;
}
const ckLayers = R => R.ids.map(layerById).filter(Boolean);
const ckLive = (R, m, list) => list.length === R.ids.length && ckAt(R, m.x, m.y, list) === m.v;

/* ---------- the scan ---------- */
function ckNew(src) {
  const kinds = {}; for (const K of CK_KINDS) kinds[K.k] = { n: 0, marks: [], cut: false, note: '' };
  return { scope: src.scope, ids: src.ids, layer: src.layer, box: src.box, ver: docVer, kinds };
}
/* Runs every check on src into R, yielding once a row. */
function* ckScan(src, R) {
  const b = src.box, P = CK_PAD, w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, W = w + 2 * P, H = h + 2 * P, x0 = b.x0 - P, y0 = b.y0 - P;
  const p = new Uint32Array(W * H), list = ckLayers(R), mask = src.mask;
  for (let y = 0; y < H; y++) {
    const cy = y0 + y; if (cy < 0 || cy >= S.h) continue;
    const span = { x0: Math.max(0, -x0), y0: y, x1: Math.min(W, S.w - x0) - 1, y1: y };
    for (const L of list) laySpan(p, W, L.px, y0 * S.w + x0, S.w, 1, span, 1);
    for (let i = y * W + span.x0, e = y * W + span.x1; i <= e; i++) if (!(p[i] >>> 24)) p[i] = 0;
    yield;
  }
  const A = { p, W, w, h, x0, y0, deg: new Uint8Array(W * H) }, ok = mask ? i => !!mask[(y0 + (i / W | 0)) * S.w + x0 + i % W] : () => true;
  A.add = (k, i, f, q) => {
    if (!ok(i)) return; const r = R.kinds[k]; r.n++;
    if (r.marks.length >= CK_MAX) { r.cut = true; return; }
    const bx = i % W, m = { x: x0 + bx, y: y0 + (i - bx) / W, v: p[i], f };
    if (q) { m.bx = x0 + q.x0; m.by = y0 + q.y0; m.bw = q.x1 - q.x0 + 1; m.bh = q.y1 - q.y0 + 1; }
    r.marks.push(m);
  };
  A.ok = ok;
  yield* ckStray(A); yield* ckDegrees(A); yield* ckCorner(A); yield* ckRuns(A); yield* ckBands(A, false); yield* ckBands(A, true); yield* ckColor(A, R); yield* ckBig(A, R);
  for (const K of CK_KINDS) { const r = R.kinds[K.k]; if (r.cut) r.note = 'The first ' + CK_MAX.toLocaleString('en') + ' are marked.'; }
}
const ckWork = b => (b.y1 - b.y0 + 1) * (12 + CK_BIG.length) + 2 * CK_PAD;
/* At once, for a test or a small scope. */
function ckFind(src) { const R = ckNew(src); if (src.box) for (const _ of ckScan(src, R)); return R; }
const ckRows = function* (A, row) { for (let y = CK_PAD; y < A.h + CK_PAD; y++) { for (let i = y * A.W + CK_PAD, e = i + A.w; i < e; i++) row(i); yield; } };

/* ---------- the checks ---------- */
/* Inside an area means all eight around it are painted, so a line's end is not a stray. A pixel set in a checker of two other colors is a dither, not a stray. */
function* ckStray(A) {
  const { p, W } = A, N = [-W, -1, 1, W, -W - 1, -W + 1, W - 1, W + 1];
  yield* ckRows(A, i => {
    const v = p[i]; if (!v || p[i - 1] === v || p[i + 1] === v || p[i - W] === v || p[i + W] === v || p[i - W - 1] === v || p[i - W + 1] === v || p[i + W - 1] === v || p[i + W + 1] === v) return;
    const n = N.map(d => p[i + d]); if (n.includes(0)) return;
    if (n[0] === n[1] && n[1] === n[2] && n[2] === n[3] && n[4] === n[5] && n[5] === n[6] && n[6] === n[7] && n[0] !== n[4]) return;
    let best = n[0], most = 0;   // the most common neighbor, the first of a tie, so a fix never depends on more than the pixels
    for (const c of n) { let k = 0; for (const d of n) if (d === c) k++; if (k > most) { most = k; best = c; } }
    A.add('stray', i, best);
  });
}
/* How many of its eight neighbors share a pixel's color. A 1 px line has 1 or 2. */
function* ckDegrees(A) {
  const { p, W, deg } = A;
  yield* ckRows(A, i => { const v = p[i]; if (!v) return; let k = 0; for (const j of [i - W - 1, i - W, i - W + 1, i - 1, i + 1, i + W - 1, i + W, i + W + 1]) if (p[j] === v) k++; deg[i] = k; });
}
/* Pixel-perfect's L (044): a pixel whose only two same-colored neighbors are beside it and above or below it. A square corner, with both arms running straight on, is drawn that way on purpose. */
function* ckCorner(A) {
  const { p, W, deg } = A;
  yield* ckRows(A, i => {
    const v = p[i]; if (deg[i] !== 2) return;
    const hz = p[i - 1] === v ? -1 : p[i + 1] === v ? 1 : 0, vt = p[i - W] === v ? -W : p[i + W] === v ? W : 0;
    if (hz && vt && !(p[i + 2 * hz] === v && p[i + 2 * vt] === v)) A.add('corner', i, 0);
  });
}
/* Traces each 1 px line of one color, from its ends and then round its loops, and splits it where it turns, so each piece runs one way with one kind of step. */
function* ckRuns(A) {
  const { p, W, deg } = A, N = [-W, -1, 1, W, -W - 1, -W + 1, W - 1, W + 1], SEEN = 128;
  const line = (j, v) => p[j] === v && (deg[j] & 127) >= 1 && (deg[j] & 127) <= 2;
  const walk = s => {
    const path = [s], v = p[s]; deg[s] |= SEEN;
    for (let c = s, go = true; go;) { go = false; for (const d of N) { const j = c + d; if (!(deg[j] & SEEN) && line(j, v)) { deg[j] |= SEEN; path.push(j); c = j; go = true; break; } } }
    if (path.length > 5) ckPieces(A, path);
  };
  yield* ckRows(A, i => { if (!(deg[i] & SEEN) && line(i, p[i]) && N.filter(d => line(i + d, p[i])).length < 2) walk(i); });
  yield* ckRows(A, i => { if (!(deg[i] & SEEN) && line(i, p[i])) walk(i); });
}
function ckPieces(A, path) {
  const W = A.W; let seg = [path[0]], cls = 0, sx = 0, sy = 0;   // cls 1 steps across a row, 2 down a column; a diagonal step is either
  for (let k = 1; k < path.length; k++) {
    const d = path[k] - path[k - 1], dy = Math.round(d / W), dx = d - dy * W;
    if ((dx && sx && dx !== sx) || (dy && sy && dy !== sy) || (!dx && cls === 1) || (!dy && cls === 2)) { if (cls) ckJags(A, seg, cls); seg = [path[k - 1]]; cls = sx = sy = 0; }
    if (dx) sx = dx; if (dy) sy = dy; if (!dx) cls = 2; else if (!dy) cls = 1;
    seg.push(path[k]);
  }
  if (cls) ckJags(A, seg, cls);
}
/* A run is a jag when it is longer or shorter than both runs beside it and the one two along on neither side matches it, so 2-3-2-3 is a rhythm and the 1 in 2-3-1-3-2 is not. The end runs may be cut short, so they are only compared against. */
function ckJags(A, seg, cls) {
  const W = A.W, at = j => cls === 1 ? (j / W | 0) : j % W, runs = [];
  for (let k = 0; k < seg.length; k++) { if (!k || at(seg[k]) !== at(seg[k - 1])) runs.push({ s: k, n: 0 }); runs[runs.length - 1].n++; }
  const r = runs.map(q => q.n);
  for (let i = 2; i < r.length - 2; i++) {
    if (!((r[i] > r[i - 1] && r[i] > r[i + 1]) || (r[i] < r[i - 1] && r[i] < r[i + 1])) || r[i - 2] === r[i] || r[i + 2] === r[i]) continue;
    let q = null;
    for (let k = runs[i - 1].s, e = runs[i + 1].s + r[i + 1]; k < e; k++) { const x = seg[k] % W, y = seg[k] / W | 0; q = joinBox(q, { x0: x, y0: y, x1: x, y1: y }); }
    A.add('runs', seg[runs[i].s], 0, q);
  }
}
/* A 1 px band of a color between a lighter and a darker one, the same three colors on each line, its edges stepping together for CK_BAND lines or more. `vert` reads columns for bands that lie across. */
function* ckBands(A, vert) {
  const { p, W } = A, P = CK_PAD, U = vert ? A.h : A.w, T = vert ? A.w : A.h, at = vert ? (u, t) => (u + P) * W + t + P : (u, t) => (t + P) * W + u + P;
  let prev = new Int32Array(U * 3), cur = new Int32Array(U * 3), go = new Uint8Array(U);   // per spot: chain length, first line, and the line spot it started on
  const tri = (u, t) => {
    const a = p[at(u - 1, t)], b = p[at(u, t)], c = p[at(u + 1, t)]; if (!a || !b || !c || a === b || b === c || a === c) return false;
    const la = ckLuma(a), lb = ckLuma(b), lc = ckLuma(c); return (la < lb && lb < lc) || (la > lb && lb > lc);
  };
  const same = (u, t, v, s) => p[at(u - 1, t)] === p[at(v - 1, s)] && p[at(u, t)] === p[at(v, s)] && p[at(u + 1, t)] === p[at(v + 1, s)];
  const emit = (arr, u, t) => {
    const n = arr[u * 3], t0 = arr[u * 3 + 1], u0 = Math.min(arr[u * 3 + 2], u) - 1, u1 = Math.max(arr[u * 3 + 2], u) + 1;
    if (n < CK_BAND) return;
    const q = vert ? { x0: t0 + P, y0: u0 + P, x1: t + P, y1: u1 + P } : { x0: u0 + P, y0: t0 + P, x1: u1 + P, y1: t + P };
    A.add('band', at(u, t), 0, q);
  };
  for (let t = 0; t < T; t++) {
    cur.fill(0); go.fill(0);
    for (let u = 0; u < U; u++) {
      if (!tri(u, t)) continue;
      let from = -1;
      if (t) for (const v of [u, u - 1, u + 1]) if (v >= 0 && v < U && prev[v * 3] && same(u, t, v, t - 1) && (from < 0 || prev[v * 3] > prev[from * 3])) from = v;
      if (from < 0) { cur[u * 3] = 1; cur[u * 3 + 1] = t; cur[u * 3 + 2] = u; }
      else { go[from] = 1; cur[u * 3] = prev[from * 3] + 1; cur[u * 3 + 1] = prev[from * 3 + 1]; cur[u * 3 + 2] = prev[from * 3 + 2]; }
    }
    if (t) for (let u = 0; u < U; u++) if (prev[u * 3] && !go[u]) emit(prev, u, t - 1);
    [prev, cur] = [cur, prev]; yield;
  }
  for (let u = 0; u < U; u++) if (prev[u * 3]) emit(prev, u, T - 1);
}
/* Soft edges, colors off the palette and the count of colors in one pass, then near twins among the colors used. */
function* ckColor(A, R) {
  const { p } = A, used = new Map(), pal = new Set(S.palette.map(packHex)), labs = S.palette.map(h => oklab(...hexToRgb(h))), near = new Map(), lab = v => oklab(v & 255, v >>> 8 & 255, v >>> 16 & 255);
  const nearest = v => { let f = near.get(v); if (f === undefined) near.set(v, f = pal.size ? packHex(S.palette[labNearest(lab(v), labs)]) : v); return f; };
  yield* ckRows(A, i => {
    const v = p[i]; if (!v || !A.ok(i)) return;
    if (v >>> 24 !== 255) { A.add('soft', i, v >>> 24 >= 128 ? (v | 0xff000000) >>> 0 : 0); return; }
    used.set(v, (used.get(v) || 0) + 1);
    if (pal.size && !pal.has(v)) A.add('off', i, nearest(v));
  });
  if (!pal.size) R.kinds.off.note = 'The project has no palette to compare with.';
  const C = R.kinds.colors, T = R.kinds.twin, list = [...used.keys()];
  C.n = list.length; if (C.n > CK_COLORS) C.note = 'Over ' + CK_COLORS + ', a limit many guides and old consoles keep to.';
  if (list.length > CK_TWIN_LIST) { T.note = 'Too many colors to compare: over ' + CK_TWIN_LIST + '.'; return; }
  const ramp = new Set(); for (const r of S.pal.ramps) for (let k = 1; k < r.colors.length; k++) { const a = packHex(r.colors[k - 1]), b = packHex(r.colors[k]); ramp.add(a + ' ' + b).add(b + ' ' + a); }
  const L = list.map(lab), rare = new Set(); let pairs = 0;
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    if (Math.hypot(L[a][0] - L[b][0], L[a][1] - L[b][1], L[a][2] - L[b][2]) >= CK_TWIN || ramp.has(list[a] + ' ' + list[b])) continue;
    pairs++; rare.add(used.get(list[b]) < used.get(list[a]) ? list[b] : list[a]);
  }
  if (rare.size) yield* ckRows(A, i => { if (rare.has(p[i])) A.add('twin', i, 0); });
  T.n = pairs;
}
/* The largest of CK_BIG whose aligned squares, from the canvas corner, are each one value. One mark covers what was checked. */
function* ckBig(A, R) {
  const { p, W, w, h, x0, y0 } = A, P = CK_PAD; let best = 0;
  if (R.kinds.colors.n < 2) return;
  for (const k of CK_BIG) {
    if (w < 2 * k || h < 2 * k) break;
    let ok = true;
    for (let y = 0; y < h && ok; y++) {
      const cy = y0 + P + y, by = Math.max(0, cy - cy % k - y0 - P);
      for (let x = 0; x < w; x++) { const cx = x0 + P + x, bx = Math.max(0, cx - cx % k - x0 - P); if (p[(y + P) * W + x + P] !== p[(by + P) * W + bx + P]) { ok = false; break; } }
      yield;
    }
    if (ok) best = k;
  }
  if (!best) return;
  A.add('big', P * W + P, 0, { x0: P, y0: P, x1: w + P - 1, y1: h + P - 1 }); R.kinds.big.note = 'Made of ' + best + ' x ' + best + ' squares.';
}

/* ---------- running it ---------- */
async function ckRun() {
  const src = ckSource(CK.scope);
  if (!src) { toast('Select an area first, or check the active layer.'); return; }
  if (!src.box) { CK.res = ckNew(src); ckShow(null); toast('Nothing to check: ' + (src.scope === 'shown' ? 'no shown layer has pixels.' : 'it has no pixels.')); return; }
  const R = ckNew(src), it = ckScan(src, R), total = ckWork(src.box);
  const done = await xpJob('Checking the art', async job => { let n = 0; for (const _ of it) if (++n % 16 === 0) await xpTick(job, Math.min(n, total), total); return true; }, 'Check');
  if (!done) return;
  CK.res = R; ckShow(CK.kind && R.kinds[CK.kind].marks.length ? CK.kind : null); tipsSync();
}
function ckShow(k) { CK.kind = k; CK.cur = null; CK.ask = false; if (k && !CK.shown) { CK.shown = true; syncGuides(); } ckSync(); requestRender(); }
/* The marks of the shown kind whose pixels have not changed. */
function ckMarks() {
  const R = CK.res; if (!R || !CK.kind) return [];
  const list = ckLayers(R); return R.kinds[CK.kind].marks.filter(m => ckLive(R, m, list));
}
function ckStep(dir) {
  const ms = ckMarks(); if (!ms.length) { CK.cur = null; ckSync(); return; }
  const k = ms.indexOf(CK.cur), m = CK.cur = ms[k < 0 ? (dir > 0 ? 0 : ms.length - 1) : (k + dir + ms.length) % ms.length];
  const cx = m.bw ? m.bx + m.bw / 2 : m.x + 0.5, cy = m.bw ? m.by + m.bh / 2 : m.y + 0.5;
  if (S.z < CK_ZOOM) S.z = CK_ZOOM;
  S.ox = Math.round(vw / 2 - cx * S.z); S.oy = Math.round(vh / 2 - cy * S.z); requestRender(); hooks.zoom && hooks.zoom(); ckSync();
}
/* One stroke on the layer that was checked, so all of a kind is one undo step, and only marked pixels whose value is still the one checked. */
function ckFix(k) {
  const R = CK.res, L = R && R.layer && layerById(R.layer); if (!L || !canEdit(L)) return 0;
  const list = [L], ms = R.kinds[k].marks.filter(m => ckLive(R, m, list)); if (!ms.length) return 0;
  beginStroke(L); for (const m of ms) plotLayer(m.x, m.y, m.f); const n = stroke.map.size; endStroke();
  return n;
}
async function ckFixNow(k) {
  const n = ckFix(k); CK.ask = false; if (!n) { ckSync(); return; }
  toast(n === 1 ? '1 pixel changed. Undo puts it back.' : n + ' pixels changed. Undo puts them back.'); await ckRun();
}
/* A new project starts with no results. The kinds ignored stay ignored for the session. */
function ckReset() { if (!CK.res && !CK.kind) return; CK.res = null; CK.kind = null; CK.cur = null; CK.ask = false; ckSync(); requestRender(); }
/* Marks are in art coordinates, so a resize moves them with the art (applyResize's put). */
function ckShift(dx, dy) {
  if (!CK.res) return;
  for (const K of CK_KINDS) for (const m of CK.res.kinds[K.k].marks) { m.x += dx; m.y += dy; if (m.bw) { m.bx += dx; m.by += dy; } }
}

/* ---------- on the canvas ---------- */
function ckDraw(c, x, y, z) {
  const R = CK.res; if (!R || !CK.kind || !CK.shown || CK.hide.has(CK.kind)) return;
  const list = ckLayers(R), r = Math.max(4, z * 0.7 + 2);
  c.save(); c.lineWidth = 1.5; c.strokeStyle = TH.danger;
  for (const m of R.kinds[CK.kind].marks) {
    const sx = x + (m.bw ? m.bx : m.x) * z, sy = y + (m.bw ? m.by : m.y) * z, sw = (m.bw || 1) * z, sh = (m.bh || 1) * z;
    if (sx + sw + r < 0 || sy + sh + r < 0 || sx - r > vw || sy - r > vh || !ckLive(R, m, list)) continue;
    const now = m === CK.cur; c.lineWidth = now ? 3 : 1.5; c.beginPath();
    if (m.bw) c.rect(Math.round(sx) - 2.5, Math.round(sy) - 2.5, Math.round(sw) + 5, Math.round(sh) + 5); else c.arc(sx + z / 2, sy + z / 2, now ? r + 2 : r, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

/* ---------- the panel ---------- */
const ckFixable = k => !!(CK.res && CK.res.layer && ckKind(k).fix);
function ckCount(K, r) { return K.k === 'twin' ? r.n + (r.n === 1 ? ' pair' : ' pairs') : String(r.n); }
/* What the finishing checklist shows beside an item: the last result for its kinds. */
function ckTick(id) {
  const R = CK.res; if (!R || !R.box) return '';
  return CK_KINDS.filter(K => K.tick === id).map(K => K.name.toLowerCase() + ' ' + R.kinds[K.k].n).join(', ');
}
function ckSync() {
  const box = $('ckList'); if (!box) return;
  const R = CK.res, name = R && R.layer && layerById(R.layer);
  document.querySelectorAll('[data-ck]').forEach(b => press(b, b.dataset.ck === CK.scope));
  $('ckNote').textContent = !R ? 'Scans for stray pixels, jaggies and color problems.'
    : !R.box ? 'Nothing was checked: there were no pixels.'
    : (R.scope === 'shown' ? 'Checked the shown layers together.' : 'Checked ' + (R.scope === 'sel' ? 'the selection on ' : '') + (name ? name.name : 'a layer that is gone') + '.') + (docVer !== R.ver ? ' The art has changed since. A mark goes when its pixel changes; Check again to count again.' : '');
  box.textContent = '';
  if (R && R.box) for (const K of CK_KINDS) {
    if (CK.hide.has(K.k)) continue;
    const r = R.kinds[K.k], row = document.createElement('div'), nm = document.createElement('button'), t = document.createElement('span'), sub = document.createElement('span'), n = document.createElement('span');
    row.className = 'vrow ckrow' + (CK.kind === K.k ? ' active' : '') + (r.n ? '' : ' none'); nm.className = 'vname'; t.textContent = K.name; sub.className = 'refsub'; sub.textContent = r.note || (CK.kind === K.k ? K.what : ''); sub.hidden = !sub.textContent; n.className = 'mono ckn'; n.textContent = ckCount(K, r);
    nm.append(t, sub); nm.disabled = !r.marks.length; nm.dataset.hint = 'Shows these on the canvas, to step through with Next. ' + K.what; nm.setAttribute('aria-label', 'Show ' + K.name.toLowerCase());
    nm.setAttribute('aria-pressed', CK.kind === K.k); nm.onclick = () => ckShow(CK.kind === K.k ? null : K.k);
    const hide = iconBtn(ICON.eyeOff, 'Ignore ' + K.name.toLowerCase(), () => { CK.hide.add(K.k); if (CK.kind === K.k) CK.kind = null; ckSync(); requestRender(); tipsSync(); });
    hide.dataset.hint = 'Hides this kind of check until the page is closed.';
    row.append(nm, n, hide); box.appendChild(row);
  }
  const ms = ckMarks(), k = CK.kind, at = ms.indexOf(CK.cur);
  $('ckStep').hidden = !k; $('ckAt').textContent = at < 0 ? ms.length + (ms.length === 1 ? ' mark' : ' marks') : at + 1 + ' of ' + ms.length; $('ckPrev').disabled = $('ckNext').disabled = !ms.length;
  $('ckFix').hidden = !k || !ckFixable(k) || CK.ask; $('ckFix').disabled = !ms.length; $('ckFix').textContent = 'Fix ' + ms.length + '…';
  $('ckAsk').hidden = !k || !CK.ask;
  if (k && CK.ask) { const f = ckKind(k).fix; $('ckAskText').textContent = 'Fix ' + ms.length + (ms.length === 1 ? ' pixel' : ' pixels') + ' on ' + (name ? name.name : 'the layer') + ': ' + f[0].toLowerCase() + f.slice(1) + ' One undo step.'; $('ckYes').textContent = 'Fix ' + ms.length; }
  $('ckOnly').hidden = !k || !ckKind(k).fix || ckFixable(k);
  $('ckIgnored').hidden = !CK.hide.size; $('ckIgnoredText').textContent = 'Ignored: ' + CK_KINDS.filter(K => CK.hide.has(K.k)).map(K => K.name).join(', ') + '.';
  panelSync();
}
function initChecks() {
  document.querySelectorAll('[data-ck]').forEach(b => { b.onclick = () => { CK.scope = b.dataset.ck; ckSync(); }; });
  $('ckRun').onclick = ckRun; $('ckPrev').onclick = () => ckStep(-1); $('ckNext').onclick = () => ckStep(1);
  $('ckFix').onclick = () => { CK.ask = true; ckSync(); }; $('ckNo').onclick = () => { CK.ask = false; ckSync(); }; $('ckYes').onclick = () => ckFixNow(CK.kind);
  $('ckUnhide').onclick = () => { CK.hide.clear(); ckSync(); tipsSync(); };
  $('ckTip').onclick = () => { $('tipsSearch').value = 'Art checks'; tipsShow(true); };
  ckSync();
}

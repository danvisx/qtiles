'use strict';
/* qtiles shadows and outlines. Both write to their own linked layer, so the art itself stays clean.
   A cast shadow is a one-off bake. Objects get live ones: drawn from the records into a locked linked layer, never in history, redrawn in the region an edit touched.
   castOf is the one place that says what records shade, so the live layer and a ghost's preview cannot disagree. */

const shadowOpacity = () => S.shadowOp / 100;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], N8 = N4.concat([[1, 1], [-1, 1], [1, -1], [-1, -1]]);
const pxInto = next => (x, y, v) => { if (x >= 0 && y >= 0 && x < S.w && y < S.h) next[y * S.w + x] = v; };

/* The darkest cool color the palette has, or its darkest color if it has no cool one. */
function shadowColor() {
  const cool = S.palette.filter(h => { const c = hexToRgb(h); return c[2] > c[0]; });
  return packHex((cool.length ? cool : S.palette).reduce((a, b) => luma(b) < luma(a) ? b : a));
}
/* Where a shadow of this layer goes. `list` is the layer order to apply, when the shadow layer is new: it joins the history along with its pixels. */
function shadowTarget(src) {
  if (src.kind === 'shadow') return { L: src };
  const have = shadowOf(src); if (have) return { L: have };
  const L = makeLayer(src.name + ' shadows'), list = S.layers.slice();
  L.kind = 'shadow'; L.opacity = shadowOpacity(); L.shadowFor = src.id; L.group = src.group; list.splice(list.indexOf(src), 0, L);
  return { L, list };
}

/* ---------- live shadows ---------- */
const LIVE_KINDS = ['prop', 'character', 'terrain'], LIVE_MSG = 'Live shadows are drawn from the objects. Turn them off in the Layers panel first.';
const liveOn = L => !!L.objectLayer && (L.shadows !== undefined ? !!L.shadows : S.liveDefault && LIVE_KINDS.includes(L.kind));
const liveOf = L => S.layers.find(x => x.live && x.shadowFor === L.id);
const liveKey = () => objSig() + '|' + S.w + '|' + S.h;
/* Rows along a, rows along b, per so many pixels of height. A row is a half tile divided by tile / 4, so a shadow runs along a grid axis and keeps to the stair, with the 2 px sideways per row of the 006 bake. */
const CAST_DIRS = { left: [1, 0, 1], right: [0, 1, 1], overhead: [1, 1, 4] }, castDir = () => CAST_DIRS[S.light] || CAST_DIRS.left;
/* Bounds from the grid origin, as objBox. */
function castBox(o) {
  const D = S.tile / 4, c = castDir(), sa = c[0], sb = c[1], per = c[2], k0 = Math.floor(o.z / per), k1 = Math.floor((o.z + o.h) / per), a0 = 2 * o.i * D + sa * k0, b0 = 2 * o.j * D + sb * k0, a1 = (2 * o.i + o.w) * D + sa * k1, b1 = (2 * o.j + o.d) * D + sb * k1, r = S.edgeRun + 2;
  return { x0: Math.floor(a0 - b1) - r, x1: Math.ceil(a1 - b0) + r, y0: Math.floor((a0 + b0) / 2) - r, y1: Math.ceil((a1 + b1) / 2) + r };
}
function castPixelBox(o) { const b = castBox(o); return { x0: b.x0 + S.gox, y0: b.y0 + S.goy, x1: b.x1 + S.gox, y1: b.y1 + S.goy }; }
/* The height of a solid over a point, or -1 outside it. Null means the whole footprint at full height, which sweeps as one rectangle. */
function castField(o) {
  const g = shapeOf(o), ca = 2 * o.i + o.w / 2, cb = 2 * o.j + o.d / 2, rim = (a, b) => ((a - ca) / (o.w / 2)) ** 2 + ((b - cb) / (o.d / 2)) ** 2;
  if (g.field) return g.field(o);   // a solid that does not fill its footprint: a disc is thin, and a capsule's corners are empty
  if (g.cast) return (a, b) => { const q = rim(a, b) / (g.cast.r * g.cast.r); return q > 1 ? -1 : o.h * g.cast.h * Math.sqrt(1 - q); };   // a crown's shadow is a small patch around the trunk, not a column
  if (g.round) return (a, b) => { const q = rim(a, b); return q > 1 ? -1 : g.surf ? Math.max(0, g.surf(o, a, b)) : o.type === 'blob' ? o.h * Math.sqrt(1 - q) : o.h; };
  return g.surf ? (a, b) => Math.max(0, g.surf(o, a, b)) : null;
}
/* A rectangle in rows from the grid origin, through the tile stair like a footprint, so a shadow edge is a tile edge. */
function castFill(a0, a1, b0, b1, c, put) {
  const x0 = Math.max(c.x0, a0 - b1 + S.gox - S.edgeRun - 1), x1 = Math.min(c.x1, a1 - b0 + S.gox + S.edgeRun + 1);
  for (let x = x0; x <= x1; x++) {
    const u = x - S.gox, e1 = edgeY(-1 - u), e2 = edgeY(u), lo = Math.max(Math.max(e1 + a0, e2 + b0) + S.goy, c.y0), hi = Math.min(Math.min(e1 + a1, e2 + b1) - 1 + S.goy, c.y1);
    for (let y = lo; y <= hi; y++) put(x, y);
  }
}
/* Inverse mapping, so nothing has holes: each solid point marks the ground points it shades, and each ground pixel then asks the mask. A floating object's shadow starts where its base would land. */
function castStamp(o, c, put) {
  const g = shapeOf(o); if (g.attach === 'wall') return;
  const D = S.tile / 4, [sa, sb, per] = castDir(), k0 = Math.floor(o.z / per), k1 = Math.floor((o.z + o.h) / per), A0 = Math.round(2 * o.i * D), A1 = Math.round((2 * o.i + o.w) * D), B0 = Math.round(2 * o.j * D), B1 = Math.round((2 * o.j + o.d) * D), f = castField(o);
  if (!f) {
    if (sa + sb === 1) castFill(A0 + sa * k0, A1 + sa * k1, B0 + sb * k0, B1 + sb * k1, c, put);
    else for (let k = k0; k <= k1; k++) castFill(A0 + k, A1 + k, B0 + k, B1 + k, c, put);
    return;
  }
  const W = A1 - A0 + sa * k1 + 1, H = B1 - B0 + sb * k1 + 1, m = new Uint8Array(W * H);
  for (let B = B0; B < B1; B++) for (let A = A0; A < A1; A++) {
    const t = f((A + 0.5) / D, (B + 0.5) / D); if (t < 0) continue;
    for (let k = k0, end = Math.floor((o.z + t) / per); k <= end; k++) m[(B - B0 + sb * k) * W + A - A0 + sa * k] = 1;
  }
  castFill(A0, A0 + W, B0, B0 + H, c, (x, y) => { const u = x - S.gox, v = y - S.goy, A = v - edgeY(-1 - u) - A0, B = v - edgeY(u) - B0; if (A >= 0 && B >= 0 && A < W && B < H && m[B * W + A]) put(x, y); });
}
/* Which pixels of a region these records shade. */
function castOf(records, region, put) { for (const o of records) if (o.shadow) castStamp(o, region, put); }
/* A shadow lands on the ground plane, so terrain on a layer below stands over it, though its shadow layer lies above that terrain. What shares the object's own layer hides it anyway. k is the object layer's place in the list. */
function castCovers(k) { const sh = shownSet(); return S.layers.slice(0, Math.max(0, k)).filter(K => K.objectLayer && K.kind === 'terrain' && sh(K)); }
const castHides = (over, i) => { for (const K of over) if (K.ids[i]) return true; return false; };
function shadowRegion(sh, L, b) {
  const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(S.w - 1, b.x1), y1 = Math.min(S.h - 1, b.y1); if (x0 > x1 || y0 > y1) return;
  const W = S.w, px = sh.px, v = shadowColor(), c = { x0, y0, x1, y1 }, over = castCovers(S.layers.indexOf(L)), put = (x, y) => { const i = y * W + x; if (!castHides(over, i)) px[i] = v; }, list = objQuery(L, c, castBox);
  for (let y = y0; y <= y1; y++) px.fill(0, y * W + x0, y * W + x1 + 1);
  castOf(sh.held ? list.filter(o => !sh.held.has(o.id)) : list, c, put);
  flush(sh, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}
/* Keeps every live shadow layer in being, directly below its source, and up to date. A record array is never changed in place, so a shadow drawn from the same array, under the same settings, needs nothing. That also holds across undo, which may bring back a layer that missed some edits. */
let tidying = false;
function shadowTidy() {
  if (tidying || !S.layers.length) return;
  tidying = true;
  const act = activeLayer(), was = S.active; let list = S.layers.filter(x => { if (!x.live) return true; const s = layerById(x.shadowFor); return s && liveOn(s); });
  for (const L of list.filter(liveOn)) {
    let sh = list.find(x => x.live && x.shadowFor === L.id);
    if (!sh) {
      if (!L.objects.some(o => o.shadow)) continue;
      sh = list.find(x => x.shadowFor === L.id) || Object.assign(makeLayer(''), { kind: 'shadow', opacity: shadowOpacity(), shadowFor: L.id, visible: L.visible });
    }
    Object.assign(sh, { live: true, locked: true, name: L.name + ' shadows', group: L.group });
    if (list[list.indexOf(L) - 1] !== sh) { list = list.filter(x => x !== sh); list.splice(list.indexOf(L), 0, sh); }
  }
  if (list.length !== S.layers.length || list.some((x, k) => x !== S.layers[k])) { S.layers = list; const k = list.indexOf(act); S.active = k >= 0 ? k : Math.min(was, list.length - 1); hooks.layers && hooks.layers(); requestRender(); }
  shadowFresh();
  tidying = false;
}
/* Redraws whatever no longer matches its records, the settings or the terrain under it. The compositor calls this too, as an eye or a change of order can uncover terrain. */
function shadowFresh() {
  const key = liveKey();
  for (const sh of S.layers) if (sh.live) {
    const L = layerById(sh.shadowFor); if (!L) continue;
    const over = castCovers(S.layers.indexOf(L)).map(K => K.objects), had = sh.castOver;
    if (sh.castFrom === L.objects && sh.castKey === key && had && had.length === over.length && over.every((q, k) => q === had[k])) continue;
    sh.castFrom = L.objects; sh.castKey = key; sh.castOver = over; shadowRegion(sh, L, { x0: 0, y0: 0, x1: S.w - 1, y1: S.h - 1 });
  }
}
/* After an edit of records: only the regions the changed records shade, one each for where they were and where they are, so a long move costs two small boxes rather than the span between them. */
function shadowEdit(L, prev, cast) {
  const sh = liveOf(L);
  if (!sh) { if (liveOn(L) && L.objects.some(o => o.shadow)) shadowTidy(); return; }
  if (sh.castFrom !== prev || sh.castKey !== liveKey()) { shadowTidy(); return; }
  sh.castFrom = L.objects; if (sh.held) return;
  const t0 = performance.now(); for (const b of cast) shadowRegion(sh, L, b);
  CAST.ms = performance.now() - t0;
}
/* Terrain changed under the shadows of the layers above it. */
function shadowCovered(K, box) {
  const k = S.layers.indexOf(K);
  for (const sh of S.layers) if (sh.live) {
    const L = layerById(sh.shadowFor); if (!L || S.layers.indexOf(L) <= k) continue;
    sh.castOver = castCovers(S.layers.indexOf(L)).map(q => q.objects); shadowRegion(sh, L, box);
  }
}

/* ---------- shadows while moving ---------- */
/* budget is the most a shadow may cost a frame. ms is what the last update took. marks are a ghost's records, when it needs its footprint shown. slow is the size of a ghost found too big to cast each frame. */
const CAST = { budget: 16, ms: 0, marks: null, slow: Infinity };
const castBoxOf = list => { let b = null; for (const o of list) if (o.shadow) b = joinBox(b, castPixelBox(o)); return b; };
function castClip(b) { return b ? { x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(S.w - 1, b.x1), y1: Math.min(S.h - 1, b.y1) } : null; }
/* Whether terrain hides any of what these records cast. */
function castHidden(over, list) {
  const c = castClip(castBoxOf(list)); if (!over.length || !c || c.x0 > c.x1 || c.y0 > c.y1) return false;
  let hit = false; castOf(list, c, (x, y) => { if (castHides(over, y * S.w + x)) hit = true; }); return hit;
}
function pvCastClear() {
  CAST.marks = null; const b = PV.sBox; PV.sBox = null;
  if (!b || !PV.S || PV.S.w !== S.w || PV.S.h !== S.h) return;
  for (let y = b.y0; y <= b.y1; y++) PV.S.px.fill(0, y * S.w + b.x0, y * S.w + b.x1 + 1);
  flush(PV.S, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
}
/* A ghost is not in the records, so what it casts goes on a preview layer that the compositor lays where the live shadow is. It holds only pixels the live layer lacks, as the two lie over each other at the same opacity. The commit never reads it: it goes through the live path. */
function pvCast(list) {
  pvCastClear(); const A = activeLayer(), onLayer = !!A.objectLayer; if (onLayer && !liveOn(A)) return;
  const sh = onLayer ? liveOf(A) : null; if (sh && !shownSet()(sh)) return;
  const over = castCovers(S.active + (onLayer ? 0 : 1)), c = castClip(castBoxOf(list));
  if (list.length >= CAST.slow) { CAST.marks = list; return; }
  if (!c || c.x0 > c.x1 || c.y0 > c.y1) return;
  if (!PV.S || PV.S.w !== S.w || PV.S.h !== S.h) PV.S = makeLayer('preview shadow');
  const W = S.w, px = PV.S.px, have = sh ? sh.px : null, v = shadowColor(), t0 = performance.now(); let hid = false;
  castOf(list, c, (x, y) => { const i = y * W + x; if (castHides(over, i)) hid = true; else if (!have || !have[i]) px[i] = v; });
  PV.sBox = c; PV.sOp = sh ? opacityOf(sh) : opacityOf({ opacity: shadowOpacity(), group: A.group }); PV.sTop = !onLayer;
  flush(PV.S, c.x0, c.y0, c.x1 - c.x0 + 1, c.y1 - c.y0 + 1);
  if (hid) CAST.marks = list;
  if (performance.now() - t0 > CAST.budget) { CAST.slow = list.length; pvCastClear(); CAST.marks = list; }   // no shadow at all beats one that falls behind the ghost
}
/* Over budget: the moved records leave the shadow layer until the drop. One redraw now, and each later frame costs nothing. */
function shadowHold(sh, L, ids, list) { sh.held = ids; const b = castBoxOf(list); if (b) shadowRegion(sh, L, b); }
function shadowFree(L, ids) {
  const sh = liveOf(L); if (!sh || !sh.held) return;
  sh.held = null; const b = castBoxOf(L.objects.filter(o => ids.has(o.id))); if (b) shadowRegion(sh, L, b);
}
/* A soft footprint, for a shadow that is not there to show where something stands: dropped for time, or under terrain. */
function castMarks(c, x, y, z) {
  const list = PK.drag ? PK.drag.marks : CAST.marks; if (!list) return;
  const D = S.tile / 4, P = (a, b, h) => [x + (S.gox + (a - b) * D) * z, y + (S.goy + (a + b) * D / 2 - h) * z];
  c.fillStyle = TH.accent; c.strokeStyle = TH.accent; c.lineWidth = 1; c.beginPath();
  for (const o of list) {
    if (o.parent) continue;
    const a0 = 2 * o.i, b0 = 2 * o.j, a1 = a0 + o.w, b1 = b0 + o.d, p = [P(a0, b0, o.z), P(a1, b0, o.z), P(a1, b1, o.z), P(a0, b1, o.z)];
    c.moveTo(p[0][0], p[0][1]); for (let k = 1; k < 4; k++) c.lineTo(p[k][0], p[k][1]); c.closePath();
  }
  c.globalAlpha = 0.18; c.fill(); c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1;
}
/* A project's default, for the layers that have not said. Like every change of the live layer, it is not a step of history. */
function liveDefaultSet(on) { S.liveDefault = on; shadowTidy(); hooks.layers(); requestRender(); setDirty(true); }
function setLayerShadows(L, on) {
  const was = L.shadows, put = v => { L.shadows = v; shadowTidy(); hooks.layers(); };
  put(on); pushHistory({ bytes: 16, undo: () => put(was), redo: () => put(on) });
}

/* Thins the outer two pixels of a mask to a checker that counts from the tile-grid origin. */
function checkerEdge(m, w, h, ox, oy) {
  const erode = a => a.map((v, i) => { const x = i % w, y = (i / w) | 0; return v && N4.every(n => { const p = x + n[0], q = y + n[1]; return p >= 0 && q >= 0 && p < w && q < h && a[q * w + p]; }) ? 1 : 0; });
  const core = erode(erode(m));
  return m.map((v, i) => v && (core[i] || DITHERS.checker.on(ox + i % w - S.gox, oy + ((i / w) | 0) - S.goy)) ? 1 : 0);
}
/* Flat on the ground from the layer's lowest row. Each row steps 2 px sideways, and at 100 percent length every second source row is kept.
   A row also takes in the pixel one step back towards the source, or a one-pixel pole would cast a dashed line instead of runs of 2. */
function castP(L, plot) {
  const b = contentBox(L), v = shadowColor(), checker = S.shadowEdge === 'checker', pct = S.castLen, H = b.y1 - b.y0 + 1;
  if (S.light === 'overhead') return shadowEllipseP(plot, (b.x0 + b.x1 + 1) >> 1, b.y1, Math.max(2, Math.round((b.x1 - b.x0 + 1) * pct / 200)), v, checker);
  const dir = S.light === 'left' ? 1 : -1, rows = Math.ceil(H * pct / 200), reach = 2 * (rows - 1);
  const ox = b.x0 - 1 - (dir < 0 ? reach : 0), w = b.x1 - b.x0 + 3 + reach, opaque = (x, y) => x >= b.x0 && x <= b.x1 && (L.px[y * S.w + x] >>> 24) > 0;
  let m = new Uint8Array(w * rows);
  for (let d = 0; d < rows; d++) {   // inverse mapping: each ground pixel asks which source pixel lands on it
    const sy = b.y1 - Math.floor(d * 200 / pct);
    for (let k = 0; k < w; k++) { const sx = ox + k - 2 * d * dir; if (opaque(sx, sy) || (d && opaque(sx + dir, sy))) m[d * w + k] = 1; }
  }
  if (checker) m = checkerEdge(m, w, rows, ox, b.y1);
  for (let d = 0; d < rows; d++) for (let k = 0; k < w; k++) if (m[d * w + k]) plot(ox + k, b.y1 + d, v);
}
function castShadow() {
  commitFloat(); const A = activeLayer(); let src = A.kind === 'shadow' ? layerById(A.shadowFor) : A;
  if (!src) { toast('Pick the layer that casts the shadow.'); return; }
  if (!contentBox(src)) { toast('This layer is empty.'); return; }
  if (liveOf(src)) { toast('This layer casts live shadows, which follow its objects by themselves.'); return; }
  const have = shadowOf(src); if (have && !canEdit(have)) return;
  const id = src.id; growForShape(plot => castP(src, plot)); src = layerById(id);
  const t = shadowTarget(src), next = new Uint32Array(S.w * S.h);
  castP(src, pxInto(next)); bakeLayer(t.L, next, t.list);
}

/* Outline colors are looked up once per source color. Off-ramp colors fall back to darkening. */
function outlineColor() {
  const memo = new Map(), steps = S.outColor === 'dark' ? 99 : S.outSteps;
  return v => {
    if (S.outColor === 'fixed') return inkV();
    if (!memo.has(v)) { const hex = packedHex(v), r = rampStep(hex, -steps); memo.set(v, r ? packHex(r) : shadeHex(hex, FACE_EDGE)); }
    return memo.get(v);
  };
}
/* Past the canvas counts as transparent, so art flush with the edge still gets a whole inside outline. */
function outlineP(L, plot) {
  const b = contentBox(L), ns = S.outN === 8 ? N8 : N4, color = outlineColor(), inside = S.outSide === 'inside';
  const at = (x, y) => x >= 0 && y >= 0 && x < S.w && y < S.h ? L.px[y * S.w + x] : 0;
  for (let y = b.y0 - 1; y <= b.y1 + 1; y++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
    const v = at(x, y);
    if (inside) { if ((v >>> 24) && ns.some(n => !(at(x + n[0], y + n[1]) >>> 24))) plot(x, y, color(v)); }
    else if (!(v >>> 24)) { const n = ns.find(q => at(x + q[0], y + q[1]) >>> 24); if (n) plot(x, y, color(at(x + n[0], y + n[1]))); }
  }
}
/* With its outline layer active, the buttons still act on the source. */
function outlineSource() { const A = activeLayer(); return layerById(A.outlineFor) || A; }
function outlineLayer() {
  commitFloat(); const id = outlineSource().id; let src = layerById(id), O = outlineOf(src);
  const b = contentBox(src), inside = S.outSide === 'inside';
  if (!b) { toast('This layer is empty.'); return; }
  if (O && !canEdit(O)) return;
  if (!inside && (b.x0 < 1 || b.y0 < 1 || b.x1 >= S.w - 1 || b.y1 >= S.h - 1) && !growToInclude(b.x0 - 1, b.y0 - 1, b.x1 + 1, b.y1 + 1, 0)) toast('The canvas is at its size limit.');
  src = layerById(id); O = outlineOf(src);
  if (!O) { O = makeLayer(src.name + ' outline'); O.outlineFor = id; O.group = src.group; }
  const list = S.layers.filter(x => x !== O), next = new Uint32Array(S.w * S.h);
  list.splice(list.indexOf(src) + (inside ? 1 : 0), 0, O);   // an inside outline sits on the art's own pixels, so below it would never show
  outlineP(src, pxInto(next)); bakeLayer(O, next, list);
}
function mergeOutline() {
  commitFloat(); const src = outlineSource(), O = outlineOf(src);
  if (!O) { toast('Outline the layer first.'); return; }
  if (!canEdit(src)) return;
  const above = S.layers.indexOf(O) > S.layers.indexOf(src), next = src.px.slice();
  for (let i = 0; i < next.length; i++) if ((O.px[i] >>> 24) && (above || !(next[i] >>> 24))) next[i] = O.px[i];
  S.active = S.layers.indexOf(src); bakeLayer(src, next, S.layers.filter(x => x !== O));
}

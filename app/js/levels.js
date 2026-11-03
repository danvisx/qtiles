'use strict';
/* qtiles levels and stacking: what lies under the pointer, moving objects over it, multi-select, align, the level ruler and footprints. */

const levelStep = () => S.objHalf ? Math.max(1, Math.round(levelPx() / 2)) : levelPx();
const snapLevel = z => Math.max(0, Math.round(Math.round(z / levelStep()) * levelStep()));
const SNAP_PX = 3;
/* A point of the plane at height z seen at a pixel, in half tiles from the grid origin. Straight, not through the stair, because a move needs fractions of a half tile. */
function planeAt(x, y, z) { const D = S.tile / 4, X = x + 0.5 - S.gox, Y = y + 0.5 - S.goy + z; return { a: (Y + X / 2) / D, b: (Y - X / 2) / D }; }

/* ---------- surfaces ---------- */
/* What an object offers at a pixel, or null. Walls, details and blobs offer nothing, so the search carries on behind them. */
function surfacePoint(o, x, y) {
  const g = shapeOf(o); if (g.attach) return null;
  const m = objMarkAt(o, x, y); if (!m) return null;
  if (g.flat) { if (m !== 1) return null; const z = o.z + o.h, p = planeAt(x, y, z); return { o, z, a: p.a, b: p.b }; }
  if (!g.surf) return null;
  const f = g.faces(o)[m]; if (!f || !f.n || f.n[2] <= 0) return null;
  const q = roofPoint(o, x, y) || planeAt(x, y, o.z);   // the stair can put a rim pixel just past the true slope, where it is at its foot
  return { o, z: o.z + Math.max(0, surfAt(o, q.a, q.b)), a: q.a, b: q.b };
}
/* The nearest surface at a pixel, across every shown object layer, so a prop finds the terrain on the layer below it. skip holds ids to look through. Reading the records rather than the id buffer sees past what is being dragged. */
function surfaceUnder(x, y, skip, only) {
  x = Math.floor(x); y = Math.floor(y); const sh = shownSet();
  for (let k = S.layers.length - 1; k >= 0; k--) {
    const L = S.layers[k]; if (!L.objectLayer || !sh(L) || (only && L !== only)) continue;
    const list = objQuery(L, { x0: x, y0: y, x1: x, y1: y }); if (!list.length) continue;
    const order = objOrder(list);
    for (let n = order.length - 1; n >= 0; n--) { const o = order[n]; if (skip && skip.has(o.id)) continue; const p = surfacePoint(o, x, y); if (p) return p; }
  }
  const p = planeAt(x, y, 0); return { o: null, z: 0, a: p.a, b: p.b };
}
/* The cell of a surface: on a flat top or the ground it is the tile the pixel is in, moved by the height, so it follows the stair exactly. */
function surfaceCell(s, x, y) {
  const flat = !s.o || shapeOf(s.o).flat, cell = flat ? tileCell(x, y + s.z) : { i: Math.floor(s.a / 2), j: Math.floor(s.b / 2) };
  return { z: s.z, cell, on: s.o && flat ? s.o : null };
}
/* Keeps a footprint on the top it landed on, if it fits. Terrain is many boxes that read as one surface, so nothing is held to any one of them. */
function keepOn(o, p) {
  if (!p || p.terrain) return o;
  if (o.w <= p.w) o.i = Math.max(p.i, Math.min(p.i + (p.w - o.w) / 2, o.i));
  if (o.d <= p.d) o.j = Math.max(p.j, Math.min(p.j + (p.d - o.d) / 2, o.j));
  return o;
}
/* The height of q's surface over a footprint: its highest point, sampled at most 17 points a side. */
function topOver(q, a0, a1, b0, b1) {
  const g = shapeOf(q); if (!g.surf) return q.h;
  const A0 = Math.max(a0, 2 * q.i), A1 = Math.min(a1, 2 * q.i + q.w), B0 = Math.max(b0, 2 * q.j), B1 = Math.min(b1, 2 * q.j + q.d), ea = Math.max(1, (A1 - A0) / 16), eb = Math.max(1, (B1 - B0) / 16); let top = 0;
  for (let a = A0; a <= A1 + 1e-9; a += ea) for (let b = B0; b <= B1 + 1e-9; b += eb) top = Math.max(top, surfAt(q, a, b));
  return top;
}
/* What a falling object would rest on: the highest top at or below its base, over its whole footprint. The index narrows the search to what shares the column. `also` holds records that have not been applied yet. */
function restUnder(o, skip, also) {
  const a0 = 2 * o.i, b0 = 2 * o.j, a1 = a0 + o.w, b1 = b0 + o.d, column = objPixelBox(Object.assign({}, o, { z: 0, h: Math.max(1, o.z + o.h) })), sh = shownSet(); let best = { z: 0, on: null };
  const test = q => {
    if (skip.has(q.id) || shapeOf(q).attach || 2 * q.i >= a1 || 2 * q.i + q.w <= a0 || 2 * q.j >= b1 || 2 * q.j + q.d <= b0) return;
    const top = q.z + topOver(q, a0, a1, b0, b1); if (top <= o.z && top > best.z) best = { z: top, on: q };
  };
  for (const L of S.layers) if (L.objectLayer && sh(L)) objQuery(L, column).forEach(test);
  if (also) also.forEach(test);
  return best;
}

/* ---------- moving ---------- */
/* Snaps a footprint's corner to the edges of what stands beside it, and otherwise to the cell grid. Edges can sit on half tiles, so a snapped object can too. */
function snapFoot(o, ca, cb, z, skip) {
  const D = S.tile / 4, tol = SNAP_PX / D, probe = objPixelBox(Object.assign({}, o, { i: ca / 2, j: cb / 2, z })), box = { x0: probe.x0 - 2 * D, y0: probe.y0 - 2 * D, x1: probe.x1 + 2 * D, y1: probe.y1 + 2 * D }, sh = shownSet();
  let a = null, b = null, da = tol, db = tol;
  const near = (v, size, e, best, dist, set) => { for (const t of [e, e - size]) { const m = Math.abs(v - t); if (m <= dist) { dist = m; best = t; } } set(best, dist); };
  for (const L of S.layers) if (L.objectLayer && sh(L)) for (const q of objQuery(L, box)) {
    if (skip.has(q.id) || shapeOf(q).attach || q.terrain || q.z > z + o.h || q.z + q.h < z) continue;
    const qa = 2 * q.i, qb = 2 * q.j;
    if (qb < cb + o.d + 1 && qb + q.d > cb - 1) for (const e of [qa, qa + q.w]) near(ca, o.w, e, a, da, (t, m) => { a = t; da = m; });
    if (qa < ca + o.w + 1 && qa + q.w > ca - 1) for (const e of [qb, qb + q.d]) near(cb, o.d, e, b, db, (t, m) => { b = t; db = m; });
  }
  return { a: a !== null ? a : 2 * Math.round(ca / 2), b: b !== null ? b : 2 * Math.round(cb / 2) };
}
const pickFree = () => S.objFree || PK.alt;
/* The middle of an object's base, on screen. The drag moves this point, so what lies under it decides where the object lands, wherever it was grabbed, and nothing jumps at the start. */
function footPixel(o) { const D = S.tile / 4, a = 2 * o.i + o.w / 2, b = 2 * o.j + o.d / 2; return { x: S.gox + (a - b) * D, y: S.goy + (a + b) * D / 2 - o.z }; }
function pickDrag(L, o, set, a) {
  const skip = new Set(); for (const q of L.objects) if (set.some(p => p.id === q.id || p.id === q.parent)) skip.add(q.id);
  const f = footPixel(o), lift = o.parent ? 0 : o.z - restUnder(o, skip).z;   // something floating stays that far above whatever it passes over
  return { L, o, set, skip, was: L.objects, a, c: tileCell(a.x, a.y), moved: null, off: { x: f.x - a.x, y: f.y - a.y + lift }, lift };
}
function pickStart(a, add) {
  add = add || S.objAdd; const hit = objHit(a.x, a.y); PK.drag = null; PK.box = null;
  if (AS.path.length && (!hit || S.layers[hit.k].id !== AS.layerId || !inPath(topOf(S.layers[hit.k], hit.o)))) asmExit();   // tapping away from the group leaves it
  if (!hit) { if (!add) objSelect(null); PK.box = { ax: a.x, ay: a.y, add }; return; }
  const L = S.layers[hit.k], top = topOf(L, hit.o), grouped = unitKey(top) !== null, unit = unitIds(L, top);
  if (asmDoubleTap(top)) { if (S.active !== hit.k) { S.active = hit.k; hooks.layers(); } asmEnter(L, top); return; }
  if (add) {
    if (S.active !== hit.k) { S.active = hit.k; OB.sel = top.id; OB.ids = grouped && unit.length > 1 ? unit : []; hooks.layers(); } else objToggle(unit);
    return;
  }
  const inSet = OB.ids.length > 0 && (grouped ? unit : [hit.o.id]).every(id => OB.ids.includes(id)), one = grouped ? top : hit.o;
  if (S.active !== hit.k) { S.active = hit.k; OB.sel = one.id; OB.ids = grouped && unit.length > 1 ? unit : []; hooks.layers(); }
  else if (!inSet) { if (grouped) objSelectMany(unit); else objSelect(hit.o.id); }
  PK.drag = pickDrag(L, one, inSet || grouped ? objSet() : [hit.o], a);
}
/* A detail slides over its parent: along the wall by pixels, or across the top by tiles. Anything else goes by the surface under its base, or straight up and down. */
function pickMoved(d, a, c) {
  const o = d.o, di = c.i - d.c.i, dj = c.j - d.c.j;
  if (o.parent) {
    const p = d.L.index.byId.get(o.parent), q = o.fit;
    if (o.face === 'top') return detailPin(Object.assign({}, o, { u: o.u + 2 * di, v: o.v + 2 * dj }), p);
    return detailPin(Object.assign({}, o, { u: o.u + snap2(a.x - d.a.x), v: shapeOf(o).floor ? o.v : o.v + snap2(wallHeight(q.axis, q.K, a.x, a.y) - wallHeight(q.axis, q.K, d.a.x, d.a.y)) }), p);
  }
  if (S.objDrag === 'height') { const z = Math.max(0, o.z + d.a.y - a.y); return Object.assign({}, o, { z: pickFree() ? z : snapLevel(z) }); }
  const s = surfaceUnder(a.x + d.off.x, a.y + d.off.y, d.skip), ca = s.a - o.w / 2, cb = s.b - o.d / 2, lift = pickFree() ? d.lift : snapLevel(d.lift), z = s.z + lift;
  const p = pickFree() ? { a: Math.round(ca), b: Math.round(cb) } : snapFoot(o, ca, cb, z, d.skip), n = Object.assign({}, o, { i: p.a / 2, j: p.b / 2, z });
  return d.set.length === 1 && !pickFree() && s.o && shapeOf(s.o).flat ? keepOn(n, s.o) : n;
}
const samePlace = (p, q) => p.i === q.i && p.j === q.j && p.z === q.z;
function pickMove(a) {
  if (PK.box) { const b = PK.box; b.x = a.x; b.y = a.y; SEL.rect = { x0: Math.min(b.ax, a.x), y0: Math.min(b.ay, a.y), x1: Math.max(b.ax, a.x), y1: Math.max(b.ay, a.y) }; requestRender(); return; }
  const d = PK.drag; if (d) { d.to = a; requestRender(); }
}
/* Runs before a frame is drawn, and once more on release, so a frame costs one move however many points the pointer sent, and the last of them always lands. */
function pickStep() {
  const d = PK.drag, a = d && d.to; if (!a) return; d.to = null;
  const m = pickMoved(d, a, tileCell(a.x, a.y)), last = d.moved || d.o, o = d.o;
  if (samePlace(m, last)) return;
  d.moved = m; const di = m.i - o.i, dj = m.j - o.j, dz = Math.max(m.z - o.z, -Math.min(...d.set.map(q => q.z)));   // a set moves as one, so it stops when its lowest member reaches the ground
  objApply(d.L, d.set.length === 1 ? objSwap(d.was, o, m) : d.set.reduce((l, q) => objSwap(l, q, Object.assign({}, q, { i: q.i + di, j: q.j + dj, z: q.z + dz })), d.was)); objSync();
  const sh = liveOf(d.L), list = d.L.objects.filter(q => d.skip.has(q.id)), over = sh && !sh.held && CAST.ms > CAST.budget;
  if (over) shadowHold(sh, d.L, d.skip, list);
  d.marks = over || (sh && sh.held) || (sh && castHidden(castCovers(S.layers.indexOf(d.L)), list)) ? list : null;
}
function pickEnd() {
  if (PK.box) { pickBox(); return; }
  pickStep(); const d = PK.drag; PK.drag = null; if (d) shadowFree(d.L, d.skip); if (!d || !d.moved || samePlace(d.moved, d.o)) { if (d && d.moved) objApply(d.L, d.was); return; }
  const next = d.L.objects, ids = new Set(d.set.map(q => q.id)), fresh = next.filter(q => ids.has(q.id)); let b = null; for (const q of fresh) b = joinBox(b, objPixelBox(q));
  if (pastEdge(b)) { objApply(d.L, d.was); objCommit(d.L, next, fresh); return; }   // the canvas copy made by growing must hold the object where it started
  objPush(d.L, d.was, next); objSync();
}
function pickAbort() { const d = PK.drag; PK.drag = null; PK.box = null; SEL.rect = null; if (d) shadowFree(d.L, d.skip); if (d && d.moved) { objApply(d.L, d.was); objSync(); } }

/* ---------- selection ---------- */
/* The selected records. A set holds no details: they travel with their parents. */
function objSet() {
  const L = activeLayer(); if (!L || !L.objectLayer) return [];
  if (OB.ids.length) return OB.ids.map(id => L.index.byId.get(id)).filter(Boolean);
  const o = objSelected(); return o ? [o] : [];
}
function objSelect(id) { if (OB.sel !== id || OB.ids.length) { OB.sel = id; OB.ids = []; objSync(); } }
function objSelectMany(ids) { OB.ids = ids.length > 1 ? ids : []; OB.sel = ids.length ? ids[0] : null; objSync(); }
/* A whole assembly goes in or out together. */
function objToggle(list) { const ids = objSet().map(o => o.parent || o.id), had = list.every(id => ids.includes(id)); objSelectMany(had ? ids.filter(q => !list.includes(q)) : [...new Set(ids.concat(list))]); }
/* Everything whose visible pixels the box touches, on the active layer, or else on the topmost object layer with anything in the box. */
function pickBox() {
  const p = PK.box, r = SEL.rect; PK.box = null; SEL.rect = null; requestRender(); if (!r) return;
  const sh = shownSet(), order = S.layers.map((_, k) => k).reverse().filter(k => S.layers[k].objectLayer && sh(S.layers[k]) && !S.layers[k].locked); order.sort((m, n) => (n === S.active) - (m === S.active));
  const x0 = Math.max(0, r.x0), y0 = Math.max(0, r.y0), x1 = Math.min(S.w - 1, r.x1), y1 = Math.min(S.h - 1, r.y1);
  for (const k of order) {
    const L = S.layers[k], found = new Set();
    for (let y = y0; y <= y1; y++) for (let x = x0, i = y * S.w + x0; x <= x1; x++, i++) { const id = L.ids[i]; if (id) { const o = L.index.byId.get(id); found.add(o.parent || id); } }
    if (!found.size) continue;
    const had = p.add && k === S.active ? objSet().map(o => o.parent || o.id) : [], ids = [...new Set(had.concat(unitsOf(L, found)))];
    if (S.active !== k) { S.active = k; hooks.layers(); }
    objSelectMany(ids); return;
  }
}

/* ---------- raise, land, align ---------- */
/* A selected detail goes with its parent: its own height comes from the wall. */
function objTops() { const L = activeLayer(); return [...new Set(objSet().map(o => o.parent ? L.index.byId.get(o.parent) : o))]; }
function objRaise(dir) { const L = activeLayer(); if (objSelected() && canTouch(L)) objPatchSet(L, objTops(), o => ({ z: Math.max(0, o.z + dir * levelStep()) }), 'raise'); }
/* Lowest first, so a stack selected together stays a stack. */
function objLand() {
  const L = activeLayer(); if (!objSelected() || !canTouch(L)) return;
  const list = objTops().sort((p, q) => p.z - q.z), skip = new Set(L.objects.filter(q => list.some(p => p.id === q.id || p.id === q.parent)).map(q => q.id)), done = [], to = new Map();
  if (asmUnit(L, list)) { const drop = Math.min(...list.map(o => o.z - restUnder(o, skip).z)); objPatchSet(L, list, o => ({ z: o.z - drop })); return; }   // it falls as one, until its first part lands
  for (const o of list) { const z = restUnder(o, skip, done).z; to.set(o.id, z); done.push(Object.assign({}, o, { id: -o.id, z })); }
  objPatchSet(L, list, o => ({ z: to.get(o.id) }));
}
const objSpan = o => ({ a0: 2 * o.i, b0: 2 * o.j, a1: 2 * o.i + o.w, b1: 2 * o.j + o.d });
/* In cell space, as the arrow keys are: left and right along i, top and bottom along j. */
function objAlign(side) {
  const L = activeLayer(), set = objSet(); if (set.length < 2 || !canTouch(L)) return;
  const s = set.map(objSpan), low = (...v) => Math.min(...v), high = (...v) => Math.max(...v);
  const to = { left: o => ({ i: low(...s.map(q => q.a0)) / 2 }), right: o => ({ i: (high(...s.map(q => q.a1)) - o.w) / 2 }), top: o => ({ j: low(...s.map(q => q.b0)) / 2 }), bottom: o => ({ j: (high(...s.map(q => q.b1)) - o.d) / 2 }) }[side];
  objPatchSet(L, set, to);
}
/* A detail centers on its parent. Anything else, alone or as a set, centers on what it stands on. */
function objCenter() {
  const L = activeLayer(), set = objSet(), o = set[0]; if (!o || !canTouch(L)) return;
  if (o.parent) { const p = L.index.byId.get(o.parent); objPatchSet(L, [o], o.face === 'top' ? { u: snap2((p.w - o.w) / 2), v: snap2((p.d - o.d) / 2) } : { u: snap2((wallOf(p, (o.face + p.facing) % 4).len - shapeOf(o).span(o).len) / 2) }); return; }
  const skip = new Set(L.objects.filter(q => set.some(p => p.id === q.id || p.id === q.parent)).map(q => q.id)), p = restUnder(o, skip).on;
  if (!p) { toast('This stands on the ground, so there is nothing to center it on.'); return; }
  const s = set.map(objSpan), a0 = Math.min(...s.map(q => q.a0)), a1 = Math.max(...s.map(q => q.a1)), b0 = Math.min(...s.map(q => q.b0)), b1 = Math.max(...s.map(q => q.b1));
  const di = Math.round(2 * p.i + (p.w - (a1 - a0)) / 2 - a0) / 2, dj = Math.round(2 * p.j + (p.d - (b1 - b0)) / 2 - b0) / 2;
  objPatchSet(L, set, q => ({ i: q.i + di, j: q.j + dj }));
}
/* With no gap given, the first and last stay and the space between is shared out, in whole half tiles from the first, so any leftover falls at the far end. */
function objDistribute(axis) {
  const L = activeLayer(), f = axis === 'i' ? 'w' : 'd', g = S.objGap === '' ? null : Math.max(0, +S.objGap), list = objSet().sort((p, q) => p[axis] - q[axis]); if (!canTouch(L)) return;
  if (list.length < (g === null ? 3 : 2)) { toast(g === null ? 'Select three or more to share out the space, or give a gap.' : 'Select two or more.'); return; }
  const last = list[list.length - 1], used = list.reduce((n, o) => n + o[f], 0), room = 2 * last[axis] + last[f] - 2 * list[0][axis] - used, gap = g === null ? Math.max(0, Math.floor(room / (list.length - 1))) : g, to = new Map(); let at = 2 * list[0][axis];
  for (const o of list) { to.set(o.id, at / 2); at += o[f] + gap; }
  objPatchSet(L, list, o => ({ [axis]: to.get(o.id) }));
}

/* ---------- on the canvas ---------- */
/* Ticks up from the ground under the selection, at the left edge of the canvas: every level, with the object's base and top picked out. */
function objRuler(c, x, y, z) {
  if (!objTool(heldTool())) return;
  const o = objSet()[0]; if (!o) return;
  const lv = levelPx(), foot = footPixel(o), ground = y + (foot.y + o.z) * z, rx = Math.max(x, 8), n = Math.ceil((o.z + o.h) / lv) + 1, sy = k => ground - k * lv * z, label = lv * z >= 12;
  c.strokeStyle = TH.accent; c.fillStyle = TH.accent; c.lineWidth = 1; c.font = '10px ' + (TH.mono || 'monospace'); c.textBaseline = 'middle'; c.beginPath();
  c.moveTo(rx + 0.5, sy(0)); c.lineTo(rx + 0.5, sy(n));
  for (let k = 0; k <= n; k++) { const t = Math.round(sy(k)) + 0.5; c.moveTo(rx, t); c.lineTo(rx + 6, t); }
  for (const h of [o.z, o.z + o.h]) { const t = Math.round(ground - h * z) + 0.5; c.moveTo(rx, t); c.lineTo(rx + 14, t); }
  c.stroke();
  if (label) for (let k = 0; k <= n; k++) c.fillText(k, rx + 17, sy(k));
}
/* Each footprint as a thin diamond on the ground, to check alignment, whatever height it stands at. */
function objFootprints(c, x, y, z) {
  if (!S.objFoot || S.mode !== 'iso') return;
  const D = S.tile / 4, sh = shownSet(), P = (a, b) => [x + (S.gox + (a - b) * D) * z, y + (S.goy + (a + b) * D / 2) * z];
  c.strokeStyle = TH.accent; c.lineWidth = 1; c.globalAlpha = 0.7; c.beginPath();
  for (const L of S.layers) if (L.objectLayer && sh(L)) for (const o of L.objects) {
    if (o.parent) continue;
    const a0 = 2 * o.i, b0 = 2 * o.j, a1 = a0 + o.w, b1 = b0 + o.d, p = [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)];
    c.moveTo(p[0][0], p[0][1]); for (let k = 1; k <= 4; k++) c.lineTo(p[k & 3][0], p[k & 3][1]);
  }
  c.stroke(); c.globalAlpha = 1;
}

/* ---------- panel ---------- */
function syncLevel() {
  const e = $('levelH'); if (document.activeElement !== e) e.value = levelPx();
  $('levelAuto').disabled = !S.level; $('levelNote').textContent = S.level ? 'Set by hand. Half tile follows the tile size.' : 'Half the tile width, so a cube looks like a cube.';
  syncChip();
}
function setLevel(n) { S.level = n ? Math.max(4, Math.min(64, Math.round(n))) : 0; objRefresh(); syncPlace(); syncLevel(); setDirty(true); requestRender(); }
function syncPick() {
  press($('objAddOpt'), S.objAdd); press($('objFreeOpt'), S.objFree); press($('dragMove'), S.objDrag === 'move'); press($('dragHeight'), S.objDrag === 'height');
  press($('objHalf'), S.objHalf); $('objGap').value = S.objGap;
}
function initLevels() {
  const flip = (id, k) => { $(id).onclick = () => { S[k] = !S[k]; syncPick(); objSync(); }; };
  flip('objAddOpt', 'objAdd'); flip('objFreeOpt', 'objFree'); flip('objHalf', 'objHalf');
  $('dragMove').onclick = () => { S.objDrag = 'move'; syncPick(); }; $('dragHeight').onclick = () => { S.objDrag = 'height'; syncPick(); };
  for (const id of ['objRaise', 'objBarRaise']) $(id).onclick = () => objRaise(1);
  for (const id of ['objLower', 'objBarLower']) $(id).onclick = () => objRaise(-1);
  for (const id of ['objLand', 'objBarLand']) $(id).onclick = objLand;
  $('objCenter').onclick = objCenter;
  document.querySelectorAll('[data-align]').forEach(b => { b.onclick = () => objAlign(b.dataset.align); });
  document.querySelectorAll('[data-spread]').forEach(b => { b.onclick = () => objDistribute(b.dataset.spread); });
  $('objGap').onchange = e => { const v = parseInt(e.target.value, 10); S.objGap = Number.isFinite(v) ? Math.max(0, v) : ''; syncPick(); };
  $('levelH').onchange = e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) setLevel(v); else syncLevel(); };
  $('levelAuto').onclick = () => setLevel(0);
  syncPick();
}

'use strict';
/* qtiles scatter brush: paints objects along a stroke, erases them, or sets them along a line.
   A stroke is kept as points on the plane, in half tiles. Each spot draws from its own seeded stream, so the same stroke and seed give the same result however the pointer events fell. */

const SC = { drag: null, last: null };
const DIRS8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/* ---------- variants ---------- */
/* A variant is a library item, by id, or a one-record item made from the shape in the Place options. */
const treeItem = () => ({ tile: S.tile, level: levelPx(), items: [objNew({ id: 1, type: 'tree', w: 4, d: 4, h: SHAPE_DEFS.tree.h(), look: Object.assign(lookNew('tree'), { seed: 1 }), outline: 'sel', shadow: true })] });
const scItem = v => v.id ? libFind(v.id) : v.item;
function scVariants() { const list = S.scVariants.map(scItem).filter(Boolean); return list.length ? list : [treeItem()]; }
function scAddShape() {
  const o = placeBase(); if (defOf(o.type).attach && defOf(o.type).attach !== 'free') { toast('Attached details need a wall or a top. Pick a shape that stands alone.'); return; }
  S.scVariants = S.scVariants.concat({ name: defOf(o.type).name, item: { tile: S.tile, level: levelPx(), items: [Object.assign({}, o, { id: 1, i: 0, j: 0, z: 0 })] } }); syncScatter();
}
/* A random size step grows a one-record item. An item of many parts keeps its size, as its parts would no longer meet. */
function scSized(list, step) {
  if (!step || list.length !== 1) return list;
  const o = list[0], g = shapeOf(o), grow = 2 * step;
  if (g.params.radius) return [shapeFit(Object.assign({}, o, { params: Object.assign({}, o.params, { radius: pn(o, 'radius') + step }), h: Math.round(o.h * (1 + step / 4)) }), {})];
  return [shapeFit(Object.assign({}, o, { w: o.w + grow, d: o.d + (g.fit ? 0 : grow), h: Math.round(o.h * (1 + step / 4)) }), {})];
}
const scReseed = (list, seed) => list.map((q, k) => shapeOf(q).reroll ? Object.assign(q, { look: Object.assign({}, q.look, { seed: (seed + k) | 0 }) }) : q);

/* ---------- overlap ---------- */
/* Footprints in buckets of four tiles, so a stroke over a full layer does not compare each spot with every object. */
const scBucket = v => Math.floor(v / 8);
function scTake(T, r) { for (let q = scBucket(r.b0); q <= scBucket(r.b1 - 1); q++) for (let p = scBucket(r.a0); p <= scBucket(r.a1 - 1); p++) { const k = p + ',' + q; if (!T.has(k)) T.set(k, []); T.get(k).push(r); } }
function scFree(T, r) {
  for (let q = scBucket(r.b0); q <= scBucket(r.b1 - 1); q++) for (let p = scBucket(r.a0); p <= scBucket(r.a1 - 1); p++) for (const e of T.get(p + ',' + q) || [])
    if (e.a0 < r.a1 && e.a1 > r.a0 && e.b0 < r.b1 && e.b1 > r.b0 && e.z0 < r.z1 && e.z1 > r.z0) return false;
  return true;
}
const scRect = (o, h) => ({ a0: 2 * o.i, b0: 2 * o.j, a1: 2 * o.i + o.w, b1: 2 * o.j + o.d, z0: o.z, z1: o.z + (h === undefined ? o.h : h) });
function scTaken(L) { const T = new Map(); if (L.objectLayer) for (const o of L.objects) if (!o.parent && !o.terrain) scTake(T, scRect(o)); return T; }

/* ---------- laying out ---------- */
/* Lands records on whatever is under them and adds them, with their mirrors, unless avoiding overlap rules them out. Null when nothing was added. */
function scLay(d, list) {
  const tops = list.filter(q => !q.parent), U = asmSpan(tops), rest = restUnder({ type: 'box', i: U.a0 / 2, j: U.b0 / 2, w: U.a1 - U.a0, d: U.b1 - U.b0, z: d.probe, h: 1, params: {} }, new Set()).z;
  const up = o => Object.assign({}, o, { z: o.z + rest }), by = new Map(), placed = [];
  for (const q of list) { if (q.parent) continue; const n = up(q); by.set(q.id, n); placed.push(n); }
  for (const q of list) if (q.parent) placed.push(detailFit(q, by.get(q.parent)));
  const sets = [placed].concat(asmTwinSets(placed, d.alloc)), all = [];
  for (const s of sets) {
    const t = s.filter(q => !q.parent), rs = t.map(o => scRect(o));
    if (S.scAvoid && !rs.every(r => scFree(d.taken, r))) continue;
    rs.forEach(r => scTake(d.taken, r)); all.push(...s); d.head = d.head || s;
  }
  if (!all.length) return null;
  d.drafts.push(...all); pvAdd(plot => objsP(all, plot)); d.box = joinBox(d.box, artBox(all)); scNote(d); return all;
}
function scNote(d) { fitNote(d.box, 'Scatter', { again: () => { pvClear(); pvAdd(plot => objsP(d.drafts, plot)); scNote(d); } }); }
/* asmTwins as a list of sets, so each mirror is tested for overlap by itself. */
function asmTwinSets(list, alloc) { const t = asmTwins(list, alloc), n = list.length, out = []; for (let k = 0; k < t.length; k += n) out.push(t.slice(k, k + n)); return out; }
function scSpot(d, k, a, b) {
  const r = rng(Math.imul(d.seed, 2654435761) + Math.imul(k + 1, 40503)), keep = r() * 100 < S.scDensity, reach = S.scJitter / 100 * S.scSpacing, ja = (r() - 0.5) * 2 * reach, jb = (r() - 0.5) * 2 * reach, pick = r(), turn = Math.floor(r() * 4), step = Math.floor(r() * (S.scSize + 1)), seed = Math.floor(r() * 0x7fffffff);
  if (!keep) return;
  const item = d.items[Math.floor(pick * d.items.length)], s = libSize(item), t = S.scTurn ? turn : 0, W = t % 2 ? s.D : s.W, D = t % 2 ? s.W : s.D;
  const list = scReseed(scSized(libInstance(item, { a: Math.round(a + ja - W / 2), b: Math.round(b + jb - D / 2), z: 0 }, { turn: t, flip: false }, { alloc: d.alloc }), step), seed);
  scLay(d, list);
}
/* Walks the new part of the stroke, one spot each `spacing` cells. What is left of a step carries over to the next segment. */
function scWalk(d, p, q) {
  const pitch = 2 * S.scSpacing, len = Math.hypot(q.a - p.a, q.b - p.b); let at = d.left;
  for (; at <= len; at += pitch) { const f = len ? at / len : 0; scSpot(d, d.k++, p.a + (q.a - p.a) * f, p.b + (q.b - p.b) * f); }
  d.left = at - len;
}
/* A line keeps to the grid axes or the cell diagonal, the only directions where whole half tiles give exactly even steps. */
function scLineDir(d) {
  const p = d.pts[0], q = d.pts[d.pts.length - 1], k = (Math.round(Math.atan2(q.b - p.b, q.a - p.a) / (Math.PI / 4)) + 8) % 8, dir = DIRS8[k], diag = !!(dir[0] && dir[1]);
  return { dir, diag, reach: Math.max(0, ((q.a - p.a) * dir[0] + (q.b - p.b) * dir[1]) / (diag ? 2 : 1)), fa: dir[0] < 0 ? 2 : 0, fb: dir[1] < 0 ? 3 : 1 };
}
/* A fence is cut to the spacing, one post a piece, so Spacing sets the posts on a line, and how fine a diagonal steps. */
function scCut(item) {
  const q = item.items[0], g = shapeOf(q), pitch = 2 * S.scSpacing; if (item.items.length !== 1 || !g.run) return item;
  return Object.assign({}, item, { items: [Object.assign({}, q, q.d > q.w ? { d: pitch } : { w: pitch }, { params: Object.assign({}, q.params, { spacing: pitch }) })] });
}
/* A run item (a fence, a wall) lies along each leg with its ends touching, stepping a diagonal corner by corner. Anything else stands centered on even marks. */
function scLine(d) {
  const line = scLineDir(d), p = d.pts[0], items = d.items.map(scCut), sizes = items.map(libSize), run = sizes[0].W !== sizes[0].D, c = { a: 2 * Math.round(p.a / 2), b: 2 * Math.round(p.b / 2) };
  const pitch = run ? Math.max(2 * S.scSpacing, Math.max(sizes[0].W, sizes[0].D)) : 2 * S.scSpacing, legs = run ? Math.max(1, Math.round(line.reach * (line.diag ? 2 : 1) / pitch)) : 1 + Math.floor(line.reach / pitch), start = !line.dir[0] ? line.fb : line.fa, made = [];
  for (let k = 0; k < legs; k++) {
    const f = line.diag && run ? (k & 1 ? line.fb : line.fa) : start, v = FRONTS[f], n = k % items.length, s = sizes[n], along = s.D > s.W ? 1 : 0, turn = (f - along + 4) % 4, W = turn % 2 ? s.D : s.W, D = turn % 2 ? s.W : s.D;
    const a0 = !run ? c.a - Math.floor(W / 2) : v[0] > 0 ? c.a : v[0] < 0 ? c.a - W : c.a - Math.floor(W / 2), b0 = !run ? c.b - Math.floor(D / 2) : v[1] > 0 ? c.b : v[1] < 0 ? c.b - D : c.b - Math.floor(D / 2);
    const list = libInstance(items[n], { a: a0, b: b0, z: 0 }, { turn, flip: false }, { alloc: d.alloc });
    scReseed(list, Math.imul(d.seed, 2654435761) + k);
    made.push({ list, at: { a: c.a, b: c.b } });
    if (line.diag && run) { c.a += v[0] * pitch; c.b += v[1] * pitch; } else { c.a += (run ? v[0] : line.dir[0]) * pitch; c.b += (run ? v[1] : line.dir[1]) * pitch; }
  }
  /* A fence ends in a post. Inside a line the next piece starts with one, so only the piece whose end post closes the line keeps it, or joints would crowd two together. */
  made.forEach((m, k) => { for (const o of m.list) if (shapeOf(o).run && made.length > 1) { const lo = frame(o).t(m.at.a, m.at.b) > frame(o).W / 2, keep = lo ? k === 0 : k === made.length - 1; if (!keep) o.params = Object.assign({}, o.params, { open: 1 }); } });
  for (const m of made) scLay(d, m.list);
}

/* ---------- stroke ---------- */
function scNew(L) {
  let id = -1;
  return { L, seed: S.scatterSeed, pts: [], left: 0, k: 0, drafts: [], alloc: () => id--, taken: scTaken(L), items: scVariants(), probe: 0, gone: new Set() };
}
const scPoint = a => { const s = surfaceUnder(a.x, a.y); return { a: s.a, b: s.b, z: s.z }; };
function scAddPoint(d, q) {
  const p = d.pts[d.pts.length - 1]; d.pts.push(q); d.probe = q.z + 2 * levelPx();
  if (S.scMode === 'erase') scErase(d, q);
  else if (S.scMode === 'paint') scWalk(d, p || q, q);
  else { pvClear(); d.drafts = []; d.head = null; d.box = null; d.taken = scTaken(d.L); d.k = 0; scLine(d); }
}
function scatterStart(a) {
  const L = activeLayer(); if (L.objectLayer && !canTouch(L)) return false;
  if (S.scMode === 'erase' && !L.objectLayer) { toast('Choose an object layer to erase from.'); return false; }
  pvClear(); SC.drag = scNew(L); scAddPoint(SC.drag, scPoint(a)); return true;
}
function scatterMove(a) { if (SC.drag) scAddPoint(SC.drag, scPoint(a)); }
function scCommit(d) {
  if (!d.drafts.length) return;
  if (!activeLayer().objectLayer) addObjectLayer();
  const L = activeLayer(), fresh = asmCopy(d.drafts, () => objSeq++);
  objCommit(L, L.objects.concat(fresh), fresh);
  SC.last = { pts: d.pts, mode: S.scMode, entry: H.stack[H.pos - 1] };
}
function scatterEnd() {
  const d = SC.drag; SC.drag = null; if (!d) { pvClear(); return; }
  if (S.scMode !== 'erase') { fitGate(d.box, 'Scatter', b => fitShift(b, 1), q => { pvClear(); if (q) d.drafts = objsShift(d.drafts, q); scCommit(d); }); return; }
  pvClear(); if (!d.gone.size) return;
  const L = activeLayer(); objEdit(L, L.objects.filter(q => !d.gone.has(q.id) && !d.gone.has(q.parent))); objSync();
}
/* Runs a whole stroke at once, for a reroll. */
function scReplay(pts) {
  const d = scNew(activeLayer()); for (const q of pts) scAddPoint(d, q);
  pvClear(); scCommit(d);
}
/* A new seed. If the last stroke is still the latest step, it is redone with that seed in its place, so a reroll changes the layout rather than adding to it. */
function scReroll() {
  S.scatterSeed = (S.scatterSeed + 1) | 0; setDirty(true); syncScatter();
  const l = SC.last; if (!l || !l.entry || l.mode !== S.scMode || H.stack[H.pos - 1] !== l.entry) return;
  undo(); SC.last = null; scReplay(l.pts);
}
/* Whole assemblies go, marked in the shadow color until the stroke ends. Each object is marked once, so a long stroke costs no more than it removes. */
function scErase(d, q) {
  const L = d.L, r = 2 * S.scBrush, probe = { type: 'box', i: (q.a - r) / 2, j: (q.b - r) / 2, w: 2 * r, d: 2 * r, z: q.z, h: 1, params: {} }, v = shadowColor(), box = objPixelBox(probe), reach = { a0: q.a - r, a1: q.a + r, b0: q.b - r, b1: q.b + r };
  const pad = 8 * S.tile; box.x0 -= pad; box.x1 += pad; box.y0 -= pad; box.y1 += pad;
  for (const hit of objQuery(L, box)) {
    const o = topOf(L, hit); if (o.terrain || d.gone.has(o.id)) continue;
    const e = scRect(o); if (e.a0 >= reach.a1 || e.a1 <= reach.a0 || e.b0 >= reach.b1 || e.b1 <= reach.b0) continue;
    for (const id of unitIds(L, o)) { d.gone.add(id); const m = L.index.byId.get(id); pvAdd(plot => objStamp(m, { x0: 0, y0: 0, x1: S.w - 1, y1: S.h - 1 }, (x, y) => plot(x, y, v))); }
  }
}

/* ---------- panel ---------- */
function syncScatter() {
  document.querySelectorAll('[data-sc-mode]').forEach(b => press(b, b.dataset.scMode === S.scMode));
  const erase = S.scMode === 'erase', line = S.scMode === 'path';
  $('scPaint').hidden = erase; $('scErase').hidden = !erase; $('scBrushOnly').hidden = line;
  for (const k of ['scSpacing', 'scJitter', 'scSize', 'scDensity', 'scBrush']) { const e = $(k); if (document.activeElement !== e) e.value = S[k]; }
  press($('scTurn'), S.scTurn); press($('scAvoid'), S.scAvoid); $('scSeed').textContent = S.scatterSeed;
  const host = $('scList'); host.textContent = '';
  const names = S.scVariants.length ? S.scVariants : [{ name: 'Tree' }];
  names.forEach((v, k) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = v.id ? (libFind(v.id) || { name: 'Missing item' }).name : v.name; if (S.scVariants.length) { b.setAttribute('aria-label', 'Remove ' + b.textContent); b.onclick = () => { S.scVariants = S.scVariants.filter((_, n) => n !== k); syncScatter(); }; } host.appendChild(b); });
  const sel = $('scAdd'), have = [...sel.options].length - 1, list = libItems();
  if (have !== list.length) { sel.length = 1; for (const x of list) { const o = document.createElement('option'); o.value = x.id; o.textContent = x.name; sel.appendChild(o); } }
}
function initScatter() {
  document.querySelectorAll('[data-sc-mode]').forEach(b => { b.onclick = () => { S.scMode = b.dataset.scMode; syncScatter(); }; });
  const lim = { scSpacing: [1, 32], scJitter: [0, 100], scSize: [0, 4], scDensity: [1, 100], scBrush: [1, 8] };
  for (const k in lim) $(k).onchange = e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) S[k] = Math.max(lim[k][0], Math.min(lim[k][1], v)); syncScatter(); };
  $('scTurn').onclick = () => { S.scTurn = !S.scTurn; syncScatter(); }; $('scAvoid').onclick = () => { S.scAvoid = !S.scAvoid; syncScatter(); };
  $('scReroll').onclick = scReroll; $('scShape').onclick = scAddShape;
  $('scAdd').onchange = e => { const id = e.target.value; e.target.value = ''; if (id) { S.scVariants = S.scVariants.concat({ id }); syncScatter(); } };
  syncScatter();
}

'use strict';
/* qtiles terrain: a brush over cells, kept as ordinary boxes on an object layer of kind terrain.
   The records are the height map: a stroke reads the cells out of them, changes some, and merges all of them back into rectangles. A rectangle that comes out the same keeps its record, so only what changed is redrawn. */

const TER_MAX = 8, TER_BUDGET = 2000, TER_RUN = 128;
const TER_SIDES = { dirt: '#c68a62', stone: '#9a9fb5' };   // a wall sits one or two steps down the ramp from these
const TR = { drag: null, ghost: null, spot: null };   // spot: the cell under the pointer and the height it will take
const cellKey = (i, j) => i + ',' + j;

const terrainLayer = () => { const A = activeLayer(); return A.objectLayer && A.kind === 'terrain' ? A : S.layers.find(L => L.objectLayer && L.kind === 'terrain') || null; };
/* The current color on top and a dirt or stone ramp on the walls. Walls join on their own ramp, so a hill's sides read as earth under any top. */
function terrainLook() {
  const k = Object.assign(lookNew('box'), { material: 'plain' }, S.terMat), s = lookFrom(TER_SIDES[S.terSide]);
  k.side = { ramp: s.ramp, base: s.base, color: s.color };
  return k;
}
/* cell key -> { i, j, n levels, look } */
function terrainCells(L) {
  const cells = new Map(), lv = levelPx();
  for (const o of L ? L.objects : []) {
    if (o.terrain !== true) continue;
    const n = Math.max(1, Math.round(o.h / lv)), key = JSON.stringify(o.look);
    for (let i = Math.floor(o.i); i < o.i + o.w / 2; i++) for (let j = Math.floor(o.j); j < o.j + o.d / 2; j++) cells.set(cellKey(i, j), { i, j, n, look: o.look, key });
  }
  return cells;
}
/* Greedy: from each free cell, the longest run along i, then as many rows along j as match it whole. */
function terrainRects(cells) {
  const list = [...cells.values()].sort((p, q) => p.j - q.j || p.i - q.i), used = new Set(), out = [];
  const same = (c, i, j) => { const q = cells.get(cellKey(i, j)); return !!q && q.n === c.n && q.key === c.key && !used.has(cellKey(i, j)); };
  for (const c of list) {
    if (used.has(cellKey(c.i, c.j))) continue;
    let w = 1, d = 1;
    while (w < TER_RUN && same(c, c.i + w, c.j)) w++;
    for (let whole = true; d < TER_RUN && whole; d += whole ? 1 : 0) for (let k = 0; k < w && whole; k++) whole = same(c, c.i + k, c.j + d);
    for (let e = 0; e < d; e++) for (let k = 0; k < w; k++) used.add(cellKey(c.i + k, c.j + e));
    out.push({ i: c.i, j: c.j, w, d, n: c.n, look: c.look });
  }
  return out;
}
/* A cell with exactly one taller side, one level taller, slopes up to it. A corner would need a shape the ramp does not have, so it stays a cliff. */
function terrainRamps(cells) {
  const at = (i, j) => { const c = cells.get(cellKey(i, j)); return c ? c.n : 0; }, seen = new Set(), out = [];
  for (const c of cells.values()) for (let f = 0; f < 4; f++) {
    const i = c.i + FRONTS[f][0], j = c.j + FRONTS[f][1], k = cellKey(i, j), n = at(i, j);   // the cell in front of a high one, on its low side
    if (seen.has(k) || c.n !== n + 1) continue;
    seen.add(k);
    const up = FRONTS.map(d => at(i + d[0], j + d[1]) - n);
    if (up.filter(v => v > 0).length === 1) out.push({ i, j, n, facing: f, look: c.look, key: c.key, len: 1 });
  }
  return mergeRamps(out);
}
/* Side by side, a row of ramps is one ramp: separate ones would each show a side wall across the slope. */
function mergeRamps(list) {
  const along = r => r.facing % 2 ? r.i : r.j, line = r => r.facing % 2 ? r.j : r.i, out = [];
  list.sort((p, q) => p.facing - q.facing || p.n - q.n || line(p) - line(q) || along(p) - along(q) || (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
  for (const r of list) { const e = out[out.length - 1]; if (e && e.facing === r.facing && e.n === r.n && e.key === r.key && line(e) === line(r) && along(e) + e.len === along(r) && e.len < TER_RUN) e.len++; else out.push(r); }
  return out;
}
/* The records for a set of cells. Anything else on the layer stays. A detail left without a parent stands free where it was, or goes if it was on a wall. */
function terrainNext(L, cells) {
  const lv = levelPx(), sig = o => [o.type, o.i, o.j, o.z, o.w, o.d, o.h, o.facing, JSON.stringify(o.look)].join(), old = new Map(L.objects.filter(o => o.terrain).map(o => [sig(o), o]));
  const made = (f, look) => { const n = objNew(Object.assign({ outline: 'none', shadow: true, look }, f)), hit = old.get(sig(n)); if (hit) return hit; n.id = objSeq++; return n; };
  const fresh = terrainRects(cells).map(r => { const h = r.n * lv; return made({ type: h <= 8 ? 'slab' : 'box', i: r.i, j: r.j, w: 2 * r.w, d: 2 * r.d, h, terrain: true }, r.look); });
  if (S.terSlopes) for (const r of terrainRamps(cells)) fresh.push(made({ type: 'ramp', i: r.i, j: r.j, z: r.n * lv, w: r.facing % 2 ? 2 * r.len : 2, d: r.facing % 2 ? 2 : 2 * r.len, h: lv, facing: r.facing, params: { slope: 1 }, terrain: 'ramp' }, r.look));
  const ids = new Set(fresh.map(o => o.id)), keep = [];
  for (const o of L.objects) {
    if (o.terrain) { if (!ids.has(o.id)) continue; }
    else if (o.parent && !L.objects.some(p => p.id === o.parent && (!p.terrain || ids.has(p.id)))) {
      if (typeof o.face === 'number') continue;
      const q = Object.assign({}, o); for (const k of ['parent', 'face', 'u', 'v', 'fit']) delete q[k]; q.i = Math.round(q.i); q.j = Math.round(q.j); keep.push(q); continue;
    }
    if (!o.terrain) keep.push(o);
  }
  return { next: keep.concat(fresh), fresh };
}
function terrainCommit(L, cells) {
  const { next, fresh } = terrainNext(L, cells), had = new Set(L.objects), changed = fresh.filter(o => !had.has(o));
  if (next.length === L.objects.length && !changed.length) return;
  objCommit(L, next, changed); syncTerrain();
  const n = next.filter(o => o.terrain).length; if (n > TER_BUDGET) toast('This terrain takes ' + n + ' boxes, over the ' + TER_BUDGET + ' it should keep to. Larger flat areas merge better.');
}
const terrainLevel = (n, n0) => Math.max(0, Math.min(TER_MAX, S.terMode === 'raise' ? n + 1 : S.terMode === 'lower' ? n - 1 : n0));

/* ---------- brush ---------- */
/* The brush at a cell, and under symmetry at its mirrored cells. Cells mirror the way objects do. */
function brushCells(c) {
  const b = brushBox(c.i, c.j, S.terBrush), out = [];
  for (let j = b.y0; j <= b.y1; j++) for (let i = b.x0; i <= b.x1; i++) {
    const q = { type: 'box', i, j, w: 2, d: 2, facing: 0 };
    out.push(q, ...objTwins(q));
  }
  return out;
}
const terrainSpot = a => { const L = terrainLayer(), s = surfaceUnder(a.x, a.y, null, L || activeLayer()); return !L ? { z: 0, cell: tileCell(a.x, a.y) } : surfaceCell(s.o && s.o.terrain ? s : { o: null, z: 0 }, a.x, a.y); };
/* Flat, at the height each cell will take. */
function terrainGhost(d, list) {
  const base = objNew({ type: 'slab', h: 1, outline: 'none', look: lookFrom(S.color) }), lv = levelPx();
  const recs = list.map(q => { const c = d.cells.get(cellKey(q.i, q.j)); return Object.assign({}, base, { i: q.i, j: q.j, w: 2, d: 2, z: (c ? terrainLevel(c.n, d.n0) : terrainLevel(0, d.n0)) * lv }); });
  pvAdd(plot => objsP(recs, plot));
  /* The flat ghost shows the top, but the walls below it reach the ground, so the box does too. */
  const walls = recs.filter(r => r.z).map(r => Object.assign({}, r, { h: r.z, z: 0 })); if (walls.length) d.box = joinBox(d.box, artBox(walls));
  d.list = (d.list || []).concat(list);
  fitNote(d.box, 'Terrain', { again: () => { const all = d.list; pvClear(); d.list = []; d.box = null; terrainGhost(d, all); } });
}
function terrainAim(cells, cell, n0) { const c = cells.get(cellKey(cell.i, cell.j)); TR.spot = { cell, h: terrainLevel(c ? c.n : 0, n0) * levelPx() }; }
function terrainPaint(d, c) {
  terrainAim(d.cells, c, d.n0);
  const list = brushCells(c).filter(q => !d.seen.has(cellKey(q.i, q.j))); if (!list.length) return;
  for (const q of list) d.seen.add(cellKey(q.i, q.j));
  terrainGhost(d, list);
}
function terrainStart(a) {
  const L = terrainLayer(); if (L && !canTouch(L)) return false;
  const s = terrainSpot(a), cells = terrainCells(L), c = cells.get(cellKey(s.cell.i, s.cell.j));
  pvClear(); TR.ghost = null; TR.drag = { cells, n0: c ? c.n : 0, z: s.z, seen: new Set() };
  terrainPaint(TR.drag, s.cell); return true;
}
function terrainMove(a) { const d = TR.drag; if (d) terrainPaint(d, tileCell(a.x, a.y + d.z)); }
function terrainHover(a) {
  const s = terrainSpot(a), k = [s.cell.i, s.cell.j, s.z, S.terBrush, S.terMode].join(); if (k === TR.ghost && pvShown()) return;
  TR.ghost = k; pvClear();
  const cells = terrainCells(terrainLayer()), c = cells.get(cellKey(s.cell.i, s.cell.j)), n0 = c ? c.n : 0; terrainAim(cells, s.cell, n0); terrainGhost({ cells, n0 }, brushCells(s.cell));
}
function terrainEnd() {
  const d = TR.drag; TR.drag = null; if (!d) { pvClear(); return; }
  fitGate(d.box, 'Terrain', b => fitShift(b, 2), q => terrainFinish(d, q));
}
function terrainFinish(d, q) {
  pvClear();
  if (q) d.seen = new Set([...d.seen].map(k => { const [i, j] = k.split(',').map(Number); return cellKey(i + q.a / 2, j + q.b / 2); }));
  const look = terrainLook(), key = JSON.stringify(look); let L = terrainLayer();
  if (!L) {   // at the bottom, so everything else stands on it
    L = makeLayer('Terrain'); objLayerInit(L); L.kind = 'terrain';
    pushHistory(layerListEntry([L, ...S.layers]));
  }
  for (const k of d.seen) {
    const [i, j] = k.split(',').map(Number), c = d.cells.get(k), n = terrainLevel(c ? c.n : 0, d.n0);
    if (n) d.cells.set(k, { i, j, n, look, key }); else d.cells.delete(k);
  }
  terrainCommit(L, d.cells);
}

/* ---------- panel ---------- */
function syncTerrain() {
  document.querySelectorAll('[data-ter-mode]').forEach(b => press(b, b.dataset.terMode === S.terMode));
  document.querySelectorAll('[data-ter-brush]').forEach(b => press(b, +b.dataset.terBrush === S.terBrush));
  document.querySelectorAll('[data-ter-side]').forEach(b => press(b, b.dataset.terSide === S.terSide));
  press($('terSlopes'), S.terSlopes);
  const L = terrainLayer(), n = L ? L.objects.filter(o => o.terrain).length : 0; $('terCount').textContent = n + (n === 1 ? ' box' : ' boxes');
  renderMat($('terMat'), 'box', terrainLook(), patch => { S.terMat = Object.assign({}, S.terMat, patch); syncTerrain(); });
}
function initTerrain() {
  document.querySelectorAll('[data-ter-mode]').forEach(b => { b.onclick = () => { S.terMode = b.dataset.terMode; syncTerrain(); }; });
  document.querySelectorAll('[data-ter-brush]').forEach(b => { b.onclick = () => { S.terBrush = +b.dataset.terBrush; syncTerrain(); }; });
  document.querySelectorAll('[data-ter-side]').forEach(b => { b.onclick = () => { S.terSide = b.dataset.terSide; syncTerrain(); }; });
  $('terSlopes').onclick = () => { S.terSlopes = !S.terSlopes; const L = terrainLayer(); if (L && canTouch(L)) terrainCommit(L, terrainCells(L)); syncTerrain(); };
}

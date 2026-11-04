'use strict';
/* qtiles characters: the pivot, mirrored facings, the tracing ghost, onion skin, animations and sprite sheets.
   A pivot sits on a pixel corner, not on a pixel. A tile is symmetric about the line between two pixel columns, so its center is a corner,
   and only then does mirroring around the pivot keep a character on its tile, and a sprite drawn at a tile center minus its pivot land exactly. */

const CHAR_MSG = 'A pivot belongs to a Character layer. Tap the layer\'s type tag to change it.', GHOST_MSG = 'This layer is the ghost. Clear the ghost to work on it.';
const GHOST_OPACITY = 0.3, TINT_STRENGTH = 0.6, FRAME_MS = 100, ANIM_PV_W = 240, ANIM_PV_H = 160;
const CH = { drag: null, play: null, tints: [], cell: null, cols: 0, pad: 0, solid: false, scale: 1, sheetScale: 1, frame: null };
const isChar = L => L.kind === 'character';

/* ---------- pivot ---------- */
function cleanPivot(p) { return p && Number.isInteger(p.x) && Number.isInteger(p.y) ? { x: p.x, y: p.y } : undefined; }
function cellCenter(x, y) {
  if (S.mode !== 'iso') { const c = S.cell; const m = c >> 1; return { x: Math.floor(x / c) * c + m, y: Math.floor(y / c) * c + m }; }   // a pivot sits on a pixel corner, so an odd cell's center rounds
  const t = tileCell(x, y), p = cellCorner(t.i, t.j); return { x: p.x, y: p.y + S.tile / 4 };
}
const cellStep = () => S.mode === 'iso' ? { x: S.tile, y: S.tile / 2 } : { x: S.cell, y: S.cell };
function pivotPut(id, p) { const L = layerById(id); if (L) L.pivot = p; charSync(); requestRender(); }
function pivotChange(L, from, to) {
  const id = L.id; pivotPut(id, to);
  pushHistory({ undo: () => pivotPut(id, from), redo: () => pivotPut(id, to) });
}
/* Joins a pivot move to the undo step of the pixels that moved with it. */
function pivotWrap(e, L, to) {
  const id = L.id, from = L.pivot, u = e.undo, r = e.redo; L.pivot = to;
  e.undo = () => { u(); pivotPut(id, from); }; e.redo = () => { r(); pivotPut(id, to); };
}
/* Where each transform puts a pivot on a float of w x h. Corners map as whole coordinates, so a flip is w - x, not w - 1 - x. */
const PIVOT_OPS = {
  flipH: (p, w) => ({ x: w - p.x, y: p.y }), flipV: (p, w, h) => ({ x: p.x, y: h - p.y }), rot180: (p, w, h) => ({ x: w - p.x, y: h - p.y }),
  rot90: (p, w, h) => ({ x: h - p.y, y: p.x }), rot270: (p, w) => ({ x: p.y, y: w - p.x })
};
/* The pivot a float lands by: a whole layer's under Place on tile, or a stamp's (047) in Iso, and in 2D with Snap = Cell, where its feet stand on a cell's bottom edge. */
const floatPin = f => f.pv && f.L.onTile ? f.pv : f.st && f.st.pv && (S.mode === 'iso' || cellBrush()) ? f.st.pv : null;
function floatSnap() {
  const f = FL, p = f && floatPin(f); if (!p) return;
  const x = f.x + p.x, y = f.y + p.y, c = cellCenter(x, y), feet = p !== f.pv && S.mode !== 'iso';
  f.x = c.x - p.x; f.y = (feet ? Math.round(y / S.cell) * S.cell : c.y) - p.y;
}
function pivotStart(a) {
  commitFloat(); const L = activeLayer();
  if (S.pivotMode === 'move') {
    if (!liftWhole()) return false;
    CH.drag = { kind: 'move', ax: a.x, ay: a.y, x: FL.x, y: FL.y }; return true;
  }
  if (!isChar(L)) { toast(CHAR_MSG); return false; }
  if (!canTouch(L)) return false;
  CH.drag = { kind: 'set', id: L.id, from: L.pivot }; pivotMove(a); return true;
}
function pivotMove(a) {
  const d = CH.drag; if (!d) return;
  if (d.kind === 'set') layerById(d.id).pivot = { x: Math.max(0, Math.min(S.w, a.x)), y: Math.max(0, Math.min(S.h, a.y)) };
  else if (FL) { FL.x = d.x + a.x - d.ax; FL.y = d.y + a.y - d.ay; FL.moved = true; floatSnap(); }
  requestRender();
}
function pivotEnd() {
  const d = CH.drag; CH.drag = null; if (!d) return;
  if (d.kind === 'move') { if (FL) endWhole(); return; }
  const L = layerById(d.id), to = L.pivot;
  if (!d.from || d.from.x !== to.x || d.from.y !== to.y) pivotChange(L, d.from, to);
}
function pivotAbort() {
  const d = CH.drag; CH.drag = null; if (!d) return;
  if (d.kind === 'move') cancelFloat(); else layerById(d.id).pivot = d.from;
}
function pivotSnap() {
  const L = activeLayer(); if (!L.pivot || !canTouch(L)) return;
  const c = cellCenter(L.pivot.x, L.pivot.y);
  if (c.x !== L.pivot.x || c.y !== L.pivot.y) pivotChange(L, L.pivot, c);
}
function pivotMark(c, x, y, z) {
  const L = activeLayer(); if (!L || !L.pivot || !isChar(L)) return;
  const p = FL && FL.pv && FL.L === L ? { x: FL.x + FL.pv.x, y: FL.y + FL.pv.y } : L.pivot, sx = x + p.x * z, sy = y + p.y * z, r = Math.max(7, 2 * z);
  const at = (a, b) => [x + a * z, y + b * z]; let corners;
  if (S.mode === 'iso') { const t = tileCell(p.x, p.y); corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => { const q = cellCorner(t.i + u, t.j + v); return at(q.x, q.y); }); }
  else { const n = cellCenter(p.x, p.y), a = S.cell >> 1, b = S.cell - a; corners = [[-a, -a], [b, -a], [b, b], [-a, b]].map(([u, v]) => at(n.x + u, n.y + v)); }
  c.beginPath(); corners.forEach((q, k) => { if (k) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath();
  c.moveTo(sx - r, sy); c.lineTo(sx + r, sy); c.moveTo(sx, sy - r); c.lineTo(sx, sy + r);
  c.strokeStyle = TH.panel; c.lineWidth = 3; c.stroke(); c.strokeStyle = TH.accent; c.lineWidth = 1.5; c.stroke();
}

/* ---------- mirrored facings ---------- */
const mirrorSrc = L => (L.mirrorOf && layerById(L.mirrorOf)) || null;
const mirrorsOf = L => S.layers.filter(x => x.mirrorOf === L.id);
/* x maps to ax - x. A twin that was moved keeps its place, because its own pivot is one end of the flip. Without any pivot the art turns about its own middle, which is the same flip both ways. */
function mirrorMap(src, twin) {
  const sp = src.pivot || (twin && twin.pivot), tp = (twin && twin.pivot) || sp;
  if (sp) return { ax: sp.x + tp.x - 1, dy: tp.y - sp.y };
  const b = contentBox(src); return b ? { ax: b.x0 + b.x1, dy: 0 } : null;
}
function mirrorPx(src, t) {
  const out = new Uint32Array(S.w * S.h);
  for (let y = 0, i = 0; y < S.h; y++) for (let x = 0; x < S.w; x++, i++) {
    const sx = t.ax - x, sy = y - t.dy;
    if (sx >= 0 && sy >= 0 && sx < S.w && sy < S.h) out[i] = src[sy * S.w + sx];
  }
  return out;
}
/* A flip around a pivot near the edge lands past it, and a clipped twin could not flip back. */
function mirrorFit(src, twin) {
  const b = contentBox(src), t = mirrorMap(src, twin); if (!b) { toast('This layer is empty.'); return false; }
  if (growToInclude(t.ax - b.x1, b.y0 + t.dy, t.ax - b.x0, b.y1 + t.dy, 0)) return true;
  toast('The canvas is at its size limit.'); return false;
}
function layerAbove(A, L) {
  const idx = aboveFamily(A); L.group = A.group; L.kind = A.kind; L.opacity = A.opacity; L.pivot = A.pivot; L.onTile = A.onTile; flush(L); insertLayer(L, idx);
  pushHistory({ bytes: S.w * S.h * 4, undo: () => removeLayer(S.layers.indexOf(L)), redo: () => insertLayer(L, idx) });
  shadowTidy();
}
function mirrorFacing() {
  commitFloat(); const id = activeLayer().id;
  if (activeLayer().live) { toast(LIVE_MSG); return; }
  if (!mirrorFit(activeLayer(), null)) return;
  const A = layerById(id), L = makeLayer(A.name + ' (mirrored)'); L.mirrorOf = id; L.px.set(mirrorPx(A.px, mirrorMap(A, null))); layerAbove(A, L);
  toast('Mirrored. Details on one side, such as a held item, may need fixing by hand.');
}
function mirrorUpdate() {
  commitFloat(); const A = activeLayer(), src = mirrorSrc(A), ids = (src ? [A] : mirrorsOf(A)).map(L => L.id); let done = 0;
  for (const id of ids) {
    const M = layerById(id), from = mirrorSrc(M);
    if (lockedOf(M)) { toast('Could not update ' + M.name + ': it is locked.'); continue; }
    if (!mirrorFit(from, M)) continue;
    const T = layerById(id), F = mirrorSrc(T); bakeLayer(T, mirrorPx(F.px, mirrorMap(F, T))); done++;
  }
  if (done) toast('Mirror updated.');
}
function backView() { commitFloat(); const A = activeLayer(); if (A.live) { toast(LIVE_MSG); return; } layerAbove(A, makeLayer(A.name + ' (back)')); }

/* ---------- ghost and onion skin ---------- */
const ghostLayer = () => S.layers.find(L => L.ghost) || null;
function ghostFrom() {
  commitFloat(); const L = activeLayer();
  if (L.live) { toast(LIVE_MSG); return; }
  if (!S.layers.some(x => x !== L && x.shadowFor !== L.id && x.outlineFor !== L.id)) { toast('Add another layer to draw on first.'); return; }
  objSelect(null); S.layers.forEach(x => { x.ghost = false; }); L.ghost = true; L.solo = false;
  hooks.layers(); requestRender(); setDirty(true);
}
function ghostClear() { S.layers.forEach(x => { x.ghost = false; }); hooks.layers(); requestRender(); setDirty(true); }
/* A ghost is not selectable, so whatever made it active (undo can) hands over to the nearest other layer, and a project left with only the ghost gets it back. */
function ghostGuard() {
  const A = activeLayer(); if (!A || !A.ghost) return;
  const order = S.layers.map((L, k) => k).filter(k => !ghostly(S.layers[k])).sort((a, b) => Math.abs(a - S.active) - Math.abs(b - S.active));
  if (order.length) S.active = order[0]; else A.ghost = false;
}
/* What to draw over the art, in that order. An onion frame lines up on the active frame's pivot, as frames may be drawn in different places. */
function ghostList() {
  const out = [], g = ghostLayer(), A = anim(), L = activeLayer();
  if (g && shownOf(g)) out.push({ L: g, dx: 0, dy: 0, color: TH.ghost });
  const F = S.onion && A ? frameLayers(A) : [], k = F.indexOf(L);
  if (k >= 0) for (const [n, color] of [[k - 1, TH.onionPrev], [k + 1, TH.onionNext]]) {
    const q = F[n]; if (q && !q.ghost) out.push({ L: q, dx: L.pivot && q.pivot ? L.pivot.x - q.pivot.x : 0, dy: L.pivot && q.pivot ? L.pivot.y - q.pivot.y : 0, color });
  }
  return out;
}
/* The tint is kept on a canvas of its own and redrawn only when the layer changes, as a canvas-sized fill on every frame would be felt on a big project. */
function tinted(k, g) {
  const t = CH.tints[k] || (CH.tints[k] = { c: document.createElement('canvas') });
  if (t.L === g.L && t.ver === g.L.ver && t.color === g.color) return t.c;
  const c = t.c; if (c.width !== S.w || c.height !== S.h) { c.width = S.w; c.height = S.h; }
  const x = c.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, S.w, S.h); x.drawImage(boxCanvas(g.L.px, S.w, 0, 0, S.w, S.h), 0, 0);
  x.globalCompositeOperation = 'source-atop'; x.globalAlpha = TINT_STRENGTH; x.fillStyle = g.color; x.fillRect(0, 0, S.w, S.h);
  t.L = g.L; t.ver = g.L.ver; t.color = g.color; return c;
}
function drawGhosts(c, x, y, z) {
  const list = ghostList();
  list.forEach((g, k) => { c.globalAlpha = GHOST_OPACITY; c.drawImage(tinted(k, g), x + g.dx * z, y + g.dy * z, S.w * z, S.h * z); });
  CH.tints.length = list.length;
}

/* ---------- animations ---------- */
const anim = () => S.anims[S.animAt] || null;
const frameLayers = A => A.frames.map(f => layerById(f.id)).filter(Boolean);
const cleanMs = v => Math.max(10, Math.min(10000, Math.round(+v) || FRAME_MS));
function cleanAnims(list) {
  return (Array.isArray(list) ? list : []).filter(a => a && Array.isArray(a.frames)).map((a, k) => ({ name: String(a.name || 'Animation ' + (k + 1)).slice(0, 40), frames: a.frames.filter(f => f && Number.isInteger(f.id)).map(f => ({ id: f.id, ms: cleanMs(f.ms) })) }));
}
/* One ghost, and no link to a layer the file does not have. */
function charLoaded(o) {
  let seen = false;
  for (const L of S.layers) { if (L.ghost && seen) L.ghost = false; seen = seen || L.ghost; if (L.mirrorOf && !layerById(L.mirrorOf)) delete L.mirrorOf; }
  S.anims = cleanAnims(o.animations); S.animAt = 0; S.onion = false;
}
function animPut(list, at) { S.anims = list; S.animAt = Math.max(0, Math.min(at, list.length - 1)); animStop(); charSync(); requestRender(); }
function animApply(list, at = S.animAt) {
  const prev = S.anims, was = S.animAt; animPut(list, at);
  pushHistory({ undo: () => animPut(prev, was), redo: () => animPut(list, at) });
}
const animWith = patch => S.anims.map((a, k) => k === S.animAt ? Object.assign({}, a, patch) : a);
function animNew() {
  const L = activeLayer(); animApply(S.anims.concat({ name: 'Animation ' + (S.anims.length + 1), frames: isChar(L) ? [{ id: L.id, ms: FRAME_MS }] : [] }), S.anims.length);
}
function frameAdd() {
  const A = anim(), L = activeLayer(); if (!A) return;
  if (!isChar(L)) { toast('Only Character layers can be frames. Tap the layer\'s type tag to change it.'); return; }
  if (A.frames.some(f => f.id === L.id)) { toast('This layer is already a frame.'); return; }
  animApply(animWith({ frames: A.frames.concat({ id: L.id, ms: FRAME_MS }) }));
}
function frameMove(k, d) {
  const f = anim().frames.slice(), n = k + d; if (n < 0 || n >= f.length) return;
  [f[k], f[n]] = [f[n], f[k]]; animApply(animWith({ frames: f }));
}
function frameRemove(k) { animApply(animWith({ frames: anim().frames.filter((f, n) => n !== k) })); }
function frameMs(k, v) { const ms = cleanMs(v); if (ms !== anim().frames[k].ms) animApply(animWith({ frames: anim().frames.map((f, n) => n === k ? Object.assign({}, f, { ms }) : f) })); else charSync(); }
/* The copy and its place in the list are one undo step, joined the way commitFloat joins a selection. */
function frameDup(k) {
  const A = anim(), L = layerById(A.frames[k].id); if (!L) return;
  if (L.ghost) { toast(GHOST_MSG); return; }
  commitFloat(); S.active = S.layers.indexOf(L); dupLayer();
  const C = activeLayer(), e = H.stack[H.pos - 1], u = e.undo, r = e.redo, prev = S.anims, was = S.animAt, f = A.frames.slice(); f.splice(k + 1, 0, { id: C.id, ms: A.frames[k].ms });
  const next = animWith({ frames: f }); animPut(next, was);
  e.undo = () => { animPut(prev, was); u(); }; e.redo = () => { r(); animPut(next, was); };
  frameShow(C);
}
/* Frames are layers stacked on one canvas, so looking at one means hiding the rest. */
function frameShow(L) {
  if (L.ghost) { toast(GHOST_MSG); return; }
  commitFloat();
  for (const F of frameLayers(anim())) { F.visible = F === L; for (const x of linkedLayers(F)) x.visible = F === L; }
  S.active = S.layers.indexOf(L); hooks.layers(); requestRender(); setDirty(true);
}
function animStop() {
  if (!CH.play) return; clearTimeout(CH.play.timer); CH.play = null;
  $('animPv').hidden = true; $('animPlay').textContent = 'Play'; press($('animPlay'), false);
}
function animTick() {
  const P = CH.play, c = P.cell, f = c.list[P.k], x = $('animPv').getContext('2d'), s = P.s; x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.w * s, c.h * s);
  if (f.box) { const b = f.box, w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1; x.drawImage(boxCanvas(f.L.px, S.w, b.x0, b.y0, w, h), 0, 0, w, h, (c.ax - f.p.x + b.x0) * s, (c.ay - f.p.y + b.y0) * s, w * s, h * s); }
  P.timer = setTimeout(() => { P.k = (P.k + 1) % c.list.length; animTick(); }, f.ms);
}
function animPlay() {
  if (CH.play) { animStop(); return; }
  const A = anim(), cell = A && sheetCell(A.frames); if (!cell) { toast('The frames are empty.'); return; }
  const s = Math.max(1, Math.min(8, Math.floor(Math.min(ANIM_PV_W / cell.w, ANIM_PV_H / cell.h)))), cv = $('animPv'); cv.width = cell.w * s; cv.height = cell.h * s; cv.hidden = false;
  CH.play = { cell, s, k: 0, timer: 0 }; $('animPlay').textContent = 'Stop'; press($('animPlay'), true); animTick();
}

/* ---------- sprite sheet ---------- */
/* The cell is the union of the frames' boxes once their pivots line up, so (ax, ay) is the pivot's place in every cell. A frame with no pivot stands on the bottom middle of its art. The ghost is never exported, even as a frame. */
function sheetCell(frames) {
  const list = frames.map(f => {
    const L = layerById(f.id), box = L && contentBox(L);
    return L && !L.ghost && { L, ms: f.ms, box, p: L.pivot || (box && { x: (box.x0 + box.x1 + 1) >> 1, y: box.y1 + 1 }) };
  }).filter(Boolean);
  let l = 0, u = 0, r = 0, d = 0;
  for (const f of list) if (f.box) { l = Math.max(l, f.p.x - f.box.x0); r = Math.max(r, f.box.x1 + 1 - f.p.x); u = Math.max(u, f.p.y - f.box.y0); d = Math.max(d, f.box.y1 + 1 - f.p.y); }
  return l + r > 0 && u + d > 0 ? { list, ax: l, ay: u, w: l + r, h: u + d } : null;
}
function sheetGrid(cell, cols, pad) {
  const n = cell.list.length, c = Math.max(1, Math.min(n, cols || n)), rows = Math.ceil(n / c), w = cell.w, h = cell.h;
  return { w: c * w + (c - 1) * pad, h: rows * h + (rows - 1) * pad, cols: c, frames: cell.list.map((f, k) => ({ x: (k % c) * (w + pad), y: Math.floor(k / c) * (h + pad), w, h, pivotX: cell.ax, pivotY: cell.ay, duration: f.ms })) };
}
function sheetPixels(cell, grid, bg) {
  const out = new Uint32Array(grid.w * grid.h).fill(bg);
  cell.list.forEach((f, k) => {
    if (!f.box) return;
    const o = grid.frames[k], dx = o.x + cell.ax - f.p.x, dy = o.y + cell.ay - f.p.y, b = f.box;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) { const v = f.L.px[y * S.w + x]; if (v >>> 24) out[(y + dy) * grid.w + x + dx] = v; }
  });
  return out;
}
const sheetFits = (g, s = 1) => g.w * s <= MAX_DIM && g.h * s <= MAX_DIM && g.w * g.h * s * s <= MAX_PIX;
/* The .json describes the PNG as saved, so every number scales with it. */
const sheetScaled = (g, s) => g.frames.map(f => ({ x: f.x * s, y: f.y * s, w: f.w * s, h: f.h * s, pivotX: f.pivotX * s, pivotY: f.pivotY * s, duration: f.duration }));
const sheetBase = A => safeName() + '-' + (A.name.trim().replace(/[^\w-]+/g, '-').slice(0, 30) || 'sheet');
function sheetOpen() {
  const A = anim(); commitFloat(); closeSheets();
  if (!A) { toast('Make an animation first, in the Animation panel.'); return; }
  CH.cell = sheetCell(A.frames); if (!CH.cell) { toast('The frames are empty.'); return; }
  CH.cols = Math.min(CH.cols || CH.cell.list.length, CH.cell.list.length); $('sprCols').max = CH.cell.list.length; $('sprCols').value = CH.cols; $('sprPad').value = CH.pad;
  sheetNote(); openSheet('sheetSprite');
}
function sheetNote() {
  const c = CH.cell, g = sheetGrid(c, CH.cols, CH.pad), n = c.list.length, ghost = ghostLayer(), skip = ghost && anim().frames.some(f => f.id === ghost.id);
  const s = CH.sheetScale = scaleChips($('sprScales'), CH.sheetScale, g.w, g.h, k => { CH.sheetScale = k; sheetNote(); }), ok = sheetFits(g, s);
  $('sprNote').textContent = n + (n > 1 ? ' frames, ' : ' frame, ') + c.w + ' × ' + c.h + ' px each. Sheet ' + g.w * s + ' × ' + g.h * s + ' px.' + (skip ? ' ' + ghost.name + ' is left out because it is the ghost.' : '') + (ok ? scaleWhy(g.w, g.h) : ' That is larger than the 4096 px limit.');
  $('sprOk').disabled = !ok; press($('sprClear'), !CH.solid); press($('sprSolid'), CH.solid);
}
async function sheetExport() {
  const A = anim(), c = CH.cell, g = sheetGrid(c, CH.cols, CH.pad), s = CH.sheetScale; closeSheets();
  const blob = await pngBlob(sheetPixels(c, g, CH.solid ? packHex(S.color2) : 0), g.w, g.h, s); if (!blob) { toast('Export failed. Try fewer columns or less padding.'); return; }
  const base = sheetBase(A), image = base + '.png';
  if (!await deliver(image, blob)) return;
  const meta = { name: A.name, frames: sheetScaled(g, s), image };
  if (await deliver(base + '.json', new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }))) toast('Sprite sheet exported (' + g.w * s + '×' + g.h * s + ') with its .json.');
}
function frameSheetOpen() {
  commitFloat(); closeSheets(); const b = contentBox(activeLayer()); if (!b) { toast('This layer is empty.'); return; }
  $('frmNote').textContent = activeLayer().name + ', ' + (b.x1 - b.x0 + 1) + ' × ' + (b.y1 - b.y0 + 1) + ' px, cropped to its pixels.'; CH.frame = { w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 }; frameScales(); openSheet('sheetFrame');
}
function frameScales() {
  const f = CH.frame; CH.scale = scaleChips($('frmScales'), CH.scale, f.w, f.h, n => { CH.scale = n; frameScales(); });
  $('frmWhy').textContent = scaleWhy(f.w, f.h).trim(); $('frmWhy').hidden = !$('frmWhy').textContent;
}

/* ---------- panel ---------- */
const FRAME_ICON = {
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>', down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  dup: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M15 9V5.5A1.5 1.5 0 0013.5 4h-8A1.5 1.5 0 004 5.5v8A1.5 1.5 0 005.5 15H9"/></svg>', out: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
function frameRow(f, k, count) {
  const L = layerById(f.id), row = document.createElement('div'), nm = document.createElement('button'), ms = document.createElement('input'), n = k + 1; if (!L) return null;
  row.className = 'frame' + (L === activeLayer() ? ' active' : ''); nm.className = 'frname'; nm.textContent = n + '. ' + L.name; nm.onclick = () => frameShow(L);
  ms.className = 'frms'; ms.type = 'number'; ms.min = 10; ms.max = 10000; ms.step = 10; ms.value = f.ms; ms.setAttribute('aria-label', 'Frame ' + n + ' duration in milliseconds'); ms.onchange = e => frameMs(k, e.target.value);
  const up = iconBtn(FRAME_ICON.up, 'Move frame ' + n + ' up', () => frameMove(k, -1)), down = iconBtn(FRAME_ICON.down, 'Move frame ' + n + ' down', () => frameMove(k, 1));
  up.disabled = k === 0; down.disabled = k === count - 1;
  row.append(nm, ms, up, down, iconBtn(FRAME_ICON.dup, 'Duplicate frame ' + n, () => frameDup(k)), iconBtn(FRAME_ICON.out, 'Take frame ' + n + ' out', () => frameRemove(k))); return row;
}
function animSync() {
  const sel = $('animSel'), A = anim(), box = $('animList'); sel.textContent = '';
  S.anims.forEach((a, k) => { const o = document.createElement('option'); o.value = k; o.textContent = a.name; sel.appendChild(o); });
  if (!A) { const o = document.createElement('option'); o.textContent = 'No animations yet'; sel.appendChild(o); }
  sel.value = A ? S.animAt : sel.value; sel.disabled = !A; $('animBody').hidden = !A; box.textContent = ''; if (!A) return;
  if (document.activeElement !== $('animName')) $('animName').value = A.name;
  A.frames.forEach((f, k) => { const row = frameRow(f, k, A.frames.length); if (row) box.appendChild(row); });
  $('animNone').hidden = A.frames.length > 0;
}
function charSync() {
  const A = activeLayer(); if (!A) return;
  const ch = isChar(A), g = ghostLayer(); $('charOnly').hidden = !ch; $('charNote').hidden = ch;
  $('charPivot').textContent = A.pivot ? A.pivot.x + ', ' + A.pivot.y : 'Not set'; $('charSnap').disabled = !A.pivot; $('charTile').disabled = !A.pivot; press($('charTile'), !!A.onTile);
  $('charUpdate').disabled = !mirrorSrc(A) && !mirrorsOf(A).length; $('ghostClear').disabled = !g; $('ghostRead').textContent = g ? g.name : 'None'; press($('charOnion'), S.onion);
  animSync();
}
function initCharacters() {
  const mode = m => { S.pivotMode = m; press($('pivotSet'), m === 'set'); press($('pivotMove'), m === 'move'); };
  $('pivotSet').onclick = () => mode('set'); $('pivotMove').onclick = () => mode('move'); mode('set');
  $('charSet').onclick = () => { mode('set'); setTool('pivot'); sidePanel(false); };
  $('charSnap').onclick = pivotSnap;
  $('charTile').onclick = () => { const A = activeLayer(); A.onTile = !A.onTile; charSync(); setDirty(true); };
  $('charMirror').onclick = mirrorFacing; $('charUpdate').onclick = mirrorUpdate; $('charBack').onclick = backView;
  $('ghostFrom').onclick = ghostFrom; $('ghostClear').onclick = ghostClear;
  $('charOnion').onclick = () => { S.onion = !S.onion; if (S.onion && !ghostList().length) toast('Onion skin shows when the active layer is a frame with a neighbor.'); charSync(); requestRender(); };
  $('charFrame').onclick = frameSheetOpen; $('fFrame').onclick = frameSheetOpen; $('fSprite').onclick = sheetOpen; $('animSheet').onclick = sheetOpen;
  $('frmOk').onclick = () => { closeSheets(); exportPng(CH.scale, { layerOnly: true, crop: true }); };
  $('sprCols').onchange = e => { CH.cols = Math.max(1, Math.min(CH.cell.list.length, parseInt(e.target.value, 10) || 1)); e.target.value = CH.cols; sheetNote(); };
  $('sprPad').onchange = e => { CH.pad = Math.max(0, Math.min(32, parseInt(e.target.value, 10) || 0)); e.target.value = CH.pad; sheetNote(); };
  $('sprClear').onclick = () => { CH.solid = false; sheetNote(); }; $('sprSolid').onclick = () => { CH.solid = true; sheetNote(); };
  $('sprOk').onclick = sheetExport;
  $('animNew').onclick = animNew; $('animSel').onchange = e => animPut(S.anims, +e.target.value);
  $('animName').onchange = e => { const v = e.target.value.trim(); if (v && v !== anim().name) animApply(animWith({ name: v })); else e.target.value = anim().name; };
  $('animAdd').onclick = frameAdd; $('animPlay').onclick = animPlay;
  $('animDel').onclick = () => { animApply(S.anims.filter((a, k) => k !== S.animAt), S.animAt - 1); };
}

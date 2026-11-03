'use strict';
/* qtiles assemblies: groups of objects that move, turn and mirror as one.
   A record's `group` lists the assemblies it is in, outermost first. There is no table of groups: the records are the truth, so saving, undo and bake need nothing extra.
   A group's origin is the back corner of its members' footprint, worked out when needed. Details carry no group: they follow their parents. */

const ASM_DEPTH = 4, DOUBLE_TAP_MS = 350;
const AS = { path: [], layerId: null, tap: null, L: null, box: null };   // the assemblies being edited inside, outermost first; L holds its members, drawn over the dimmed canvas

/* ---------- units ---------- */
const inPath = o => AS.path.every((id, k) => o.group && o.group[k] === id);
const topOf = (L, o) => o.parent ? L.index.byId.get(o.parent) || o : o;
/* The assembly a record stands for at the level being edited, or null for a lone object. */
const unitKey = o => o.group && o.group.length > AS.path.length ? o.group[AS.path.length] : null;
/* Everything that is selected along with a top-level record. */
function unitIds(L, o) {
  const key = unitKey(o), n = AS.path.length; if (key === null) return [o.id];
  return L.objects.filter(q => !q.parent && q.group && q.group[n] === key && inPath(q)).map(q => q.id);
}
/* The ids of a marquee, grown to whole assemblies. */
function unitsOf(L, ids) { const out = new Set(); for (const id of ids) { const o = L.index.byId.get(id); if (o) unitIds(L, o).forEach(q => out.add(q)); } return [...out]; }
/* True when the list is exactly one whole assembly. */
function asmUnit(L, list) {
  const key = list.length ? unitKey(list[0]) : null; if (key === null || !list.every(o => unitKey(o) === key)) return false;
  return unitIds(L, list[0]).length === list.length;
}
const asmSpan = tops => ({ a0: Math.min(...tops.map(o => 2 * o.i)), b0: Math.min(...tops.map(o => 2 * o.j)), a1: Math.max(...tops.map(o => 2 * o.i + o.w)), b1: Math.max(...tops.map(o => 2 * o.j + o.d)) });
/* New ids throughout, so a copy shares nothing with what it came from. The first `keep` levels of a group path stay: a copy made inside an assembly stays in it. */
function asmCopy(list, alloc, keep = 0) {
  const ids = new Map(), gs = new Map(), id = v => { if (!ids.has(v)) ids.set(v, alloc()); return ids.get(v); }, gid = v => { if (!gs.has(v)) gs.set(v, alloc()); return gs.get(v); };
  return list.map(q => {
    const n = Object.assign({}, q, { id: id(q.id) });
    if (q.parent !== undefined) n.parent = id(q.parent);
    if (q.group) n.group = q.group.map((g, k) => k < keep ? g : gid(g));
    if (q.lib) n.lib = Object.assign({}, q.lib, { g: gid(q.lib.g) });
    return n;
  });
}

/* ---------- pose ---------- */
/* One flip or quarter turn of a member, in half tiles from the back corner of a box W x D. A true turn always swaps the footprint, unlike objTurn, whose shapes turn on the spot. */
function detailFlip(q, o, facing) {
  if (q.face === 'top') return Object.assign({}, q, { u: q.v, v: q.u, w: q.d, d: q.w, facing: q.facing ^ 1 });
  const world = (q.face + o.facing) % 4;
  return Object.assign({}, q, { face: ((world ^ 1) - facing + 4) % 4, u: wallOf(o, world).len - shapeOf(q).span(q).len - q.u });
}
function poseFlip(c) {
  const o = c.o, g = shapeOf(o), facing = o.facing ^ 1, n = Object.assign({}, o, { w: o.d, d: o.w, facing });
  c.kids = c.kids.map(q => detailFlip(q, o, facing)); c.o = g.mirror ? g.mirror(n) : n; [c.a, c.b, c.W, c.D] = [c.b, c.a, c.D, c.W];
}
function poseTurn(c) {
  const o = c.o; c.kids = c.kids.map(q => detailSpin(q, o, 1));
  c.o = Object.assign({}, o, { w: o.d, d: o.w, facing: (o.facing + 1) % 4 }); [c.a, c.b, c.W, c.D] = [c.D - c.b - o.d, c.a, c.D, c.W];
}
/* Flips across the line from the back corner to the front, which is a mirror on screen, then turns. A library link keeps count, so an update comes back the same way round. */
function asmPose(list, pose, to) {
  const tops = list.filter(q => !q.parent), U = asmSpan(tops), A = to ? to.a : U.a0, B = to ? to.b : U.b0, dz = to ? to.z : 0, kids = new Map(), out = [];
  for (const q of list) if (q.parent) { if (!kids.has(q.parent)) kids.set(q.parent, []); kids.get(q.parent).push(q); }
  const turn = (pose.turn % 4 + 4) % 4;
  for (const o of tops) {
    const c = { o, a: 2 * o.i - U.a0, b: 2 * o.j - U.b0, W: U.a1 - U.a0, D: U.b1 - U.b0, kids: kids.get(o.id) || [] };
    if (pose.flip) poseFlip(c);
    for (let k = 0; k < turn; k++) poseTurn(c);
    const n = Object.assign({}, c.o, { i: (A + c.a) / 2, j: (B + c.b) / 2, z: o.z + dz });
    if (o.lib) n.lib = Object.assign({}, o.lib, pose.flip ? { turn: (turn - o.lib.turn + 4) % 4, flip: !o.lib.flip } : { turn: (o.lib.turn + turn) % 4 });
    out.push(n); for (const q of c.kids) out.push(detailFit(q, n));
  }
  return out;
}
/* The mirrored copies of a whole set under symmetry. Its footprint mirrors the way one object's does, and the set takes the matching pose inside it. Records at the same spot are dropped, as objTwins does. */
function asmTwins(list, alloc) {
  const U = asmSpan(list.filter(q => !q.parent)), out = [], key = q => [q.i, q.j, q.w, q.d].join(), box = { type: 'box', i: U.a0 / 2, j: U.b0 / 2, w: U.a1 - U.a0, d: U.b1 - U.b0, facing: 0, params: {} }, seen = new Set([key(box)]);
  for (const [mx, my] of [[S.mirrorX, false], [false, S.mirrorY], [S.mirrorX, S.mirrorY]]) {
    if (!mx && !my) continue;
    const t = objMirror(box, mx, my); if (seen.has(key(t))) continue;
    seen.add(key(t)); out.push(...asmCopy(asmPose(list, { flip: mx !== my, turn: my ? 2 : 0 }, { a: 2 * t.i, b: 2 * t.j, z: 0 }), alloc));
  }
  return out;
}

/* ---------- edits ---------- */
const asmSet = () => objSet().filter(o => !o.parent);
function asmMake() {
  const L = activeLayer(), set = asmSet(), n = AS.path.length; if (set.length < 2 || !canTouch(L)) return;
  if (set.some(o => o.terrain)) { toast('Terrain stays out of assemblies: a stroke rebuilds its boxes.'); return; }
  if (set.some(o => (o.group ? o.group.length : 0) >= ASM_DEPTH)) { toast('Assemblies nest ' + ASM_DEPTH + ' deep at most.'); return; }
  const g = objSeq++; objPatchSet(L, set, o => { const p = o.group || []; return { group: p.slice(0, n).concat(g, p.slice(n)) }; });
}
/* Takes away one level, so what was inside an assembly stays together. A library link goes with the assembly it named. */
function asmExplode() {
  const L = activeLayer(), set = asmSet(), n = AS.path.length; if (!set.length || !canTouch(L)) return;
  objPatchSet(L, set, o => {
    const key = unitKey(o), p = o.group || [], rest = p.slice(0, n).concat(p.slice(n + 1));
    return { group: rest.length ? rest : undefined, lib: o.lib && o.lib.g === key ? undefined : o.lib };
  });
}
function asmApply(pose) {
  const L = activeLayer(), set = asmSet(); if (!set.length || !canTouch(L)) return;
  const ids = new Set(set.map(o => o.id)), posed = asmPose(L.objects.filter(q => ids.has(q.id) || ids.has(q.parent)), pose), by = new Map(posed.map(q => [q.id, q]));
  objCommit(L, L.objects.map(q => by.get(q.id) || q), posed);
}
const asmTurn = by => asmApply({ turn: by, flip: false }), asmFlip = () => asmApply({ turn: 0, flip: true });

/* ---------- inside an assembly ---------- */
/* A second tap on the same record soon after the first. A finger has no double-click, so this counts taps itself. */
function asmDoubleTap(o) {
  const now = performance.now(), t = AS.tap; AS.tap = { id: o.id, t: now };
  if (!t || t.id !== o.id || now - t.t > DOUBLE_TAP_MS || unitKey(o) === null) return false;
  AS.tap = null; return true;
}
function asmEnter(L, o) {
  const key = unitKey(o); if (key === null) return;
  AS.path = o.group.slice(0, AS.path.length + 1); AS.layerId = L.id;
  objSelectMany(unitIds(L, o));
}
function asmExit() { if (!AS.path.length) return; AS.path = []; AS.layerId = null; objSelect(null); asmSync(); requestRender(); }
/* Draws the members alone, for showing above the dimmed canvas. They come from their records, so whatever stands in front of them does not hide them. */
function asmFocus(L) {
  if (!AS.L || AS.L.w !== S.w || AS.L.h !== S.h) { AS.L = canvasLayer('focus'); AS.box = null; }
  const P = AS.L, W = S.w, old = AS.box; let b = null;
  if (old) for (let y = old.y0; y <= old.y1; y++) P.px.fill(0, y * W + old.x0, y * W + old.x1 + 1);
  const list = L.objects.filter(q => inPath(topOf(L, q)));
  objsP(objOrder(list), (x, y, v) => { P.px[y * W + x] = v; });
  for (const o of list) b = joinBox(b, objPixelBox(o));
  b = b && { x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(W - 1, b.x1), y1: Math.min(S.h - 1, b.y1) };
  AS.box = b; const u = old && b ? joinBox(old, b) : old || b;
  if (u && u.x1 >= u.x0 && u.y1 >= u.y0) flush(P, u.x0, u.y0, u.x1 - u.x0 + 1, u.y1 - u.y0 + 1);
}
/* Undo, a layer switch or a delete can take away what was being edited inside. */
function asmSync() {
  const L = AS.path.length ? layerById(AS.layerId) : null, on = !!L && L === activeLayer() && !!L.objectLayer && L.objects.some(inPath);
  if (AS.path.length && !on) { AS.path = []; AS.layerId = null; }
  $('asmBar').hidden = !on; if (on) asmFocus(L);
}
function asmDim(c, x, y, z) {
  if (!AS.path.length || !AS.L) return;
  c.globalAlpha = 0.65; c.fillStyle = TH.stage; c.fillRect(x, y, S.w * z, S.h * z); c.globalAlpha = 1;
  c.imageSmoothingEnabled = false; c.drawImage(AS.L.canvas, x, y, S.w * z, S.h * z);
}

/* ---------- panel ---------- */
function asmFill(o, set) {
  const L = activeLayer(), tops = set.filter(q => !q.parent), one = asmUnit(L, tops), many = tops.length > 1, link = !o.parent && o.lib ? libFind(o.lib.id) : null;
  $('asmRow').hidden = !!o.parent && !many; $('objMulti').hidden = !many || one;
  $('asmMake').hidden = !many || one; $('asmExplode').hidden = $('asmIn').hidden = !one;
  for (const id of ['asmTurnL', 'asmTurnR', 'asmFlip']) $(id).hidden = !many;
  $('libPush').hidden = !(link && link.mine && (one || !many)); $('libAll').hidden = !(link && (one || !many));
  if (one) { $('objTitle').textContent = link ? link.name : 'Assembly'; $('objLevels').textContent = tops.length + ' objects move, turn and mirror as one. Double-tap or use Edit inside to change a part.'; }
}
function initAssembly() {
  $('asmMake').onclick = asmMake; $('asmExplode').onclick = asmExplode;
  $('asmIn').onclick = () => { const L = activeLayer(), o = asmSet()[0]; if (o) asmEnter(L, o); };
  $('asmDone').onclick = asmExit;
  $('asmTurnL').onclick = () => asmTurn(-1); $('asmTurnR').onclick = () => asmTurn(1); $('asmFlip').onclick = asmFlip;
}

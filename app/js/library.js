'use strict';
/* qtiles library: built-in assemblies from app/library/*.js and the artist's own, kept in the project.
   An item is a list of records in local coordinates, from the back corner of its footprint. It says which tile and level size it was drawn at, so heights scale to the project.
   The looks hold ramp names, so an item needs no palette of its own. An instance keeps a link (`lib`) on its top-level records: item id, instance id, and the pose it was placed in. */

const LIB_CATS = ['Buildings', 'Nature', 'Props', 'Vehicles', 'Terrain', 'Mine'], LIB_FORMAT = 'qtiles-lib', OLD_LIB_FORMAT = 'isopic-lib', LIB_THUMB = 48;
const libLike = o => !!o && (o.app === LIB_FORMAT || o.app === OLD_LIB_FORMAT);
const LIB_BUILT = [];   // the raw items: the data files after this one in the script list add to it
const LIB = { built: [], cat: 'All', q: '', save: null };

/* ---------- items ---------- */
const libItems = () => LIB.built.concat(S.library);
const libFind = id => libItems().find(x => x.id === id) || null;
const libPicked = () => S.libPick ? libFind(S.libPick) : null;
function cleanItem(x, mine) {
  if (!x || !Array.isArray(x.items) || !x.items.length) return null;
  const tile = x.tile >= 8 && x.tile <= 256 ? x.tile : 32, items = cleanObjects(x.items).map(q => { const n = Object.assign({}, q); delete n.lib; return n; });
  return items.length ? { id: String(x.id || 'mine-' + Date.now().toString(36)), name: String(x.name || 'Item').slice(0, 40), category: LIB_CATS.includes(x.category) ? x.category : 'Mine', mine: !!mine, tile, level: x.level > 0 ? x.level : tile / 2, items } : null;
}
const cleanLibrary = list => (Array.isArray(list) ? list : []).map(x => cleanItem(x, true)).filter(Boolean);
/* The ramp by name, or the nearest ramp to the color it had, so an item drawn on one palette looks right on another. */
function libRamp(k) {
  const named = paletteRamps().find(r => r.name === k.ramp && !isLoose(r));
  if (named) { const base = Math.min(k.base | 0, named.colors.length - 1); return Object.assign({}, k, { base, color: named.colors[base] }); }
  const near = nearestOnRamp(k.color); return near ? Object.assign({}, k, { ramp: near.ramp.name, base: near.index, color: near.ramp.colors[near.index] }) : k;
}
function libLook(k) {
  const n = libRamp(k);
  if (k.accent) n.accent = libRamp(k.accent);
  if (k.side) n.side = libRamp(k.side);
  return n;
}
/* A new set of records from an item, placed with its back corner at (at.a, at.b) in half tiles and its base at at.z. opt.path puts it inside an assembly, and opt.g reuses an instance id. */
function libInstance(item, at, pose, opt = {}) {
  const alloc = opt.alloc || (() => objSeq++), level = levelPx() / item.level, tile = S.tile / item.tile;
  const local = item.items.map(q => {
    const n = Object.assign({}, q, { look: libLook(q.look) });
    if (q.parent !== undefined) { if (typeof q.face === 'number') { n.u = snap2(q.u * tile); n.v = snap2(q.v * tile); } return n; }
    n.z = Math.round(q.z * level); n.h = Math.max(1, Math.round(q.h * level));
    const g = shapeOf(n); if (g.rescale && (tile !== 1 || level !== 1)) n.params = g.rescale(n, tile, level);
    return shapeFit(n, {});
  });
  const list = asmCopy(local, alloc), tops = list.filter(q => !q.parent), g = opt.g !== undefined ? opt.g : alloc(), path = opt.path || [];
  for (const o of tops) {
    const p = path.concat(tops.length > 1 ? [g] : [], o.group || []);
    if (p.length) o.group = p; else delete o.group;
    if (item.id) o.lib = { id: item.id, g, turn: 0, flip: false };
  }
  return asmPose(list, pose, at);
}
/* The footprint and height an item takes up unturned. A long one runs along its longer axis; a path uses that. */
function libSize(item) {
  const tops = item.items.filter(q => !q.parent), U = asmSpan(tops), level = levelPx() / item.level;
  return { W: U.a1 - U.a0, D: U.b1 - U.b0, H: Math.max(...tops.map(o => Math.round((o.z + o.h) * level))) };
}
/* Local copies of a selection. A selected assembly loses its own level, because placing an item makes that level again. */
function libCapture(L, set, name, category, id, skip = AS.path.length + (asmUnit(L, set) ? 1 : 0)) {
  const ids = new Set(set.map(o => o.id)), list = L.objects.filter(q => ids.has(q.id) || ids.has(q.parent)), tops = list.filter(q => !q.parent), U = asmSpan(tops), z0 = Math.min(...tops.map(o => o.z));
  let n = 1;
  const items = asmCopy(list, () => n++).map(q => {
    const c = Object.assign({}, q); delete c.fit; delete c.lib;
    if (!q.parent) { c.i = q.i - U.a0 / 2; c.j = q.j - U.b0 / 2; c.z = q.z - z0; const p = q.group ? q.group.slice(skip) : []; if (p.length) c.group = p; else delete c.group; }
    return c;
  });
  return cleanItem({ id: id || 'mine-' + Date.now().toString(36) + '-' + S.library.length, name, category, tile: S.tile, level: levelPx(), items }, true);
}
function libAdd(item) { const k = S.library.findIndex(x => x.id === item.id); if (k >= 0) S.library[k] = item; else S.library.push(item); setDirty(true); syncLibrary(); }
function libSaveSel(name, category) {
  const L = activeLayer(), set = asmSet(); if (!set.length) return null;
  const item = libCapture(L, set, name, category); if (item) { libAdd(item); toast('Saved to the library.'); }
  return item;
}
/* An edited instance becomes the item, so a change can be sent to the others. All of the instance counts, even from one part selected inside it. Its pose goes too, as the item is drawn unturned. */
function libPushItem() {
  const L = activeLayer(), o = asmSet()[0], was = o && o.lib ? libFind(o.lib.id) : null; if (!was || !was.mine) return;
  const set = L.objects.filter(q => !q.parent && q.lib && q.lib.g === o.lib.g), kids = L.objects.filter(q => set.some(p => p.id === q.parent));
  const back = asmPose(set.concat(kids), o.lib.flip ? { turn: o.lib.turn, flip: true } : { turn: -o.lib.turn, flip: false });
  const item = libCapture({ objects: back, index: L.index }, back.filter(q => !q.parent), was.name, was.category, was.id, o.group ? o.group.indexOf(o.lib.g) + 1 : 0);
  if (item) { libAdd(item); toast('Library item updated.'); }
}
function libRemove(id) { S.library = S.library.filter(x => x.id !== id); if (S.libPick === id) S.libPick = null; setDirty(true); pvClear(); syncLibrary(); }

/* ---------- update all instances ---------- */
/* Each instance, by layer: its records, the pose it stands in, and what it is nested in. */
function libInstances(id) {
  const out = [];
  for (const L of S.layers) {
    if (!L.objectLayer) continue;
    const by = new Map();
    for (const o of L.objects) if (o.lib && o.lib.id === id && !o.parent) { if (!by.has(o.lib.g)) by.set(o.lib.g, []); by.get(o.lib.g).push(o); }
    for (const [g, tops] of by) out.push({ L, g, tops });
  }
  return out;
}
/* v1 has no overrides map: the item overwrites whatever was changed inside an instance, which is why this asks first. One undo step over every layer. */
function libUpdateAll(id) {
  const item = libFind(id); if (!item) return 0;
  const list = libInstances(id).filter(x => !lockedOf(x.L)), next = new Map(); let box = null;
  for (const x of list) {
    const o = x.tops[0], U = asmSpan(x.tops), k = o.group ? o.group.indexOf(x.g) : -1, gone = new Set(x.tops.map(q => q.id));
    const fresh = libInstance(item, { a: U.a0, b: U.b0, z: Math.min(...x.tops.map(q => q.z)) }, { turn: o.lib.turn, flip: o.lib.flip }, { g: x.g, path: o.group ? o.group.slice(0, k < 0 ? o.group.length : k) : [] });
    next.set(x.L.id, (next.get(x.L.id) || x.L.objects).filter(q => !gone.has(q.id) && !gone.has(q.parent)).concat(fresh));
    for (const q of fresh) box = joinBox(box, objPixelBox(q));
  }
  if (!list.length) return 0;
  if (box && pastEdge(box) && !growTold(box, 8)) toast('The canvas is at its size limit.');
  const steps = [...next].map(([lid, after]) => ({ lid, before: layerById(lid).objects, after })), run = k => steps.forEach(s => objApply(layerById(s.lid), s[k]));
  run('after'); OB.sel = null; OB.ids = [];
  pushHistory({ bytes: 64 * steps.length, undo: () => run('before'), redo: () => run('after') });
  objSync(); return list.length;
}

/* ---------- placing ---------- */
function libDrafts(d, alloc) {
  let id = -1; const take = alloc || (() => id--), list = libInstance(libPicked(), { a: 2 * d.b.i, b: 2 * d.b.j, z: d.z }, S.libPose, { alloc: take, path: AS.path });
  return list.concat(asmTwins(list, take));
}
function libTurn(by) { S.libPose = { turn: (S.libPose.turn + by + 4) % 4, flip: S.libPose.flip }; pvClear(); }
function libFlip() { S.libPose = { turn: (4 - S.libPose.turn) % 4, flip: !S.libPose.flip }; pvClear(); }
/* R and M work only while an item is on the pen, so both keep their usual meaning otherwise. */
function libKey(k) {
  if (heldTool() !== 'place' || !libPicked()) return false;
  if (k === 'r') libTurn(1); else if (k === 'm') libFlip(); else return false;
  return true;
}
function libPick(id) { S.libPick = S.libPick === id ? null : id; S.libPose = { turn: 0, flip: false }; pvClear(); syncLibrary(); const b = libPickBox(); if (b && fitOf(b).larger) fitZoom(b); }
/* The picked item's size as a box from the canvas corner, so it can be told before there is a ghost, which a finger does not get until it lands. Worked out once per pose. */
function libPickBox() {
  const item = libPicked(); if (!item) return null;
  const key = [item.id, S.libPose.turn, S.libPose.flip, objSig()].join(); if (LIB.boxKey === key) return LIB.box;
  let id = -1; const b = listBox(libInstance(item, { a: 0, b: 0, z: 0 }, S.libPose, { alloc: () => id-- }));
  LIB.boxKey = key; return LIB.box = { x0: 0, y0: 0, x1: b.x1 - b.x0, y1: b.y1 - b.y0 };
}

/* ---------- files ---------- */
async function libExport() {
  if (!S.library.length && !S.stamps.length) { toast('Save something to the library first.'); return; }
  const text = JSON.stringify({ app: LIB_FORMAT, version: 1, items: S.library.map(({ mine, ...x }) => x), stamps: S.stamps.length ? S.stamps.map(stmSaved) : undefined });
  if (await deliver(safeName() + '.qtiles-lib.json', new Blob([text], { type: 'application/json' }))) toast('Library exported.');
}
/* An item with an id the project already holds replaces it, so a re-import updates rather than doubles. */
function libImport(o) {
  if (!libLike(o) || !(Array.isArray(o.items) || Array.isArray(o.stamps))) { toast('This is not a qtiles library file.'); return 0; }
  const list = cleanLibrary(o.items), marks = cleanStamps(o.stamps), n = list.length + marks.length; list.forEach(libAdd); marks.forEach(stmAdd);
  toast(n ? 'Imported ' + n + (n === 1 ? ' item.' : ' items.') : 'No items found in that file.');
  return n;
}
function libLoad() { LIB.built = LIB_BUILT.map(x => cleanItem(x, false)).filter(Boolean); syncLibrary(); }

/* ---------- panel ---------- */
/* Runs the real rasterizer on a small grid, stepping the tile down until the item fits. It is drawn again only when the project's look changes. */
function libThumb(cv, item) {
  const sig = objSig(); if (cv.dataset.sig === sig) return; cv.dataset.sig = sig;
  const keep = [S.tile, S.gox, S.goy, S.edgeRun, S.level], ctx = cv.getContext('2d'), img = ctx.createImageData(LIB_THUMB, LIB_THUMB), px = new Uint32Array(img.data.buffer), box = { x0: 0, y0: 0, x1: LIB_THUMB - 1, y1: LIB_THUMB - 1 };
  try {
    for (const tile of [16, 12, 8]) {
      Object.assign(S, { tile, gox: 0, goy: 0, edgeRun: 2, level: 0 });
      let id = -1, b = null; const list = libInstance(item, { a: 0, b: 0, z: 0 }, { turn: 0, flip: false }, { alloc: () => id-- });
      for (const o of list) b = joinBox(b, objBox(o));
      if (tile > 8 && (b.x1 - b.x0 > LIB_THUMB || b.y1 - b.y0 > LIB_THUMB)) continue;
      S.gox = Math.round((LIB_THUMB - b.x1 - b.x0) / 2); S.goy = Math.round((LIB_THUMB - b.y1 - b.y0) / 2);
      for (const o of objOrder(list)) objStamp(o, box, (x, y, v) => { px[y * LIB_THUMB + x] = v; }, (x, y) => px[y * LIB_THUMB + x]);
      break;
    }
  } finally { [S.tile, S.gox, S.goy, S.edgeRun, S.level] = keep; }
  ctx.putImageData(img, 0, 0);
}
function libShown() {
  const q = LIB.q.trim().toLowerCase();
  return libItems().filter(x => (LIB.cat === 'All' || (LIB.cat === 'Mine' ? x.mine : x.category === LIB.cat)) && (!q || x.name.toLowerCase().includes(q)));
}
function syncLibrary() {
  const host = $('libGrid'), list = libShown(), picked = libPicked(), lib = S.placeTab === 'library';
  press($('placeTabShapes'), !lib); press($('placeTabLib'), lib); $('placeShapes').hidden = lib; $('placeLib').hidden = !lib;
  document.querySelectorAll('[data-lib-cat]').forEach(b => press(b, b.dataset.libCat === LIB.cat));
  const key = list.map(x => x.id + x.name).join();
  if (host.dataset.key !== key) {
    host.dataset.key = key; host.textContent = '';
    for (const x of list) {
      const b = document.createElement('button'), c = document.createElement('canvas'); b.className = 'shapecard'; b.dataset.lib = x.id; c.width = c.height = LIB_THUMB;
      b.append(c, x.name); b.onclick = () => libPick(x.id); host.appendChild(b);
    }
  }
  for (const b of host.children) { press(b, b.dataset.lib === S.libPick); libThumb(b.firstChild, libFind(b.dataset.lib)); }
  $('libEmpty').hidden = list.length > 0;
  $('libEmpty').textContent = 'Nothing here yet. Select objects, then Save to library in the inspector.';
  $('libPose').hidden = !picked; $('libDel').hidden = !(picked && picked.mine); $('libExport').disabled = !S.library.length && !S.stamps.length;
  stmSync(); syncScatter();
}
function openLibSave() {
  const o = asmSet()[0]; if (!o) return;
  $('libName').value = o.lib && libFind(o.lib.id) ? libFind(o.lib.id).name : defOf(o.type).name; $('libCat').value = 'Mine'; openSheet('sheetLib');
}
function openLibAll() {
  const o = asmSet()[0], item = o && o.lib ? libFind(o.lib.id) : null; if (!item) return;
  const n = libInstances(item.id).length; LIB.save = item.id;
  $('libAllNote').textContent = 'This redraws ' + n + (n === 1 ? ' copy' : ' copies') + ' of ' + item.name + ' from the library. Anything changed inside a copy is replaced.'; openSheet('sheetLibAll');
}
function initLibrary() {
  const row = $('libCats');
  for (const c of ['All'].concat(LIB_CATS)) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.libCat = c; b.textContent = c; b.onclick = () => { LIB.cat = c; syncLibrary(); }; row.appendChild(b); }
  for (const c of LIB_CATS) { const o = document.createElement('option'); o.textContent = c; $('libCat').appendChild(o); }
  $('libSearch').oninput = e => { LIB.q = e.target.value; syncLibrary(); };
  $('placeTabShapes').onclick = () => { S.placeTab = 'shapes'; S.libPick = null; pvClear(); syncLibrary(); };
  $('placeTabLib').onclick = () => { S.placeTab = 'library'; pvClear(); syncLibrary(); };
  $('libTurnL').onclick = () => libTurn(-1); $('libTurnR').onclick = () => libTurn(1); $('libMirror').onclick = libFlip;
  $('libDel').onclick = () => { if (S.libPick) libRemove(S.libPick); };
  $('libSave').onclick = openLibSave; $('libPush').onclick = libPushItem; $('libAll').onclick = openLibAll;
  $('libSaveOk').onclick = () => { closeSheets(); libSaveSel($('libName').value.trim() || 'Item', $('libCat').value); };
  $('libAllOk').onclick = () => { closeSheets(); toast('Updated ' + libUpdateAll(LIB.save) + '.'); };
  $('libExport').onclick = libExport; $('libImport').onclick = () => $('libInput').click();
  $('libInput').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { libImport(JSON.parse(await f.text())); } catch (_) { toast('This is not a qtiles library file.'); } };
  libLoad();
}

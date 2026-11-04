'use strict';
/* qtiles core: document state, layers, history, pixel math.
   Pixels are stored as packed little-endian RGBA in Uint32Array (0xAABBGGRR). */

const APP_VERSION = '0.3.0';   // shown in About and on the start screen
const MAX_DIM = 4096, MAX_PIX = 16777216;
/* Each ramp runs dark to light. Black belongs to no family, so it stays loose. */
const DEFAULT_RAMPS = [
  { name: 'Deep sea', colors: ['#0b132b','#1c2541','#3a506b','#5bc0be','#a8e6ef','#e8f6f8'] },
  { name: 'Neutrals', colors: ['#2b2d42','#4a4e69','#6c7086','#9a9fb5','#c9ccd6','#f2f3f7'] },
  { name: 'Brick', colors: ['#4a1f1f','#7a2e2a','#b04a3a','#e07a5f','#f2b896','#f6e2c8'] },
  { name: 'Greens', colors: ['#14342b','#24593f','#3f8a4f','#7bb661','#b9d98a','#e4efb4'] },
  { name: 'Yellows', colors: ['#8a5a14','#c98a1b','#f2b632','#ffd966','#fff1a8','#ffffff'] },
  { name: 'Blues', colors: ['#0d3b66','#1f6fb2','#3da5d9','#7ad3e8'] },
  { name: 'Pinks', colors: ['#8e4a8b','#d96c9c'] },
  { name: 'Skin and hair', colors: ['#2a1a12','#5a3624','#8f5a3a','#c68a62','#e8b998','#f6dcc4'] }   // for characters
];
const DEFAULT_PALETTE = DEFAULT_RAMPS.flatMap(r => r.colors).concat('#000000');

const LAYER_KINDS = [['layer', 'Layer'], ['character', 'Character'], ['prop', 'Prop'], ['terrain', 'Terrain'], ['background', 'Background'], ['shadow', 'Shadow']];
const S = {
  name: 'untitled', w: 352, h: 224, layers: [], active: 0,
  mode: 'flat', tile: 32, cell: 8, major: 4, snap: 'pixel', gridShow: 'cells', rulers: true, guideHover: true, guideMirror: true,   // cell is in pixels and major in cells or tiles (0 is off). snap is pixel, cell or corner in 2D, pixel or tile in Iso. How the grid and its guides show is not saved, except rulers
  color: '#3f8a4f', color2: '#24593f', tool: 'pencil', toolBefore: 'pencil', brush: 1,
  lineSnap: true, rectFill: false, ovalFill: false, ovalCircle: false, ovalCenter: false, fillAll: true,
  light: 'left', shadeDir: -1,
  objType: 'box', objFacing: 0, objP: {}, objW: 4, objD: 4, objH: 0, objMat: {}, objOutline: 'dark', objShadow: true, objHalf: false, objFree: false, objAdd: false, objDrag: 'move', objFoot: false, objGap: '', level: 0,   // objH 0 is the shape's default height; level 0 means the default, half the tile width
  library: [], libPick: null, libPose: { turn: 0, flip: false }, placeTab: 'shapes', stamps: [], kitPresets: [],   // the project's own library items and stamps, and the item on the pen
  scMode: 'paint', scSpacing: 2, scJitter: 40, scSize: 0, scDensity: 100, scBrush: 1, scTurn: true, scAvoid: true, scatterSeed: 1, scVariants: [],
  terMode: 'raise', terBrush: 1, terSide: 'dirt', terSlopes: false, terMat: { materialTop: 'grass' },
  ditherMode: 'brush', ditherPat: 'checker', ditherLevel: 8, ditherClear: false,
  edgeRun: 2, tileTex: 'plain', tileVariants: 4, tileRandom: true, tileVar: 1, tileSeed: 1, tileRim: 'none', tileH: 0, nudgeX: 0, nudgeY: 0,
  shadowEdge: 'hard', castLen: 100, outN: 4, outSide: 'outside', outColor: 'sel', outSteps: 1,
  gox: 192, goy: 0,
  mirrorX: false, mirrorY: false, axisX: 351, axisY: 223, axisSnap: true,   // axes are doubled, so an odd value sits between two pixels and an even one on a pixel
  example: null, tipsDismissed: false,   // the example this project came from, for its tips
  projectId: null, revision: 0, savedAt: null,   // which project this is and how often it reached a file (storage.js). The id comes with the first save or recovery copy
  checklist: [],   // ids of the finishing checklist items ticked for this project
  pivotMode: 'set', onion: false, anims: [], animAt: 0,   // animations are name and frames [{ id, ms }], with the one in the Animation panel at animAt
  groups: [],   // layer groups, as records (groups.js); solo on one is never saved
  views: [], sections: {}, secOn: false, secW: 256, secH: 256, secOx: 0, secOy: 0, seamGuard: true,   // saved views as { name, x, y, z } around the view's center, and section marks by index (scene.js); secOx and secOy move with the art
  sizeLock: false,   // the canvas keeps its size: art past the edge is cut off instead of growing it. The Resize dialog still works
  guides: 'lines',   // height guides: 'off', 'lines' or 'planes'. A device preference, never saved in the project
  edgeGrow: 'auto',   // adding art past the edge: 'auto' extends the canvas, 'ask' asks first. A device preference, never saved in the project
  liveDefault: true, shadowOp: 35,   // whether an object layer that has not said casts live shadows, and how strong a new shadow layer starts
  z: 4, ox: 0, oy: 0, palette: DEFAULT_PALETTE.slice(), fingerDraws: false, dirty: false
};
const hooks = {};            // ui.js / files.js fill these in
const CELL_MAX = 256, MAJORS = [0, 2, 4, 8, 16], SNAPS = ['pixel', 'cell', 'corner', 'tile'];
const cellDefault = (w, h) => Math.max(w, h) <= 64 ? 1 : 8, majorDefault = (cell, w, h) => cell === 1 && Math.max(w, h) <= 16 ? 0 : 4;
const SEL = { mask: null, box: null, edges: null, rect: null, op: 'set', wandAll: true, phase: 0 };   // the selection (select.js); mask covers the canvas, 1 = selected
const OB = { sel: null, ids: [], edges: null, box: null, x: 0, y: 0 };   // the selected object's id, all of them when there are several, and their outline from (x, y) (objects.js)
let FL = null;               // the floating selection, while one exists
let needRender = true;
function requestRender() { needRender = true; }

function pack(r, g, b, a) { return (((a === undefined ? 255 : a) << 24) | (b << 16) | (g << 8) | r) >>> 0; }
function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join(''); }
function packedHex(v) { return rgbToHex(v & 255, (v >>> 8) & 255, (v >>> 16) & 255); }
function packHex(h) { const c = hexToRgb(h); return c ? pack(c[0], c[1], c[2], 255) : 0; }
/* Hue is 0..360, saturation and value are 0..1. */
function hsvToRgb(h, s, v) {
  const f = n => { const k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))); };
  return [f(5), f(3), f(1)];
}
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max ? d / max : 0, max / 255];
}
/* Hue is 0..360, saturation and lightness are 0..1. */
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2, d = max - min;
  return [rgbToHsv(r, g, b)[0], d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
}
function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
function setColor(hex) {
  const c = hexToRgb(hex); if (!c) return;
  S.color = rgbToHex(c[0], c[1], c[2]);
  hooks.color && hooks.color();
}
/* What a stroke paints, worked out from S.color where the stroke begins. A stored copy that only setColor wrote stayed transparent on a start that never called it. */
const INK = { hex: '', v: 0 };
function inkV() { if (INK.hex !== S.color) { INK.hex = S.color; INK.v = packHex(S.color); } return INK.v; }
function swapColors() { const c = S.color2; S.color2 = S.color; setColor(c); }
/* Face multipliers for a color on no ramp (faceShades in palettes.js): lit = FACE_LEFT, shaded = FACE_RIGHT, with a cool shift in shadow. */
function shadeHex(hex, f) {
  const c = hexToRgb(hex);
  return pack(Math.round(c[0] * f[0]), Math.round(c[1] * f[1]), Math.round(c[2] * f[2]), 255);
}
const FACE_LEFT = [0.80, 0.83, 0.92], FACE_RIGHT = [0.60, 0.63, 0.78], FACE_SIDE = [0.70, 0.73, 0.85], FACE_EDGE = [0.36, 0.38, 0.52];

function over(d, s, op) {
  const sa = (s >>> 24) * op; if (sa <= 0) return d;
  const sf = sa / 255, da = (d >>> 24) / 255, oa = sf + da * (1 - sf);
  if (oa <= 0) return 0;
  const k = da * (1 - sf);
  return pack(
    Math.round(((s & 255) * sf + (d & 255) * k) / oa),
    Math.round((((s >>> 8) & 255) * sf + ((d >>> 8) & 255) * k) / oa),
    Math.round((((s >>> 16) & 255) * sf + ((d >>> 16) & 255) * k) / oa),
    Math.round(oa * 255));
}
/* A group's eye and lock add to the layer's own and never change them, so showing a group brings every layer back as it was. Opacity multiplies per layer at composite time, with no flatten: two overlapping translucent layers in a translucent group show through each other. */
const groupOf = L => (L.group && S.groups.find(g => g.id === L.group)) || null;
const shownOf = L => { const g = groupOf(L); return L.visible && (!g || g.visible); };
const lockedOf = L => { const g = groupOf(L); return L.locked || !!(g && g.locked); };
const opacityOf = L => { const g = groupOf(L); return L.opacity * (g ? g.opacity : 1); };
/* A soloed group shows the way it looks, so a layer hidden inside it stays hidden. */
const soloed = L => { const g = groupOf(L); return L.solo || !!(g && g.solo && L.visible); };
/* Solo shows one layer or group on its own; otherwise the eye toggles decide. */
function shownSet() { const any = S.layers.some(soloed); return L => !ghostly(L) && (any ? soloed(L) : shownOf(L)); }
function soloClear() { S.layers.forEach(L => { L.solo = false; }); if (S.groups.some(g => g.solo)) S.groups = S.groups.map(g => ({ ...g, solo: false })); }
function flatAt(i) { const sh = shownSet(); let v = 0; for (const L of S.layers) if (sh(L)) v = over(v, L.px[i], opacityOf(L)); return v; }
function flatten() {
  const out = new Uint32Array(S.w * S.h), sh = shownSet();
  for (const L of S.layers) {
    if (!sh(L)) continue;
    const p = L.px, op = opacityOf(L);
    for (let i = 0; i < out.length; i++) { const s = p[i]; if (s >>> 24) out[i] = (out[i] === 0 && op >= 1) ? s : over(out[i], s, op); }
  }
  return out;
}

/* ---------- layers ---------- */
let layerSeq = 1;            // ids link helper layers to their source, and survive the layer objects applyResize replaces
/* A layer has no canvas: what shows on screen is composite.js's tiles. Passing px adopts it, so opening a file does not hold every layer twice. */
function makeLayer(name, px) { return { id: layerSeq++, name, visible: true, opacity: 1, locked: false, solo: false, kind: 'layer', w: S.w, h: S.h, px: px || new Uint32Array(S.w * S.h) }; }
/* A helper layer that is drawn whole on every frame, as the view of an assembly being edited is. */
function canvasLayer(name) {
  const L = makeLayer(name), c = document.createElement('canvas'); c.width = S.w; c.height = S.h;
  L.canvas = c; L.ctx = c.getContext('2d'); L.img = L.ctx.createImageData(S.w, S.h); L.px = new Uint32Array(L.img.data.buffer); return L;
}
const layerById = id => S.layers.find(L => L.id === id);
const shadowOf = L => S.layers.find(x => x.shadowFor === L.id);
const outlineOf = L => S.layers.find(x => x.outlineFor === L.id);
const linkedLayers = L => S.layers.filter(x => x.shadowFor === L.id || x.outlineFor === L.id);
const linkOf = L => L.shadowFor || L.outlineFor || L.mirrorOf;
/* The top of a chain of links, such as the outline of a mirror. The count stops a loop in a damaged file. */
function linkRoot(L) { for (let n = 0, s; n < 8 && (s = linkOf(L) && layerById(linkOf(L))); n++) L = s; return L; }
function family(L) { const r = linkRoot(L); return S.layers.filter(x => linkRoot(x) === r); }
/* Where a new layer beside L goes: past the rest of its family, or it would split them. */
function aboveFamily(L) { const r = linkRoot(L); let k = S.layers.indexOf(L) + 1; while (S.layers[k] && linkRoot(S.layers[k]) === r) k++; return k; }
/* A ghost is drawn by its own path, over everything, and read by nothing: leaving it out of shownSet keeps it out of fill, the wand, the picker, surfaces and hit tests. Its linked layers go with it. */
const ghostly = L => { if (L.ghost) return true; const s = (L.shadowFor || L.outlineFor) && layerById(L.shadowFor || L.outlineFor); return !!(s && s.ghost); };
function flush(L, x, y, w, h) {
  if (x === undefined) { x = 0; y = 0; w = S.w; h = S.h; }
  x = Math.max(0, x); y = Math.max(0, y); w = Math.min(S.w - x, w); h = Math.min(S.h - y, h);
  if (w > 0 && h > 0) { cpTouch(L, x, y, w, h); if (L.ctx) L.ctx.putImageData(L.img, 0, 0, x, y, w, h); }
  L.ver = (L.ver | 0) + 1; requestRender();   // ver tells a cached tint its layer changed
}
function activeLayer() { return S.layers[S.active]; }

/* ---------- history (diff based, so big canvases stay cheap) ---------- */
const H_CAP = 150e6;
const H = { stack: [], pos: 0, bytes: 0, told: false, packing: 0, busy: false };   // told: the trim toast has shown for this project; packing: entries waiting to shrink (storage.js)
function resetHistory() { H.stack = []; H.pos = 0; H.bytes = 0; H.told = false; hooks.history && hooks.history(); }
/* An entry that is about to shrink still counts at full size, so nothing is trimmed until it has. */
function historyTrim() {
  if (H.packing) return;
  let cut = false;
  while (H.bytes > H_CAP && H.stack.length > 1) { H.bytes -= H.stack.shift().bytes || 0; H.pos--; cut = true; }
  if (cut && !H.told) { H.told = true; toast('Oldest undo steps were dropped to save memory.'); }
  if (cut) hooks.history && hooks.history();
}
function pushHistory(e) {
  for (let i = H.pos; i < H.stack.length; i++) H.bytes -= H.stack[i].bytes || 0;
  H.stack.length = H.pos; H.stack.push(e); H.pos = H.stack.length; H.bytes += e.bytes || 0;
  historyPack(e); historyTrim();
  hooks.history && hooks.history(); setDirty(true);
}
/* A packed entry has to be unpacked first, which is not instant, so the step runs again when that is done. */
function undo() {
  if (H.busy) return;
  if (FL) { cancelFloat(); return; }
  if (H.pos < 1) return;
  const e = H.stack[H.pos - 1];
  if (e.gz) { historyUnpack(e, undo); return; }
  H.pos--; e.gen = (e.gen | 0) + 1; e.undo(); afterHistory(); historyPack(e);
}
function redo() {
  if (H.busy) return;
  cancelFloat();
  if (H.pos >= H.stack.length) return;
  const e = H.stack[H.pos];
  if (e.gz) { historyUnpack(e, redo); return; }
  H.pos++; e.gen = (e.gen | 0) + 1; e.redo(); afterHistory(); historyPack(e);
}
function afterHistory() { objRefresh(); requestRender(); hooks.layers && hooks.layers(); hooks.history && hooks.history(); setDirty(true); }
let docVer = 0;   // counts changes, so a save that takes seconds can tell whether the art moved on while it ran
function setDirty(v) { if (v) docVer++; S.dirty = v; hooks.dirty && hooks.dirty(); if (v && hooks.autosave) hooks.autosave(); }

function pixelEntry(L, map) {
  const n = map.size, idx = new Uint32Array(n), oldV = new Uint32Array(n), newV = new Uint32Array(n);
  let k = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const [i, o] of map) {
    idx[k] = i; oldV[k] = o; newV[k] = L.px[i]; k++;
    const x = i % S.w, y = (i / S.w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const d = { idx, oldV, newV };   // read through d, as packing can replace all three
  const apply = v => { const at = d.idx; for (let j = 0; j < n; j++) L.px[at[j]] = v[j]; flush(L, x0, y0, x1 - x0 + 1, y1 - y0 + 1); };
  return { bytes: n * 12, undo: () => apply(d.oldV), redo: () => apply(d.newV), parts: () => [[d, 'idx'], [d, 'oldV'], [d, 'newV']] };
}

/* A stroke records the old value of every pixel it touches, then becomes one history entry. */
let stroke = null;
function beginStroke(L) { stroke = { L, map: new Map(), px0: 1e9, py0: 1e9, px1: -1, py1: -1 }; }
function plotLayer(x, y, v) {
  if (x < 0 || y < 0 || x >= S.w || y >= S.h) return;
  const L = stroke.L, i = y * S.w + x, o = L.px[i];
  if (SEL.mask && !SEL.mask[i]) return;   // a selection limits every painting tool
  if (o === v) return;
  if (!stroke.map.has(i)) stroke.map.set(i, o);
  L.px[i] = v; strokeGrow(x, y);
}
function strokeGrow(x, y) {
  if (x < stroke.px0) stroke.px0 = x; if (x > stroke.px1) stroke.px1 = x;
  if (y < stroke.py0) stroke.py0 = y; if (y > stroke.py1) stroke.py1 = y;
}
/* Puts a pixel back as it was before this stroke and drops it from the record, so a corner pixel-perfect takes out leaves no trace in undo. */
function unplotLayer(x, y) {
  if (x < 0 || y < 0 || x >= S.w || y >= S.h) return;
  const i = y * S.w + x; if (!stroke.map.has(i)) return;
  stroke.L.px[i] = stroke.map.get(i); stroke.map.delete(i); strokeGrow(x, y);
}
function flushStroke() {
  if (!stroke || stroke.px1 < 0) return;
  flush(stroke.L, stroke.px0, stroke.py0, stroke.px1 - stroke.px0 + 1, stroke.py1 - stroke.py0 + 1);
  stroke.px0 = stroke.py0 = 1e9; stroke.px1 = stroke.py1 = -1;
}
function endStroke() {
  if (!stroke) return; flushStroke();
  if (stroke.map.size) pushHistory(pixelEntry(stroke.L, stroke.map));
  stroke = null;
}
function cancelStroke() {
  if (!stroke) return;
  for (const [i, o] of stroke.map) stroke.L.px[i] = o;
  flush(stroke.L); stroke = null;
}

/* ---------- layer operations ---------- */
function insertLayer(L, idx) { S.layers.splice(idx, 0, L); S.active = idx; hooks.layers && hooks.layers(); requestRender(); }
function removeLayer(idx) { S.layers.splice(idx, 1); S.active = Math.max(0, Math.min(S.active, S.layers.length - 1)); hooks.layers && hooks.layers(); requestRender(); }
function addLayer(name, init) {
  const L = makeLayer(name || 'Layer ' + (S.layers.length + 1)), idx = aboveFamily(activeLayer());
  L.group = activeLayer().group; if (init) init(L);
  insertLayer(L, idx);
  pushHistory({ undo: () => removeLayer(S.layers.indexOf(L)), redo: () => insertLayer(L, idx) });   // by identity: a live shadow layer may have joined the list since
}
function dupLayer() {
  const src = activeLayer(), L = makeLayer(src.name + ' copy'), idx = aboveFamily(src);
  L.px.set(src.px); L.group = src.group; L.tag = src.tag; L.opacity = src.opacity; L.kind = src.kind; L.shadows = src.shadows; L.pivot = src.pivot; L.onTile = src.onTile; if (src.objectLayer) objCopyLayer(src, L); flush(L); insertLayer(L, idx);
  pushHistory({ bytes: S.w * S.h * 4, undo: () => removeLayer(S.layers.indexOf(L)), redo: () => insertLayer(L, idx) });
  shadowTidy();
}
function deleteLayer(withLinked) {
  if (S.layers.length < 2) return false;
  const L = activeLayer(), gone = withLinked ? [L, ...linkedLayers(L)] : [L, ...linkedLayers(L).filter(x => x.live)];   // a live shadow means nothing without its objects
  if (gone.length >= S.layers.length) return false;
  pushHistory(layerListEntry(S.layers.filter(x => !gone.includes(x)))); return true;
}
/* Swaps the layer list inside an undo step, with the same layer staying active. It stores copies, so a later splice of S.layers cannot reach them. */
function layerListEntry(next, inner) {
  const prev = S.layers.slice(), act = activeLayer();
  const put = list => { const k = list.indexOf(act); S.layers = list.slice(); S.active = k >= 0 ? k : Math.min(S.active, list.length - 1); hooks.layers && hooks.layers(); requestRender(); };
  put(next);
  return { bytes: (inner ? inner.bytes : 0) + S.w * S.h * 4, undo: () => { if (inner) inner.undo(); put(prev); }, redo: () => { put(next); if (inner) inner.redo(); }, parts: inner && inner.parts };
}
/* Replaces a layer's pixels in one undo step, together with a new layer order if `list` is given. It takes no selection into account: callers that should honor one apply it to `next`. */
function bakeLayer(L, next, list) {
  const map = new Map();
  for (let i = 0; i < next.length; i++) if (L.px[i] !== next[i]) { map.set(i, L.px[i]); L.px[i] = next[i]; }
  if (!map.size && !list) return;
  flush(L); const e = pixelEntry(L, map);
  pushHistory(list ? layerListEntry(list, e) : e);
}
function mergeDown() {
  const a = S.active; if (a < 1) return false;
  const L = S.layers[a], B = S.layers[a - 1], d = { before: B.px.slice() }, op = L.group === B.group ? L.opacity : opacityOf(L);   // inside one group, the group's opacity still applies to the result
  if (B.objectLayer) { toast(OBJ_MSG); return false; }
  if (L.live || B.live) { toast(LIVE_MSG); return false; }
  if (B.ghost) { toast(GHOST_MSG); return false; }
  for (let i = 0; i < B.px.length; i++) if (L.px[i] >>> 24) B.px[i] = over(B.px[i], L.px[i], op);
  d.after = B.px.slice(); flush(B); removeLayer(a);
  let merged = true;
  pushHistory({
    bytes: S.w * S.h * 12,
    undo: () => { merged = false; B.px.set(d.before); flush(B); insertLayer(L, a); },
    redo: () => { merged = true; B.px.set(d.after); flush(B); removeLayer(a); },
    parts: () => [[d, 'before'], [d, 'after'], ...(merged ? [[L, 'px']] : [])]
  });
  return true;
}

/* ---------- document ---------- */
function newDoc(w, h, name) {
  S.w = w; S.h = h; S.layers = []; S.groups = []; S.active = 0; S.library = []; S.stamps = []; S.kitPresets = []; S.libPick = null; S.example = null; S.tipsDismissed = false; S.checklist = []; S.anims = []; S.animAt = 0; S.sizeLock = false; S.brush = 1; S.cell = cellDefault(w, h); S.major = majorDefault(S.cell, w, h); S.snap = 'pixel';
  hooks.unbind && hooks.unbind();   // a new project must not save over the last one's file
  selReset(); sceneReset(); refReset(); ckReset(); S.layers.push(makeLayer('Layer 1')); S.gox = Math.floor(w / 2); S.goy = 0; S.nudgeX = 0; S.nudgeY = 0; S.axisX = w - 1; S.axisY = h - 1;
  if (name) S.name = name;
  resetHistory(); hooks.layers && hooks.layers(); hooks.canvas && hooks.canvas(); hooks.tips && hooks.tips(); requestRender();
}
/* Changing the canvas size is one undoable step. (dx, dy) is where the old pixels land in the new canvas;
   the view shifts with them so nothing appears to move on screen. */
function applyResize(nw, nh, dx, dy) {
  const ow = S.w, oh = S.h, oldL = S.layers;
  S.w = nw; S.h = nh;
  const sx0 = Math.max(0, -dx), sx1 = Math.min(ow, nw - dx);
  const moved = (from, to) => {
    if (sx1 > sx0) for (let y = 0; y < oh; y++) {
      const ny = y + dy; if (ny < 0 || ny >= nh) continue;
      to.set(from.subarray(y * ow + sx0, y * ow + sx1), ny * nw + sx0 + dx);
    }
  };
  const newL = oldL.map(o => {
    const L = makeLayer(o.name); L.visible = o.visible; L.opacity = o.opacity; L.locked = o.locked; L.kind = o.kind; L.solo = o.solo; L.id = o.id; L.shadowFor = o.shadowFor; L.outlineFor = o.outlineFor; L.live = o.live; L.shadows = o.shadows; L.onTile = o.onTile; L.mirrorOf = o.mirrorOf; L.ghost = o.ghost; L.group = o.group; L.tag = o.tag;
    if (o.pivot) L.pivot = { x: o.pivot.x + dx, y: o.pivot.y + dy };
    moved(o.px, L.px);
    if (o.objectLayer) { L.objectLayer = true; L.objects = o.objects; L.index = o.index; L.sig = o.sig; L.ids = new Uint32Array(nw * nh); moved(o.ids, L.ids); L.faces = new Uint8Array(nw * nh); moved(o.faces, L.faces); }   // records are in cell space, so they and the index stay as they are
    flush(L); return L;
  });
  const put = (layers, w, h, sign) => {
    const pw = sign > 0 ? ow : nw, ph = sign > 0 ? oh : nh;
    const act = S.layers[S.active], at = act ? layers.findIndex(L => L.id === act.id) : -1;   // a live shadow may have come or gone since, so the list can be shorter than the index
    S.layers = layers; S.active = at >= 0 ? at : Math.min(S.active, layers.length - 1); S.w = w; S.h = h; selResized(pw, ph, sign * dx, sign * dy); S.ox -= sign * dx * S.z; S.oy -= sign * dy * S.z; S.gox += sign * dx; S.goy += sign * dy; S.axisX += sign * 2 * dx; S.axisY += sign * 2 * dy; ckShift(sign * dx, sign * dy); sceneShift(sign * dx, sign * dy); refShift(sign * dx, sign * dy); pvOutClear();
    hooks.layers && hooks.layers(); hooks.canvas && hooks.canvas(); requestRender();
  };
  put(newL, nw, nh, 1);
  for (const L of newL) if (L.objectLayer) objNewArea(L, dx, dy, ow, oh);
  /* Only the side not in use costs anything, and the other side's layers belong to the next step. */
  let grown = true;
  pushHistory({ bytes: ow * oh * 4 * oldL.length, undo: () => { grown = false; put(oldL, ow, oh, -1); }, redo: () => { grown = true; put(newL, nw, nh, 1); }, parts: () => layerParts(grown ? oldL : newL) });
  shadowTidy();
}
function resizeDoc(nw, nh, ax, ay) { applyResize(nw, nh, Math.round((nw - S.w) * ax), Math.round((nh - S.h) * ay)); }
function extendBy(l, t, r, b, before) {
  const nw = S.w + l + r, nh = S.h + t + b;
  if (!sizeOk(nw, nh)) return false;
  if (before) before();
  applyResize(nw, nh, l, t); return true;
}
function shrinkBy(l, t, r, b) {
  const nw = S.w - l - r, nh = S.h - t - b;
  if (!sizeOk(nw, nh)) return false;
  applyResize(nw, nh, -l, -t); return true;
}
/* Grow just enough to contain the box (art coordinates), plus a margin so a long stroke does not grow one pixel at a time.
   Under the size lock nothing moves and the caller carries on: plotting clips, so the art past the edge is cut off. */
function growToInclude(x0, y0, x1, y1, margin, before) {
  if (S.sizeLock) { hooks.locked && hooks.locked(); return { dx: 0, dy: 0, locked: true }; }
  for (const m of [margin, 0]) {
    const fit = v => m && S.mode !== 'iso' ? Math.ceil(v / S.cell) * S.cell : v;   // the 2D grid starts at the canvas corner, so growing left or up by whole cells keeps the art on it
    const l = x0 < 0 ? fit(-x0 + m) : 0, t = y0 < 0 ? fit(-y0 + m) : 0, r = x1 >= S.w ? x1 - S.w + 1 + m : 0, b = y1 >= S.h ? y1 - S.h + 1 + m : 0;
    if (!(l || t || r || b)) return { dx: 0, dy: 0 };
    if (extendBy(l, t, r, b, before)) return { dx: l, dy: t };
  }
  return null;
}
function sizeOk(w, h) { return w >= 1 && h >= 1 && w <= MAX_DIM && h <= MAX_DIM && w * h <= MAX_PIX; }
/* How far a pixel box sticks out on each side, for a ghost and for its commit alike. `tooBig` means no canvas can hold it, `canGrow` that this canvas can grow to hold it where it is. */
function fitOf(box) {
  const l = Math.max(0, -box.x0), t = Math.max(0, -box.y0), r = Math.max(0, box.x1 - S.w + 1), b = Math.max(0, box.y1 - S.h + 1), w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  return { l, t, r, b, w, h, fits: !(l || t || r || b), larger: w > S.w || h > S.h, tooBig: w > MAX_DIM || h > MAX_DIM, canGrow: sizeOk(S.w + l + r, S.h + t + b), addW: l + r, addH: t + b };
}

/* ---------- iso grid maths: cell (i,j) top corner sits at (ox + (i-j)*tw/2, (i+j)*tw/4) ---------- */
function isoOrigin() { return { x: S.gox, y: S.goy }; }
function cellAt(px, py) {
  const o = isoOrigin(), hw = S.tile / 2, hh = S.tile / 4;
  const a = (px - o.x) / hw, b = (py - o.y) / hh;
  return { i: Math.floor((a + b) / 2), j: Math.floor((b - a) / 2) };
}
function cellCorner(i, j) { const o = isoOrigin(); return { x: o.x + (i - j) * S.tile / 2, y: o.y + (i + j) * S.tile / 4 }; }
/* The stair of a 2:1 edge: steps of about S.edgeRun pixels across and half that down, always adding up to one tile.
   One half tile is built outward from a tile's tip, mirrored around it, then repeated. A plain stair cannot be symmetric when, say, runs of 3 straddle the tip,
   and this way every tile is the same shape and symmetric both ways. Tile widths are multiples of 4, or tile corners would land on half pixels. */
function edgeY(x) {
  const P = S.tile / 2, D = P / 2, n = Math.max(1, Math.round(P / S.edgeRun)), m = Math.floor((x + 0.5 + D) / P), u = x + 0.5 - m * P;
  return m * D + Math.sign(u) * Math.ceil(Math.ceil(Math.abs(u) * n / P - 0.5) * D / n - 0.5);
}
/* The tile a pixel belongs to. Every pixel has exactly one, so stamped tiles meet with no gap or overlap. */
function tileCell(x, y) {
  const u = x - S.gox, v = y - S.goy, h = S.tile / 2;
  return { i: Math.floor((v - edgeY(-1 - u)) / h), j: Math.floor((v - edgeY(u)) / h) };
}
function inCell(x, y, i, j) { const c = tileCell(x, y); return c.i === i && c.j === j; }

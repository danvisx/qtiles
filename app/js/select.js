'use strict';
/* qtiles selection: a mask over the canvas (SEL in core.js), a floating selection (FL), an internal clipboard, and integer-only transforms.
   Lifting only hides pixels from view. The real edit happens on commit, as one stroke, so a move is one undo step and the canvas can grow first. */

let selDrag = null, clip = null, clipStale = false;
const selTool = t => t === 'marquee' || t === 'wand';
function canTouch(L = activeLayer()) {
  if (L.ghost) { toast(GHOST_MSG); return false; }
  if (!shownSet()(L)) { toast('This layer is hidden. Show it to change it.'); return false; }
  if (lockedOf(L)) { toast('This layer is locked. Unlock it in the Layers panel.'); return false; }
  return true;
}
/* For anything that writes pixels. An object layer's pixels are a cache of its records. */
function canEdit(L = activeLayer()) {
  if (!canTouch(L)) return false;
  if (L.objectLayer) { toast(OBJ_MSG); return false; }
  return true;
}
function needSelTool() { if (!selTool(S.tool)) setTool('marquee'); }

/* ---------- masks ---------- */
function maskBox(m, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) if (m[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
/* The outline as merged line segments, built once per change: the ants redraw every few frames and only cost as much as the outline. */
function maskEdges(m, w, h) {
  const out = [], at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
  for (let y = 0; y <= h; y++) {
    let run = -1, kind = 0;
    for (let x = 0; x <= w; x++) {
      const a = at(x, y - 1) ? 1 : 0, b = at(x, y) ? 1 : 0, k = x < w && a !== b ? 1 + a : 0;
      if (k !== kind) { if (kind) out.push(run, y, x, y); run = x; kind = k; }
    }
  }
  for (let x = 0; x <= w; x++) {
    let run = -1, kind = 0;
    for (let y = 0; y <= h; y++) {
      const a = at(x - 1, y) ? 1 : 0, b = at(x, y) ? 1 : 0, k = y < h && a !== b ? 1 + a : 0;
      if (k !== kind) { if (kind) out.push(x, run, x, y); run = y; kind = k; }
    }
  }
  return out;
}
function selRefresh() {
  SEL.edges = FL ? maskEdges(FL.mask, FL.w, FL.h) : SEL.mask ? maskEdges(SEL.mask, S.w, S.h) : null;
  hooks.sel && hooks.sel(); requestRender();
}
function selPut(m) { SEL.box = m ? maskBox(m, S.w, S.h) : null; SEL.mask = SEL.box ? m : null; selRefresh(); }
function selCombine(m, op) {
  if (op !== 'set' && SEL.mask) for (let i = 0; i < m.length; i++) m[i] = op === 'add' ? (m[i] | SEL.mask[i]) : (SEL.mask[i] & (m[i] ^ 1));
  else if (op === 'sub') return;
  selPut(m);
}
function rectMask(x0, y0, x1, y1) {
  const m = new Uint8Array(S.w * S.h);
  for (let y = y0; y <= y1; y++) m.fill(1, y * S.w + x0, y * S.w + x1 + 1);
  return m;
}
function wandMask(x, y) {
  const m = new Uint8Array(S.w * S.h); if (x < 0 || y < 0 || x >= S.w || y >= S.h) return m;
  floodScan(SEL.wandAll ? flatten() : activeLayer().px, x, y, (px, py) => { m[py * S.w + px] = 1; });
  return m;
}
function contentBox(L) { return maskBox(L.px.map(v => v >>> 24 ? 1 : 0), S.w, S.h); }
function selectAll() { commitFloat(); selPut(rectMask(0, 0, S.w - 1, S.h - 1)); }
function selectNone() { commitFloat(); selPut(null); }
const anySel = () => !!(FL || SEL.mask || OB.sel !== null || OB.ids.length || AS.path.length);
/* A tap on the stage: a person's own placing, so a float past the edge can ask, and then the selection stays until that is answered. */
function stageClear() {
  floatDone(); if (FL) return;
  selPut(null); asmExit(); objSelect(null);
}
function selectInvert() {
  commitFloat(); if (!SEL.mask) { selectAll(); return; }
  selPut(SEL.mask.map(v => v ^ 1));
}
function selectContent() {
  commitFloat(); const b = contentBox(activeLayer());
  if (!b) { toast('This layer is empty.'); return; }
  selPut(rectMask(b.x0, b.y0, b.x1, b.y1));
}
function selResized(pw, ph, dx, dy) {
  if (!SEL.mask) return;
  const m = new Uint8Array(S.w * S.h), old = SEL.mask;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (old[y * pw + x]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < S.w && ny < S.h) m[ny * S.w + nx] = 1; }
  selPut(m);
}
function selReset() { FL = null; selDrag = null; SEL.rect = null; OB.sel = null; OB.ids = []; OB.edges = null; selPut(null); }

/* ---------- floating selection ---------- */
function floatCanvas(f) {
  f.op = maskBox(f.px, f.w, f.h);
  const c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
  const x = c.getContext('2d'), img = x.createImageData(f.w, f.h);
  new Uint32Array(img.data.buffer).set(f.px); x.putImageData(img, 0, 0); f.canvas = c;
}
function floatMake(o) { FL = o; floatCanvas(FL); selRefresh(); }
function grabSel(L) {
  const b = SEL.box, w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, px = new Uint32Array(w * h), mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y + b.y0) * S.w + x + b.x0;
    if (SEL.mask[i]) { mask[y * w + x] = 1; px[y * w + x] = L.px[i]; }
  }
  return { px, mask, w, h };
}
function blitSrc(L, f, on) {
  const s = f.src;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.mask[y * s.w + x]) L.px[(y + s.y) * S.w + x + s.x] = on ? s.px[y * s.w + x] : 0;
  flush(L, s.x, s.y, s.w, s.h);
}
function liftSel(dup) {
  if (FL) return true;
  if (!SEL.mask || !canEdit()) return false;
  const L = activeLayer(), g = grabSel(L), b = SEL.box, keep = SEL.mask;
  const f = { L, px: g.px, mask: g.mask, w: g.w, h: g.h, x: b.x0, y: b.y0, sel: keep, moved: !!dup,
    src: dup ? null : { x: b.x0, y: b.y0, w: g.w, h: g.h, px: g.px.slice(), mask: g.mask.slice() } };
  if (!dup) blitSrc(L, f, false);
  if (!dup && L.pivot && !L.px.some(v => v >>> 24)) f.pv = { x: L.pivot.x - f.x, y: L.pivot.y - f.y };   // all of the layer is on the float, so its pivot travels too, relative to the float
  SEL.mask = null; SEL.box = null; floatMake(f); return true;
}
/* The selection to go back to. A whole-layer lift only borrows one. */
const floatSel = f => f.whole ? (f.whole === true ? null : f.whole) : f.sel;
/* The opaque part of a float, in art coordinates. */
const floatBox = f => f.op ? { x0: f.x + f.op.x0, y0: f.y + f.op.y0, x1: f.x + f.op.x1, y1: f.y + f.op.y1 } : null;
/* The canvas grew under a float that stays up. Its source goes back first, so the history of the growth holds the true pixels, and a saved selection is sized to the old canvas. */
function floatGrow(box, margin) {
  const f = FL, ow = S.w, oh = S.h, id = f.L.id;
  if (f.src) blitSrc(f.L, f, true);
  const g = growTold(box, margin); if (!g) { if (f.src) blitSrc(f.L, f, false); return null; }
  f.L = layerById(id); f.x += g.dx; f.y += g.dy;
  if (f.src) { f.src.x += g.dx; f.src.y += g.dy; blitSrc(f.L, f, false); }
  if (f.sel) f.sel = stampMask(f.sel, g.dx, g.dy, ow, oh);
  if (f.whole && f.whole !== true) f.whole = stampMask(f.whole, g.dx, g.dy, ow, oh);
  selRefresh(); return g;
}
/* The least pixel shift that puts a float inside, or null if it is larger than the canvas. */
function floatShift(b) {
  const f = fitOf(b); return f.larger ? null : { x: f.l - f.r, y: f.t - f.b };
}
/* What a person's own Done, Enter or tap away does. commitFloat stays as it is, as code that calls it carries on straight after and cannot wait for an answer.
   With Shift, or Keep on the pen, a stamp goes back on the pen once placed: where it was, or at the point tapped. */
function floatDone(again) {
  if (!FL) return; const f = FL, more = f.st && (again || SM.keep), x = f.x, y = f.y;
  fitGate(FL.moved ? floatBox(FL) : null, 'The selection', floatShift, q => {
    if (q) { FL.x += q.x; FL.y += q.y; } commitFloat();
    if (more) stmAgain(f, again && again.x !== undefined ? { x: again.x + f.x - x, y: again.y + f.y - y } : null);   // a growth moved the art, and the point with it
  }, () => {});
}
/* Commit restores the source first, so history sees the true pixels: growing the canvas, then one stroke that erases the source and stamps the float. */
function commitFloat(stamp) {
  if (!FL) return; if (stamp !== false && FL.moved) floatSnap();   // here as well as during a drag, so no way of moving a layer can leave Place on tile off a cell center
  const f = FL, keep = floatSel(f); FL = null; stamp = stamp !== false;
  if (f.src) blitSrc(f.L, f, true);
  if (stamp && !f.moved) { selPut(keep); return; }
  const k = S.layers.indexOf(f.L), op = maskBox(f.px, f.w, f.h), ow = S.w, oh = S.h; let gx = 0, gy = 0;
  if (stamp && op) {
    const g = growTold({ x0: f.x + op.x0, y0: f.y + op.y0, x1: f.x + op.x1, y1: f.y + op.y1 }, 0);
    if (g) { gx = g.dx; gy = g.dy; f.x += gx; f.y += gy; if (f.src) { f.src.x += gx; f.src.y += gy; } } else toast('The canvas is at its size limit.');
  }
  const L = S.layers[k], s = f.src; beginStroke(L);
  if (s) for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.mask[y * s.w + x]) plotLayer(x + s.x, y + s.y, 0);
  if (stamp) for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const v = f.px[y * f.w + x]; if (v >>> 24) plotLayer(x + f.x, y + f.y, v); }
  const pos = H.pos; endStroke();
  const before = keep ? stampMask(keep, gx, gy, ow, oh) : null, m = f.whole ? before : stamp ? stampMask(f.mask, f.x, f.y, f.w, f.h) : null;
  if (H.pos > pos) {   // undo puts the selection back with the pixels, or the next action would land on the wrong area
    const e = H.stack[H.pos - 1], u = e.undo, r = e.redo, n = S.w * S.h * 2;
    e.undo = () => { u(); selPut(before); }; e.redo = () => { r(); selPut(m); }; e.bytes += n; H.bytes += n;
    if (f.pv && stamp) pivotWrap(e, L, { x: f.x + f.pv.x, y: f.y + f.pv.y });
  }
  selPut(m);
}
function stampMask(src, x0, y0, w, h) {
  const m = new Uint8Array(S.w * S.h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const nx = x + x0, ny = y + y0; if (src[y * w + x] && nx >= 0 && ny >= 0 && nx < S.w && ny < S.h) m[ny * S.w + nx] = 1; }
  return m;
}
function cancelFloat() {
  if (!FL) return; const f = FL; FL = null;
  if (f.src) blitSrc(f.L, f, true);
  selPut(floatSel(f) || null);
}
function nudge(dx, dy) {
  if (!FL) { needSelTool(); if (!liftSel(false)) return; }
  if (floatPin(FL)) { const s = cellStep(); dx = Math.sign(dx) * s.x; dy = Math.sign(dy) * s.y; }   // a single pixel would snap straight back
  FL.x += dx; FL.y += dy; FL.moved = true; requestRender();
}

/* ---------- pointer: both selection tools move a selection the same way ---------- */
const inFloat = a => a.x >= FL.x && a.y >= FL.y && a.x < FL.x + FL.w && a.y < FL.y + FL.h && FL.mask[(a.y - FL.y) * FL.w + a.x - FL.x];
const inSel = a => SEL.mask && a.x >= 0 && a.y >= 0 && a.x < S.w && a.y < S.h && SEL.mask[a.y * S.w + a.x];
function selStart(a, e) {
  const op = e.shiftKey ? 'add' : e.altKey ? 'sub' : SEL.op;
  if (FL) { selDrag = inFloat(a) ? { kind: 'float', ax: a.x, ay: a.y, x: FL.x, y: FL.y } : null; if (!selDrag) floatDone(e.shiftKey && a); return; }
  if (inSel(a) && (op === 'set' || e.altKey)) selDrag = { kind: 'lift', ax: a.x, ay: a.y, dup: e.altKey, op };
  else selDrag = { kind: 'new', ax: a.x, ay: a.y, op, wand: drawTool === 'wand' };
  if (selDrag.kind === 'new' && !selDrag.wand) selRect(a);
}
function selRect(a) {
  const d = selDrag;
  SEL.rect = { x0: Math.max(0, Math.min(d.ax, a.x)), y0: Math.max(0, Math.min(d.ay, a.y)), x1: Math.min(S.w - 1, Math.max(d.ax, a.x)), y1: Math.min(S.h - 1, Math.max(d.ay, a.y)) };
  requestRender();
}
function selMove(a) {
  const d = selDrag; if (!d) return;
  if (d.kind === 'lift') { if (!liftSel(d.dup)) { selDrag = null; return; } selDrag = { kind: 'float', ax: d.ax, ay: d.ay, x: FL.x, y: FL.y }; selMove(a); return; }
  if (d.kind === 'float') { FL.x = d.x + a.x - d.ax; FL.y = d.y + a.y - d.ay; FL.moved = true; floatSnap(); requestRender(); }
  else if (!d.wand) { d.moved = true; selRect(a); }
}
function selEnd() {
  const d = selDrag; selDrag = null; if (!d) return;
  const r = SEL.rect; SEL.rect = null;
  if (d.kind === 'lift') { if (drawTool === 'wand') selCombine(wandMask(d.ax, d.ay), 'set'); else selPut(null); }
  else if (d.kind === 'new') {
    if (d.wand) selCombine(wandMask(d.ax, d.ay), d.op);
    else if (d.moved && r.x0 <= r.x1 && r.y0 <= r.y1) selCombine(rectMask(r.x0, r.y0, r.x1, r.y1), d.op);
    else if (d.op === 'set') selPut(null);
  }
  requestRender();
}
function selAbort() { selDrag = null; SEL.rect = null; requestRender(); }

/* ---------- clipboard ---------- */
function copySel() {
  if (FL) { clip = { w: FL.w, h: FL.h, px: FL.px.slice() }; clipStale = false; return true; }
  if (!SEL.mask) { toast('Select something first.'); return false; }
  const g = grabSel(activeLayer()); clip = { w: g.w, h: g.h, px: g.px }; clipStale = false; return true;
}
function deleteSel() {
  if (FL) { if (FL.src || FL.sel) commitFloat(false); else cancelFloat(); return; }
  if (!SEL.mask) { toast('Select something first.'); return; }
  if (!canEdit()) return;
  const b = SEL.box; beginStroke(activeLayer());
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) plotLayer(x, y, 0);
  endStroke();
}
function cutSel() { if (copySel()) deleteSel(); }
function duplicateSel() {
  commitFloat(); if (!SEL.mask) { toast('Select something first.'); return; }
  needSelTool(); if (liftSel(true)) nudge(4, 4);
}
function viewCenter() { return { x: Math.round((vw / 2 - S.ox) / S.z), y: Math.round((vh / 2 - S.oy) / S.z) }; }
/* Pasted pixels stay on the float until commit, so a paste past the edge shows and then grows the canvas. */
function pasteBuf(b, at) {
  commitFloat(); if (!canEdit()) return false;
  needSelTool(); const p = at || viewCenter();
  SEL.mask = null; SEL.box = null;
  floatMake({ L: activeLayer(), px: b.px.slice(), mask: b.px.map(v => v >>> 24 ? 1 : 0), w: b.w, h: b.h, x: p.x - (b.w >> 1), y: p.y - (b.h >> 1), sel: null, moved: true, src: null });
  return true;
}
/* No blending: a pasted image keeps only fully opaque or fully transparent pixels. */
async function imageBuf(blob) {
  const bmp = await createImageBitmap(blob), w = bmp.width, h = bmp.height;
  if (!sizeOk(Math.max(w, 16), Math.max(h, 16))) { toast('That image is too large to paste.'); return null; }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
  const px = new Uint32Array(x.getImageData(0, 0, w, h).data.buffer).map(v => (v >>> 24) < 128 ? 0 : (v | 0xff000000) >>> 0);
  return { w, h, px };
}
/* The internal clipboard is the newer one until the page loses focus: only then can something else have been copied. */
async function pasteSystem(at) {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find(t => t.startsWith('image/')); if (!type) continue;
      const b = await imageBuf(await item.getType(type)); if (b) return pasteBuf(b, at);
    }
  } catch (_) {}
  return false;
}
async function pasteClip(at) {
  if (clip && !clipStale) { pasteBuf(clip, at); return; }
  if (await pasteSystem(at)) return;
  if (clip) pasteBuf(clip, at); else toast('Nothing to paste.');
}

/* ---------- transforms: inverse mapping from each new pixel, nearest-neighbor, integer only ---------- */
const wallDrop = (w, rev) => x => (rev ? w - 1 - x : x) >> 1;
const wallOp = rev => (w, h) => {
  const drop = wallDrop(w, rev), max = (w - 1) >> 1;
  return { w, h: h + max, at: (x, y) => { const sy = y - drop(x); return sy >= 0 && sy < h ? sy * w + x : -1; } };
};
const unwallOp = rev => (w, h) => {
  const drop = wallDrop(w, rev), max = (w - 1) >> 1;
  return { w, h: h + max, dy: -max, trim: true, at: (x, y) => { const sy = y - max + drop(x); return sy >= 0 && sy < h ? sy * w + x : -1; } };
};
const BUF_OPS = {
  flipH: (w, h) => ({ w, h, at: (x, y) => y * w + w - 1 - x }),
  flipV: (w, h) => ({ w, h, at: (x, y) => (h - 1 - y) * w + x }),
  rot90: (w, h) => ({ w: h, h: w, center: true, at: (x, y) => (h - 1 - x) * w + y }),
  rot180: (w, h) => ({ w, h, at: (x, y) => (h - 1 - y) * w + w - 1 - x }),
  rot270: (w, h) => ({ w: h, h: w, center: true, at: (x, y) => x * w + w - 1 - y }),
  wallL: wallOp(false), wallR: wallOp(true), unwallL: unwallOp(false), unwallR: unwallOp(true),
  /* The 2:1 diamond: N x N becomes 2N x N with rows 2, 6, 10... wide. Sampling pixel centers would only ever hit sources with an even x + y and turn
     a checker texture solid, so odd columns read the neighboring diagonal and every source pixel lands exactly once. The lower half sits one column left to keep the outline symmetric. */
  top: (w, h) => { const nh = (w + h + 1) >> 1; return { w: w + h, h: nh, center: true, at: (x, y) => {
    const p = x - h + (y * 2 >= nh ? 1 : 0), s = 2 * y + (p & 1 ? (p < 0 ? 1 : -1) : 0), sx = (s + p) / 2, sy = (s - p) / 2;
    return sx >= 0 && sy >= 0 && sx < w && sy < h ? sy * w + sx : -1;
  } }; }
};
function remapBuf(src, op) {
  const out = new (src.constructor)(op.w * op.h);
  for (let y = 0, i = 0; y < op.h; y++) for (let x = 0; x < op.w; x++, i++) { const k = op.at(x, y); if (k >= 0) out[i] = src[k]; }
  return out;
}
/* Rows left empty by a wall undo are dropped, so the float stays tight around its pixels. */
function applyOp(name) {
  const f = FL, op = BUF_OPS[name](f.w, f.h);
  if (f.pv && PIVOT_OPS[name]) f.pv = PIVOT_OPS[name](f.pv, f.w, f.h);
  if (f.st) f.st.pv = f.st.pv && PIVOT_OPS[name] ? PIVOT_OPS[name](f.st.pv, f.w, f.h) : null;   // a projected stamp has no feet to stand on
  let px = remapBuf(f.px, op), mask = remapBuf(f.mask, op), idx = f.st && remapBuf(f.st.idx, op), nh = op.h, top = 0;
  if (op.center) { f.x += Math.trunc((f.w - op.w) / 2); if (name !== 'top') f.y += Math.trunc((f.h - op.h) / 2); }
  if (op.dy) f.y += op.dy;
  if (op.trim) {
    const b = maskBox(mask, op.w, nh);
    if (b) { top = b.y0; nh = b.y1 - b.y0 + 1; px = px.slice(top * op.w, (top + nh) * op.w); mask = mask.slice(top * op.w, (top + nh) * op.w); if (idx) idx = idx.slice(top * op.w, (top + nh) * op.w); f.y += top; }
  }
  if (idx) f.st.idx = idx;
  f.px = px; f.mask = mask; f.w = op.w; f.h = nh; f.moved = true; floatCanvas(f); selRefresh();
}
function liftWhole() {
  const b = contentBox(activeLayer()); if (!b) { toast('This layer is empty.'); return false; }
  if (!canEdit()) return false;
  const keep = SEL.mask, box = SEL.box;
  SEL.mask = rectMask(b.x0, b.y0, b.x1, b.y1); SEL.box = b;
  if (!liftSel(false)) { SEL.mask = keep; SEL.box = box; return false; }
  FL.whole = keep || true; return true;
}
function endWhole() { commitFloat(); }
/* With nothing selected, a transform acts on the whole layer straight away. A selection stays floating, so it can be placed before committing. */
function transform(name) {
  if (FL) { applyOp(name); return; }
  if (SEL.mask) { needSelTool(); if (liftSel(false)) applyOp(name); return; }
  if (liftWhole()) { applyOp(name); endWhole(); }
}
function mirrorLayer() { commitFloat(); if (liftWhole()) { applyOp('flipH'); endWhole(); } }

const SEL_ACTIONS = {
  all: selectAll, none: selectNone, invert: selectInvert, content: selectContent, cut: cutSel, copy: copySel, delete: deleteSel, duplicate: duplicateSel,
  paste: () => pasteClip(), done: () => floatDone(), cancel: cancelFloat, mirror: mirrorLayer, stamp: () => openStampSave()
};

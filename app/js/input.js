'use strict';
/* qtiles input: pen and mouse draw, fingers pan and pinch (or draw, if switched), the Hand tool pans with any of them, keyboard shortcuts.
   Two-finger tap = undo, three-finger tap = redo. A pen on the glass makes touches ignored (palm rejection). */

const ptrs = new Map();
let drawId = null, drawTool = null, drawFinger = false, panId = null, panLast = null, gesture = null;
let shadeNow = null, dith = null, gradFrame = 0, penPP = null, shapeKeys = { shift: false, alt: false };
let penDown = false, lastPenUp = 0, spaceDown = false, tabbing = false, shape = null, lastArt = null, tap = null, lastWheel = 0, placingAxis = false;

function local(e) { const r = view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function toArt(p) { return { x: Math.floor((p.x - pxSnap(S.ox)) / S.z), y: Math.floor((p.y - pxSnap(S.oy)) / S.z) }; }
const pastEdge = b => b.x0 < 0 || b.y0 < 0 || b.x1 >= S.w || b.y1 >= S.h;
/* In iso mode the mirror line snaps to tile corners, the pixel a block's corner sits on, so walls meet exactly. */
function axisAt(p) {
  const cx = Math.max(0, Math.min(S.w, (p.x - S.ox) / S.z)), cy = Math.max(0, Math.min(S.h, (p.y - S.oy) / S.z));
  if (S.mode === 'iso' && S.axisSnap) {
    const hw = S.tile / 2, hh = S.tile / 4;
    S.axisX = 2 * (S.gox + Math.round((cx - 0.5 - S.gox) / hw) * hw); S.axisY = 2 * (S.goy + Math.round((cy - 0.5 - S.goy) / hh) * hh);
  } else if (S.mode !== 'iso' && S.snap !== 'pixel') { const c = S.cell; S.axisX = 2 * c * Math.round(cx / c) - 1; S.axisY = 2 * c * Math.round(cy / c) - 1; }   // on a cell border, so a mirrored cell is a cell
  else { S.axisX = Math.round(cx * 2) - 1; S.axisY = Math.round(cy * 2) - 1; }
  setDirty(true); requestRender();
}

function startPan(id) { panId = id; panLast = { x: ptrs.get(id).x, y: ptrs.get(id).y }; view.classList.add('panning'); }
function touches() { return [...ptrs.values()].filter(p => p.type === 'touch'); }
function startGesture() {
  const t = touches(); if (t.length < 2) return;
  cancelAnimationFrame(glide);
  const mid = { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 };
  gesture = { d0: Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1, z0: S.z, art: { x: (mid.x - S.ox) / S.z, y: (mid.y - S.oy) / S.z } };
  panId = null;
}
function gestureMove() {
  const t = touches(); if (t.length < 2 || !gesture) return;
  const mid = { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 }, d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
  S.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, gesture.z0 * d / gesture.d0)); gesture.mid = mid;
  S.ox = mid.x - gesture.art.x * S.z; S.oy = mid.y - gesture.art.y * S.z; hooks.zoom && hooks.zoom();
}
function endGesture() {
  if (!gesture) return; const m = gesture.mid || { x: vw / 2, y: vh / 2 }; gesture = null;
  zoomGlide(zoomSnap(S.z), m.x, m.y);
}

function previewShape() {
  if (!shape) return;
  const e = shapeEnds(shape.x0, shape.y0, shape.x1, shape.y1, drawTool);
  [shape.ax, shape.ay, shape.ex, shape.ey] = drawTool === 'ellipse' ? ovalEnds(e) : e;
  pvDraw(plot => shapeP(plot, inkV()));
}
function shapeP(plot, v) {
  const m = mirrored(plot);
  if (drawTool === 'line') (S.mode === 'iso' && S.lineSnap ? edgeLineP : lineP)(shape.ax, shape.ay, shape.ex, shape.ey, stamper(S.brush, m), v);
  else if (drawTool === 'ellipse') { if (S.ovalFill) ovalP(shape.ax, shape.ay, shape.ex, shape.ey, true, m, v); ovalP(shape.ax, shape.ay, shape.ex, shape.ey, false, stamper(S.brush, m), v); }
  else rectP(shape.ax, shape.ay, shape.ex, shape.ey, S.rectFill, m, v);
}
/* Shift keeps the ellipse a circle and Alt draws it out from the pixel it started on, as Circle and From center do for a finger. From the center the size is odd, as the middle is a pixel. */
function ovalEnds(e) {
  let [ax, ay, ex, ey] = e, dx = ex - ax, dy = ey - ay;
  if (S.ovalCircle || shapeKeys.shift) { const n = Math.max(Math.abs(dx), Math.abs(dy)); dx = dx < 0 ? -n : n; dy = dy < 0 ? -n : n; }
  return S.ovalCenter || shapeKeys.alt ? [ax - Math.abs(dx), ay - Math.abs(dy), ax + Math.abs(dx), ay + Math.abs(dy)] : [ax, ay, ax + dx, ay + dy];
}
/* Dragging out from the center. Either axis sets the size, so a drag straight down works as well as one across. */
function ellipseP(plot) { shadowEllipseP(mirrored(plot), shape.x0, shape.y0, shape.rx, shape.v, S.shadowEdge === 'checker'); }
function previewEllipse() { shape.rx = Math.max(2, Math.abs(cornerSnap(shape.x1) - shape.x0), 2 * Math.abs(cornerSnap(shape.y1) - shape.y0)); pvDraw(ellipseP); }
function startEllipse(a) {
  const have = activeLayer().kind === 'shadow' ? activeLayer() : shadowOf(activeLayer());
  if (have && !canEdit(have)) return false;
  shape = { x0: cornerSnap(a.x), y0: cornerSnap(a.y), x1: a.x, y1: a.y, v: shadowColor() }; previewEllipse(); return true;
}
function commitEllipse() {
  pvClear(); growForShape(ellipseP);
  const t = shadowTarget(activeLayer()), next = t.L.px.slice(), put = pxInto(next);
  ellipseP((x, y, v) => { if (!SEL.mask || SEL.mask[y * S.w + x]) put(x, y, v); });
  bakeLayer(t.L, next, t.list); shape = null;
}
function pickAt(a) {
  if (refPickArt(a)) return;
  if (a.x < 0 || a.y < 0 || a.x >= S.w || a.y >= S.h) return;
  const v = flatAt(a.y * S.w + a.x); if (v >>> 24) setColor(rgbToHex(v & 255, (v >>> 8) & 255, (v >>> 16) & 255));
}

/* Dither shows on the preview layer and is painted on release, so a whole stroke is one undo step and can grow the canvas to fit. */
function ditherSeg(plot, x0, y0, x1, y1) {
  const m = mirrored(plot), paint = dith.paint;
  strokeP(x0, y0, x1, y1, dith.n, (x, y) => { const v = paint(x, y); if (v !== null) m(x, y, v); });
}
function ditherPath(plot) {
  const q = dith.pts;
  for (let k = 0; k < q.length; k += 2) ditherSeg(plot, q[Math.max(0, k - 2)], q[Math.max(1, k - 1)], q[k], q[k + 1]);
}
function setGradArea(a) {
  GR.area = { x0: Math.max(0, Math.min(dith.x, a.x)), y0: Math.max(0, Math.min(dith.y, a.y)), x1: Math.min(S.w - 1, Math.max(dith.x, a.x)), y1: Math.min(S.h - 1, Math.max(dith.y, a.y)) };
}
function startDither(a) {
  if (S.ditherMode === 'brush') { dith = { kind: 'brush', n: S.brush, paint: ditherPainter(), pts: [a.x, a.y] }; pvAdd(plot => ditherPath(plot)); }
  else if (GR.area || SEL.box) { GR.area = GR.area || Object.assign({}, SEL.box); dith = { kind: 'line' }; GR.line = { ax: a.x, ay: a.y, bx: a.x, by: a.y }; }
  else { dith = { kind: 'area', x: a.x, y: a.y }; setGradArea(a); }
}
function moveDither(a) {
  if (!dith) return;
  if (dith.kind === 'brush') { const q = dith.pts, n = q.length; q.push(a.x, a.y); pvAdd(plot => ditherSeg(plot, q[n - 2], q[n - 1], a.x, a.y)); }
  else if (dith.kind === 'area') setGradArea(a);
  else {   // the preview costs as much as the rectangle, so draw it at most once a frame
    GR.line.bx = a.x; GR.line.by = a.y;
    if (!gradFrame) gradFrame = requestAnimationFrame(() => { gradFrame = 0; if (GR.line) pvDraw(plot => gradientP(GR.area, GR.line, plot)); });
  }
}
function commitDither() {
  if (!dith) return;
  if (dith.kind === 'area') { const a = GR.area; if (a.x0 >= a.x1 || a.y0 >= a.y1) GR.area = null; }
  else if (dith.kind === 'brush') {
    pvClear(); const g = growForShape(ditherPath), q = dith.pts;
    if (g) q.forEach((v, k) => { q[k] = v + (k & 1 ? g.dy : g.dx); });
    beginStroke(activeLayer()); ditherPath(plotLayer); endStroke();
  } else {
    const a = GR.area, l = GR.line; GR.line = null; pvClear();
    if (l.ax !== l.bx || l.ay !== l.by) {
      const g = growForShape(plot => gradientP(a, l, plot));
      if (g) for (const [o, ks] of [[a, ['x0', 'y0', 'x1', 'y1']], [l, ['ax', 'ay', 'bx', 'by']]]) ks.forEach((k, n) => { o[k] += n & 1 ? g.dy : g.dx; });
      beginStroke(activeLayer()); gradientP(a, l, plotLayer); endStroke();
    }
    GR.area = null;
  }
  dith = null; syncDither();
}

function startStroke(e, p) {
  LOCK_NOTE.told = false;
  const a = toArt(p); lastArt = a; drawFinger = e.pointerType === 'touch'; if (!drawFinger) hover = a;   // no hover before the tip lands on an iPad without it
  drawTool = (e.pointerType === 'pen' && (e.buttons & 32)) ? 'eraser' : S.tool;
  if (placingAxis) { drawTool = 'axis'; drawId = e.pointerId; axisAt(p); return; }
  if (drawTool === 'picker') { drawId = e.pointerId; pickAt(a); return; }
  if (selTool(drawTool)) { drawId = e.pointerId; selStart(a, e); return; }
  if (drawTool === 'shadow') { if (startEllipse(a)) drawId = e.pointerId; return; }   // it writes to the shadow layer, so a locked source does not stop it
  if (drawTool === 'pick') { drawId = e.pointerId; PK.alt = e.altKey; pickStart(a, e.shiftKey); return; }
  if (drawTool === 'place') { if (placeStart(a)) drawId = e.pointerId; return; }
  if (drawTool === 'terrain') { if (terrainStart(a)) drawId = e.pointerId; return; }
  if (drawTool === 'scatter') { if (scatterStart(a)) drawId = e.pointerId; return; }
  if (drawTool === 'pivot') { if (pivotStart(a)) drawId = e.pointerId; return; }
  let L = activeLayer();
  if (!shownSet()(L)) { toast('This layer is hidden. Show it to draw on it.'); return; }
  if (lockedOf(L)) { toast('This layer is locked. Unlock it in the Layers panel.'); return; }
  if (L.objectLayer) { toast(OBJ_MSG); return; }
  const box = mirrorBox(a.x, a.y, brushed(drawTool) ? S.brush : 0);
  if ((drawTool === 'pencil' || drawTool === 'eraser' || shapeTool(drawTool)) && pastEdge(box)) {
    const g = growToInclude(box.x0, box.y0, box.x1, box.y1, 32);
    if (g) { a.x += g.dx; a.y += g.dy; L = activeLayer(); } else toast('The canvas is at its size limit.');
  }
  drawId = e.pointerId;
  if (drawTool === 'pencil' || drawTool === 'eraser') {
    beginStroke(L); penPP = null; penSeg(a, a); flushStroke();
  } else if (shapeTool(drawTool)) {
    shape = { x0: a.x, y0: a.y, x1: a.x, y1: a.y }; previewShape();
  } else if (drawTool === 'fill') { floodFill(a.x, a.y); drawId = null; }
  else if (drawTool === 'shade') {
    shadeNow = mirrored(shadeP(rampStepMap(S.shadeDir), new Set()));
    beginStroke(L); strokeP(a.x, a.y, a.x, a.y, S.brush, shadeNow); flushStroke();
  } else if (drawTool === 'dither') startDither(a);
  else if (drawTool === 'tile') tileStart(a);
}
function moveStroke(a) {
  if (lastArt && a.x === lastArt.x && a.y === lastArt.y) return;
  if (cellBrush() && lastArt && !shapeTool(drawTool) && brushed(drawTool) && Math.floor(a.x / S.cell) === Math.floor(lastArt.x / S.cell) && Math.floor(a.y / S.cell) === Math.floor(lastArt.y / S.cell)) { lastArt = a; return; }   // the cell is painted already, and a big one costs a stamp per move
  if (drawTool === 'pencil' || drawTool === 'eraser') {
    const box = mirrorBox(a.x, a.y, S.brush);
    if (pastEdge(box)) {   // drawing past the edge, on either side of a mirror, grows the canvas; the stroke carries on in a second undo step
      const g = growToInclude(box.x0, box.y0, box.x1, box.y1, 32, endStroke);
      if (g && !g.locked) { a.x += g.dx; a.y += g.dy; lastArt.x += g.dx; lastArt.y += g.dy; beginStroke(activeLayer()); penPP = null; }
    }
    penSeg(lastArt, a); flushStroke();
  } else if (shapeTool(drawTool)) { shape.x1 = a.x; shape.y1 = a.y; previewShape(); }
  else if (drawTool === 'place') placeMove(a);
  else if (drawTool === 'pick') pickMove(a);
  else if (drawTool === 'picker') pickAt(a);
  else if (selTool(drawTool)) selMove(a);
  else if (drawTool === 'shade') { strokeP(lastArt.x, lastArt.y, a.x, a.y, S.brush, shadeNow); flushStroke(); }
  else if (drawTool === 'dither') moveDither(a);
  else if (drawTool === 'shadow' && shape) { shape.x1 = a.x; shape.y1 = a.y; previewEllipse(); }
  else if (drawTool === 'tile' && TL.drag) tileMove(a);
  else if (drawTool === 'terrain') terrainMove(a);
  else if (drawTool === 'scatter') scatterMove(a);
  else if (drawTool === 'pivot') pivotMove(a);
  lastArt = a;
}
/* Pencil and eraser. At brush 1 with Pixel-perfect on, the path goes through its filter, which starts again with each stroke and after the canvas grows, as the points it holds belong to the stroke before. */
function penSeg(p, q) {
  const v = drawTool === 'eraser' ? 0 : inkV();
  if (S.brush === 1 && perfectOn()) { penPP = penPP || perfectP(plotLayer, unplotLayer); lineP(p.x, p.y, q.x, q.y, penPP, v); }
  else strokeP(p.x, p.y, q.x, q.y, S.brush, mirrored(plotLayer), v);
}
function commitStroke() {
  if (drawTool === 'axis') { placingAxis = false; syncMirror(); }
  else if (drawTool === 'pencil' || drawTool === 'eraser' || drawTool === 'shade') endStroke();
  else if (drawTool === 'dither') commitDither();
  else if (drawTool === 'shadow' && shape) commitEllipse();
  else if (drawTool === 'tile' && TL.drag) tileCommit();
  else if (selTool(drawTool)) selEnd();
  else if (shapeTool(drawTool) && shape) {
    pvClear(); growForShape(plot => shapeP(plot, 0));
    const L = activeLayer(); beginStroke(L); shapeP(plotLayer, inkV());
    endStroke(); pvClear(); shape = null;
  } else if (drawTool === 'place' && PL.drag) placeCommit();
  else if (drawTool === 'pick') pickEnd();
  else if (drawTool === 'terrain') terrainEnd();
  else if (drawTool === 'scatter') scatterEnd();
  else if (drawTool === 'pivot') pivotEnd();
  drawId = null;
}
/* A finished shape that reaches past the edge grows the canvas first, so nothing is clipped. Shape coordinates shift with it. */
function growForShape(run) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  run((x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
  if (x1 < 0 || x0 > 1e8 || (x0 >= 0 && y0 >= 0 && x1 < S.w && y1 < S.h)) return;
  const g = growToInclude(x0, y0, x1, y1, 8);
  if (!g) { toast('The canvas is at its size limit.'); return; }
  if (shape) { shape.x0 += g.dx; shape.y0 += g.dy; shape.ax += g.dx; shape.ay += g.dy; shape.ex += g.dx; shape.ey += g.dy; }
  return g;
}
function abortStroke() { cancelStroke(); pivotAbort(); pvClear(); shape = null; PL.drag = null; pickAbort(); dith = null; TL.drag = null; TR.drag = null; SC.drag = null; GR.line = null; drawId = null; selAbort(); syncDither(); requestRender(); }

view.addEventListener('pointerdown', e => {
  e.preventDefault(); const p = local(e), t = e.pointerType;
  try { view.setPointerCapture(e.pointerId); } catch (_) {}
  if (RF.adjust && refDown(e, p)) return;   // the reference takes every pointer, and touch moves it rather than the view
  if (t === 'touch') {
    if (penDown || performance.now() - lastPenUp < 250) return;
    ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, type: t });
    if (ptrs.size === 1) { tap = { t0: performance.now(), max: 1, moved: false }; if (S.tool === 'hand') startPan(e.pointerId); else if (S.fingerDraws || placingAxis || selTool(S.tool) || S.tool === 'pick' || S.tool === 'pivot') startStroke(e, p); else startPan(e.pointerId); }
    else { if (tap) tap.max = Math.max(tap.max, ptrs.size); if (drawId !== null && drawFinger) abortStroke(); startGesture(); }
    return;
  }
  if (t === 'pen') { penDown = true; for (const [id, q] of ptrs) if (q.type === 'touch') ptrs.delete(id); gesture = null; if (drawId !== null && drawFinger) abortStroke(); panId = null; }
  if (t === 'mouse' && (e.button === 1 || e.button === 2 || spaceDown)) { ptrs.set(e.pointerId, { x: p.x, y: p.y, type: t }); startPan(e.pointerId); return; }
  if (t === 'mouse' && e.button !== 0) return;
  ptrs.set(e.pointerId, { x: p.x, y: p.y, type: t }); shapeKeys = { shift: e.shiftKey, alt: e.altKey };
  if (S.tool === 'hand') startPan(e.pointerId); else startStroke(e, p);
});
view.addEventListener('pointermove', e => {
  const p = local(e), a = toArt(p);
  if (e.pointerType !== 'touch') { hover = a; updateStatus(a); } else if (e.pointerId === drawId) updateStatus(a);
  if (RF.adjust && refMove(e, p)) { requestRender(); return; }
  const q = ptrs.get(e.pointerId);
  if (q) {
    if (tap && q.type === 'touch' && Math.hypot(p.x - q.sx, p.y - q.sy) > 12) tap.moved = true;
    q.x = p.x; q.y = p.y;
  }
  if (e.pointerId === panId && q) { S.ox += p.x - panLast.x; S.oy += p.y - panLast.y; panLast = { x: p.x, y: p.y }; }
  else if (gesture && e.pointerType === 'touch') gestureMove();
  else if (e.pointerId === drawId && drawTool === 'axis') axisAt(p);
  else if (e.pointerId === drawId) {
    const list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    PK.alt = e.altKey; shapeKeys = { shift: e.shiftKey, alt: e.altKey };
    for (const ce of (list.length ? list : [e])) moveStroke(toArt(local(ce)));
    if (e.pointerType !== 'touch') hover = toArt(p);   // growing the canvas shifts art coordinates
  } else if ((S.tool === 'place' || S.tool === 'terrain') && S.mode === 'iso' && drawId === null && !placingAxis && e.pointerType !== 'touch') (S.tool === 'place' ? placeHover : terrainHover)(a);
  requestRender();
});
function pointerEnd(e, cancelled) {
  const t = e.pointerType;
  if (t === 'pen') { penDown = false; lastPenUp = performance.now(); }
  if (refUp(e)) { requestRender(); return; }
  if (e.pointerId === drawId) { if (cancelled) abortStroke(); else commitStroke(); }
  if (e.pointerId === panId) { panId = null; view.classList.remove('panning'); }
  if (ptrs.delete(e.pointerId) && t === 'touch') {
    if (gesture && touches().length < 2) endGesture();
    if (ptrs.size === 0 && tap) {
      if (!cancelled && !tap.moved && performance.now() - tap.t0 < 350) { if (tap.max === 2) undo(); else if (tap.max === 3) redo(); }
      tap = null;
    }
  }
  requestRender();
}
view.addEventListener('pointerup', e => pointerEnd(e, false));
view.addEventListener('pointercancel', e => pointerEnd(e, true));
/* The pointer going onto the notice keeps the ghost the notice is about. */
function hoverGone() { hover = null; if (pvShown() && (S.tool === 'place' || S.tool === 'terrain')) pvClear(); requestRender(); }
view.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && drawId === null && !(e.relatedTarget && $('fitBar').contains(e.relatedTarget))) hoverGone(); });
view.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerdown', () => { tabbing = false; }, true);
view.addEventListener('wheel', e => {
  e.preventDefault(); const p = local(e), now = performance.now();
  const notch = e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && !e.deltaX);
  if (e.ctrlKey || notch) { if (now - lastWheel > 70) { zoomStep(e.deltaY < 0 ? 1 : -1, p.x, p.y); lastWheel = now; } }
  else { S.ox -= e.deltaX; S.oy -= e.deltaY; requestRender(); }
}, { passive: false });
['gesturestart', 'gesturechange', 'gestureend'].forEach(n => document.addEventListener(n, e => e.preventDefault()));

/* ---------- keyboard ---------- */
const KEYS = { b: 'pencil', e: 'eraser', l: 'line', r: 'rect', u: 'ellipse', g: 'fill', i: 'picker', c: 'place', a: 'pick', h: 'shade', d: 'dither', o: 'shadow', t: 'tile', n: 'terrain', q: 'scatter', v: 'marquee', w: 'wand', p: 'pivot', f: 'hand' };
document.addEventListener('keydown', e => {
  const tg = e.target.tagName; if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return;
  if (XP.job || !$('sheetNew').hidden) return;   // the art must hold still under an export; Esc cancels it in help.js
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (k === 'tab') tabbing = true;
  if (k === ' ' && tabbing && tg === 'BUTTON') return;   // Space presses a button reached by Tab. After a click it still pans
  if (k === ' ') { spaceDown = true; e.preventDefault(); return; }
  if (objKey(k, mod, e.shiftKey)) { e.preventDefault(); return; }
  const arrow = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k], sel = FL || SEL.mask;
  if (arrow && sel) { e.preventDefault(); const n = e.shiftKey ? 8 : 1; nudge(arrow[0] * n, arrow[1] * n); }
  else if (k === 'enter' && FL) floatDone();
  else if (k === 'escape' && FL) cancelFloat();
  else if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); deleteSel(); }
  else if (mod && k === 'a') { e.preventDefault(); selectAll(); }
  else if (mod && k === 'd') { e.preventDefault(); selectNone(); }
  else if (mod && k === 'i') { e.preventDefault(); selectInvert(); }
  else if (mod && k === 'j') { e.preventDefault(); duplicateSel(); }
  else if (mod && k === 'c') { if (sel) copySel(); }
  else if (mod && k === 'x') { if (sel) cutSel(); }
  else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
  else if (mod && k === 's') { e.preventDefault(); saveProject(); }
  else if (mod && k === ',') { e.preventDefault(); prefsOpen(); }
  else if (!mod && KEYS[k]) chooseTool(KEYS[k]);
  else if (!mod && k === 'x') swapColors();
  else if (k === 'm') setMode(S.mode === 'iso' ? 'flat' : 'iso');
  else if (k === 's') toggleMirror('mirrorX');
  else if ((k === '[' || k === ']') && brushed(heldTool())) setBrush(S.brush + (k === ']' ? 1 : -1));   // a size nothing shows must not change unseen
  else if (k === '+' || k === '=') zoomStep(1);
  else if (k === '-') zoomStep(-1);
  else if (k === '0') fitView();
  else if (!mod && k >= '1' && k <= '9') viewKey(+k - 1);
});
/* The paste event hands over a system image without a permission prompt. */
document.addEventListener('paste', async e => {
  const tg = e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || !$('sheetNew').hidden) return;
  const at = hover ? { x: hover.x, y: hover.y } : null, file = [...((e.clipboardData && e.clipboardData.files) || [])].find(f => f.type.startsWith('image/'));
  if (file && refSecOpen()) refAddFile(file);
  else if (file && (!clip || clipStale)) { const b = await imageBuf(file); if (b) pasteBuf(b, at); }
  else if (clip) pasteBuf(clip, at);
  else toast('Nothing to paste.');
});
window.addEventListener('blur', () => { clipStale = true; });
document.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });

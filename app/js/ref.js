'use strict';
/* qtiles references: a picture to trace over or to look at beside the work. A reference is an editor overlay: it is never in pixels, history, exports, thumbnails or the minimap,
   and only the picker and Make a pixel layer read it. Its place is in art coordinates, with its center at (x, y), so it stays on the art when the view moves and shifts with a resize.
   The image is decoded once and kept small (REF_SIDE), and its encoded copy is made when it is added, so a save reads it at once. */

const REF_MAX = 3, REF_SIDE = 2048, REF_CAP = 1.5e6, REF_OPACITY = 40, REF_STEP = 15, REF_MIN_PX = 4, REF_PIX_MAX = 4194304, REF_PV_MAX = 262144, REF_SAMPLE = 65536;
const REF_DATA = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/, REF_FILE = /^image\/(png|jpeg|webp|gif)$/, REF_EXT = /\.(png|jpe?g|webp|gif)$/i;
const REF_HELP = ['Adjust', 'Moves, scales and turns the reference. Nothing is drawn while it is on.', 'drag to move it, a corner to scale it (Shift frees its shape), the round handle to turn it (Alt for any angle). Two fingers scale and turn it, not the view.'];
/* at: the reference the section shows. shown: the Guides switch, for this session. touch: pointers on the canvas in Adjust. win: the window's own view of its picture. */
const RF = { list: [], at: -1, seq: 1, shown: true, adjust: false, snap: true, drag: null, pinch: null, moved: false, touch: new Map(), picked: null, one: null, bad: 0,
  win: { id: 0, z: 1, ox: 0, oy: 0, w: 0, h: 0, ptrs: new Map(), pinch: null, tap: null } };

const refCur = () => RF.list[RF.at] || null;
const refShown = r => RF.shown && !r.hidden;
const refRad = r => r.rot * Math.PI / 180;
const refAngle = v => ((v % 360) + 540) % 360 - 180;
const refPose = r => ({ x: r.x, y: r.y, scale: r.scale, scaleY: r.scaleY, rot: r.rot });
const refImage = f => REF_FILE.test(f.type) || REF_EXT.test(f.name || '');
const refPng = f => f.type === 'image/png' || /\.png$/i.test(f.name || '');
/* From art to image pixels and back. The picker, the frame and the handles all go through these, so they agree with what is drawn. */
function refToImg(r, ax, ay) { const a = refRad(r), c = Math.cos(a), s = Math.sin(a), dx = ax - r.x, dy = ay - r.y; return { x: (dx * c + dy * s) / r.scale + r.w / 2, y: (-dx * s + dy * c) / r.scaleY + r.h / 2 }; }
function refToArt(r, ix, iy) { const a = refRad(r), c = Math.cos(a), s = Math.sin(a), u = (ix - r.w / 2) * r.scale, v = (iy - r.h / 2) * r.scaleY; return { x: r.x + u * c - v * s, y: r.y + u * s + v * c }; }
const refCorners = r => [[0, 0], [r.w, 0], [r.w, r.h], [0, r.h]].map(([i, j]) => refToArt(r, i, j));
function refNew(o) { return Object.assign({ id: RF.seq++, name: 'Reference', x: 0, y: 0, scale: 1, scaleY: 1, rot: 0, opacity: REF_OPACITY, above: true, pixelated: false, locked: false, hidden: false, window: false, keep: true, pix: null }, o); }
/* Whole and centered on the canvas, unturned. */
function refFit(r) { const k = Math.min(S.w / r.w, S.h / r.h); Object.assign(r, { scale: k, scaleY: k, rot: 0, x: S.w / 2, y: S.h / 2 }); }
function refShift(dx, dy) { for (const r of RF.list) { r.x += dx; r.y += dy; } }
function refReset() { RF.list = []; RF.at = -1; RF.picked = null; RF.bad = 0; if (RF.adjust) refAdjustSet(false); else refSync(); }

/* ---------- on the canvas ---------- */
/* Pixelated is the picture as the art grid would hold it: one smooth sample per art pixel, inside the canvas, drawn again only when the reference or the canvas moves. */
function refPix(r) {
  const key = [r.x, r.y, r.scale, r.scaleY, r.rot, S.w, S.h].join();
  if (r.pix && r.pix.key === key) return r.pix;
  const q = refCorners(r), xs = q.map(p => p.x), ys = q.map(p => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), x1 = Math.min(S.w, Math.ceil(Math.max(...xs))), y1 = Math.min(S.h, Math.ceil(Math.max(...ys)));
  if (x1 <= x0 || y1 <= y0 || (x1 - x0) * (y1 - y0) > REF_PIX_MAX) { r.pix = { key, cv: null }; return r.pix; }   // past this it is drawn smooth, as one canvas the size of a big drawing costs more than it shows
  const cv = (r.pix && r.pix.cv) || document.createElement('canvas'); cv.width = x1 - x0; cv.height = y1 - y0;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.translate(r.x - x0, r.y - y0); c.rotate(refRad(r)); c.drawImage(r.img, -r.w * r.scale / 2, -r.h * r.scaleY / 2, r.w * r.scale, r.h * r.scaleY);
  r.pix = { key, cv, x0, y0 }; return r.pix;
}
function refPaint(c, r, x, y, z) {
  c.save(); c.globalAlpha = r.opacity / 100;
  const p = r.pixelated && refPix(r);
  if (p && p.cv) { c.imageSmoothingEnabled = false; c.drawImage(p.cv, x + p.x0 * z, y + p.y0 * z, p.cv.width * z, p.cv.height * z); }
  else {
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.translate(x + r.x * z, y + r.y * z); c.rotate(refRad(r));
    const w = r.w * r.scale * z, h = r.h * r.scaleY * z; c.drawImage(r.img, -w / 2, -h / 2, w, h);
  }
  c.restore();
}
/* Called twice from render, inside the canvas clip: under the art and over it. */
function refDraw(c, x, y, z, above) { for (const r of RF.list) if (refShown(r) && r.above === above) refPaint(c, r, x, y, z); }
const refGrip = () => COARSE() ? 22 : 12;
function refHandles(r) {
  const q = refCorners(r).map(p => ({ x: S.ox + p.x * S.z, y: S.oy + p.y * S.z })), top = { x: (q[0].x + q[1].x) / 2, y: (q[0].y + q[1].y) / 2 }, a = refRad(r), off = refGrip() * 2;
  return { corners: q, top, turn: { x: top.x + Math.sin(a) * off, y: top.y - Math.cos(a) * off } };
}
/* The frame shows only in Adjust, outside the clip, so a reference past the canvas edge can still be reached. */
function refFrame(c) {
  const r = refCur(); if (!RF.adjust || !r) return;
  const h = refHandles(r), g = refGrip() / 2;
  c.save(); c.strokeStyle = TH.accent; c.lineWidth = 1.5; if (r.locked) c.setLineDash([6, 4]);
  c.beginPath(); h.corners.forEach((p, k) => k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.stroke(); c.setLineDash([]);
  if (!r.locked) {
    c.beginPath(); c.moveTo(h.top.x, h.top.y); c.lineTo(h.turn.x, h.turn.y); c.stroke();
    c.fillStyle = TH.panel;
    for (const p of h.corners) { c.fillRect(p.x - g / 2, p.y - g / 2, g, g); c.strokeRect(p.x - g / 2, p.y - g / 2, g, g); }
    c.beginPath(); c.arc(h.turn.x, h.turn.y, g * 0.6, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  c.restore();
}

/* ---------- Adjust ---------- */
function refAdjustSet(on) {
  const r = refCur(); if (on && !r) return;
  RF.adjust = on; RF.drag = null; RF.pinch = null; RF.touch.clear();
  if (on) { commitFloat(); pvClear(); if (r.hidden) { r.hidden = false; setDirty(true); } }
  view.classList.toggle('refadj', on); refSync(); syncToolHelp();
  if (on) panelGo('reference');
  requestRender();
}
function refHit(r, p) {
  const h = refHandles(r), d = refGrip();
  if (Math.hypot(p.x - h.turn.x, p.y - h.turn.y) <= d) return { kind: 'turn' };
  for (let k = 0; k < 4; k++) if (Math.hypot(p.x - h.corners[k].x, p.y - h.corners[k].y) <= d) return { kind: 'corner', k };
  return { kind: 'move' };
}
const refArtAt = p => ({ x: (p.x - S.ox) / S.z, y: (p.y - S.oy) / S.z });
/* Returns false for what the view should still have: a middle or right drag, or one with Space held, pans as usual. */
function refDown(e, p) {
  if (e.pointerType === 'mouse' && (e.button !== 0 || spaceDown)) return false;
  const r = refCur(); RF.touch.set(e.pointerId, { x: p.x, y: p.y });
  if (!r) return true;
  if (r.locked) { if (RF.touch.size === 1) toast('This reference is locked. Unlock it in the Reference section to move it.'); return true; }
  if (RF.touch.size === 2) { const [a, b] = [...RF.touch.values()]; RF.drag = null; RF.pinch = { a: { ...a }, b: { ...b }, r0: refPose(r) }; return true; }
  if (RF.touch.size > 2) return true;
  const hit = refHit(r, p), d = RF.drag = { kind: hit.kind, p0: p, r0: refPose(r) };
  if (hit.kind === 'corner') { d.sg = [[-1, -1], [1, -1], [1, 1], [-1, 1]][hit.k]; const o = refCorners(r)[(hit.k + 2) % 4]; d.anchor = { x: o.x, y: o.y }; }
  return true;
}
function refMove(e, p) {
  const q = RF.touch.get(e.pointerId); if (!q) return false;
  q.x = p.x; q.y = p.y;
  const r = refCur(); if (!r || r.locked) return true;
  if (RF.pinch) refPinch(r);
  else if (RF.drag) refDrag(r, RF.drag, p, e);
  else return true;
  RF.moved = true; return true;
}
function refDrag(r, d, p, e) {
  const a = refArtAt(p), r0 = d.r0;
  if (d.kind === 'move') { r.x = r0.x + (p.x - d.p0.x) / S.z; r.y = r0.y + (p.y - d.p0.y) / S.z; return; }
  if (d.kind === 'turn') { const t = Math.atan2(a.x - r0.x, -(a.y - r0.y)) * 180 / Math.PI; r.rot = refAngle(e.altKey ? t : Math.round(t / REF_STEP) * REF_STEP); return; }
  /* A corner moves and the opposite one stays put. Worked out along the picture's own axes, so a turned reference scales the same way. */
  const t0 = r0.rot * Math.PI / 180, c = Math.cos(t0), s = Math.sin(t0), A = d.anchor, vx = a.x - A.x, vy = a.y - A.y, lx = (vx * c + vy * s) * d.sg[0], ly = (-vx * s + vy * c) * d.sg[1];
  const W0 = r.w * r0.scale, H0 = r.h * r0.scaleY;
  let W, H;
  if (e.shiftKey) { W = Math.max(REF_MIN_PX, lx); H = Math.max(REF_MIN_PX, ly); }
  else { const k = Math.max(REF_MIN_PX / Math.min(W0, H0), (lx * W0 + ly * H0) / (W0 * W0 + H0 * H0)); W = k * W0; H = k * H0; }
  const hx = d.sg[0] * W / 2, hy = d.sg[1] * H / 2;
  Object.assign(r, { scale: W / r.w, scaleY: H / r.h, x: A.x + hx * c - hy * s, y: A.y + hx * s + hy * c });
}
/* Two fingers move, scale and turn the reference about the point between them, in the same 15 degree steps as the handle. */
function refPinch(r) {
  const [a, b] = [...RF.touch.values()], P = RF.pinch, r0 = P.r0; if (!b) return;
  const d0 = Math.hypot(P.b.x - P.a.x, P.b.y - P.a.y) || 1, least = REF_MIN_PX / Math.min(r.w * r0.scale, r.h * r0.scaleY), k = Math.max(least, Math.hypot(b.x - a.x, b.y - a.y) / d0);
  const turn = Math.round((Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(P.b.y - P.a.y, P.b.x - P.a.x)) * 180 / Math.PI / REF_STEP) * REF_STEP, t = turn * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const m0 = refArtAt({ x: (P.a.x + P.b.x) / 2, y: (P.a.y + P.b.y) / 2 }), m = refArtAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), ox = (r0.x - m0.x) * k, oy = (r0.y - m0.y) * k;
  Object.assign(r, { scale: r0.scale * k, scaleY: r0.scaleY * k, rot: refAngle(r0.rot + turn), x: m.x + ox * c - oy * s, y: m.y + ox * s + oy * c });
}
/* True when the pointer was Adjust's, so the view's own handling leaves it alone. */
function refUp(e) {
  if (!RF.touch.delete(e.pointerId)) return false;
  if (RF.touch.size < 2) RF.pinch = null;
  if (RF.touch.size === 1 && refCur()) { const [p] = [...RF.touch.values()]; RF.drag = { kind: 'move', p0: { ...p }, r0: refPose(refCur()) }; }   // the finger left behind carries on moving it
  if (!RF.touch.size) { RF.drag = null; if (RF.moved) { RF.moved = false; setDirty(true); } }
  return true;
}

/* ---------- picking colors ---------- */
function oklab(r, g, b) {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }, R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
/* The first of equally near colors wins, so the answer never depends on anything but the list. */
function labNearest(q, labs) {
  let best = 0, bd = Infinity;
  for (let k = 0; k < labs.length; k++) { const p = labs[k], d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < bd) { bd = d; best = k; } }
  return best;
}
function refNearest(hex) { const list = S.palette; return list.length ? list[labNearest(oklab(...hexToRgb(hex)), list.map(h => oklab(...hexToRgb(h))))] : hex; }
function refSampleImg(img, ix, iy) {
  const cv = RF.one || (RF.one = Object.assign(document.createElement('canvas'), { width: 1, height: 1 })), c = cv.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, 1, 1); c.drawImage(img, ix, iy, 1, 1, 0, 0, 1, 1);
  const d = c.getImageData(0, 0, 1, 1).data; return d[3] < 128 ? null : rgbToHex(d[0], d[1], d[2]);
}
/* What shows on that art pixel: the pixelated sample, or the picture's own pixel under its center. */
function refSampleArt(r, ax, ay) {
  const p = r.pixelated && refPix(r);
  if (p && p.cv) { const u = ax - p.x0, v = ay - p.y0; return u >= 0 && v >= 0 && u < p.cv.width && v < p.cv.height ? refSampleImg(p.cv, u, v) : null; }
  const i = refToImg(r, ax + 0.5, ay + 0.5);
  return i.x >= 0 && i.y >= 0 && i.x < r.w && i.y < r.h ? refSampleImg(r.img, Math.floor(i.x), Math.floor(i.y)) : null;
}
function refUse(hex) {
  const near = RF.snap ? refNearest(hex) : hex;
  RF.picked = near !== hex ? { hex, near } : null; setColor(near);
  $('sbHint').textContent = 'from the reference, ' + (RF.picked ? 'the nearest palette color ' + near + ' to ' + hex + '.' : hex + '.');
}
function refPickedSync() {
  const p = RF.picked, on = !!p && S.color === p.near; $('refPicked').hidden = !on; if (!on) return;
  $('refPickedSw').style.background = p.hex; $('refPickedHex').textContent = p.hex;
}
function refPickedAdd() {
  const p = RF.picked; if (!p) return;
  if (!hasColor(p.hex)) { addLoose(p.hex); renderPalette(); setDirty(true); }
  RF.picked = null; setColor(p.hex);
}
/* A reference over the art answers first. One under it answers only where the art is empty, as that is where it shows. */
function refPickArt(a) {
  if (a.x < 0 || a.y < 0 || a.x >= S.w || a.y >= S.h || !RF.list.some(refShown)) return false;
  const empty = !(flatAt(a.y * S.w + a.x) >>> 24), order = RF.list.filter(r => r.above).reverse().concat(empty ? RF.list.filter(r => !r.above).reverse() : []);
  for (const r of order) { if (!refShown(r)) continue; const hex = refSampleArt(r, a.x, a.y); if (hex) { refUse(hex); return true; } }
  $('sbHint').textContent = 'from the art.'; return false;
}

/* ---------- adding, keeping and loading ---------- */
/* Small enough to keep: at most REF_SIDE on the long side and REF_CAP once encoded, stepping the quality and then the size down until it fits. The canvas is what the session shows, so a reopened file looks the same. */
function refEncode(src) {
  let k = Math.min(1, REF_SIDE / Math.max(src.width, src.height));
  for (let n = 0; n < 8; n++, k *= 0.75) {
    const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k)), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(src, 0, 0, w, h);
    for (const q of [0.85, 0.7, 0.55]) {
      let data = cv.toDataURL('image/webp', q); if (!data.startsWith('data:image/webp')) data = cv.toDataURL('image/jpeg', q);   // Safari writes no WebP
      if (data.length * 0.75 <= REF_CAP) return { img: cv, data, w, h };
    }
  }
  return null;
}
async function refAddFile(file) {
  if (RF.list.length >= REF_MAX) { toast('A project keeps up to ' + REF_MAX + ' references. Remove one first.'); return false; }
  if (!refImage(file)) { toast('A reference can be a PNG, JPEG, WebP or GIF image.'); return false; }
  let bmp = null; try { bmp = await createImageBitmap(file); } catch (_) { bmp = null; }
  if (!bmp) { toast('That image could not be read.'); return false; }
  const made = refEncode(bmp); if (bmp.close) bmp.close();
  if (!made) { toast('That image is too large to keep, even made smaller.'); return false; }
  const r = refNew(Object.assign(made, { name: (file.name || '').replace(/\.\w+$/, '').slice(0, 40) || 'Reference' }));
  refFit(r); RF.list.push(r); RF.at = RF.list.length - 1; setDirty(true); refSync(); requestRender(); panelGo('reference');
  toast('Reference added. It is never part of the art or its exports.'); return true;
}
function refPickFile() { closeSheets(); $('refInput').click(); }
function refRemove(k) {
  const r = RF.list[k]; if (!r) return;
  if (RF.adjust && RF.at === k) refAdjustSet(false);
  RF.list = RF.list.filter(x => x !== r); RF.at = Math.min(RF.at, RF.list.length - 1); setDirty(true); refSync(); requestRender();
  toast('Reference removed.', { label: 'Undo', run: () => { if (RF.list.length >= REF_MAX) return; RF.list.splice(Math.min(k, RF.list.length), 0, r); RF.at = RF.list.indexOf(r); setDirty(true); refSync(); requestRender(); } });
}
/* A recovery copy keeps every reference, and a file only those kept with it, so one left out stays for this session and its recovery copies. */
function refSaved(all) {
  const out = RF.list.filter(r => all || r.keep).map(r => ({ id: r.id, name: r.name, data: r.data, w: r.w, h: r.h, x: r.x, y: r.y, scale: r.scale, scaleY: r.scaleY !== r.scale ? r.scaleY : undefined, rot: r.rot, opacity: r.opacity, above: r.above,
    pixelated: r.pixelated || undefined, locked: r.locked || undefined, hidden: r.hidden || undefined, window: r.window || undefined, keep: r.keep ? undefined : false }));
  return out.length ? out : undefined;
}
function refClean(d) {
  if (!d || typeof d.data !== 'string' || d.data.length * 0.75 > REF_CAP || !REF_DATA.test(d.data)) return null;
  const side = v => Number.isInteger(v) && v >= 1 && v <= REF_SIDE, num = (v, lo, hi, def) => Number.isFinite(v) && v >= lo && v <= hi ? v : def;
  if (!side(d.w) || !side(d.h)) return null;
  const scale = num(d.scale, 1e-4, 1e4, 1);
  return { name: String(d.name || 'Reference').slice(0, 40), data: d.data, w: d.w, h: d.h, x: num(d.x, -1e6, 1e6, 0), y: num(d.y, -1e6, 1e6, 0), scale, scaleY: num(d.scaleY, 1e-4, 1e4, scale), rot: refAngle(num(d.rot, -1e4, 1e4, 0)),
    opacity: Math.round(num(d.opacity, 10, 100, REF_OPACITY)), above: d.above !== false, pixelated: !!d.pixelated, locked: !!d.locked, hidden: !!d.hidden, window: !!d.window, keep: d.keep !== false };
}
/* Decoded before the project changes at all, so a file that fails later still leaves the open project's references alone. */
async function refsRead(list) {
  const out = []; let bad = 0;
  for (const d of Array.isArray(list) ? list.slice(0, REF_MAX) : []) {
    const o = refClean(d); let img = null;
    try { img = o && await createImageBitmap(new Blob([unb64(o.data.slice(o.data.indexOf(',') + 1))], { type: o.data.slice(5, o.data.indexOf(';')) })); } catch (_) { img = null; }
    if (!img || !img.width || !img.height) { bad++; continue; }
    if (img.width !== o.w || img.height !== o.h) { o.scale *= o.w / img.width; o.scaleY *= o.h / img.height; o.w = img.width; o.h = img.height; }
    out.push(refNew(Object.assign(o, { img })));
  }
  return { list: out, bad };
}
function refsPut(got) {
  RF.list = got.list; RF.at = got.list.length ? 0 : -1; RF.picked = null; RF.bad = got.bad; RF.win.id = 0;
  if (RF.adjust) refAdjustSet(false); else refSync();
  if (got.bad) toast(refNote().trim());
}
const refNote = () => RF.bad ? ' ' + (RF.bad > 1 ? RF.bad + ' references' : 'A reference') + ' in it could not be read and ' + (RF.bad > 1 ? 'were' : 'was') + ' left out.' : '';

/* ---------- the window ---------- */
const refWinRef = () => RF.list.find(r => r.window && !r.hidden) || null;
function refWinShow() {
  const r = refWinRef(), W = RF.win; $('refWin').hidden = !r; if (!r) { W.id = 0; return; }
  $('refWinName').textContent = r.name; refWinSize();
  if (W.id !== r.id) { W.id = r.id; refWinFit(); }
  refWinDraw();
}
function refWinSize() {
  const cv = $('refWinCv'), W = RF.win, w = cv.clientWidth || 280, h = cv.clientHeight || 210;
  if (w === W.w && h === W.h && cv.width === Math.round(w * dpr)) return;
  W.w = w; W.h = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
}
function refWinFit() { const r = refWinRef(), W = RF.win; if (!r) return; W.z = Math.min(W.w / r.w, W.h / r.h); W.ox = (W.w - r.w * W.z) / 2; W.oy = (W.h - r.h * W.z) / 2; refWinDraw(); }
/* Smooth when small, square pixels close up, so a pick lands on the pixel it looks like. */
function refWinDraw() {
  const r = refWinRef(), W = RF.win; if (!r) return;
  const c = $('refWinCv').getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W.w, W.h);
  c.imageSmoothingEnabled = W.z < 4; c.imageSmoothingQuality = 'high'; c.drawImage(r.img, W.ox, W.oy, r.w * W.z, r.h * W.z);
}
function refWinZoom(k, px, py) { const W = RF.win, r = refWinRef(); if (!r) return; const z = Math.max(Math.min(W.w / r.w, W.h / r.h) / 4, Math.min(64, W.z * k)); W.ox = px - (px - W.ox) * z / W.z; W.oy = py - (py - W.oy) * z / W.z; W.z = z; refWinDraw(); }
function refWinAt(e) { const b = $('refWinCv').getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
function refWinDown(e) {
  e.preventDefault(); const W = RF.win, p = refWinAt(e); try { $('refWinCv').setPointerCapture(e.pointerId); } catch (_) {}
  W.ptrs.set(e.pointerId, p);
  if (W.ptrs.size === 1) W.tap = { x: p.x, y: p.y, t: performance.now(), last: p };
  else { W.tap = null; const [a, b] = [...W.ptrs.values()]; W.pinch = { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, z: W.z, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ox: W.ox, oy: W.oy }; }
}
function refWinMove(e) {
  const W = RF.win; if (!W.ptrs.has(e.pointerId)) return;
  const p = refWinAt(e), was = W.ptrs.get(e.pointerId); W.ptrs.set(e.pointerId, p);
  if (W.pinch && W.ptrs.size >= 2) {
    const [a, b] = [...W.ptrs.values()], P = W.pinch, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    W.z = P.z; W.ox = P.ox; W.oy = P.oy; refWinZoom(Math.hypot(b.x - a.x, b.y - a.y) / P.d, P.mid.x, P.mid.y); W.ox += mid.x - P.mid.x; W.oy += mid.y - P.mid.y; refWinDraw(); return;
  }
  if (W.tap && Math.hypot(p.x - W.tap.x, p.y - W.tap.y) <= 6) return;
  W.tap = null; W.ox += p.x - was.x; W.oy += p.y - was.y; refWinDraw();
}
/* A tap samples the picture whatever the tool, and a drag only moves it. */
function refWinUp(e) {
  const W = RF.win; if (!W.ptrs.delete(e.pointerId)) return;
  if (W.ptrs.size < 2) W.pinch = null;
  const t = W.tap; W.tap = null; if (!t || W.ptrs.size || e.type === 'pointercancel') return;
  const r = refWinRef(); if (!r) return;
  const ix = Math.floor((t.x - W.ox) / W.z), iy = Math.floor((t.y - W.oy) / W.z);
  if (ix < 0 || iy < 0 || ix >= r.w || iy >= r.h) return;
  const hex = refSampleImg(r.img, ix, iy); if (hex) refUse(hex); else toast('That part of the picture is transparent.');
}

/* ---------- the panel ---------- */
function refEdit(patch) { const r = refCur(); if (!r) return; Object.assign(r, patch); setDirty(true); refSync(); requestRender(); }
function refSync() {
  const box = $('refList'); if (!box) return;
  box.textContent = '';
  RF.list.forEach((r, k) => {
    const row = document.createElement('div'), nm = document.createElement('button'), name = document.createElement('span');
    row.className = 'vrow refrow' + (k === RF.at ? ' active' : ''); nm.className = 'lname vname'; name.textContent = r.name; nm.appendChild(name);
    if (!r.keep) { const s = document.createElement('span'); s.className = 'refsub'; s.textContent = 'Not saved in the file'; nm.appendChild(s); }
    nm.setAttribute('aria-label', 'Choose ' + r.name); nm.setAttribute('aria-pressed', k === RF.at); nm.onclick = () => { if (RF.adjust && RF.at !== k) refAdjustSet(false); RF.at = k; refSync(); };
    row.append(nm,
      iconBtn(r.hidden ? ICON.eyeOff : ICON.eye, (r.hidden ? 'Show ' : 'Hide ') + r.name, () => { r.hidden = !r.hidden; setDirty(true); refSync(); requestRender(); }),
      iconBtn(r.locked ? ICON.lock : ICON.unlock, (r.locked ? 'Unlock ' : 'Lock ') + r.name, () => { r.locked = !r.locked; setDirty(true); refSync(); requestRender(); }, r.locked),
      iconBtn('<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', 'Remove ' + r.name, () => refRemove(k)));
    box.appendChild(row);
  });
  const r = refCur(); $('refMore').hidden = !r; $('refNone').hidden = RF.list.length > 0; $('refAdd').disabled = RF.list.length >= REF_MAX; press($('refSnap'), RF.snap);
  if (r) {
    press($('refAbove'), r.above); press($('refBelow'), !r.above); press($('refPix'), r.pixelated); press($('refWinOn'), r.window); press($('refKeep'), r.keep); press($('refAdjust'), RF.adjust);
    if (document.activeElement !== $('refOp')) $('refOp').value = r.opacity; $('refOpRead').textContent = r.opacity + '%';
    $('refAdjustNote').hidden = !RF.adjust; $('refAdjustNote').textContent = r.locked ? 'This reference is locked, so Adjust cannot move it.' : COARSE() ? 'One finger moves it, two scale and turn it. The view holds still. Tap Adjust again to finish.' : 'Drag to move it, a corner to scale it, the round handle to turn it. Esc or Adjust again finishes.';
  }
  if (PN.ready) { syncGuides(); panelSync(); }
  refWinShow(); refPickedSync();
}
function refSecOpen() {
  const s = $('refSec'), side = $('side'); if (s.hidden || panelClosed() || PN.shut.has('reference')) return false;
  const a = s.getBoundingClientRect(), b = side.getBoundingClientRect(); return a.bottom > b.top && a.top < b.bottom;
}

/* ---------- Make a pixel layer ---------- */
/* Area-averaged: each new pixel is the mean of the picture's pixels under it, by how much of each it covers, with color weighted by alpha so a see-through edge does not darken. */
async function refShrink(src, sw, sh, tw, th, job, total) {
  const spans = (n, m) => { const out = []; for (let t = 0; t < m; t++) { const a = t * n / m, b = (t + 1) * n / m, s = []; for (let i = Math.floor(a); i < Math.min(n, Math.ceil(b)); i++) s.push(i, Math.min(i + 1, b) - Math.max(i, a)); out.push(s); } return out; };
  const xs = spans(sw, tw), ys = spans(sh, th), out = new Float32Array(tw * th * 4);
  for (let ty = 0; ty < th; ty++) {
    const sy = ys[ty];
    for (let tx = 0; tx < tw; tx++) {
      const sx = xs[tx]; let r = 0, g = 0, b = 0, a = 0, wt = 0;
      for (let j = 0; j < sy.length; j += 2) for (let i = 0; i < sx.length; i += 2) {
        const k = (sy[j] * sw + sx[i]) * 4, w = sy[j + 1] * sx[i + 1], al = src[k + 3] * w;
        r += src[k] * al; g += src[k + 1] * al; b += src[k + 2] * al; a += al; wt += w;
      }
      const o = (ty * tw + tx) * 4; if (a) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; } out[o + 3] = wt ? a / wt : 0;
    }
    if (job) await xpTick(job, ty + 1, total);
  }
  return out;
}
/* Median cut, on an even sample of the opaque pixels, with every tie broken by the colors themselves so the same picture gives the same colors. */
function refMedian(avg, n) {
  const all = avg.length / 4, step = Math.max(1, Math.ceil(all / REF_SAMPLE)), px = [];
  for (let i = 0; i < all; i += step) if (avg[i * 4 + 3] >= 128) px.push([0, 1, 2].map(c => Math.round(avg[i * 4 + c])));
  if (!px.length) return [];
  const boxes = [px];
  while (boxes.length < n) {
    let best = -1, bc = 0, br = 0;
    boxes.forEach((q, k) => { for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of q) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if (hi - lo > br) { br = hi - lo; best = k; bc = c; } } });
    if (best < 0) break;
    const q = boxes[best].sort((p, o) => p[bc] - o[bc] || p[0] - o[0] || p[1] - o[1] || p[2] - o[2]), m = q.length >> 1;
    boxes.splice(best, 1, q.slice(0, m), q.slice(m));
  }
  return [...new Set(boxes.map(q => rgbToHex(...[0, 1, 2].map(c => Math.round(q.reduce((s, p) => s + p[c], 0) / q.length)))))];
}
/* Each pixel to the nearest chosen color, after an ordered Bayer offset if asked for. Under half alpha is empty, and everything else is fully opaque. */
async function refMap(avg, tw, th, colors, dither, job, total) {
  const M = dither === 2 ? BAYER2 : dither === 4 ? BAYER4 : null, labs = colors.map(h => oklab(...hexToRgb(h))), packs = colors.map(packHex), out = new Uint32Array(tw * th), seen = new Map();
  const spread = M ? 255 / Math.cbrt(Math.max(2, colors.length)) : 0, cl = v => Math.max(0, Math.min(255, Math.round(v)));
  if (!colors.length) return out;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const o = (y * tw + x) * 4; if (avg[o + 3] < 128) continue;
      const t = M ? ((M[y % dither][x % dither] + 0.5) / (dither * dither) - 0.5) * spread : 0, r = cl(avg[o] + t), g = cl(avg[o + 1] + t), b = cl(avg[o + 2] + t), key = (r << 16) | (g << 8) | b;
      let k = seen.get(key); if (k === undefined) { k = labNearest(oklab(r, g, b), labs); seen.set(key, k); }
      out[y * tw + x] = packs[k];
    }
    if (job) await xpTick(job, th + y + 1, total);
  }
  return out;
}
const RM = { src: null, r: null, shape: false, photo: false, w: 0, h: 0, timer: null, ver: 0 };
async function refMake(job) {
  const r = RM.r, w = RM.w, h = RM.h, total = h * 2, avg = await refShrink(RM.src, r.w, r.h, w, h, job, total);
  const colors = RM.photo ? refMedian(avg, Math.max(2, Math.min(32, numOf('rmN') || 8))) : S.palette.slice();
  return refMap(avg, w, h, colors, +$('rmDither').value, job, total);
}
function refMakeSize() {
  const r = RM.r, fit = Math.min(S.w / r.w, S.h / r.h, 1e9);
  if (!RM.shape) { RM.w = S.w; RM.h = S.h; }
  else {
    const w = Math.max(1, Math.min(S.w, numOf('rmW') || Math.round(r.w * fit)));
    RM.w = w; RM.h = Math.max(1, Math.min(S.h, Math.round(w * r.h / r.w))); if (RM.h === S.h) RM.w = Math.max(1, Math.min(w, Math.round(S.h * r.w / r.h)));
  }
  $('rmW').value = RM.w; $('rmH').value = RM.h; $('rmW').disabled = !RM.shape; $('rmH').disabled = true;
}
function refMakeSync() {
  press($('rmCanvas'), !RM.shape); press($('rmShape'), RM.shape); press($('rmPal'), !RM.photo); press($('rmPhoto'), RM.photo); $('rmNField').hidden = !RM.photo;
  refMakeSize(); clearTimeout(RM.timer); RM.timer = setTimeout(refMakePreview, 120);
}
/* The preview runs the same steps as the layer, so what it shows is what you get. Past REF_PV_MAX pixels it would hold the page, so it says so instead. */
async function refMakePreview() {
  const v = ++RM.ver, big = RM.w * RM.h > REF_PV_MAX; $('rmPvs').hidden = big;
  $('rmNote').textContent = RM.w + ' x ' + RM.h + ' px' + (big ? '. Too large to preview here; the layer is made the same way.' : ', at the top left of the canvas.');
  if (big) return;
  const out = await refMake(null); if (v !== RM.ver) return;
  const one = $('rmPv1'), four = $('rmPv4'), c = one.getContext('2d'); one.width = RM.w; one.height = RM.h;
  const img = c.createImageData(RM.w, RM.h); new Uint32Array(img.data.buffer).set(out); c.putImageData(img, 0, 0);
  const n = Math.min(48, RM.w), m = Math.min(48, RM.h), d = four.getContext('2d'); four.width = n * 4; four.height = m * 4; d.imageSmoothingEnabled = false;
  d.drawImage(one, Math.floor((RM.w - n) / 2), Math.floor((RM.h - m) / 2), n, m, 0, 0, n * 4, m * 4);
}
function refMakeOpen() {
  const r = refCur(); if (!r) return;
  const cv = document.createElement('canvas'); cv.width = r.w; cv.height = r.h; const c = cv.getContext('2d'); c.drawImage(r.img, 0, 0);
  Object.assign(RM, { r, src: c.getImageData(0, 0, r.w, r.h).data }); $('rmW').value = '';
  $('rmTitle').textContent = 'Make a pixel layer from ' + r.name; closeSheets(); openSheet('sheetRefMake'); refMakeSync();
}
async function refMakeGo() {
  const r = RM.r, w = RM.w, h = RM.h; if (!r) return;
  const out = await xpJob('Making a pixel layer', job => refMake(job), 'Making the layer'); if (!out) return;
  closeSheets(); RM.src = null;
  addLayer('From ' + r.name, L => { for (let y = 0; y < h; y++) L.px.set(out.subarray(y * w, y * w + w), y * S.w); flush(L); });
  setDirty(true); toast('Made a layer from ' + r.name + '. Paint over it: it is a starting point, not finished pixel art.');
}

function initRefs() {
  $('refAdd').onclick = refPickFile; $('fRef').onclick = refPickFile;
  $('refInput').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) refAddFile(f); };
  $('refAbove').onclick = () => refEdit({ above: true }); $('refBelow').onclick = () => refEdit({ above: false });
  $('refOp').oninput = e => refEdit({ opacity: Math.max(10, Math.min(100, +e.target.value)) });
  $('refPix').onclick = () => refEdit({ pixelated: !refCur().pixelated });
  $('refKeep').onclick = () => refEdit({ keep: !refCur().keep });
  $('refWinOn').onclick = () => { const r = refCur(), on = !r.window; for (const x of RF.list) x.window = false; r.window = on; if (on && r.hidden) r.hidden = false; setDirty(true); refSync(); requestRender(); };
  $('refAdjust').onclick = () => refAdjustSet(!RF.adjust);
  $('refFit').onclick = () => { const r = refCur(); if (r.locked) { toast('This reference is locked.'); return; } refFit(r); setDirty(true); requestRender(); };
  $('refUnturn').onclick = () => { const r = refCur(); if (r.locked) { toast('This reference is locked.'); return; } refEdit({ rot: 0, scaleY: r.scale }); };
  $('refSnap').onclick = () => { RF.snap = !RF.snap; refSync(); };
  $('refMakeBtn').onclick = refMakeOpen; $('refPickedAdd').onclick = refPickedAdd;
  $('rmCanvas').onclick = () => { RM.shape = false; refMakeSync(); }; $('rmShape').onclick = () => { RM.shape = true; refMakeSync(); };
  $('rmPal').onclick = () => { RM.photo = false; refMakeSync(); }; $('rmPhoto').onclick = () => { RM.photo = true; refMakeSync(); };
  $('rmW').onchange = $('rmN').onchange = $('rmDither').onchange = refMakeSync; $('rmOk').onclick = refMakeGo;
  $('refWinClose').onclick = () => { for (const x of RF.list) x.window = false; setDirty(true); refSync(); };
  $('refWinFitBtn').onclick = refWinFit;
  const cv = $('refWinCv'); cv.onpointerdown = refWinDown; cv.onpointermove = refWinMove; cv.onpointerup = cv.onpointercancel = refWinUp;
  cv.addEventListener('wheel', e => { e.preventDefault(); const p = refWinAt(e); refWinZoom(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y); }, { passive: false });
  window.addEventListener('resize', () => { if (refWinRef()) { refWinSize(); refWinDraw(); } });
  refSync();
}

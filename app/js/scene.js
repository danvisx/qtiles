'use strict';
/* qtiles big scenes: the minimap, saved views, sections with their seam guard, and the memory readout.
   Views keep the art coordinate at the middle of the screen, and the section grid has its own origin. Both move with the art when the canvas grows to the left or up, so a mark stays on what it marked. */

const MM_W = 200, MM_H = 160, MM_BUDGET_MS = 3, MM_EVERY_MS = 120, MM_KEY = 'qtiles.minimap', VIEW_MAX = 9, SEAM_PX = 4, SEAM_REACH = 16, SEAM_OPACITY = 0.55, NOTE_MAX = 200, MEM_WARN = 1e9, MEM_TILE = CP_T * CP_T * 16;
const SEC_SIZES = [128, 256, 512, 1024];
/* box is the art rectangle still to redraw. job is the part being worked through now, which runs a few rows a frame, so the map never costs more than a sliver of one. */
const MM = { on: false, w: 0, h: 0, k: 1, px: null, img: null, ctx: null, box: null, job: null, at: 0, grab: null, key: '', ver: 0, warned: false };

/* ---------- minimap ---------- */
function miniAll() { MM.box = { x0: 0, y0: 0, x1: S.w - 1, y1: S.h - 1 }; MM.job = null; }
function miniTouch(x, y, w, h) { MM.box = joinBox(MM.box, { x0: x, y0: y, x1: x + w - 1, y1: y + h - 1 }); }
function miniShow(on) { MM.on = on; $('mini').hidden = !on; $('miniBtn').hidden = on; press($('miniOpt'), on); MM.key = ''; requestRender(); }
/* Runs when the canvas changes size or a project opens. Until someone chooses, the map opens by itself only for a canvas too big to see at a glance, and not on a phone, where it covers the art. */
function miniFit() {
  const k = Math.min(MM_W / S.w, MM_H / S.h), w = Math.max(1, Math.round(S.w * k)), h = Math.max(1, Math.round(S.h * k)), cv = $('miniCv'), top = $('miniTop');
  if (w !== MM.w || h !== MM.h) {
    cv.width = w; cv.height = h; top.width = Math.round(w * dpr); top.height = Math.round(h * dpr);
    for (const c of [cv, top]) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
    MM.ctx = cv.getContext('2d'); MM.img = MM.ctx.createImageData(w, h); MM.px = new Uint32Array(MM.img.data.buffer); MM.w = w; MM.h = h;
  }
  MM.k = k; miniAll(); MM.key = '';
  if (prefGet('mapAuto')) miniShow(Math.max(S.w, S.h) > 1024 && window.innerWidth > 600);
  viewsUi(); secUi();
}
function miniAuto(on) { prefSet('mapAuto', on); if (on) miniFit(); }
function miniTick(t) {
  if (!MM.on || !MM.px || (!MM.box && !MM.job)) return;
  if (!MM.job) {
    if (t - MM.at < MM_EVERY_MS) return;
    const b = MM.box, k = MM.k, y0 = Math.floor(b.y0 * k); MM.box = null;
    MM.job = { x0: Math.floor(b.x0 * k), x1: Math.min(MM.w - 1, Math.ceil((b.x1 + 1) * k) - 1), y: y0, y1: Math.min(MM.h - 1, Math.ceil((b.y1 + 1) * k) - 1) };
  }
  const j = MM.job, y0 = j.y, end = performance.now() + MM_BUDGET_MS, k = MM.k;
  do {
    const sy = Math.min(S.h - 1, Math.floor((j.y + 0.5) / k)) * S.w;
    for (let x = j.x0, i = j.y * MM.w + x; x <= j.x1; x++, i++) MM.px[i] = pxAt(sy + Math.min(S.w - 1, Math.floor((x + 0.5) / k)));
    j.y++;
  } while (j.y <= j.y1 && performance.now() < end);
  if (j.y > y0) MM.ctx.putImageData(MM.img, 0, 0, j.x0, y0, j.x1 - j.x0 + 1, j.y - y0);
  if (j.y > j.y1) { MM.job = null; MM.at = t; }
}
function miniOver() {
  const c = $('miniTop').getContext('2d'), k = MM.k; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, MM.w, MM.h);
  if (S.secOn) {
    const r = secRange(); c.fillStyle = TH.accent; c.globalAlpha = 0.28;
    for (const q of secList()) if ((S.sections[secKey(q.x, q.y)] || {}).done) { const b = secBox(q.x, q.y); c.fillRect(b.x * k, b.y * k, b.w * k, b.h * k); }
    c.globalAlpha = 1; c.strokeStyle = TH.grid; c.lineWidth = 1; c.beginPath();
    for (let i = r.x0; i <= r.x1 + 1; i++) { const x = Math.round(secBox(i, 0).x * k) + 0.5; c.moveTo(x, 0); c.lineTo(x, MM.h); }
    for (let j = r.y0; j <= r.y1 + 1; j++) { const y = Math.round(secBox(0, j).y * k) + 0.5; c.moveTo(0, y); c.lineTo(MM.w, y); }
    c.stroke();
  }
  const a = viewArt(), x0 = Math.max(0, a.x * k), y0 = Math.max(0, a.y * k), x1 = Math.min(MM.w, (a.x + a.w) * k), y1 = Math.min(MM.h, (a.y + a.h) * k);
  c.strokeStyle = TH.accent; c.lineWidth = 1.5; c.strokeRect(x0 + 0.75, y0 + 0.75, Math.max(2, x1 - x0 - 1.5), Math.max(2, y1 - y0 - 1.5));
}
/* What the main view shows, in art coordinates. */
const viewArt = () => ({ x: -S.ox / S.z, y: -S.oy / S.z, w: vw / S.z, h: vh / S.z });
function viewOn(x, y) { S.ox = Math.round(vw / 2 - x * S.z); S.oy = Math.round(vh / 2 - y * S.z); requestRender(); }
function miniAt(e) { const r = $('miniMap').getBoundingClientRect(); return { x: (e.clientX - r.left - ($('miniMap').clientLeft || 0)) / MM.k, y: (e.clientY - r.top - ($('miniMap').clientTop || 0)) / MM.k }; }
/* Dragging the rectangle keeps the spot it was picked up by under the pointer. A tap outside it jumps there, and the drag carries on from the middle. */
function miniDown(e) {
  e.preventDefault(); const p = miniAt(e), a = viewArt(), inside = p.x >= a.x && p.x < a.x + a.w && p.y >= a.y && p.y < a.y + a.h;
  MM.grab = inside ? { x: p.x - (a.x + a.w / 2), y: p.y - (a.y + a.h / 2) } : { x: 0, y: 0 };
  try { $('miniMap').setPointerCapture(e.pointerId); } catch (_) {}
  viewOn(p.x - MM.grab.x, p.y - MM.grab.y);
}
function miniMove(e) { if (!MM.grab) return; const p = miniAt(e); viewOn(p.x - MM.grab.x, p.y - MM.grab.y); }

/* ---------- views ---------- */
function viewGo(k) {
  const v = S.views[k]; if (!v) return false;
  S.z = v.z; viewOn(v.x, v.y); hooks.zoom(); return true;
}
function viewKey(k) { if (!viewGo(k)) toast('No view ' + (k + 1) + ' yet. Save one under Views and sections.'); }
function viewSave() {
  if (S.views.length >= VIEW_MAX) { toast('A project keeps ' + VIEW_MAX + ' views. Delete one first.'); return; }
  const a = viewArt(); S.views = S.views.concat({ name: 'View ' + (S.views.length + 1), x: Math.round(a.x + a.w / 2), y: Math.round(a.y + a.h / 2), z: S.z });
  setDirty(true); viewsUi(); toast('View saved. Press ' + S.views.length + ' to come back to it.');
}
function viewEdit(k, patch) { S.views = patch ? S.views.map((v, n) => n === k ? Object.assign({}, v, patch) : v) : S.views.filter((v, n) => n !== k); setDirty(true); viewsUi(); }
function viewsUi() {
  const box = $('viewList'); box.textContent = '';
  S.views.forEach((v, k) => {
    const row = document.createElement('div'), n = document.createElement('span'), nm = document.createElement('button'); row.className = 'vrow'; n.className = 'mono muted'; n.textContent = k + 1;
    nm.className = 'lname vname'; nm.textContent = v.name; nm.setAttribute('aria-label', 'Go to ' + v.name + ' (' + (k + 1) + ')'); nm.onclick = () => viewGo(k);
    const ren = iconBtn('<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19z"/></svg>', 'Rename ' + v.name, () => nameEdit(nm, v.name, name => viewEdit(k, { name: name.slice(0, 40) }), viewsUi));
    row.append(n, nm, ren, iconBtn('<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', 'Delete ' + v.name, () => viewEdit(k))); box.appendChild(row);
  });
  $('viewSave').disabled = S.views.length >= VIEW_MAX; $('viewNone').hidden = S.views.length > 0;
}

/* ---------- sections ---------- */
const secKey = (x, y) => x + ',' + y;
const secAt = (x, y) => ({ x: Math.floor((x - S.secOx) / S.secW), y: Math.floor((y - S.secOy) / S.secH) });
const secBox = (i, j) => ({ x: S.secOx + i * S.secW, y: S.secOy + j * S.secH, w: S.secW, h: S.secH });
function secRange() { const a = secAt(0, 0), b = secAt(S.w - 1, S.h - 1); return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; }
/* In reading order, the order for walking a map. */
function secList() {
  const r = secRange(), out = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push({ x, y });
  return out;
}
function secCur() { const a = viewArt(); return secAt(Math.max(0, Math.min(S.w - 1, a.x + a.w / 2)), Math.max(0, Math.min(S.h - 1, a.y + a.h / 2))); }
function secGo(i, j) {
  const b = secBox(i, j), fit = Math.min(vw * 0.9 / b.w, vh * 0.9 / b.h);
  S.z = ZOOMS.filter(z => z <= fit).pop() || ZOOM_MIN; viewOn(b.x + b.w / 2, b.y + b.h / 2); hooks.zoom();
}
function secStep(d) {
  const list = secList(), c = secCur(), k = list.findIndex(q => q.x === c.x && q.y === c.y), q = list[(k + d + list.length) % list.length]; secGo(q.x, q.y);
}
function secTodo() {
  const list = secList(), c = secCur(), k = list.findIndex(q => q.x === c.x && q.y === c.y);
  for (let n = 1; n <= list.length; n++) { const q = list[(k + n) % list.length]; if (!(S.sections[secKey(q.x, q.y)] || {}).done) { secGo(q.x, q.y); return; } }
  toast('Every section is done.');
}
function secMark(q, patch) {
  const key = secKey(q.x, q.y), next = Object.assign({ done: false, note: '' }, S.sections[key], patch), all = Object.assign({}, S.sections);
  if (next.done || next.note) all[key] = next; else delete all[key];   // an unmarked section stores nothing, so a walked map stays small
  S.sections = all; MM.ver++; setDirty(true); secUi(); requestRender();
}
function secUi() {
  const on = S.secOn, q = secCur(), m = S.sections[secKey(q.x, q.y)] || {}, list = secList();
  press($('secOn'), on); syncGuides(); $('secMore').hidden = !on; $('secRead').textContent = q.x + ', ' + q.y;
  press($('secDone'), !!m.done); if (document.activeElement !== $('secNote')) $('secNote').value = m.note || '';
  $('secCount').textContent = list.filter(k => (S.sections[secKey(k.x, k.y)] || {}).done).length + ' of ' + list.length + ' done';
  $('secSizeRead').textContent = S.secW + ' × ' + S.secH + ' px';
  const preset = S.secW === S.secH && SEC_SIZES.includes(S.secW); $('secSize').value = preset ? S.secW : 'cells';
}
function secCellSize() { return S.mode === 'iso' ? [16 * S.tile, 8 * S.tile] : [16 * S.cell, 16 * S.cell]; }
function secShow(on) { S.secOn = on; setDirty(true); MM.ver++; secUi(); requestRender(); }
function secSetSize(w, h) { S.secW = Math.max(16, Math.min(MAX_DIM, w)); S.secH = Math.max(16, Math.min(MAX_DIM, h)); setDirty(true); MM.ver++; secUi(); requestRender(); }
/* The neighbor's edge pixels, shown on this side of the seam at the pen, so a pattern can be carried across it. Each edge the pen is near gives a strip SEAM_PX wide, moved across the seam and centered on the pen. */
function seamCells(ax, ay) {
  const out = { cells: [], edges: [] };
  /* `at` is the first pixel past the seam, on one axis. `from` is where the neighbor's strip starts on that axis, and `shift` carries it across. */
  const strip = (at, from, shift, along, size, length, xy) => {
    if (at <= 0 || at >= size) return;   // the canvas edge has no neighbor
    out.edges.push(xy(at, along - SEAM_REACH).concat(xy(at, along + SEAM_REACH + 1)));
    for (let a = Math.max(0, from), e = Math.min(size, from + SEAM_PX); a < e; a++) for (let u = Math.max(0, along - SEAM_REACH), n = Math.min(length - 1, along + SEAM_REACH); u <= n; u++) {
      const [x, y] = xy(a, u), v = pxAt(y * S.w + x); if (v >>> 24) { const [dx, dy] = xy(a + shift, u); out.cells.push({ x: dx, y: dy, v }); }
    }
  };
  const axis = (pos, org, sec, along, size, length, xy) => {
    const r = (((pos - org) % sec) + sec) % sec, start = pos - r, end = start + sec;
    if (r < SEAM_PX) strip(start, start - SEAM_PX, SEAM_PX, along, size, length, xy);
    if (r >= sec - SEAM_PX) strip(end, end, -SEAM_PX, along, size, length, xy);
  };
  axis(ax, S.secOx, S.secW, ay, S.w, S.h, (a, u) => [a, u]);
  axis(ay, S.secOy, S.secH, ax, S.h, S.w, (a, u) => [u, a]);
  return out;
}
const seamTool = t => brushed(t) || shapeTool(t);
function sceneDraw(c, x, y, z) {
  if (!S.secOn) return;
  const r = { x0: Math.max(0, Math.floor(-x / z)), y0: Math.max(0, Math.floor(-y / z)), x1: Math.min(S.w - 1, Math.floor((vw - x) / z)), y1: Math.min(S.h - 1, Math.floor((vh - y) / z)) }, a = secAt(r.x0, r.y0), b = secAt(r.x1, r.y1);
  c.strokeStyle = TH.accent; c.globalAlpha = 0.55; c.lineWidth = 1; c.beginPath();
  for (let i = a.x; i <= b.x + 1; i++) { const sx = Math.round(x + secBox(i, 0).x * z) + 0.5; c.moveTo(sx, y); c.lineTo(sx, y + S.h * z); }
  for (let j = a.y; j <= b.y + 1; j++) { const sy = Math.round(y + secBox(0, j).y * z) + 0.5; c.moveTo(x, sy); c.lineTo(x + S.w * z, sy); }
  c.stroke(); c.globalAlpha = 1;
  const at = drawId !== null ? lastArt : hover;
  if (!S.seamGuard || !at || z < 1 || !seamTool(drawId !== null ? drawTool : S.tool)) return;
  const q = seamCells(at.x, at.y);
  c.globalAlpha = SEAM_OPACITY;
  for (const p of q.cells) { c.fillStyle = packedHex(p.v); c.fillRect(x + p.x * z, y + p.y * z, z, z); }
  c.globalAlpha = 1; c.strokeStyle = TH.accent; c.lineWidth = 2; c.beginPath();
  for (const e of q.edges) { c.moveTo(x + e[0] * z, y + e[1] * z); c.lineTo(x + e[2] * z, y + e[3] * z); }
  c.stroke();
}

/* ---------- the project's side of it ---------- */
function sceneReset() { Object.assign(S, { views: [], sections: {}, secOn: false, secW: 256, secH: 256, secOx: 0, secOy: 0, seamGuard: true, rulers: true, objFoot: false, liveDefault: true, shadowOp: 35 }); extChosen = null; MM.ver++; }
function sceneShift(dx, dy) { S.secOx += dx; S.secOy += dy; S.views = S.views.map(v => Object.assign({}, v, { x: v.x + dx, y: v.y + dy })); }
const sceneSaved = () => ({
  views: S.views.length ? S.views : undefined, sections: Object.keys(S.sections).length ? S.sections : undefined,
  sectionGrid: S.secOn || S.secW !== 256 || S.secH !== 256 || S.secOx || S.secOy || !S.seamGuard ? { on: S.secOn, w: S.secW, h: S.secH, ox: S.secOx, oy: S.secOy, seam: S.seamGuard } : undefined,
  rulers: S.rulers ? undefined : false, footprints: S.objFoot || undefined, extendStep: extChosen || undefined, liveShadows: S.liveDefault ? undefined : false, shadowOpacity: S.shadowOp === 35 ? undefined : S.shadowOp
});
function cleanViews(list) {
  return (Array.isArray(list) ? list : []).filter(v => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).slice(0, VIEW_MAX)
    .map((v, k) => ({ name: String(v.name || 'View ' + (k + 1)).slice(0, 40), x: v.x, y: v.y, z: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.z)) }));
}
function cleanSections(o) {
  const out = {}; if (!o || typeof o !== 'object') return out;
  for (const k of Object.keys(o)) if (/^-?\d+,-?\d+$/.test(k) && o[k] && (o[k].done || o[k].note)) out[k] = { done: !!o[k].done, note: String(o[k].note || '').slice(0, NOTE_MAX) };
  return out;
}
function sceneLoad(o) {
  const g = o.sectionGrid || {}, size = v => Number.isInteger(v) && v >= 16 && v <= MAX_DIM ? v : 256;
  Object.assign(S, { views: cleanViews(o.views), sections: cleanSections(o.sections), secOn: !!g.on, secW: size(g.w), secH: size(g.h), secOx: g.ox | 0, secOy: g.oy | 0, seamGuard: g.seam !== false, rulers: o.rulers !== false, objFoot: !!o.footprints, liveDefault: o.liveShadows !== false, shadowOp: o.shadowOpacity >= 0 && o.shadowOpacity <= 100 ? o.shadowOpacity : 35 }); MM.ver++;
  extChosen = EXT_STEPS.includes(o.extendStep) ? o.extendStep : null;
}
/* Called once for each change that can move the view: only the map's rectangle and the section panel depend on it. */
function sceneView() {
  const key = [S.ox, S.oy, S.z, vw, vh, S.secOn, S.secW, S.secH, S.secOx, S.secOy, S.w, S.h, MM.ver].join();
  if (key === MM.key) return; MM.key = key;
  if (MM.on) miniOver();
  if (S.secOn) secUi();
}

/* ---------- memory ---------- */
function memBytes() {
  let n = H.bytes + CP.mipBytes + CP.tiles.size * MEM_TILE;
  for (const L of S.layers) n += L.px.byteLength + (L.ids ? L.ids.byteLength + L.faces.byteLength : 0);
  return n;
}
function memSync() {
  const n = memBytes(), over = n >= MEM_WARN, e = $('sbMem'); e.textContent = Math.round(n / 1e6) + ' MB'; e.classList.toggle('warn', over); e.hidden = !over && !prefGet('memShown');
  if (over && !MM.warned) toast('This project uses over 1 GB of memory. If the browser struggles, merge layers or crop the canvas.');
  MM.warned = over;
}

/* ---------- does it fit ---------- */
const FIT = { now: null, key: '' }, EDGE_KEY = 'qtiles.edgeGrow';
/* A ghost that adds art says what box it will take up. `again` redraws it after the canvas grows. `inside` places it moved inside, for Fit inside. */
function fitNote(box, name, act) { PV.fit = box ? Object.assign({ box, name }, act) : null; requestRender(); }
const fitSides = f => { const s = [[f.r, 'right'], [f.l, 'left'], [f.t, 'up'], [f.b, 'down']].filter(p => p[0]).map(p => p[0] + ' px ' + p[1]); return s.length > 1 ? s.slice(0, -1).join(', ') + ' and ' + s[s.length - 1] : s[0]; };
/* What the notice is about: a float, then a ghost, then an item too big for the canvas that has no ghost yet, as a finger gets none until it lands. */
function fitNow() {
  if (FL) return FL.moved && FL.op ? { box: floatBox(FL), name: 'The selection', float: true } : null;
  if (PV.fit) return PV.fit;
  const b = heldTool() === 'place' ? libPickBox() : null;
  return b && fitOf(b).larger ? { box: b, name: libPicked().name } : null;
}
function fitWords(n, f) {
  if (f.tooBig) return { text: n.name + ' is ' + f.w + ' x ' + f.h + ' px, over the ' + MAX_DIM + ' px a canvas can be. It cannot fit.' };
  if (!f.canGrow) return { text: n.name + ' would need a canvas over ' + MAX_DIM + ' px a side.' + (n.float || n.inside ? '' : ' The part past it is cut off.'), inside: !!(n.float || n.inside) };
  const say = f.larger ? n.name + ' is ' + f.w + ' x ' + f.h + ' px. The canvas is ' + S.w + ' x ' + S.h + '.' : n.name + ' sticks out ' + fitSides(f) + '.';
  if (S.sizeLock) return { text: say + ' The canvas is locked, so the part outside is cut off.', extend: 'Unlock and extend' };
  return { text: say + (S.edgeGrow === 'ask' ? ' Placing it asks first.' : f.larger ? '' : ' It will extend the canvas.'), extend: 'Extend now' };
}
/* Runs from render, so every way a ghost or float can move or change the canvas is covered, and the bar changes only when its words do. */
function fitSync() {
  const bar = $('fitBar'), n = fitNow(), f = n && fitOf(n.box), show = !!f && !f.fits; FIT.now = show ? n : null;
  if (!show) { if (!bar.hidden) { bar.hidden = true; FIT.key = ''; } return; }
  const w = fitWords(n, f), key = w.text + (w.extend || '') + !!w.inside;
  bar.hidden = false; if (key === FIT.key) return; FIT.key = key;
  $('fitText').textContent = w.text; $('fitGo').hidden = !w.extend; $('fitGo').textContent = w.extend || ''; $('fitIn').hidden = !w.inside;
}
/* The least pan that shows a box, after zooming out if it is too big for the stage at this zoom. */
function fitZoom(b) {
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, room = Math.min((vw - 16) / w, (vh - 16) / h); if (room >= S.z) return;
  zoomTo(ZOOMS.filter(v => v <= room).pop() || ZOOM_MIN);
}
function fitReveal(b) {
  fitZoom(b);
  const pan = (lo, hi, size) => lo < 8 ? Math.min(8 - lo, Math.max(0, size - 8 - hi)) : hi > size - 8 ? Math.max(size - 8 - hi, Math.min(0, 8 - lo)) : 0;
  S.ox += pan(S.ox + b.x0 * S.z, S.ox + (b.x1 + 1) * S.z, vw); S.oy += pan(S.oy + b.y0 * S.z, S.oy + (b.y1 + 1) * S.z, vh); requestRender();
}
/* Grows the canvas around a box, and says by how much. The view stays put unless the box ended up out of it. */
function growTold(box, margin) {
  const w = S.w, h = S.h, g = growToInclude(box.x0, box.y0, box.x1, box.y1, margin);
  if (g && (S.w !== w || S.h !== h)) { toast('Canvas extended by ' + (S.w - w) + ' x ' + (S.h - h) + ' px.'); fitReveal({ x0: box.x0 + g.dx, y0: box.y0 + g.dy, x1: box.x1 + g.dx, y1: box.y1 + g.dy }); }
  return g;
}
function fitExtend() {
  const n = FIT.now; if (!n) return;
  if (S.sizeLock) lockSet(false);
  if (n.float) floatGrow(n.box, 8); else { growTold(n.box, 8); if (n.again) n.again(); }
  requestRender();
}
/* The least move onto the half-tile grid, in `step` half tiles, that puts a box inside the canvas, or null if none does. x moves by (a - b) * tile / 4 and y by (a + b) * tile / 8. */
function fitShift(box, step) {
  const X = S.tile / 4, Y = S.tile / 8, nearest = (lo, hi) => lo > hi ? null : lo > 0 ? lo : hi < 0 ? hi : 0;
  const pLo = Math.ceil(-box.x0 / X), pHi = Math.floor((S.w - 1 - box.x1) / X), qLo = Math.ceil(-box.y0 / Y), qHi = Math.floor((S.h - 1 - box.y1) / Y), p0 = nearest(pLo, pHi), q0 = nearest(qLo, qHi);
  if (p0 === null || q0 === null) return null;
  let best = null;
  for (let p = Math.max(pLo, p0 - 2 * step); p <= Math.min(pHi, p0 + 2 * step); p++) for (let q = Math.max(qLo, q0 - 2 * step); q <= Math.min(qHi, q0 + 2 * step); q++) {
    const a = (p + q) / 2, b = (q - p) / 2, cost = Math.hypot(p * X, q * Y);
    if (a % step === 0 && b % step === 0 && (!best || cost < best.cost)) best = { a, b, cost };
  }
  return best && { a: best.a, b: best.b };
}
/* The canvas is at its limit where the art stands: grows as far as the art needs, then moves it inside. */
function fitInside() {
  const n = FIT.now; if (!n) return;
  const f = fitOf(n.box), room = { x0: 0, y0: 0, x1: Math.min(MAX_DIM, Math.max(S.w, f.w + 16)) - 1, y1: Math.min(MAX_DIM, Math.max(S.h, f.h + 16)) - 1 };
  if (n.float) {
    if (f.larger) floatGrow(room, 0);
    const q = floatShift(floatBox(FL)); if (q) { FL.x += q.x; FL.y += q.y; }
    requestRender(); return;
  }
  if (f.larger) growTold(room, 0);
  const q = fitShift(n.again ? (n.again(), PV.fit.box) : n.box, 1);
  if (q) PV.fit.inside(q); else toast('It does not fit inside.');
}
/* Commit past the edge under Ask. Under the lock there is nothing to ask, as the art is cut off and a toast says so. `go` gets the move chosen, or null. */
function fitGate(box, name, shiftFor, go, stop = pvClear) {
  const f = box && fitOf(box);
  if (!f || f.fits || S.sizeLock || S.edgeGrow !== 'ask') { go(null); return; }
  const q = shiftFor(box);
  $('fitAsk').textContent = f.canGrow ? 'Extend the canvas by ' + f.addW + ' x ' + f.addH + ' px to fit ' + name + '?' : name + ' does not fit: the canvas would pass ' + MAX_DIM + ' px a side.';
  $('fitYes').hidden = !f.canGrow; $('fitMove').hidden = !q;
  askSheet('sheetFit').then(a => { if (a === 'yes') go(null); else if (a === 'move' && q) go(q); else stop(); });
}
function edgeSet(v) { S.edgeGrow = v === 'ask' ? 'ask' : 'auto'; document.querySelectorAll('[data-edge-grow]').forEach(b => press(b, b.dataset.edgeGrow === S.edgeGrow)); requestRender(); }

function initScene() {
  miniShow(!prefGet('mapAuto') && prefStored(MM_KEY) === '1');
  const toggle = on => { prefSet('mapAuto', false); miniShow(on); try { localStorage.setItem(MM_KEY, on ? '1' : '0'); } catch (_) {} };
  $('miniBtn').onclick = () => toggle(true); $('miniClose').onclick = () => toggle(false); $('miniOpt').onclick = () => toggle(!MM.on);
  const map = $('miniMap'); map.onpointerdown = miniDown; map.onpointermove = miniMove; map.onpointerup = map.onpointercancel = () => { MM.grab = null; };
  $('viewSave').onclick = viewSave;
  $('secOn').onclick = () => secShow(!S.secOn);
  for (const n of SEC_SIZES) { const o = document.createElement('option'); o.value = n; o.textContent = n + ' × ' + n + ' px'; $('secSize').insertBefore(o, $('secSize').lastElementChild); }
  $('secSize').onchange = e => { if (e.target.value === 'cells') secSetSize(...secCellSize()); else secSetSize(+e.target.value, +e.target.value); };
  $('secDone').onclick = () => { const q = secCur(); secMark(q, { done: !(S.sections[secKey(q.x, q.y)] || {}).done }); };
  $('secNote').onchange = e => secMark(secCur(), { note: e.target.value.trim().slice(0, NOTE_MAX) });
  $('secNext').onclick = () => secStep(1); $('secPrev').onclick = () => secStep(-1); $('secTodo').onclick = secTodo;
  $('secGo').onclick = () => { const x = parseInt($('secX').value, 10), y = parseInt($('secY').value, 10); if (Number.isInteger(x) && Number.isInteger(y)) secGo(x, y); else toast('Type a section number across and down.'); };
  miniFit(); memSync();
  edgeSet(prefGet('edgeGrow'));
  document.querySelectorAll('[data-edge-grow]').forEach(b => { b.onclick = () => { edgeSet(b.dataset.edgeGrow); prefSet('edgeGrow', S.edgeGrow); }; });
  $('fitGo').onclick = fitExtend; $('fitIn').onclick = fitInside;
  $('fitBar').onpointerleave = e => { if (e.pointerType !== 'touch' && drawId === null && e.relatedTarget !== view) hoverGone(); };
  $('fitYes').onclick = () => sheetAnswer('yes'); $('fitMove').onclick = () => sheetAnswer('move');
}

'use strict';
/* qtiles UI: toolbar, colour palette, tool options, layers panel, sheets, toast. */

const $ = id => document.getElementById(id);
let toastTimer = null;
/* `act` adds one button, { label, run }, and more time to reach it. */
function toast(msg, act) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  if (act) { const b = document.createElement('button'); b.className = 'btn toastact'; b.textContent = act.label; b.onclick = () => { t.hidden = true; act.run(); }; t.appendChild(b); }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, act ? 6000 : 3200);
}
function press(el, on) { el.setAttribute('aria-pressed', on ? 'true' : 'false'); }
const exportOpts = { layerOnly: false, crop: false, sel: false, mode: 'image', solid: false, tile: 256, overlap: false, skip: false };
const ICON = {
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 6.2A9.6 9.6 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.9M6.5 7.6A17 17 0 002 12s4 7 10 7c1.5 0 2.9-.4 4.1-1"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 017.5-1.5"/></svg>',
  solo: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/></svg>',
  grip: '<svg viewBox="0 0 8 24"><path d="M2 7h.01M6 7h.01M2 12h.01M6 12h.01M2 17h.01M6 17h.01"/></svg>',
  chevR: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  chevD: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  layers: '<svg viewBox="0 0 24 24"><path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/></svg>',
  film: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M9 5v14M15 5v14"/></svg>',
  mirror: '<svg viewBox="0 0 24 24"><path d="M12 3v18" stroke-dasharray="3 3"/><path d="M9 7L3 17h6zM15 7l6 10h-6z"/></svg>',
  views: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16"/></svg>',
  canvas: '<svg viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/></svg>',
  photo: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5L6 19"/></svg>'
};
function iconBtn(svg, label, fn, pressed) {
  const b = document.createElement('button'); b.className = 'btn ico'; b.innerHTML = svg; b.setAttribute('aria-label', label); b.title = label; b.onclick = fn;
  if (pressed !== undefined) press(b, pressed); return b;
}
function updateStatus(a) {
  let s = (a.x >= 0 && a.y >= 0 && a.x < S.w && a.y < S.h) ? 'x ' + a.x + '  y ' + a.y : 'outside';
  if (S.mode === 'iso') { const c = tileCell(a.x, a.y); s += '  tile ' + c.i + ', ' + c.j; }
  else s += '  cell ' + Math.floor(a.x / S.cell) + ', ' + Math.floor(a.y / S.cell);
  if (S.secOn) { const q = secAt(a.x, a.y); s += '  ·  section ' + q.x + ', ' + q.y; }
  $('status').textContent = s; sizesHover();
}

/* ---------- tools & modes ---------- */
const TOOL_NAMES = { pencil: 'Pencil', eraser: 'Eraser', line: 'Line', rect: 'Rectangle', ellipse: 'Ellipse', fill: 'Fill', picker: 'Color picker', place: 'Place object', pick: 'Select object', shade: 'Lighten / Darken', dither: 'Dither', shadow: 'Shadow ellipse', tile: 'Ground tile', scatter: 'Scatter', terrain: 'Terrain', marquee: 'Rectangular select', wand: 'Magic wand', pivot: 'Set pivot', hand: 'Hand' };
/* What the art and the panel answer to. Hand changes only what a drag does, so a selection and a ghost carry on as they were under the tool it interrupted. */
const heldTool = () => S.tool === 'hand' ? S.toolBefore : S.tool;
function setTool(t) {
  if (t === 'hand' && S.tool === 'hand') t = S.toolBefore;
  if (objTool(t) && S.mode !== 'iso') { toast('Objects need Iso mode.'); return; }
  if (t === 'tile' && S.mode !== 'iso') { toast('Tiles need Iso mode.'); return; }
  if (t === 'terrain' && S.mode !== 'iso') { toast('Terrain needs Iso mode.'); return; }
  if (t === 'scatter' && S.mode !== 'iso') { toast('Scatter needs Iso mode.'); return; }
  const held = t === 'hand' || (S.tool === 'hand' && t === S.toolBefore);   // into Hand and back again leaves everything as it was
  if (!held) {
    PN.forced = null;
    if (!(selTool(t) && selTool(heldTool()))) commitFloat();
    GR.area = null; if (!objTool(t)) { asmExit(); objSelect(null); }
  }
  if (t === 'hand') S.toolBefore = S.tool;
  S.tool = t; pvClear();
  document.querySelectorAll('#tools [data-tool]').forEach(b => press(b, b.dataset.tool === t));
  if (t !== 'hand') {   // the panel stays on the tool Hand interrupted
    document.querySelectorAll('.opts > div').forEach(d => { d.hidden = !d.dataset.for.split(' ').includes(t); });
    if (t === 'terrain') syncTerrain();
    if (t === 'place' || t === 'scatter') syncLibrary();
  }
  view.classList.toggle('hand', t === 'hand');
  syncToolHelp(); syncDither(); if (t !== 'hand') panelTool(); requestRender();
}
/* A person picking a tool, as against setTool's other callers, which only need it set. Coming back from Hand is not a choice: everything stays as it was. */
function chooseTool(t) {
  const back = S.tool === 'hand' && (t === 'hand' || t === S.toolBefore);
  if (RF.adjust) refAdjustSet(false);
  setTool(t); if (!back && t !== 'hand' && S.tool === t) panelJump();
}

/* ---------- side panel ---------- */
/* What each tool needs, in order: these sections follow its options, and the first that is showing is where choosing the tool lands. LIGHT_TOOLS read the light, so its control shows in their options. */
const TOOL_PANELS = {
  pencil: ['tool', 'color'], eraser: ['tool', 'color'], line: ['tool', 'color'], rect: ['tool', 'color'], ellipse: ['tool', 'color'], fill: ['tool', 'color'],
  picker: ['color'],
  place: ['tool', 'color'], pick: ['object', 'tool'],
  terrain: ['tool', 'color'], scatter: ['tool', 'color'], tile: ['tool', 'color'],
  shade: ['tool', 'color'], dither: ['tool', 'color'], shadow: ['tool', 'color'],
  marquee: ['selection', 'tool'], wand: ['selection', 'tool'], pivot: ['character', 'tool'],
  hand: []
};
const LIGHT_TOOLS = ['place', 'pick', 'terrain', 'scatter', 'tile', 'shade', 'dither', 'shadow'];
/* The order when no tool says otherwise. `rail` borrows that tool's icon, so a section looks like the tool it belongs to. `when` is for a section that comes and goes; Object's is set by objSync. */
const PANELS = [
  { key: 'tool', id: 'optSec', pill: 'Tool', hint: 'The options of the active tool.' },
  { key: 'object', id: 'objSec', pill: 'Object', rail: 'pick', hint: 'Everything about the selected objects.', meta: () => { const n = objSet().length; return n > 1 ? n + ' selected' : ''; } },
  { key: 'color', id: 'colorSec', pill: 'Color', rail: 'picker', hint: 'The palette, the color picker and the second color.', meta: () => S.color.toUpperCase() },
  { key: 'selection', id: 'selSec', pill: 'Selection', rail: 'marquee', hint: 'Actions on the selection, or on the whole layer with nothing selected.', when: () => selTool(heldTool()) || !!(FL || SEL.mask), meta: () => FL ? FL.w + ' x ' + FL.h : SEL.box ? (SEL.box.x1 - SEL.box.x0 + 1) + ' x ' + (SEL.box.y1 - SEL.box.y0 + 1) : '' },
  { key: 'layers', id: 'layersSec', pill: 'Layers', icon: 'layers', hint: 'The layers of this project.', meta: () => String(S.layers.filter(L => !L.live).length) },
  { key: 'character', id: 'charSec', pill: 'Character', rail: 'pivot', hint: 'Pivot, facings and ghost, for a layer of type Character.', when: () => heldTool() === 'pivot' || (!!activeLayer() && isChar(activeLayer())) || !!ghostLayer() || S.onion },
  { key: 'animation', id: 'animSec', pill: 'Animation', icon: 'film', hint: 'Named lists of Character layers, played as frames.', when: () => prefGet('animTools') && (S.anims.length > 0 || S.layers.some(isChar)), meta: () => S.anims.length ? String(S.anims.length) : '' },
  { key: 'symmetry', id: 'symSec', pill: 'Symmetry', icon: 'mirror', hint: 'Repeats what you paint across a mirror line.', meta: () => S.mirrorX && S.mirrorY ? 'Four-way' : S.mirrorX ? 'Left-right' : S.mirrorY ? 'Top-bottom' : 'Off' },
  { key: 'shadow', id: 'shadowSec', pill: 'Shadow', rail: 'shadow', hint: 'Cast a shadow from a layer, or outline it.' },
  { key: 'reference', id: 'refSec', pill: 'Reference', icon: 'photo', hint: 'Photos and pictures to trace over or look at. They are never part of the art.', meta: () => RF.list.length ? String(RF.list.length) : '' },
  { key: 'views', id: 'sceneSec', pill: 'Views', icon: 'views', hint: 'Saved views, the minimap and sections of a big canvas.' },
  { key: 'canvas', id: 'canvasSec', pill: 'Canvas', icon: 'canvas', hint: 'Canvas size and its lock.', meta: () => S.w + ' x ' + S.h },
  { key: 'grid', id: 'gridSec', pill: 'Grid', icon: 'grid', hint: 'Grid display, guides and snap.', meta: () => S.mode === 'iso' ? 'Iso' : '2D' }
];
const PANEL_KEY = 'qtiles.panel', PANEL_MS = 150, PULSE_MS = 600;
const PN = { ready: false, shut: new Set(), forced: null, seen: new Set(), raf: 0, objKey: '' };   // forced: a section a tip pointed into, kept until the next tool
const panelOf = k => PANELS.find(p => p.key === k);
const panelClosed = () => getComputedStyle($('side')).visibility === 'hidden';
const panelTarget = () => TOOL_PANELS[heldTool()].find(k => !$(panelOf(k).id).hidden) || 'tool';
function panelSave() { try { localStorage.setItem(PANEL_KEY, JSON.stringify([...PN.shut])); } catch (_) {} }
function panelLoad() {
  let shut = []; try { shut = JSON.parse(localStorage.getItem(PANEL_KEY)) || []; } catch (_) {}
  for (const p of PANELS) if (p.head) panelFold(p.key, Array.isArray(shut) && shut.includes(p.key));
}
function panelFold(k, shut) {
  const p = panelOf(k); if (!p.head) return;   // the tool's options have no title bar, so they cannot be folded away
  $(p.id + 'Body').hidden = shut; p.head.setAttribute('aria-expanded', !shut);
  if (shut) PN.shut.add(k); else PN.shut.delete(k);
}
/* Reads the tool, not the rail: Hand leaves all of this on the tool it interrupted. */
function panelTool() {
  const t = heldTool(), word = TOOL_HELP[t][0], rail = document.querySelector('#tools [data-tool="' + t + '"] svg');
  $('optTitle').textContent = TOOL_NAMES[t]; $('toolKey').textContent = toolKey(t); $('toolIcon').innerHTML = rail.outerHTML;
  $('toolHint').textContent = (word !== TOOL_NAMES[t] ? word + '. ' : '') + TOOL_HELP[t][1];
  panelSync(); panelArrange();
}
/* The sections a tool needs follow its options, so the jump has little or no way to go. Nodes move only when the order changes, and a move takes focus, which goes back. */
function panelArrange() {
  const side = $('side'), row = TOOL_PANELS[heldTool()], want = [...new Set(['tool', ...row, ...PANELS.map(p => p.key)])].map(panelOf);
  if ([...side.querySelectorAll(':scope > .sec')].every((e, n) => e.id === want[n].id)) return;
  const f = document.activeElement;
  for (const p of want) { side.appendChild($(p.id)); $('secBar').appendChild(p.pillEl); }
  if (f && f !== document.activeElement) f.focus({ preventScroll: true });
}
/* What shows and what its title says. Cheap enough for every layer or selection change, and it touches nothing that scrolls. */
function panelSync() {
  if (!PN.ready) return;
  const light = LIGHT_TOOLS.includes(heldTool()); $('lightField').hidden = !light;
  $('optSec').hidden = !light && !document.querySelector('.opts > div:not([hidden])');
  for (const p of PANELS) {
    const sec = $(p.id); if (p.when) sec.hidden = !p.when() && PN.forced !== p.key;
    p.pillEl.hidden = sec.hidden;
    if (p.metaEl && !sec.hidden) { const m = p.meta(); if (p.metaEl.textContent !== m) p.metaEl.textContent = m; }
  }
  panelPills();
}
function panelPulse(el) { el.classList.add('pulse'); clearTimeout(el.pulseTimer); el.pulseTimer = setTimeout(() => el.classList.remove('pulse'), PULSE_MS); }
function panelScroll(top, still) {
  const side = $('side'), from = side.scrollTop, t0 = performance.now(); cancelAnimationFrame(PN.raf);
  if (still || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { side.scrollTop = top; return; }
  (function step(t) { const k = Math.min(1, (t - t0) / PANEL_MS); side.scrollTop = from + (top - from) * k; if (k < 1) PN.raf = requestAnimationFrame(step); })(t0);
}
/* Goes to a section and opens it. `near` leaves the panel at the top when the section's title already shows there, so the tool card and its options stay in view. */
function panelGo(k, near, still) {
  const p = panelOf(k), side = $('side'), el = $(p.id); if (PN.shut.has(k)) { panelFold(k, false); panelSave(); }
  const y = el.getBoundingClientRect().top - side.getBoundingClientRect().top + side.scrollTop, h = p.head ? p.head.offsetHeight : 0;
  panelScroll(k === 'tool' || (near && y + h <= side.clientHeight) ? 0 : y - $('secBar').offsetHeight, still);
  panelPulse(p.head || $('toolCard'));
}
/* Only a choice of tool lands here, so nothing on the canvas moves the panel. A phone's sheet stays shut and lands when it opens. The Inspector is the one section a tool lands on past its own options. */
function panelLand(still) { const k = panelTarget(); panelGo(k, k !== 'object', still); }
function panelJump() { if (drawId === null && !panelClosed()) panelLand(); }
function panelOpen(on) { sidePanel(on); if (on) panelLand(true); }
/* A control a tip or a tour points at has to be there: its section shows, and opens, whatever the tool. */
function panelReveal(el) {
  const p = PANELS.find(q => $(q.id).contains(el)); if (!p) return;
  if (p.when && !p.when()) PN.forced = p.key;
  if (PN.shut.has(p.key)) { panelFold(p.key, false); panelSave(); }
  panelSync();
}
/* A selection moves the panel only under Select object, and then only if the Inspector's title cannot be seen. */
function panelObject(set) {
  const key = set.map(o => o.id).join(); if (!PN.ready || key === PN.objKey) return;
  PN.objKey = key; panelSync(); if (!key) return;
  const p = panelOf('object');
  if (heldTool() !== 'pick' || panelClosed()) { panelPulse(p.pillEl); return; }
  const r = p.head.getBoundingClientRect(), s = $('side').getBoundingClientRect();
  if (r.top < s.top + $('secBar').offsetHeight || r.bottom > s.bottom) panelGo('object');
}
function panelPills() {
  const bar = $('secBar'), now = [...$('side').querySelectorAll(':scope > .sec')].find(e => !e.hidden && PN.seen.has(e.id));
  for (const p of PANELS) {
    const on = !!now && now.id === p.id; if (on === p.pillEl.hasAttribute('aria-current')) continue;
    p.pillEl.toggleAttribute('aria-current', on); if (!on) continue;
    const a = p.pillEl.offsetLeft, b = a + p.pillEl.offsetWidth;
    if (a < bar.scrollLeft) bar.scrollLeft = a; else if (b > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = b - bar.clientWidth;
  }
}
function panelInit() {
  const bar = $('secBar');
  for (const p of PANELS) {
    const sec = $(p.id), h = sec.querySelector(':scope > h3'), pill = document.createElement('button');
    pill.className = 'secpill'; pill.textContent = p.pill; pill.dataset.hint = p.hint; pill.onclick = () => panelGo(p.key); bar.appendChild(pill); p.pillEl = pill;
    if (!h) continue;
    const body = document.createElement('div'), head = document.createElement('button'), name = document.createElement('span'), icon = document.createElement('span'), chev = document.createElement('span'), rail = p.rail && document.querySelector('#tools [data-tool="' + p.rail + '"] svg');
    body.className = 'secbody'; body.id = p.id + 'Body'; while (h.nextSibling) body.appendChild(h.nextSibling); sec.appendChild(body);
    icon.className = 'secicon'; icon.innerHTML = rail ? rail.outerHTML : ICON[p.icon]; chev.className = 'secchev'; chev.innerHTML = ICON.chevD;
    name.className = 'secname'; name.textContent = h.textContent; if (h.id) { name.id = h.id; h.removeAttribute('id'); }   // objects.js retitles this one
    head.className = 'secfold'; head.dataset.hint = p.hint; head.setAttribute('aria-controls', body.id); head.append(icon, name);
    if (p.meta) { p.metaEl = document.createElement('span'); p.metaEl.className = 'secmeta mono'; head.appendChild(p.metaEl); }
    head.appendChild(chev); head.onclick = () => { panelFold(p.key, !PN.shut.has(p.key)); panelSave(); };
    h.className = 'sechead'; h.textContent = ''; h.appendChild(head); p.head = head;
  }
  bar.addEventListener('wheel', e => { if (!e.deltaX && bar.scrollWidth > bar.clientWidth) { e.preventDefault(); bar.scrollLeft += e.deltaY; } }, { passive: false });   // a mouse wheel has no sideways
  panelLoad(); PN.ready = true;
  if (window.IntersectionObserver) {   // the band just under the bar, which says what is being read
    const io = new IntersectionObserver(list => {
      for (const e of list) { if (e.isIntersecting) PN.seen.add(e.target.id); else PN.seen.delete(e.target.id); }
      panelPills();
    }, { root: $('side'), rootMargin: -(bar.offsetHeight + 1) + 'px 0px -70% 0px' });
    for (const p of PANELS) io.observe($(p.id));
  }
}
function setMode(m) {
  S.mode = m; pvClear(); press($('modeIso'), m === 'iso'); press($('modeFlat'), m === 'flat');
  if (m === 'iso') S.snap = S.snap === 'corner' ? 'tile' : S.snap === 'cell' ? 'pixel' : S.snap; else if (S.snap === 'tile') S.snap = 'corner';   // each grid has its own choices
  for (const t of ['place', 'pick', 'tile', 'terrain', 'scatter']) document.querySelector('[data-tool="' + t + '"]').hidden = m !== 'iso';
  $('lineSnap').hidden = m !== 'iso'; $('axisSnap').hidden = m !== 'iso'; $('isoTools').hidden = m !== 'iso'; $('secCells').textContent = '16 \u00d7 16 ' + (m === 'iso' ? 'tiles' : 'cells');
  const t = heldTool();
  if (m !== 'iso' && (objTool(t) || t === 'tile' || t === 'terrain' || t === 'scatter')) setTool('pencil');
  syncGrid(); setDirty(true); requestRender();
}
function setBrush(n) { S.brush = Math.max(1, Math.min(8, n)); syncBrush(); requestRender(); }
function syncBrush() {
  document.querySelectorAll('#brushRow .chip').forEach(b => press(b, +b.dataset.n === S.brush)); $('brushN').value = S.brush;
  const b = $('sbBrush'), n = S.brush, cells = cellBrush(), label = 'Brush size in ' + (cells ? 'cells' : 'pixels');
  $('perfect').hidden = n !== 1; press($('perfect'), perfectOn());   // a larger brush has no corners to clean
  $('brushUnit').textContent = cells ? 'cells' : 'px'; $('brushN').setAttribute('aria-label', label); $('brushRow').setAttribute('aria-label', label);
  b.hidden = !brushed(S.tool); b.textContent = cells ? 'Brush ' + n + (n > 1 ? ' cells (' : ' cell (') + n * S.cell + ' px)' : 'Brush ' + n + ' px';
  syncChip();
}

/* ---------- sizes: the status bar chip and its popover ---------- */
const countPx = n => n + (n === 1 ? ' pixel' : ' pixels');
const footPx = () => cellBrush() ? S.brush * S.cell : S.brush;
function sizeText() {
  const flat = S.mode !== 'iso', n = S.brush;
  return { mode: flat ? '2D' : 'Iso', canvas: S.w + ' x ' + S.h + ' px', gridName: flat ? 'Cell' : 'Tile', grid: flat ? String(S.cell) : S.tile + ' x ' + S.tile / 2, brush: !brushed(heldTool()) ? '' : cellBrush() ? n + (n > 1 ? ' cells' : ' cell') : String(n) };
}
function syncChip() {
  const t = sizeText(), b = $('sizeChip');
  $('chipMode').textContent = t.mode; $('chipCanvas').textContent = t.canvas; $('chipGridName').textContent = t.gridName; $('chipGridN').textContent = t.grid;
  $('chipBrush').hidden = !t.brush; $('chipBrushN').textContent = t.brush;
  b.setAttribute('aria-label', 'Sizes: ' + [t.mode, 'canvas ' + t.canvas, t.gridName.toLowerCase() + ' ' + t.grid, t.brush && 'brush ' + t.brush, 'snap ' + S.snap].filter(Boolean).join(', '));
  sizesSync();
}
/* One line, the cause before what follows from it. A brush of several cells is what Snap on Cell is for, so only a size in pixels is compared with a cell. */
function sizeWarn() {
  const iso = S.mode === 'iso', foot = footPx();
  if (iso ? S.tile > S.w || S.tile / 2 > S.h : S.cell > S.w || S.cell > S.h) return (iso ? 'Tile' : 'Cell') + ' is larger than the canvas';
  if (foot > S.w || foot > S.h) return 'Brush is larger than the canvas';
  return !iso && !cellBrush() && S.brush > S.cell ? 'Brush is larger than a cell' : '';
}
function sizeLabels() {
  const n = S.brush, cells = cellBrush(), foot = footPx(), rows = [['canvas', 'Canvas ' + S.w + ' x ' + S.h + ' px']];
  rows.push(S.mode === 'iso' ? ['grid', 'Tile ' + S.tile + ' x ' + S.tile / 2 + ' px'] : ['grid', 'Cell ' + S.cell + ' px']);
  if (S.mode === 'iso' && S.layers.some(L => L.objectLayer && L.objects.length)) rows.push(['level', 'Level ' + levelPx() + ' px']);
  rows.push(['brush', 'Brush ' + (cells ? n + (n > 1 ? ' cells (' : ' cell (') + foot + ' px, ' : n + ' px (') + countPx(foot * foot) + ')']);
  return rows;
}
const SZ_W = 296, SZ_H = 148;
let szSpot = '';
/* The art pixel the 2D diagram stands on: the pointer's, or the middle of the center cell. */
function sizeSpot() {
  const a = drawId !== null && drawFinger ? lastArt : hover, c = S.cell;
  if (a && a.x >= 0 && a.y >= 0 && a.x < S.w && a.y < S.h) return a;
  const mid = n => Math.min(n - 1, Math.floor(n / 2 / c) * c + (c >> 1));
  return { x: mid(S.w), y: mid(S.h) };
}
/* The whole canvas when that leaves a cell and the brush 3 px or more on screen. Otherwise a whole-number scale around the spot, as a 1 px brush on 4096 px cannot be drawn to scale and whole. */
function sizePlan() {
  const a = sizeSpot(), b = stampBox(a.x, a.y, S.brush), foot = b.x1 - b.x0 + 1, fit = Math.min(SZ_W / S.w, SZ_H / S.h), need = Math.ceil(3 / Math.min(S.cell, foot));
  const whole = fit >= need, k = whole ? Math.floor(fit) : need;
  const place = (size, room, at) => { const s = size * k; return s <= room ? Math.floor((room - s) / 2) : Math.max(room - s, Math.min(0, Math.round(room / 2 - (at + 0.5) * k))); };
  return { k, whole, ox: place(S.w, SZ_W, a.x), oy: place(S.h, SZ_H, a.y), cell: { i: Math.floor(a.x / S.cell), j: Math.floor(a.y / S.cell) }, foot: b };
}
function drawSizesFlat(c) {
  const p = sizePlan(), k = p.k, X = n => p.ox + n * k, Y = n => p.oy + n * k, W = S.w * k, Ht = S.h * k, s = S.cell, cw = s * k;
  c.save(); c.beginPath(); c.rect(X(0), Y(0), W, Ht); c.clip();
  c.fillStyle = TH.panel; c.fillRect(X(0), Y(0), W, Ht);
  c.globalAlpha = 0.12; c.fillStyle = TH.accentFill; c.fillRect(X(p.cell.i * s), Y(p.cell.j * s), cw, cw); c.globalAlpha = 1;
  c.strokeStyle = TH.grid; c.lineWidth = 1; c.beginPath();
  for (let i = Math.max(1, Math.ceil(-p.ox / cw)); i * s < S.w && X(i * s) < SZ_W; i++) { c.moveTo(X(i * s) + 0.5, 0); c.lineTo(X(i * s) + 0.5, SZ_H); }
  for (let j = Math.max(1, Math.ceil(-p.oy / cw)); j * s < S.h && Y(j * s) < SZ_H; j++) { c.moveTo(0, Y(j * s) + 0.5); c.lineTo(SZ_W, Y(j * s) + 0.5); }
  c.stroke();
  if (!S.sizeLock) c.restore();   // past the edge the canvas grows, so the brush is not cut off there
  c.fillStyle = TH.accent; c.fillRect(X(p.foot.x0), Y(p.foot.y0), (p.foot.x1 - p.foot.x0 + 1) * k, (p.foot.y1 - p.foot.y0 + 1) * k);
  if (S.sizeLock) c.restore();
  c.strokeStyle = TH.canvasEdge; c.strokeRect(X(0) + 0.5, Y(0) + 0.5, W - 1, Ht - 1);
  return p;
}
/* The same cell test as the Tile tool, a run of pixels at a time, with the brush at the tile's center. */
function drawSizesIso(c) {
  const w = S.tile, h = w / 2, k = Math.max(1, Math.floor(Math.min((SZ_W - 8) / w, (SZ_H - 8) / h))), ox = Math.floor((SZ_W - w * k) / 2), oy = Math.floor((SZ_H - h * k) / 2);
  const X = x => ox + (x + w / 2) * k, Y = y => oy + y * k;
  c.fillStyle = TH.gridMajor;
  for (let y = 0; y < h; y++) { let a = null, b = null; for (let x = -w / 2; x < w / 2; x++) if (inCell(x + S.gox, y + S.goy, 0, 0)) { if (a === null) a = x; b = x; } if (a !== null) c.fillRect(X(a), Y(y), (b - a + 1) * k, k); }
  const f = stampBox(0, h / 2, S.brush); c.fillStyle = TH.accent; c.fillRect(X(f.x0), Y(f.y0), (f.x1 - f.x0 + 1) * k, (f.y1 - f.y0 + 1) * k);
  return { k, whole: true };
}
function drawSizes() {
  const cv = $('szCv'), c = cv.getContext('2d'), r = window.devicePixelRatio || 1;
  if (cv.width !== SZ_W * r) { cv.width = SZ_W * r; cv.height = SZ_H * r; }
  c.setTransform(r, 0, 0, r, 0, 0); c.fillStyle = TH.stage; c.fillRect(0, 0, SZ_W, SZ_H);
  const p = S.mode === 'iso' ? drawSizesIso(c) : drawSizesFlat(c), part = $('szPart');
  part.hidden = p.whole; part.textContent = 'Part of the canvas, at ' + p.k + 'x.';
}
function sizesSync() {
  if ($('sizesPop').hidden) return;
  const flat = S.mode !== 'iso', labels = $('szLabels'), warn = sizeWarn(), cells = cellBrush(), word = flat ? 'Cell' : 'Tile', name = word + ' size in pixels', e = document.activeElement;
  labels.textContent = ''; for (const [k, text] of sizeLabels()) { const d = document.createElement('div'), key = document.createElement('i'); key.className = 'szkey'; key.dataset.k = k; d.append(key, text); labels.appendChild(d); }
  $('szCv').setAttribute('aria-label', sizeLabels().map(r => r[1]).join(', '));
  $('szWarn').hidden = !warn; $('szWarn').textContent = warn;
  $('szBrushUnit').textContent = cells ? 'cells' : 'px'; $('szBrushN').setAttribute('aria-label', 'Brush size in ' + (cells ? 'cells' : 'pixels')); if (e !== $('szBrushN')) $('szBrushN').value = S.brush;
  $('szBrushDown').disabled = S.brush <= 1; $('szBrushUp').disabled = S.brush >= 8;
  $('szGridName').textContent = word + ' size (px)'; $('szGridNote').textContent = flat ? 'Cell: one square of the grid. Snap to cell paints whole cells.' : 'Tile: one diamond of the grid. Snap to tile puts line ends on its corners.'; $('szSnapNote').textContent = SNAP_NOTES[S.snap];
  const n = $('szGridN'); n.setAttribute('aria-label', name); $('szGridDown').setAttribute('aria-label', word + ' size down'); $('szGridUp').setAttribute('aria-label', word + ' size up');
  n.min = flat ? 1 : 8; n.max = flat ? CELL_MAX : 256; n.step = flat ? 1 : 4; if (e !== n) n.value = flat ? S.cell : S.tile;
  drawSizes();
}
function sizesHover() {
  if ($('sizesPop').hidden || S.mode === 'iso') return;
  const a = sizeSpot(), k = a.x + ',' + a.y; if (k !== szSpot) { szSpot = k; drawSizes(); }
}
/* Doubling, as cells and tiles usually do, from wherever the size is now, so a custom size steps to the next round one. */
function sizeGridStep(by) {
  const flat = S.mode !== 'iso', list = flat ? [...CELL_SIZES, 64, 128, 256] : [8, ...TILE_SIZES, 256], v = flat ? S.cell : S.tile, to = by > 0 ? list.find(n => n > v) : list.filter(n => n < v).pop();
  if (to) sizeGridSet(to);
}
function sizeGridSet(n) { if (S.mode === 'iso') { tileCustom = false; setTileSize(n); } else { cellCustom = false; setCell(n); } }
function initSizes() {
  $('sizeChip').onclick = () => togglePop('sizesPop', $('sizesPop').hidden);
  $('szResize').onclick = openCanvasSheet;
  $('szBrushDown').onclick = () => setBrush(S.brush - 1); $('szBrushUp').onclick = () => setBrush(S.brush + 1);
  $('szBrushN').onchange = e => { const v = parseInt(e.target.value, 10); e.target.blur(); setBrush(Number.isFinite(v) ? v : S.brush); };
  $('szGridDown').onclick = () => sizeGridStep(-1); $('szGridUp').onclick = () => sizeGridStep(1);
  $('szGridN').onchange = e => { const v = parseInt(e.target.value, 10); e.target.blur(); if (Number.isFinite(v)) sizeGridSet(v); else syncChip(); };
}

/* ---------- guides ---------- */
const GUIDE_LINE = { grid: 'var(--grid-major)', accent: 'var(--accent-line)' };
let gridWas = 'cells';
/* One row per overlay on the canvas. `line` draws a sample of its line, `need` says why it cannot show right now. A row with `pref` lives in that row of Preferences, not in the Grid section. */
const GUIDES = [
  { id: 'guideGrid', name: () => 'Grid', note: () => S.mode === 'iso' ? 'Tile lines' : 'Cell lines', line: '<path d="M1 3h18M1 11h18M5 0v14M15 0v14"/>', color: 'grid', on: () => S.gridShow !== 'off', set: v => { if (!v) gridWas = S.gridShow; S.gridShow = v ? gridWas : 'off'; syncGrid(); } },
  { id: 'guideHover', name: () => S.mode === 'iso' ? 'Tile under pointer' : 'Cell under pointer', line: '<path d="M10 1l9 6-9 6-9-6z" fill="var(--sel)"/>', color: 'accent', on: () => S.guideHover, set: v => { S.guideHover = v; }, need: () => S.gridShow === 'off' && 'Needs Grid' },
  { id: 'rulersOn', name: () => 'Rulers', pref: 'rulers', line: '<path d="M1 3h18M3 3v4M8 3v4M13 3v4M18 3v4"/>', color: 'grid', on: () => S.rulers, set: v => { S.rulers = v; setDirty(true); }, need: () => S.mode === 'iso' ? 'In 2D only' : Math.max(...rulerCells()) > RULER_CELLS ? 'Up to ' + RULER_CELLS + ' cells a side' : S.gridShow === 'off' && 'Needs Grid' },
  { id: 'guideRef', name: () => 'References', note: () => RF.list.length === 1 ? '1 added' : RF.list.length + ' added', line: '<rect x="2" y="1" width="16" height="12" rx="1.5"/><path d="M18 10l-4-4-8 7"/>', color: 'accent', on: () => RF.shown, set: v => { RF.shown = v; refSync(); }, need: () => !RF.list.length && 'None added' },
  { id: 'guideMirror', name: () => 'Mirror line', line: '<path d="M10 0v14" stroke-dasharray="3 2"/>', color: 'accent', on: () => S.guideMirror, set: v => { S.guideMirror = v; }, need: () => !S.mirrorX && !S.mirrorY && 'Needs Symmetry' },
  { id: 'guideSec', name: () => 'Sections', line: '<path d="M1 7h18M10 0v14"/>', color: 'accent', on: () => S.secOn, set: secShow },
  { id: 'seamGuard', name: () => 'Seam guard', pref: 'seamGuard', line: '<path d="M10 0v14" stroke-width="3"/>', color: 'accent', on: () => S.seamGuard, set: v => { S.seamGuard = v; setDirty(true); }, need: () => !S.secOn && 'Needs Sections' },
  { id: 'guideHeight', name: () => 'Height guides', iso: true, note: () => HG_NAMES[S.guides], line: '<path d="M4 13V3M16 13V3M4 13l6-3 6 3" stroke-dasharray="1 2"/>', color: 'accent', on: () => S.guides !== 'off', set: v => hgSet(v ? HG.was : 'off') },
  { id: 'objFootOpt', name: () => 'Footprints', pref: 'footprints', line: '<path d="M10 3l8 4-8 4-8-4z"/>', color: 'accent', on: () => S.objFoot, set: v => { S.objFoot = v; setDirty(true); }, need: () => S.mode !== 'iso' && 'In Iso only' }
];
const guidesShown = () => GUIDES.filter(g => !g.pref && (S.mode === 'iso' || !g.iso));
function buildGuides() {
  for (const g of GUIDES) {
    const row = document.createElement('div'), mark = document.createElement('span'), name = document.createElement('span'), note = document.createElement('span'), b = document.createElement('button');
    row.className = 'guide'; row.dataset.guide = g.id; mark.className = 'gmark'; mark.innerHTML = '<svg viewBox="0 0 20 14" style="stroke:' + GUIDE_LINE[g.color] + '">' + g.line + '</svg>';
    name.className = 'gname'; note.className = 'gnote'; b.className = 'btn ico'; b.id = g.id;
    b.onclick = () => { g.set(!g.on()); syncGuides(); requestRender(); };
    row.append(mark, name, note, b); (g.pref ? document.querySelector('[data-pref="' + g.pref + '"] .pctl > div') : $('guides')).appendChild(row);
  }
}
function syncGuides() {
  for (const g of GUIDES) {
    const row = document.querySelector('[data-guide="' + g.id + '"]'), b = $(g.id), on = g.on(), need = g.need && g.need() || '', name = g.name();
    row.hidden = !g.pref && !guidesShown().includes(g); row.classList.toggle('off', !on || !!need);
    row.querySelector('.gname').textContent = name; row.querySelector('.gnote').textContent = need || (g.note ? g.note() : '');
    press(b, on); b.disabled = !!need; b.innerHTML = on ? ICON.eye : ICON.eyeOff; b.setAttribute('aria-label', name); b.title = name;
  }
}

/* ---------- light, shade and dither options ---------- */
function setLight(l) {
  S.light = l; pvClear(); hooks.color(); objRefresh();
  document.querySelectorAll('[data-light]').forEach(b => press(b, b.dataset.light === l));
}
function syncShade() { press($('shadeDark'), S.shadeDir < 0); press($('shadeLight'), S.shadeDir > 0); }
function syncDither() {
  const grad = S.ditherMode === 'grad';
  press($('ditherBrush'), !grad); press($('ditherGrad'), grad); press($('offSecond'), !S.ditherClear); press($('offClear'), S.ditherClear);
  $('brushOpt').hidden = !brushed(heldTool()); syncBrush();
  $('ditherPat').disabled = grad; $('levelField').hidden = grad || !DITHERS[S.ditherPat].density;
  $('levelRead').textContent = S.ditherLevel + ' / 16'; $('gradHint').hidden = !grad;
  $('gradHint').textContent = SEL.box ? 'Drag across the selection to set the fade.' : GR.area ? 'Now drag across the rectangle to set the fade. Tap to start over.' : 'Drag a rectangle, then drag across it to set the fade.';
  drawDitherPreview(); requestRender();
}
function drawDitherPreview() {
  const c = $('ditherPv').getContext('2d'), img = c.createImageData(16, 16), px = new Uint32Array(img.data.buffer);
  const on = packHex(S.color), off = S.ditherClear ? 0 : packHex(S.color2), pat = DITHERS[S.ditherPat], grad = S.ditherMode === 'grad';
  for (let v = 0; v < 16; v++) for (let u = 0; u < 16; u++) px[v * 16 + u] = (grad ? bayerOn(u, v, Math.round(u * 16 / 15)) : pat.on(u, v, S.ditherLevel)) ? on : off;
  c.putImageData(img, 0, 0);
}

/* Each [data-opt] button sets one field of S, written "field:value". */
function syncOpts() {
  document.querySelectorAll('[data-opt]').forEach(b => { const [k, v] = b.dataset.opt.split(':'); press(b, String(S[k]) === v); });
  $('castRead').textContent = S.castLen + '%'; $('outStepsField').hidden = S.outColor !== 'sel';
  syncTile();
}

/* ---------- tiles and the grid ---------- */
const SNAP_NOTES = { pixel: 'The brush lands on any pixel.', cell: 'The brush paints whole cells, and its size counts cells.', corner: 'Lines, rectangles and ellipses start and end on cell corners. The pencil lands on any pixel.', tile: 'Lines and rectangles start and end on tile corners. The brush stays in pixels.' };
const CELL_SIZES = [1, 2, 4, 8, 16, 32];
let cellCustom = false;
function syncGrid() {
  const flat = S.mode !== 'iso', preset = CELL_SIZES.includes(S.cell), [nx, ny] = rulerCells(), cut = S.w % S.cell || S.h % S.cell;
  press($('modeFlat2'), flat); press($('modeIso2'), !flat);
  if (!cellCustom) $('cellSel').value = preset ? S.cell : 'custom';
  $('cellCustomField').hidden = preset && !cellCustom; $('cellCustom').value = S.cell;
  $('cellNote').textContent = nx + ' \u00d7 ' + ny + ' cells of ' + S.cell + ' px' + (cut ? ', the last ones cut off by the canvas edge.' : '.');
  document.querySelectorAll('[data-grid]').forEach(b => { const [k, v] = b.dataset.grid.split(':'); press(b, String(S[k]) === v); });
  document.querySelector('[data-grid="gridShow:cells"]').textContent = flat ? 'Cells' : 'Tiles'; document.querySelector('[data-grid="gridShow:pixels"]').textContent = (flat ? 'Cells' : 'Tiles') + ' and pixels';
  document.querySelectorAll('[data-grid="snap:cell"], [data-grid="snap:corner"]').forEach(b => { b.hidden = !flat; }); document.querySelectorAll('[data-grid="snap:tile"]').forEach(b => { b.hidden = flat; });
  const unit = flat ? 'cells' : 'tiles'; $('majorUnit').textContent = unit; $('majorSeg').setAttribute('aria-label', 'Major line every this many ' + unit);
  $('snapNote').textContent = SNAP_NOTES[S.snap]; syncGuides(); syncBrush(); panelSync();
}
function setCell(n) { S.cell = Math.max(1, Math.min(CELL_MAX, Math.round(n) || 1)); syncGrid(); setDirty(true); requestRender(); }
function syncOrigin() { $('sbOrigin').textContent = 'origin ' + S.gox + ', ' + S.goy; $('originReset').disabled = !S.nudgeX && !S.nudgeY; }
function syncTile() {
  const preset = TILE_SIZES.includes(S.tile), textured = S.tileTex !== 'plain';
  if (!tileCustom) $('tileSel').value = preset ? S.tile : 'custom';
  $('tileCustomField').hidden = preset && !tileCustom; $('tileCustom').value = S.tile;
  $('tileVarField').hidden = !textured; press($('tileRandom'), S.tileRandom); $('tilePick').hidden = S.tileRandom;
  $('tileVar').max = S.tileVariants; S.tileVar = Math.min(S.tileVar, S.tileVariants); $('tileVar').value = S.tileVar;
  $('tileVarRead').textContent = S.tileVar + ' of ' + S.tileVariants; $('tileVarsRead').textContent = S.tileVariants;
  $('tileSeed').value = S.tileSeed; $('tileTex').value = S.tileTex; $('tileH').value = S.tileH; syncLevel();
  if (!$('guidePop').hidden) drawGuide();
  seamTick();
}
let tileCustom = false;
function setTileSize(w) {
  const snapped = Math.max(8, Math.min(256, Math.round(w / 4) * 4)), was = S.tile; S.tile = snapped;
  syncTile(); if (snapped !== was) { objRefresh(); syncPlace(); setDirty(true); requestRender(); toast('The grid and snapping changed. Pixels already drawn stay where they are.'); }
  else if (snapped !== w) toast('Tile widths are multiples of 4, so the tile height stays a whole number of pixels.');
}
/* The guide reads the same cell test as the Tile tool, so what it shows is what gets stamped. */
function drawGuide() {
  const w = S.tile, h = w / 2, cv = $('guideCv'), c = cv.getContext('2d'), z = Math.max(1, Math.floor(220 / w)), st = getComputedStyle(document.documentElement);
  cv.width = (w + 2) * z; cv.height = (h + 2) * z;
  c.fillStyle = st.getPropertyValue('--accent-line').trim();
  for (let y = 0; y < h; y++) for (let x = -w / 2; x < w / 2; x++) if (inCell(x + S.gox, y + S.goy, 0, 0)) c.fillRect((x + w / 2 + 1) * z, (y + 1) * z, z, z);
  $('guideNote').textContent = w + ' \u00d7 ' + h + ' px, runs of ' + S.edgeRun;
}
let seamTimer = null, seamAt = 0;
/* The preview redraws on the view's render at most every 120 ms, with one more after the last change. */
function seamTick() {
  if ($('seamPop').hidden || seamTimer) return;
  seamTimer = setTimeout(() => { seamTimer = null; seamAt = performance.now(); drawSeam(); }, Math.max(0, 120 - (performance.now() - seamAt)));
}
function drawSeam() {
  const b = seamBuf(), one = $('seam1'), two = $('seam2'), ok = b && !b.big;
  $('seamNote').textContent = !b ? 'Stamp a tile or select a region to see it repeated.' : b.big ? 'Select at most ' + SEAM_MAX + ' \u00d7 ' + SEAM_MAX + ' px to preview it.' : '';
  $('seamNote').hidden = ok; $('seamView').hidden = !ok;
  if (!ok) return;
  one.width = b.w; one.height = b.h; two.width = b.w * 2; two.height = b.h * 2;
  const c = one.getContext('2d'), img = c.createImageData(b.w, b.h); new Uint32Array(img.data.buffer).set(b.px); c.putImageData(img, 0, 0);
  const d = two.getContext('2d'); d.imageSmoothingEnabled = false; d.drawImage(one, 0, 0, b.w * 2, b.h * 2);
}
function togglePop(id, on) {
  const p = $(id); p.hidden = !on;
  if (id === 'seamPop') { document.querySelectorAll('.seamBtn').forEach(b => press(b, on)); if (on) drawSeam(); }
  else if (id === 'histPop') { press($('histBtn'), on); historySync(); }
  else if (id === 'sizesPop') { $('sizeChip').setAttribute('aria-expanded', on); if (on) sizesSync(); }
  else if (id === 'heightPop') $('heightBtn').setAttribute('aria-expanded', on);
  else { press($('guideBtn'), on); if (on) drawGuide(); }
}
/* A popover drags by its title bar and stays on screen. Pointer capture keeps a fast drag from slipping off the bar. */
function dragPop(p) {
  const bar = p.querySelector('.pophead'); let from = null;
  bar.onpointerdown = e => { if (e.target.closest('button')) return; const r = p.getBoundingClientRect(); from = { x: e.clientX - r.left, y: e.clientY - r.top }; bar.setPointerCapture(e.pointerId); };
  bar.onpointermove = e => {
    if (!from) return;
    p.style.left = Math.max(0, Math.min(innerWidth - p.offsetWidth, e.clientX - from.x)) + 'px'; p.style.top = Math.max(0, Math.min(innerHeight - p.offsetHeight, e.clientY - from.y)) + 'px'; p.style.right = 'auto';
  };
  bar.onpointerup = bar.onpointercancel = () => { from = null; };
}

/* ---------- selection ---------- */
hooks.sel = () => {
  const any = !!(FL || SEL.mask); $('selBar').hidden = !any;
  document.querySelectorAll('.float-only').forEach(b => { b.hidden = !FL; });
  ['none', 'cut', 'copy', 'delete', 'duplicate'].forEach(k => document.querySelectorAll('[data-sel="' + k + '"]').forEach(b => { b.disabled = !any; }));
  if (!any) { document.querySelectorAll('.selmore').forEach(d => { d.hidden = true; }); }
  document.querySelectorAll('[data-selop]').forEach(b => press(b, b.dataset.selop === SEL.op));
  press($('wandAll'), SEL.wandAll); press($('wandOne'), !SEL.wandAll); syncDither(); panelSync();
};
/* An action bar sits just above what it acts on, or below it when there is no room, and stays inside the stage. */
function placeBars() {
  if (!$('selBar').hidden) placeBar($('selBar'), FL ? { x0: FL.x, y0: FL.y, x1: FL.x + FL.w - 1, y1: FL.y + FL.h - 1 } : SEL.box);
  if (!$('objBar').hidden && OB.box) placeBar($('objBar'), OB.box);
}
function placeBar(bar, b) {
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  const mid = S.ox + (b.x0 + b.x1 + 1) / 2 * S.z, left = (VW.flip ? vw - mid : mid) - bw / 2, top = S.oy + b.y0 * S.z - bh - 8, under = S.oy + (b.y1 + 1) * S.z + 8;
  bar.style.left = Math.max(8, Math.min(vw - bw - 8, left)) + 'px';
  bar.style.top = Math.max(8, Math.min(vh - bh - 8, top >= 8 ? top : under)) + 'px';
}

/* ---------- symmetry ---------- */
function syncMirror() {
  press($('mirrorX'), S.mirrorX); press($('mirrorY'), S.mirrorY); press($('axisPlace'), placingAxis); press($('axisSnap'), S.axisSnap);
  $('symMore').hidden = !S.mirrorX && !S.mirrorY; syncGuides(); panelSync(); requestRender();
}
function toggleMirror(k) {
  S[k] = !S[k]; if (!S.mirrorX && !S.mirrorY) placingAxis = false;
  pvClear(); syncMirror(); setDirty(true);
}

/* ---------- colour & palette ---------- */
function renderPalette() {
  const sel = $('palSel'), all = PALETTES.concat(S.myPalettes); sel.textContent = '';
  if (!findPalette(S.pal.id)) all.push(S.pal);
  for (const q of all) { const o = document.createElement('option'); o.value = q.id; o.textContent = q.name; sel.appendChild(o); }
  sel.value = S.pal.id;
  const p = $('pal'); p.textContent = ''; p.classList.toggle('edit', $('palEdit').getAttribute('aria-pressed') === 'true');
  for (const r of paletteRamps()) {
    const name = document.createElement('div'), row = document.createElement('div'); name.className = 'rampname'; name.textContent = r.name; row.className = 'ramprow';
    for (const hex of r.colors) {
      const b = document.createElement('button'); b.className = 'sw'; b.style.background = hex; b.dataset.hex = hex;
      b.setAttribute('aria-label', 'Color ' + hex); press(b, hex === S.color.toLowerCase()); row.appendChild(b);
    }
    p.append(name, row);
  }
  $('palCredit').hidden = !S.pal.credit; $('palCredit').textContent = S.pal.credit || '';
  const ramps = paletteRamps().filter(r => !isLoose(r)), target = $('rampTarget'); target.textContent = '';
  for (const r of ramps) { const o = document.createElement('option'); o.textContent = r.name; target.appendChild(o); }
  $('rampAddBtn').disabled = !ramps.length; $('autoRampsBtn').disabled = !paletteRamps().some(isLoose);
}
/* Changing palette never remaps art, but the two current colors move to the nearest color the new palette has. */
function paletteChanged() {
  const a = rampOf(S.color), b = rampOf(S.color2);
  if (!b.exact) S.color2 = b.ramp.colors[b.index];
  renderPalette(); setColor(a.exact ? S.color : a.ramp.colors[a.index]); objRefresh(); setDirty(true);
}
const HSV = { h: 0, s: 0, v: 0 };
function pickFromHsv() { setColor(rgbToHex(...hsvToRgb(HSV.h, HSV.s, HSV.v))); }
function drawHsv() {
  const box = $('svBox'), s = Math.round(HSV.s * 100), v = Math.round(HSV.v * 100);
  box.style.backgroundColor = 'hsl(' + Math.round(HSV.h) + ',100%,50%)';
  $('svDot').style.left = s + '%'; $('svDot').style.top = (100 - v) + '%'; $('hueInput').value = Math.round(HSV.h);
  box.setAttribute('aria-valuenow', v); box.setAttribute('aria-valuetext', 'Saturation ' + s + '%, brightness ' + v + '%');
}
hooks.color = () => {
  // Black and grays have no hue, so re-read HSV only for a color the picker did not make, and keep what that color cannot express.
  // Otherwise dragging down to black would snap the hue slider to red.
  if (rgbToHex(...hsvToRgb(HSV.h, HSV.s, HSV.v)) !== S.color) {
    const [h, s, v] = rgbToHsv(...hexToRgb(S.color));
    if (s) HSV.h = h;
    if (v) HSV.s = s;
    HSV.v = v;
  }
  drawHsv();
  $('curSwatch').style.background = S.color; $('curSwatch2').style.background = S.color2; $('colorInput').value = S.color; $('hexInput').value = S.color;
  document.querySelectorAll('#pal .sw').forEach(b => press(b, b.getAttribute('aria-label').slice(6).toLowerCase() === S.color.toLowerCase()));
  const sh = $('shades').children, f = faceShades(S.color);
  const hx = v => rgbToHex(v & 255, (v >>> 8) & 255, (v >>> 16) & 255);
  sh[0].style.background = hx(f.top); sh[1].style.background = hx(f.left); sh[2].style.background = hx(f.right);
  drawDitherPreview(); refPickedSync(); syncPlace(); if (heldTool() === 'terrain') syncTerrain(); if (heldTool() === 'place') syncLibrary();
  if (pvShown() && (S.tool === 'place' || S.tool === 'terrain')) pvClear();
  panelSync();
};

/* ---------- layers panel ---------- */
hooks.layers = () => {
  if (!S.layers.length) return;
  ghostGuard();
  $('cvSize').textContent = S.w + ' x ' + S.h + ' px'; $('sbName').textContent = S.name + '  \u00b7  ' + S.w + ' \u00d7 ' + S.h + ' px';
  dragAbort(); const box = $('layers'); box.textContent = ''; let inGroup = null;
  for (let k = S.layers.length - 1; k >= 0; k--) {
    const L = S.layers[k], g = groupOf(L), row = document.createElement('div');
    if (g && g !== inGroup) box.appendChild(groupRow(g, activeLayer().group === g.id));
    inGroup = g; if (g && g.collapsed) continue;
    row.className = 'layer' + (k === S.active ? ' active' : '') + (shownOf(L) ? '' : ' off') + (L.ghost ? ' ghost' : '') + (g ? ' ingroup' : '') + (linkOf(L) && layerById(linkOf(L)) ? ' linked' : '');
    row.dataset.k = k; if (L.tag) row.dataset.tag = L.tag;
    const eye = iconBtn(L.visible ? ICON.eye : ICON.eyeOff, (L.visible ? 'Hide ' : 'Show ') + L.name, () => { L.visible = !L.visible; const pair = L.live ? layerById(L.shadowFor) : liveOf(L); if (pair) pair.visible = L.visible; hooks.layers(); requestRender(); setDirty(true); });
    const nm = document.createElement('button'); nm.className = 'lname'; nm.textContent = L.name; nm.title = 'Tap to select, tap again to rename';
    if (LG.marks.has(L.id)) { nm.classList.add('marked'); nm.setAttribute('aria-pressed', 'true'); }
    nm.onclick = ev => {
      if (layerMark(L, ev)) return;
      if (L.ghost) { toast(GHOST_MSG); return; }
      if (S.active !== k) { S.active = k; hooks.layers(); return; }
      nameEdit(nm, L.name, v => { L.name = v; hooks.layers(); setDirty(true); });
    };
    const kd = document.createElement('button'); kd.className = 'lkind'; kd.dataset.kind = L.kind; kd.title = 'Layer type. Tap to change.';
    kd.textContent = (LAYER_KINDS.find(x => x[0] === L.kind) || LAYER_KINDS[0])[1]; kd.setAttribute('aria-label', 'Layer type: ' + kd.textContent); kd.dataset.short = kd.textContent[0];
    kd.onclick = () => { const i = LAYER_KINDS.findIndex(x => x[0] === L.kind); L.kind = LAYER_KINDS[(i + 1) % LAYER_KINDS.length][0]; shadowTidy(); hooks.layers(); setDirty(true); };
    const lk = iconBtn(L.locked ? ICON.lock : ICON.unlock, (L.locked ? 'Unlock ' : 'Lock ') + L.name, () => { L.locked = !L.locked; hooks.layers(); setDirty(true); }, L.locked);
    const so = iconBtn(ICON.solo, (L.solo ? 'Stop soloing ' : 'Show only ') + L.name, () => { const on = !L.solo; soloClear(); L.solo = on; hooks.layers(); requestRender(); }, L.solo);
    if (L.objectLayer) { nm.title = 'Object layer. ' + nm.title; nm.classList.add('lobj'); }
    if (L.ghost) { kd.dataset.kind = 'ghost'; kd.textContent = 'Ghost'; kd.dataset.short = 'G'; kd.setAttribute('aria-label', 'Ghost layer. Tap to clear it.'); kd.title = 'Tap to clear the ghost.'; kd.onclick = ghostClear; so.disabled = true; }
    row.append(gripBtn(L.name, L), eye, nm, kd, lk, so); box.appendChild(row);
  }
  $('layerOpacity').value = Math.round(activeLayer().opacity * 100);
  $('lDel').disabled = S.layers.length < 2; $('lMerge').disabled = S.active < 1;
  $('lUp').disabled = !moveStep(1); $('lDown').disabled = !moveStep(-1);
  $('outMerge').disabled = !outlineOf(outlineSource());
  $('lBake').hidden = !activeLayer().objectLayer; syncLayerShadows(); groupSync(); objSync(); charSync(); memSync(); panelSync();
};
/* The shadow's own opacity, from its source, so nobody has to dig for a locked layer. */
function syncLayerShadows() {
  const A = activeLayer(), on = liveOn(A), sh = liveOf(A); $('lShadowRow').hidden = !A.objectLayer; press($('lShadows'), on);
  $('lShadowOp').closest('.field').hidden = !sh; if (sh) $('lShadowOp').value = Math.round(sh.opacity * 100);
}
hooks.history = () => { $('undoBtn').disabled = H.pos === 0; $('redoBtn').disabled = H.pos >= H.stack.length; memSync(); historySync(); sizesSync(); };
hooks.dirty = () => { saveBar(); if (SK.side && docVer !== SK.ver) shrinkClose(); };
/* Edge handles sit in pairs just outside each canvas edge while that edge is on screen, side by side on the top and bottom, stacked on the left and right. On a tiny canvas they move out further, so two pairs at a corner do not overlap. */
hooks.view = () => {
  placeBars(); seamTick(); sceneView();
  const x = S.ox, y = S.oy, W = S.w * S.z, Ht = S.h * S.z, big = edgeSmall(), size = big || window.matchMedia('(pointer: coarse)').matches ? 44 : 28, gap = 4, off = Math.max(size / 2 + 8, size * 1.5 + gap / 2 + 2 - Math.max(W, Ht) / 2), far = off + (rulersShown() ? RULER_PX : 0);   // rulers sit on the top and left, and the handles go outside them
  const pad = size + gap / 2 + 6, cx = Math.min(Math.max(x + W / 2, pad), vw - pad), cy = Math.min(Math.max(y + Ht / 2, pad), vh - pad), step = (size + gap) / 2, n = extStepNow();
  const at = { top: [cx, y - far], bottom: [cx, y + Ht + off], left: [x - far, cy], right: [x + W + off, cy] };
  document.querySelectorAll('.edge').forEach(el => {
    const side = el.dataset.edge || el.dataset.shrink, minus = !!el.dataset.shrink, flat = side === 'top' || side === 'bottom', [px, py] = at[side], on = !S.sizeLock && !VW.flip && px >= 8 && px <= vw - 8 && py >= 8 && py <= vh - 8;
    el.classList.toggle('big', big); el.style.display = on ? 'flex' : 'none';
    if (on) { el.style.left = px + (flat ? (minus ? -step : step) : 0) + 'px'; el.style.top = py + (flat ? 0 : minus ? step : -step) + 'px'; }
    if (minus) el.disabled = n >= (flat ? S.h : S.w);
  });
  shrinkPlace();
};
/* The step the handles use. At 4096 px on both sides the list of steps is empty, and shrinking is still possible. */
const extStepNow = () => +$('extStep').value || extChosen || EXT_DEFAULT;
function extendEdge(side) {
  const n = +$('extStep').value; if (S.sizeLock) return;
  commitFloat(); const a = { top: [0, n, 0, 0], left: [n, 0, 0, 0], right: [0, 0, n, 0], bottom: [0, 0, 0, n] }[side];
  if (!n || !extendBy(...a)) toast('The canvas is at its size limit (4096 px a side).');
}
const SK = { side: null, cut: null, ver: 0 };   // the question the chip is asking, with docVer at that moment: anything that changes the art makes its count stale
function shrinkArgs(side, n) { return { top: [0, n, 0, 0], left: [n, 0, 0, 0], right: [0, 0, n, 0], bottom: [0, 0, 0, n] }[side]; }
function shrinkEdge(side) {
  const n = extStepNow(); if (S.sizeLock) return;
  commitFloat();
  const [l, t, r, b] = shrinkArgs(side, n), holds = (S.w - l - r >= 1 && S.h - t - b >= 1) ? stripHolds(r ? S.w - r : 0, b ? S.h - b : 0, l ? l - 1 : S.w - 1, t ? t - 1 : S.h - 1) : null;
  shrinkClose(); if (!holds) return;
  if (holds.pixels || holds.objects) shrinkAsk(side, n, holds); else shrinkBy(l, t, r, b);
}
function shrinkWords(h) {
  const many = (k, w) => k + ' ' + w + (k === 1 ? '' : 's'), parts = [];
  if (h.pixels) parts.push(many(h.pixels, 'pixel') + ' on ' + many(h.layers, 'layer'));
  if (h.objects) parts.push(many(h.objects, 'object'));
  return 'Cuts off ' + parts.join(' and ') + '. Shrink?';
}
function shrinkAsk(side, n, holds) {
  Object.assign(SK, { side, cut: shrinkArgs(side, n), ver: docVer }); $('shrinkText').textContent = shrinkWords(holds);
  $('shrinkAsk').hidden = false; shrinkPlace(); $('shrinkNo').focus({ preventScroll: true });
}
function shrinkClose() { SK.side = null; $('shrinkAsk').hidden = true; }
/* Next to the minus, on the outer side if there is room. It goes when its button does, so it cannot ask about an edge nobody can see. */
function shrinkPlace() {
  if (!SK.side) return;
  const btn = document.querySelector('[data-shrink="' + SK.side + '"]'), el = $('shrinkAsk'); if (S.sizeLock || btn.style.display === 'none') { shrinkClose(); return; }
  const bx = parseFloat(btn.style.left), by = parseFloat(btn.style.top), w = el.offsetWidth, h = el.offsetHeight, gap = btn.offsetWidth / 2 + 6, room = 8, keep = (v, max) => Math.max(room, Math.min(max - room, v));
  let l = bx - w / 2, t = by - h / 2;
  if (SK.side === 'top' || SK.side === 'bottom') { const out = SK.side === 'top' ? by - gap - h : by + gap, inn = SK.side === 'top' ? by + gap : by - gap - h; t = out >= room && out + h <= vh - room ? out : inn; }
  else { const out = SK.side === 'left' ? bx - gap - w : bx + gap; if (out >= room && out + w <= vw - room) l = out; else t = by + gap + h <= vh - room ? by + gap : by - gap - btn.offsetWidth - 4 - h; }   // too wide for the side it would stand on, so under the pair, the minus being the lower one, or above it
  el.style.left = keep(l, vw - w) + 'px'; el.style.top = keep(t, vh - h) + 'px';
}
/* Steps that work on every edge. With one side at the limit, the ones the other side can still take, and the handle on the full side says so. */
function extSteps(w, h) {
  const fit = side => EXT_STEPS.filter(n => side + n <= MAX_DIM), all = fit(Math.max(w, h));
  return all.length ? all : fit(Math.min(w, h));
}
function extSync() {
  const list = extSteps(S.w, S.h), sel = $('extStep'), first = Math.max(S.w, S.h) < EXT_SMALL ? EXT_SMALL_STEP : EXT_DEFAULT;
  sel.textContent = ''; for (const n of list) { const o = document.createElement('option'); o.textContent = n; sel.appendChild(o); }
  if (list.length) sel.value = list.includes(extChosen) ? extChosen : list.includes(first) ? first : list[list.length - 1];
  sel.disabled = !list.length;
}
function canvasSync() {
  const on = S.sizeLock; extSync(); press($('cvLock'), on); press($('cvLock2'), on); $('extStep').disabled = $('extStep').disabled || on;
  $('cvHint').textContent = on ? 'The canvas keeps its size. Art past the edge is cut off. Resize still works.' : 'Use the + and − handles on the canvas edges, or just draw past an edge and it grows.';
}
/* Unlocking refits a small canvas: Fit left no room for handles it did not have. */
function lockSet(on) { S.sizeLock = on; if (!on) { $('toast').hidden = true; if (edgeSmall()) fitView(); } setDirty(true); canvasSync(); requestRender(); }
/* Once per action: a stroke reports here on every move. Outside a stroke (a paste, a menu) each report is an action of its own. */
hooks.locked = () => {
  if (LOCK_NOTE.told && drawId !== null) return;
  LOCK_NOTE.told = true; toast('Canvas is locked at ' + S.w + ' x ' + S.h + '. Art past the edge is cut off.', { label: 'Unlock', run: () => lockSet(false) });
};
hooks.canvas = () => { GR.area = null; cellCustom = false; animStop(); syncDither(); syncOrigin(); syncGrid(); miniFit(); canvasSync(); };   // the gradient rectangle is in pixel coordinates, which a resize moves
const zoomLabel = z => (z >= 1 || !Number.isInteger(1 / z) ? +z.toFixed(z < 1 ? 2 : 1) : '1/' + 1 / z) + 'x';
hooks.zoom = () => { $('zoomRead').textContent = $('sbZoom').textContent = zoomLabel(S.z); };

/* ---------- sheets ---------- */
function openSheet(id) { $(id).hidden = false; }
function closeSheets() { document.querySelectorAll('.scrim').forEach(s => { s.hidden = true; }); $('fileBtn').setAttribute('aria-expanded', 'false'); sheetAnswer(null); startShut(); }
/* Keeps Tab inside a dialog. */
function tabInside(e, box) {
  if (e.key !== 'Tab') return;
  const list = [...box.querySelectorAll('a[href], button, input, select')].filter(x => !x.disabled && x.getClientRects().length), n = list.length, at = list.indexOf(document.activeElement); if (!n) return;
  if (e.shiftKey && at <= 0) { e.preventDefault(); list[n - 1].focus(); }
  else if (!e.shiftKey && at === n - 1) { e.preventDefault(); list[0].focus(); }
}
/* A sheet that answers a question. Esc, Cancel and a tap outside all answer null, so nothing is left waiting. */
let sheetAsk = null;
function askSheet(id) { closeSheets(); openSheet(id); return new Promise(r => { sheetAsk = r; }); }
function sheetAnswer(v) { const r = sheetAsk; sheetAsk = null; if (r) { closeSheets(); r(v); } }
let anchorSel = [0, 0], cvLinked = false, extChosen = null;
const EXT_STEPS = [1, 2, 4, 8, 16, 32, 64, 128, 256], EXT_SMALL = 64, EXT_SMALL_STEP = 4, EXT_DEFAULT = 32, LOCK_NOTE = { told: false };

/* ---------- File menu ---------- */
/* In the order they show: down one column, then down the next. The markup cannot give that at every width, as Help moves. */
const menuItems = () => [...$('fileMenu').querySelectorAll('[role^="menuitem"]')].filter(b => !b.hidden && !b.disabled).map(b => [b, b.getBoundingClientRect()]).sort(([, a], [, b]) => a.left - b.left || a.top - b.top).map(([b]) => b);
function fileMenuOpen() {
  closeSheets(); saveBar(); reopenSync();
  const r = $('fileBtn').getBoundingClientRect(), p = $('filePanel');
  p.style.left = r.left + 'px'; p.style.top = r.bottom + 4 + 'px'; p.style.maxHeight = window.innerHeight - r.bottom - 12 + 'px';
  openSheet('sheetFile'); p.scrollTop = 0; $('fileBtn').setAttribute('aria-expanded', 'true');
  menuItems()[0].focus({ preventScroll: true });
}
function fileMenuClose() { closeSheets(); $('fileBtn').focus({ preventScroll: true }); }
function fileMenuKey(e) {
  const list = menuItems(), n = list.length, at = list.indexOf(document.activeElement), k = e.key;
  const to = { ArrowDown: (at + 1) % n, ArrowUp: (at + n - 1) % n, Home: 0, End: n - 1 }[k];
  if (to !== undefined) { e.preventDefault(); list[to].focus(); } else if (k === 'Tab') { e.preventDefault(); fileMenuClose(); }
  if (!e.ctrlKey && !e.metaKey) e.stopPropagation();   // these keys are the menu's, not a tool's or a selection's
}

const numOf = id => parseInt($(id).value, 10);
const sizeClamp = v => Math.max(1, Math.min(MAX_DIM, Math.round(v) || 1));
function cvRead() {
  const w = numOf('cvW'), h = numOf('cvH'), ok = sizeOk(w, h);
  $('cvRead').textContent = ok ? 'From ' + S.w + ' x ' + S.h + ' to ' + w + ' x ' + h : 'Width and height are 1 to 4096 px.'; $('cvOk').disabled = !ok;
}
/* The other side comes from the canvas's own proportions, not the last value, so stepping down and back lands where it began. */
function cvFollow(id) {
  const v = numOf(id), wide = id === 'cvW';
  if (cvLinked && v >= 1) $(wide ? 'cvH' : 'cvW').value = sizeClamp(wide ? v * S.h / S.w : v * S.w / S.h);
  cvRead();
}
function cvStep(id, by) { $(id).value = sizeClamp((numOf(id) || 0) + by); cvFollow(id); }
function openCanvasSheet() {
  closeSheets(); $('cvW').value = S.w; $('cvH').value = S.h; cvRead(); canvasSync(); openSheet('sheetCanvas');
}
function buildAnchor() {
  const box = $('anchor'); box.textContent = '';
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const b = document.createElement('button'); b.setAttribute('aria-label', 'Anchor ' + ['top', 'middle', 'bottom'][y] + ' ' + ['left', 'centre', 'right'][x]);
    press(b, x === anchorSel[0] && y === anchorSel[1]); b.onclick = () => { anchorSel = [x, y]; buildAnchor(); }; box.appendChild(b);
  }
}

function initUI() {
  panelInit(); prefsBuild(); buildGuides(); initSizes();
  document.querySelectorAll('#tools [data-tool]').forEach(b => b.onclick = () => chooseTool(b.dataset.tool));
  $('modeIso').onclick = $('modeIso2').onclick = () => setMode('iso'); $('modeFlat').onclick = $('modeFlat2').onclick = () => setMode('flat');
  $('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
  $('zoomIn').onclick = () => zoomStep(1); $('zoomOut').onclick = () => zoomStep(-1); $('fitBtn').onclick = fitView;
  $('panelBtn').onclick = () => panelOpen(!$('side').classList.contains('open'));
  $('projName').oninput = e => { S.name = e.target.value; hooks.layers(); setDirty(true); };
  document.querySelectorAll('.edge').forEach(b => b.onclick = () => b.dataset.shrink ? shrinkEdge(b.dataset.shrink) : extendEdge(b.dataset.edge));
  $('shrinkGo').onclick = () => { const a = SK.cut; shrinkClose(); if (a) shrinkBy(...a); };
  $('shrinkNo').onclick = shrinkClose;
  document.addEventListener('pointerdown', e => { if (SK.side && !e.target.closest('#shrinkAsk')) shrinkClose(); }, true);
  $('cvResizeBtn').onclick = () => { commitFloat(); buildAnchor(); openCanvasSheet(); };
  $('extStep').onchange = e => { extChosen = +e.target.value; setDirty(true); requestRender(); };
  $('cvLock').onclick = $('cvLock2').onclick = () => lockSet(!S.sizeLock);
  $('cvLink').onclick = () => { cvLinked = !cvLinked; press($('cvLink'), cvLinked); };
  for (const id of ['cvW', 'cvH']) { $(id).oninput = () => cvFollow(id); $(id + 'Down').onclick = () => cvStep(id, -1); $(id + 'Up').onclick = () => cvStep(id, 1); }

  /* colour */
  $('colorInput').oninput = e => setColor(e.target.value);
  $('curSwatch2').onclick = swapColors;
  $('hexInput').onchange = e => { const c = hexToRgb(e.target.value); if (c) setColor(rgbToHex(...c)); else e.target.value = S.color; };
  $('pal').onclick = e => {
    const b = e.target.closest('.sw'); if (!b) return;
    if ($('palEdit').getAttribute('aria-pressed') === 'true') { if (S.palette.length > 2) { removeColor(b.dataset.hex); renderPalette(); syncPlace(); objRefresh(); setDirty(true); } }
    else setColor(b.dataset.hex);
  };
  const box = $('svBox'), unit = n => Math.max(0, Math.min(1, n));
  const svAt = e => { const r = box.getBoundingClientRect(); HSV.s = unit((e.clientX - r.left) / r.width); HSV.v = unit(1 - (e.clientY - r.top) / r.height); pickFromHsv(); };
  box.onpointerdown = e => { box.setPointerCapture(e.pointerId); svAt(e); };
  box.onpointermove = e => { if (box.hasPointerCapture(e.pointerId)) svAt(e); };
  box.onkeydown = e => {
    const step = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, 0.02], ArrowDown: [0, -0.02] }[e.key]; if (!step) return;
    e.preventDefault(); HSV.s = unit(HSV.s + step[0]); HSV.v = unit(HSV.v + step[1]); pickFromHsv();
  };
  $('hueInput').oninput = e => { HSV.h = +e.target.value; pickFromHsv(); };
  $('palAdd').onclick = () => { if (!hasColor(S.color)) { addLoose(S.color); renderPalette(); hooks.color(); setDirty(true); } else toast('Already in the palette.'); };
  $('palSel').onchange = e => { usePalette(findPalette(e.target.value) || S.pal); paletteChanged(); };
  $('palTools').onclick = () => { $('palName').value = S.pal.name; openSheet('sheetPal'); };
  $('rampNewBtn').onclick = () => { newRampFrom(S.color, +$('rampSteps').value); paletteChanged(); toast('Ramp added.'); };
  $('rampAddBtn').onclick = () => { addToRamp(S.color, $('rampTarget').value); paletteChanged(); toast('Color added to the ramp.'); };
  $('autoRampsBtn').onclick = () => { const n = autoRamps(); paletteChanged(); toast(n ? 'Grouped the loose colors into ' + n + (n > 1 ? ' ramps.' : ' ramp.') : 'No loose colors share a hue family.'); };
  $('palSaveBtn').onclick = () => { addMyPalette($('palName').value.trim() || S.pal.name, S.pal.ramps); paletteChanged(); toast('Saved in this project.'); };
  $('palImportBtn').onclick = () => $('palInput').click();
  $('palInput').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (importPalette(await f.text(), f.name.replace(/\.\w+$/, '').slice(0, 60))) { closeSheets(); paletteChanged(); toast('Palette imported.'); } else toast('No colors found in that file.');
  };
  $('palTextBtn').onclick = () => {
    if (importPalette($('palText').value, 'Pasted')) { $('palText').value = ''; closeSheets(); paletteChanged(); toast('Palette imported.'); } else toast('Paste at least two hex colors.');
  };
  $('palHexBtn').onclick = () => exportPalette('.hex', paletteToHex());
  $('palGplBtn').onclick = () => exportPalette('.gpl', paletteToGpl());
  $('palEdit').onclick = () => { press($('palEdit'), $('palEdit').getAttribute('aria-pressed') !== 'true'); renderPalette(); };

  /* options */
  const br = $('brushRow');
  for (let n = 1; n <= 8; n++) { const b = document.createElement('button'), s = document.createElement('span'); s.className = 'brushsq'; s.style.width = s.style.height = 2 * n + 'px'; b.className = 'chip'; b.appendChild(s); b.dataset.n = n; b.setAttribute('aria-label', 'Brush size ' + n + ' px'); b.onclick = () => setBrush(n); br.appendChild(b); }
  $('brushDown').onclick = () => setBrush(S.brush - 1); $('brushUp').onclick = () => setBrush(S.brush + 1);
  $('brushN').onchange = e => { const v = parseInt(e.target.value, 10); setBrush(Number.isFinite(v) ? v : S.brush); };
  $('sbBrush').onclick = () => exMark('#brushOpt');
  $('lineSnap').onclick = e => { S.lineSnap = !S.lineSnap; press(e.currentTarget, S.lineSnap); };
  $('rectFill').onclick = e => { S.rectFill = !S.rectFill; press(e.currentTarget, S.rectFill); };
  for (const [id, k] of [['ovalFill', 'ovalFill'], ['ovalCircle', 'ovalCircle'], ['ovalCenter', 'ovalCenter']]) $(id).onclick = e => { S[k] = !S[k]; press(e.currentTarget, S[k]); };
  $('perfect').onclick = () => { prefSet('perfect', Object.assign({}, prefGet('perfect'), { [S.mode === 'iso' ? 'iso' : 'flat']: !perfectOn() })); syncBrush(); };
  $('fillAll').onclick = () => { S.fillAll = true; press($('fillAll'), true); press($('fillOne'), false); };
  $('fillOne').onclick = () => { S.fillAll = false; press($('fillAll'), false); press($('fillOne'), true); };
  initObjects(); initTerrain(); initHeightGuides(); initAssembly(); initScatter(); initLibrary(); initCharacters();

  /* selection */
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-sel]'), t = e.target.closest('[data-transform]'), m = e.target.closest('[data-more]');
    if (a) SEL_ACTIONS[a.dataset.sel]();
    else if (t) transform(t.dataset.transform);
    else if (m) document.querySelectorAll('.selmore').forEach(d => { d.hidden = d.id !== m.dataset.more || !d.hidden; }), requestRender();
  });
  document.querySelectorAll('[data-selop]').forEach(b => b.onclick = () => { SEL.op = b.dataset.selop; hooks.sel(); });
  $('wandAll').onclick = () => { SEL.wandAll = true; hooks.sel(); }; $('wandOne').onclick = () => { SEL.wandAll = false; hooks.sel(); };
  // a float belongs to one layer, so reaching for another layer, or changing this one, places it first
  for (const el of [$('layers'), document.querySelector('.lbtns'), $('lbtnsObj')]) el.addEventListener('pointerdown', () => commitFloat(), true);

  /* light, shade and dither */
  document.querySelectorAll('[data-light]').forEach(b => b.onclick = () => {
    const big = S.layers.reduce((n, L) => n + (L.objects ? L.objects.length : 0), 0) >= 2000, run = () => { setLight(b.dataset.light); setDirty(true); };
    if (big) { toast('Redrawing objects and shadows.'); setTimeout(run, 40); } else run();   // the wait lets the note paint before the redraw holds the page
  });
  $('shadeDark').onclick = () => { S.shadeDir = -1; syncShade(); }; $('shadeLight').onclick = () => { S.shadeDir = 1; syncShade(); };
  for (const id in DITHERS) { const o = document.createElement('option'); o.value = id; o.textContent = DITHERS[id].name; $('ditherPat').appendChild(o); }
  $('ditherPat').onchange = e => { S.ditherPat = e.target.value; syncDither(); };
  $('ditherLevel').oninput = e => { S.ditherLevel = +e.target.value; syncDither(); };
  const ditherMode = m => { S.ditherMode = m; GR.area = null; pvClear(); syncDither(); };
  $('ditherBrush').onclick = () => ditherMode('brush'); $('ditherGrad').onclick = () => ditherMode('grad');
  $('offSecond').onclick = () => { S.ditherClear = false; syncDither(); }; $('offClear').onclick = () => { S.ditherClear = true; syncDither(); };

  /* shadow and outline */
  document.querySelectorAll('[data-opt]').forEach(b => { const [k, v] = b.dataset.opt.split(':'); b.onclick = () => { S[k] = isNaN(v) ? v : +v; pvClear(); syncOpts(); objRefresh(); if (k === 'edgeRun') setDirty(true); requestRender(); }; });
  $('castLen').oninput = e => { S.castLen = +e.target.value; syncOpts(); };
  $('outColor').onchange = e => { S.outColor = e.target.value; syncOpts(); };
  $('castBtn').onclick = castShadow; $('outBtn').onclick = outlineLayer; $('outMerge').onclick = mergeOutline;

  /* symmetry */
  $('mirrorX').onclick = () => toggleMirror('mirrorX'); $('mirrorY').onclick = () => toggleMirror('mirrorY');
  $('axisPlace').onclick = () => { placingAxis = !placingAxis; pvClear(); syncMirror(); if (placingAxis) toast('Tap the canvas to place the mirror line. Drag to adjust it.'); };
  $('axisCenter').onclick = () => { S.axisX = S.w - 1; S.axisY = S.h - 1; setDirty(true); requestRender(); };
  $('axisSnap').onclick = () => { S.axisSnap = !S.axisSnap; syncMirror(); };

  /* grid */
  $('tileSel').onchange = e => { tileCustom = e.target.value === 'custom'; if (tileCustom) syncTile(); else setTileSize(+e.target.value); };
  $('tileCustom').onchange = e => setTileSize(parseInt(e.target.value, 10) || S.tile);
  document.querySelectorAll('[data-nudge]').forEach(b => b.onclick = () => nudgeOrigin(...b.dataset.nudge.split(',').map(Number)));
  $('originReset').onclick = resetOrigin;
  document.querySelectorAll('.seamBtn').forEach(b => b.onclick = () => togglePop('seamPop', $('seamPop').hidden));
  $('guideBtn').onclick = () => togglePop('guidePop', $('guidePop').hidden);
  document.querySelectorAll('[data-pop-close]').forEach(b => b.onclick = () => togglePop(b.dataset.popClose, false));
  document.querySelectorAll('.pop').forEach(dragPop);

  /* ground tile */
  for (const id in TEXTURES) { const o = document.createElement('option'); o.value = id; o.textContent = TEXTURES[id].name; $('tileTex').appendChild(o); }
  $('tileTex').onchange = e => { S.tileTex = e.target.value; syncTile(); };
  $('tileVariants').oninput = e => { S.tileVariants = +e.target.value; syncTile(); };
  $('tileRandom').onclick = () => { S.tileRandom = !S.tileRandom; syncTile(); };
  $('tileVar').oninput = e => { S.tileVar = +e.target.value; syncTile(); };
  $('tileSeed').onchange = e => { S.tileSeed = parseInt(e.target.value, 10) || 1; setDirty(true); syncTile(); };
  $('tileReroll').onclick = () => { S.tileSeed = 1 + Math.floor(Math.random() * 99999); setDirty(true); syncTile(); };
  $('tileH').onchange = e => { S.tileH = Math.max(0, Math.min(64, parseInt(e.target.value, 10) || 0)); syncTile(); };
  $('cellSel').onchange = e => { cellCustom = e.target.value === 'custom'; if (cellCustom) syncGrid(); else setCell(+e.target.value); };
  $('cellCustom').onchange = e => setCell(parseInt(e.target.value, 10));
  document.querySelectorAll('[data-grid]').forEach(b => { const [k, v] = b.dataset.grid.split(':'); b.onclick = () => { S[k] = isNaN(v) ? v : +v; pvClear(); syncGrid(); if (k !== 'gridShow') setDirty(true); requestRender(); }; });

  /* layers */
  $('lAdd').onclick = () => addLayer(); $('lDup').onclick = dupLayer;
  $('lDel').onclick = () => {
    if (activeLayer().live) { toast(LIVE_MSG); return; }
    const more = linkedLayers(activeLayer()).filter(L => !L.live);   // the last layers cannot all go, so with nothing else left only the active one does
    if (more.length && more.length < S.layers.length - 1) { $('linkedNote').textContent = 'Linked to ' + activeLayer().name + ': ' + more.map(L => L.name).join(', ') + '.'; openSheet('sheetLinked'); }
    else if (!deleteLayer()) toast('Keep at least one layer.');
  };
  $('delLinked').onclick = () => { closeSheets(); deleteLayer(true); }; $('delOnly').onclick = () => { closeSheets(); deleteLayer(); };
  $('lUp').onclick = () => moveLayer(1); $('lDown').onclick = () => moveLayer(-1);
  $('lMerge').onclick = mergeDown;
  $('lShadows').onclick = () => { const A = activeLayer(); setLayerShadows(A, !liveOn(A)); };
  $('lShadowOp').oninput = e => { const sh = liveOf(activeLayer()); if (sh) { sh.opacity = e.target.value / 100; requestRender(); setDirty(true); } };
  $('layerOpacity').oninput = e => { activeLayer().opacity = e.target.value / 100; requestRender(); setDirty(true); };

  /* sheets */
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = sheetsBack);
  document.querySelectorAll('.scrim').forEach(s => s.addEventListener('pointerdown', e => { if (e.target === s) sheetsBack(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') sheetsBack(); });
  $('fileBtn').onclick = fileMenuOpen; $('saveBtn').onclick = () => saveProject();
  $('filePanel').addEventListener('keydown', fileMenuKey);
  $('fNew').onclick = openNew; $('fResize').onclick = () => { commitFloat(); buildAnchor(); openCanvasSheet(); };
  $('fOpen').onclick = () => { closeSheets(); pickOpen(); };
  $('fSave').onclick = () => { closeSheets(); saveProject(); };
  $('fSaveCopy').onclick = () => { closeSheets(); saveCopy(); };
  for (const [id, mode] of [['fExport', 'image'], ['fExportLayers', 'layers'], ['fExportTiles', 'tiles']]) $(id).onclick = () => { exportOpts.mode = mode; commitFloat(); closeSheets(); xpOpen(); };
  $('fTipsOpen').onclick = () => { closeSheets(); tipsShow(true); };
  $('cvOk').onclick = () => {
    const w = numOf('cvW'), h = numOf('cvH'); if (!sizeOk(w, h)) return;
    closeSheets(); if (w !== S.w || h !== S.h) resizeDoc(w, h, anchorSel[0] / 2, anchorSel[1] / 2);
  };
  renderPalette(); hooks.color(); setBrush(1); setTool('pencil'); setMode(S.mode); setLight(S.light); syncShade(); syncOpts(); syncOrigin(); hooks.sel(); hooks.layers(); hooks.history(); hooks.zoom(); canvasSync();
  initScene(); initExport(); initAbout();
}

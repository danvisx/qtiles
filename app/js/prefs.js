'use strict';
/* qtiles preferences: settings that are set once and then left alone. Device settings are one object in localStorage. Project settings keep their own fields in S, so this dialog is only another way to reach them.
   PREFS is the list of every setting. A row's control is made from its entry, or is a `part`: markup in index.html that moves into the row and keeps its id, handlers and sync function. */

const PREFS_KEY = 'qtiles.prefs', OLD_KEYS = 'isopic.', THEMES = ['system', 'light', 'dark'], AUTOSAVE_SECS = [15, 30, 60, 120, 300], HEIGHT_UNITS = ['both', 'levels', 'pixels'];
const PREF_DEVICE = { labels: null, theme: 'system', fingers: null, tipsOff: false, mapAuto: true, memShown: true, autosave: 30, edgeGrow: 'auto', guides: 'lines', heights: 'both', onboarded: false, animTools: false, animTold: false, startScreen: true, startMode: 'flat', newLast: null, welcomeSeen: 0, perfect: { flat: true, iso: false } };   // labels and fingers are null until someone chooses, so a laptop, an iPad and a phone each get their own default
const PREF_OK = { labels: v => v === null || typeof v === 'boolean', fingers: v => v === null || typeof v === 'boolean', theme: v => THEMES.includes(v), autosave: v => AUTOSAVE_SECS.includes(v), edgeGrow: v => v === 'auto' || v === 'ask', guides: v => HG_LEVELS.includes(v), heights: v => HEIGHT_UNITS.includes(v), startMode: v => v === 'flat' || v === 'iso', perfect: v => !!v && typeof v.flat === 'boolean' && typeof v.iso === 'boolean' };
const PF = { v: null, cat: 'interface', open: new Set(['interface']), from: null, had: false };   // had: this browser held something of qtiles, or Isopic, before this page load

/* ---------- device settings ---------- */
/* Once, on the first start under this name. A key already here wins, and a key that will not fit stays to try again. The old recovery key is left to recoveryMigrate: it can be larger than the room that is left. */
function keysMove() {
  try {
    const old = [];
    for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); if (key.startsWith(OLD_KEYS) || key.startsWith('qtiles.') || OLD_AUTOSAVE_KEYS.includes(key)) PF.had = true; if (key.startsWith(OLD_KEYS) && !OLD_AUTOSAVE_KEYS.includes(key)) old.push(key); }
    for (const key of old) {
      const to = 'qtiles.' + key.slice(OLD_KEYS.length);
      if (localStorage.getItem(to) === null) localStorage.setItem(to, localStorage.getItem(key));
      localStorage.removeItem(key);
    }
  } catch (_) {}
}
function prefStored(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
/* The keys each setting had before this object. */
function prefOld() {
  const out = {}, labels = prefStored(LABELS_KEY), edge = prefStored(EDGE_KEY), guides = prefStored(HG_KEY);
  if (labels !== null) out.labels = labels === '1';
  if (prefStored(COACH_KEY) === '1') out.onboarded = true;
  if (edge !== null) out.edgeGrow = edge;
  if (guides !== null) out.guides = guides;
  if (prefStored(EX_OFF_KEY) === '1') out.tipsOff = true;
  if (prefStored(MM_KEY) !== null) out.mapAuto = false;
  return out;
}
function prefsRead() {
  let saved = null; try { saved = JSON.parse(prefStored(PREFS_KEY)); } catch (_) {}
  if (saved && typeof saved === 'object' && saved.fingers === undefined && saved.fingerDraws === true) saved.fingers = true;   // the old fingerDraws was saved as false with every other setting, so only true says someone chose it
  const all = Object.assign({}, PREF_DEVICE, prefOld(), saved && typeof saved === 'object' ? saved : null); PF.v = {};
  for (const k in PREF_DEVICE) { const ok = PREF_OK[k] || (v => typeof v === typeof PREF_DEVICE[k]); PF.v[k] = ok(all[k]) ? all[k] : PREF_DEVICE[k]; }
  return PF.v;
}
const prefGet = k => (PF.v || prefsRead())[k];
function prefSet(k, v) { (PF.v || prefsRead())[k] = v; try { localStorage.setItem(PREFS_KEY, JSON.stringify(PF.v)); } catch (_) {} }

function themeApply() { const t = prefGet('theme'); if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; }
function setFinger(on) {
  prefSet('fingers', on); fingerStart();
  toast(S.fingerDraws ? 'Fingers draw. Two fingers pan and zoom.' : 'Fingers pan and zoom. Pencil or mouse draws.');
}
/* Animation and sprite sheets are set aside, not gone: a project's animations load and save whatever this says. */
function animToolsSync() {
  const on = prefGet('animTools');
  for (const id of ['fSprite', 'fFrame', 'charFrame', 'charOnion']) $(id).hidden = !on;
  if (!on && S.onion) { S.onion = false; charSync(); requestRender(); }
  panelSync();
}
/* True once per device, when a project with animations opens while they are hidden. */
function animTell() {
  if (!S.anims.length || prefGet('animTools') || prefGet('animTold')) return false;
  prefSet('animTold', true); return true;
}
function heightsSet(v) { prefSet('heights', v); HG.list = null; hooks.layers(); requestRender(); }
function setAutosave(s) {
  prefSet('autosave', s); if (!RC.timer) return;
  clearTimeout(RC.timer); RC.timer = null; snapLater(autosaveMs());
}

/* ---------- the settings ---------- */
const PREF_CATS = [['interface', 'Interface'], ['input', 'Input'], ['drawing', 'Drawing'], ['canvas', 'Canvas'], ['grid', 'Grid and tiles'], ['sections', 'Sections'], ['shadows', 'Shadows'], ['light', 'Light'], ['saving', 'Saving'], ['help', 'Help'], ['labs', 'Labs']];
const DEVICE = 'device', PROJECT = 'project', SCOPE_WORDS = { device: 'This device', project: 'This project' };
const onOff = (id, get, set) => ({ id, get, set, kind: 'switch' });
/* `def` is what Reset goes back to, as a value or worked out from the canvas. A row with no `def` has nothing to reset. `used` is what Show where it is used outlines. */
const PREFS = [
  Object.assign(onOff('prefLabels', () => $('tools').classList.contains('labels'), v => { prefSet('labels', v); labelsStart(); }), { key: 'labels', cat: 'interface', scope: DEVICE, label: 'Labels on the tool rail', desc: 'Shows the name of each tool under its icon. On by default on touch.', def: null, used: '#tools' }),
  { key: 'theme', cat: 'interface', scope: DEVICE, label: 'Theme', desc: 'Light, dark, or whatever the system uses.', kind: 'seg', opts: [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], get: () => prefGet('theme'), set: v => { prefSet('theme', v); themeApply(); }, def: 'system' },
  Object.assign(onOff('prefStart', () => prefGet('startScreen'), v => prefSet('startScreen', v)), { key: 'startScreen', cat: 'interface', scope: DEVICE, label: 'Show the start screen when qtiles opens', desc: 'With this off, qtiles carries on from the newest recovery copy, or opens a blank 2D canvas when there is none.', def: true }),
  { key: 'startMode', cat: 'interface', scope: DEVICE, label: 'New projects start in', desc: 'Which grid the start screen and New have chosen. They remember the last choice here.', kind: 'seg', opts: [['flat', '2D'], ['iso', 'Isometric']], get: () => prefGet('startMode'), set: v => newMode(v), def: 'flat' },
  Object.assign(onOff('prefMap', () => prefGet('mapAuto'), miniAuto), { key: 'mapAuto', cat: 'interface', scope: DEVICE, label: 'Map opens by itself', desc: 'Opens the map on a canvas over 1024 px a side. Opening or closing it by hand turns this off.', def: true, used: '#mini, #miniBtn' }),
  Object.assign(onOff('prefMem', () => prefGet('memShown'), v => { prefSet('memShown', v); memSync(); }), { key: 'memShown', cat: 'interface', scope: DEVICE, label: 'Memory in the status bar', desc: 'Shows roughly how much memory the project takes. It shows over 1 GB whatever this says.', def: true, used: '#sbMem' }),
  Object.assign(onOff('prefFinger', () => S.fingerDraws, setFinger), { key: 'fingers', cat: 'input', scope: DEVICE, label: 'Finger draws', desc: 'One finger draws instead of moving the view. Two fingers still pan and zoom. On by default on a phone, which has no Pencil. The status bar says when this is on.', def: null }),
  { key: 'guides', cat: 'drawing', scope: DEVICE, label: 'Height guides', desc: 'Dotted lines that show where an object stands and how tall it is. Also under Height guides in the options of Place object and Select object.', clone: '#heightPop .seg', def: 'lines', put: v => { hgSet(v); syncGuides(); }, used: '#guideHeight' },
  { key: 'heights', cat: 'drawing', scope: DEVICE, label: 'Show heights as', desc: 'How the inspector, height guides and status bar give a height.', kind: 'seg', opts: [['both', 'Both'], ['levels', 'Levels'], ['pixels', 'Pixels']], get: () => prefGet('heights'), set: heightsSet, def: 'both', used: '#objSec' },
  { key: 'edgeGrow', cat: 'canvas', scope: DEVICE, label: 'Past the edge', desc: 'What happens when art lands past the canvas edge: extend the canvas, or ask first.', part: 'edgeGrow', def: 'auto', put: v => { edgeSet(v); prefSet('edgeGrow', S.edgeGrow); } },
  { key: 'extStep', cat: 'canvas', scope: PROJECT, label: 'Extend by (px)', desc: 'How far the + and − handles on the canvas edges move them. A locked canvas has none.', part: 'extStep', def: null, put: v => { extChosen = v; canvasSync(); setDirty(true); }, used: '#canvasSec' },
  { key: 'tile', cat: 'grid', scope: PROJECT, label: 'Tile size', desc: 'The size of the isometric grid. Pixels already drawn stay where they are.', part: 'tile', def: 32, put: v => { tileCustom = false; setTileSize(v); }, used: '#sizeChip' },
  { key: 'edgeRun', cat: 'grid', scope: PROJECT, label: 'Edge steps', desc: 'How a tile edge steps: runs of 2, 3 or 4 pixels. Runs of 2 are the true 2:1 line.', part: 'edgeRun', def: 2, put: v => { S.edgeRun = v; pvClear(); syncOpts(); objRefresh(); setDirty(true); requestRender(); }, used: '#guideBtn' },
  { key: 'level', cat: 'grid', scope: PROJECT, label: 'Level height', desc: 'The height unit for objects. Half a tile by default, so a cube looks like a cube.', part: 'level', def: 0, put: setLevel, used: '#sizeChip' },
  { key: 'origin', cat: 'grid', scope: PROJECT, label: 'Grid origin', desc: 'Moves the tile grid one pixel; the art stays put. Arrow keys work here too.', part: 'origin', def: true, put: resetOrigin, used: '#sbOrigin' },
  { key: 'cell', cat: 'grid', scope: PROJECT, label: 'Cell size (px)', desc: 'The size of a cell of the 2D grid. Pixels already drawn stay where they are.', part: 'cell', def: () => cellDefault(S.w, S.h), put: v => { cellCustom = false; setCell(v); }, used: '#sizeChip' },
  { key: 'major', cat: 'grid', scope: PROJECT, labelHtml: 'Major line every (<span id="majorUnit">cells</span>)', label: 'Major line every', desc: 'A stronger line every this many cells or tiles.', part: 'major', def: () => majorDefault(S.cell, S.w, S.h), put: v => { S.major = v; syncGrid(); setDirty(true); requestRender(); }, used: '#guideGrid' },
  { key: 'rulers', cat: 'grid', scope: PROJECT, label: 'Rulers', desc: 'Numbers the cells along the top and left of the canvas in 2D, up to 64 cells a side.', guide: 'rulersOn', def: true, put: v => { S.rulers = v; syncGuides(); setDirty(true); requestRender(); } },
  { key: 'footprints', cat: 'grid', scope: PROJECT, label: 'Footprints', desc: 'Draws every object\'s footprint as a thin diamond on the ground, whatever height it stands at.', guide: 'objFootOpt', def: false, put: v => { S.objFoot = v; syncGuides(); setDirty(true); requestRender(); } },
  { key: 'secSize', cat: 'sections', scope: PROJECT, label: 'Section size', desc: 'How big a section is. Marks stay with their numbers, so they land on other areas.', part: 'secSize', def: 256, put: v => secSetSize(v, v), used: '#sceneSec' },
  { key: 'seamGuard', cat: 'sections', scope: PROJECT, label: 'Seam guard', desc: 'Near a section\'s edge, shows the 4 px across the seam on your side. It needs Sections on.', guide: 'seamGuard', def: true, put: v => { S.seamGuard = v; syncGuides(); setDirty(true); requestRender(); }, used: '#secOn' },
  Object.assign(onOff('prefLive', () => S.liveDefault, liveDefaultSet), { key: 'liveShadows', cat: 'shadows', scope: PROJECT, label: 'Live shadows', desc: 'Object layers cast shadows that follow them. A layer\'s own Live shadows switch, under Layers, goes first.', def: true, used: '#layersSec' }),
  { key: 'shadowOp', cat: 'shadows', scope: PROJECT, label: 'Shadow opacity default', desc: 'How strong a new shadow layer starts. Each layer\'s own slider stays under Layers.', kind: 'range', id: 'prefShadowOp', min: 0, max: 100, unit: '%', get: () => S.shadowOp, set: v => { S.shadowOp = v; setDirty(true); }, def: 35, used: '#layersSec' },
  { key: 'light', cat: 'light', scope: PROJECT, label: 'Light', desc: 'Where the light comes from, for the whole project. Tools that read it show this in their options too.', clone: '#lightField .seg', def: 'left', put: v => { setLight(v); setDirty(true); }, used: '[data-tool="shade"]' },
  { key: 'autosave', cat: 'saving', scope: DEVICE, label: 'Recovery copy every', desc: 'How often a copy of unsaved work is kept in this browser. Going to the background or leaving also keeps one.', kind: 'select', id: 'prefAutosave', opts: AUTOSAVE_SECS.map(s => [s, s < 60 ? s + ' seconds' : s === 60 ? '1 minute' : s / 60 + ' minutes']), get: () => prefGet('autosave'), set: setAutosave, def: 30 },
  { key: 'history', cat: 'saving', scope: DEVICE, label: 'Undo history', desc: 'When this fills, the oldest steps are dropped. Clear history is under File, Undo history.', kind: 'read', id: 'prefHistory', get: () => historyLine(), used: '#fileBtn' },
  Object.assign(onOff('prefTips', () => EX.off || !!S.tipsDismissed, v => exTipsOff(v)), { key: 'tipsOff', cat: 'help', scope: DEVICE, label: 'Example tips off', desc: 'Hides the tip strip on example projects.', def: false }),
  { key: 'replay', cat: 'help', scope: DEVICE, label: 'Tour', desc: 'A short tour of the tools, gestures and layers.', kind: 'action', id: 'prefReplay', text: 'Take the tour', run: () => { closeSheets(); coachStart(); } },
  { key: 'welcome', cat: 'help', scope: DEVICE, label: 'Welcome', desc: 'The first screen a new visitor sees: what qtiles makes, and where to begin.', kind: 'action', id: 'prefWelcome', text: 'Show the welcome again', run: () => welcomeAgain() },
  { key: 'gestures', cat: 'help', scope: DEVICE, label: 'Gestures', desc: 'Lists what fingers, the Pencil and a mouse do.', kind: 'action', id: 'prefGestures', text: 'Show gestures', run: () => { closeSheets(); openSheet('sheetGestures'); } },
  Object.assign(onOff('prefAnim', () => prefGet('animTools'), v => { prefSet('animTools', v); animToolsSync(); }), { key: 'animTools', cat: 'labs', scope: DEVICE, label: 'Animation and sprite sheets', desc: 'Shows the Animation section, Onion skin, Sprite sheet and Frame as PNG. A project keeps its animations either way.', def: false })
];
const prefOf = k => PREFS.find(p => p.key === k);
const prefShown = sel => [...document.querySelectorAll(sel)].some(e => !e.closest('[hidden]'));

/* ---------- building the dialog ---------- */
function prefControl(p) {
  if (p.part) return document.querySelector('#prefParts [data-part="' + p.part + '"]');
  if (p.clone) return document.querySelector(p.clone).cloneNode(true);
  if (p.guide) return document.createElement('div');   // buildGuides puts the row here, as a guide lives in GUIDES wherever it shows
  const el = document.createElement(p.kind === 'seg' ? 'div' : p.kind === 'select' ? 'select' : p.kind === 'read' ? 'p' : p.kind === 'range' ? 'label' : 'button');
  if (p.id && p.kind !== 'range') el.id = p.id;
  if (p.kind === 'switch') { el.className = 'chip'; el.setAttribute('aria-label', p.label); hintOn(el, p.desc); el.onclick = () => { p.set(!p.get()); prefSync(); }; }
  else if (p.kind === 'action') { el.className = 'btn'; el.textContent = p.text; hintOn(el, p.desc); el.onclick = p.run; }
  else if (p.kind === 'read') el.className = 'mono prefread';
  else if (p.kind === 'select') {
    el.setAttribute('aria-label', p.label); hintOn(el, p.desc);
    for (const [v, t] of p.opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; el.appendChild(o); }
    el.onchange = () => { p.set(+el.value); prefSync(); };
  } else if (p.kind === 'seg') {
    el.className = 'seg wide'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', p.label);
    for (const [v, t] of p.opts) { const b = document.createElement('button'); b.textContent = t; b.dataset.prefValue = v; hintOn(b, p.desc); b.onclick = () => { p.set(v); prefSync(); }; el.appendChild(b); }
  } else {
    const r = document.createElement('input'), n = document.createElement('span');
    r.id = p.id; r.type = 'range'; r.min = p.min; r.max = p.max; r.setAttribute('aria-label', p.label); hintOn(r, p.desc); n.className = 'mono'; el.className = 'row'; r.className = 'grow';
    r.oninput = () => { p.set(+r.value); prefSync(); }; el.append(r, n);
  }
  return el;
}
function prefRow(p) {
  const row = document.createElement('div'), head = document.createElement('div'), name = document.createElement('b'), scope = document.createElement('span'), desc = document.createElement('p'), ctl = document.createElement('div');
  row.className = 'prow'; row.dataset.pref = p.key; head.className = 'row between prowhead'; scope.className = 'pscope'; scope.textContent = SCOPE_WORDS[p.scope]; desc.className = 'hint'; ctl.className = 'pctl';
  name.textContent = p.label; if (p.labelHtml) name.innerHTML = p.labelHtml;
  desc.textContent = p.desc; head.append(name, scope); ctl.appendChild(prefControl(p)); row.append(head, desc, ctl);
  if (p.used) { const b = document.createElement('button'); b.className = 'plink'; b.textContent = 'Show where it is used'; b.dataset.used = p.used; b.onclick = () => { closeSheets(); exMark(p.used); }; row.appendChild(b); }
  return row;
}
function prefCat([key, name]) {
  const sec = document.createElement('section'), title = document.createElement('h3'), fold = document.createElement('button'), chev = document.createElement('span'), body = document.createElement('div'), nav = document.createElement('button');
  sec.className = 'pcat'; sec.dataset.cat = key; title.className = 'pcatname'; title.textContent = name; fold.className = 'pfold'; chev.className = 'secchev'; chev.innerHTML = ICON.chevD; fold.append(name, chev); fold.dataset.hint = 'Shows or hides these settings.'; body.className = 'pcatbody';
  fold.onclick = () => { if (PF.open.has(key)) PF.open.delete(key); else PF.open.add(key); prefCats(); };
  for (const p of PREFS.filter(q => q.cat === key)) body.appendChild(prefRow(p));
  body.appendChild(prefReset(key, name)); sec.append(title, fold, body);
  nav.className = 'pnav'; nav.textContent = name; nav.dataset.cat = key; nav.dataset.hint = 'Shows these settings.'; nav.onclick = () => { PF.cat = key; prefCats(); };
  $('prefsNav').appendChild(nav); return sec;
}
function prefReset(key, name) {
  const box = document.createElement('div'), go = document.createElement('button'), ask = document.createElement('div'), words = document.createElement('p'), yes = document.createElement('button'), no = document.createElement('button');
  box.className = 'preset'; go.className = 'btn'; go.textContent = 'Reset to defaults'; go.dataset.hint = 'Puts every setting in ' + name + ' back as it starts. It asks first.';
  ask.className = 'row wrap'; ask.hidden = true; words.className = 'hint'; words.textContent = 'Reset every setting in ' + name + '?'; yes.className = 'btn danger'; yes.textContent = 'Reset'; yes.dataset.hint = 'Resets these settings.'; no.className = 'btn'; no.textContent = 'Cancel'; no.dataset.hint = 'Leaves these settings as they are.';
  const shut = () => { ask.hidden = true; go.hidden = false; };
  go.onclick = () => { ask.hidden = false; go.hidden = true; no.focus({ preventScroll: true }); };
  no.onclick = () => { shut(); go.focus({ preventScroll: true }); }; yes.onclick = () => { prefsReset(key); shut(); go.focus({ preventScroll: true }); };
  ask.append(words, yes, no); box.append(go, ask); box.hidden = !PREFS.some(p => p.cat === key && p.def !== undefined); return box;
}
function prefsReset(cat) {
  for (const p of PREFS) if (p.cat === cat && p.def !== undefined) { const v = typeof p.def === 'function' ? p.def() : p.def; (p.put || p.set)(v); }
  prefSync();
}
function prefsBuild() {
  for (const c of PREF_CATS) $('prefsList').appendChild(prefCat(c));
  $('prefParts').remove();
  $('prefsFind').oninput = prefFilter;
  $('prefsClose').onclick = prefsClose;
  $('fPrefs').onclick = () => prefsOpen(); $('prefsBtn').onclick = () => prefsOpen();
  $('sbFinger').onclick = () => prefsOpen('input');
  document.querySelectorAll('[data-prefs]').forEach(b => { b.onclick = () => prefsOpen(b.dataset.prefs); });
  $('prefOrigin').addEventListener('keydown', e => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (step) { e.preventDefault(); nudgeOrigin(...step); }
  });
  $('sheetPrefs').addEventListener('keydown', prefsKey);
  animToolsSync();
}

/* ---------- showing it ---------- */
/* Reads what cannot tell the dialog itself, so a file opened since it was last shown cannot leave a row behind. */
function prefSync() {
  for (const p of PREFS) {
    if (p.kind === 'switch') { const b = $(p.id), on = !!p.get(); press(b, on); b.textContent = on ? 'On' : 'Off'; }
    else if (p.kind === 'seg') document.querySelectorAll('[data-pref="' + p.key + '"] [data-pref-value]').forEach(b => press(b, b.dataset.prefValue === p.get()));
    else if (p.kind === 'select') $(p.id).value = p.get();
    else if (p.kind === 'read') $(p.id).textContent = p.get();
    else if (p.kind === 'range') { $(p.id).value = p.get(); $(p.id).nextElementSibling.textContent = p.get() + p.unit; }
  }
  document.querySelectorAll('.prow .plink').forEach(b => { b.hidden = !prefShown(b.dataset.used); });
}
function prefCats() {
  document.querySelectorAll('.pcat').forEach(c => { const k = c.dataset.cat, on = PF.open.has(k); c.classList.toggle('on', k === PF.cat); c.classList.toggle('open', on); c.querySelector('.pfold').setAttribute('aria-expanded', on); });
  document.querySelectorAll('.pnav').forEach(b => { if (b.dataset.cat === PF.cat) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
}
function prefFilter() {
  const q = $('prefsFind').value.trim().toLowerCase(), names = Object.fromEntries(PREF_CATS); let any = false;
  $('prefsBox').classList.toggle('finding', !!q);
  for (const p of PREFS) { const hit = tipHit(q, p.label, p.desc, names[p.cat]); document.querySelector('[data-pref="' + p.key + '"]').hidden = !hit; any = any || hit; }
  document.querySelectorAll('.pcat').forEach(c => { c.hidden = !c.querySelector('.prow:not([hidden])'); });
  document.querySelectorAll('.pnav').forEach(b => { b.hidden = !!q; });
  $('prefsNone').hidden = any;
}
/* The dialog takes focus itself, as focusing the search box would raise the iPad's keyboard. */
function prefsOpen(cat) {
  if (!$('sheetPrefs').hidden && !cat) return;
  coachEnd(); PF.from = document.activeElement; closeSheets();
  if (cat) { PF.cat = cat; PF.open.add(cat); }
  $('prefsFind').value = ''; prefFilter(); prefCats(); prefSync(); openSheet('sheetPrefs'); $('prefsBox').focus({ preventScroll: true });
  const sec = document.querySelector('.pcat[data-cat="' + PF.cat + '"]'); if (cat && sec.scrollIntoView) sec.scrollIntoView({ block: 'start' });   // a phone shows every group in one column
}
function prefsClose() {
  sheetsBack();
  const f = PF.from; PF.from = null; if (f && f.isConnected && f.focus) f.focus({ preventScroll: true });
}
/* A tip that points at a control in here: the dialog opens at its row. */
function prefsReveal(el) { prefsOpen(el.closest('.pcat').dataset.cat); }
/* The keys are the dialog's: a tool's shortcut must not fire behind it, and Tab stays inside. Esc closes it here, or focus would not go back. */
function prefsKey(e) {
  e.stopPropagation();
  if (e.key === 'Escape') { prefsClose(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); prefsClose(); return; }
  tabInside(e, $('prefsBox'));
}

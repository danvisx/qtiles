'use strict';
/* qtiles examples: the start screen, which is also the New dialog, the unsaved-changes guard and the tip strip. See app/examples/README.md.
   Projects are kept as JSON text, in a table that a classic script fills, because a page opened from disk cannot fetch. Parsing the text gives a fresh copy each time, so nothing done to an open example can reach its source. */

const EX_DATA = { list: [], files: {} };   // filled by examples/embedded.js, which scripts/build_artifact.py writes from app/examples/
const EX = { tip: 0, soloed: false, stage: 0, off: false, thumbs: new Map(), after: null, marked: null, markTimer: null, list: null, mode: 'iso', cat: '', query: '' };
const EX_OFF_KEY = 'qtiles.tipsOff', EX_THUMB = [168, 128], EX_THUMB_START = [240, 160], EX_MARK_MS = 2400, EX_START_N = { '2d': 4, iso: 5 }, EX_ORDER_LAST = 1000;
const EX_CATS = [['', 'All'], ['scenery', 'Scenery'], ['characters', 'Characters'], ['animals', 'Animals'], ['transport', 'Transport'], ['objects', 'Objects']];
const EX_MODES = [['2d', '2D'], ['iso', 'Isometric']];
const EX_SIZES = { tiny: 'Tiny', small: 'Small', medium: 'Medium', scene: 'Scene' }, EX_SIZE_MAX = [[32, 'tiny'], [64, 'small'], [160, 'medium']];
const EX_STAGE_UNDER = { 3: 2 };   // stage 3 leaves out the details, and with the base under it that shows as flat color rather than as holes
/* Blank starts. `mode` is the grid a group shows under. A tile preset also sets the tile size, so one tile fills the canvas. */
const NEW_GROUPS = [
  { name: 'Sprite', mode: 'flat', lock: true, sizes: [[8, 8], [16, 16], [24, 24], [32, 32], [48, 48], [64, 64]] },
  { name: 'Character', mode: 'flat', lock: true, sizes: [[16, 32], [24, 48], [32, 48]] },
  { name: 'Tile', mode: 'iso', tile: true, sizes: [[16, 8], [32, 16], [64, 32], [128, 64]] },
  { name: 'Scene', mode: 'iso', sizes: [[352, 224], [256, 256], [512, 384], [1024, 768], [2048, 2048]] }
];
const NEW_BOX = 44, NEW_PV = 64, STCARD_THUMB = 64, SIZES_TOLD_KEY = 'qtiles.sizesTold';
const NEW_FIRST = { flat: ['Sprite', 64, 64], iso: ['Scene', 352, 224] };
const NW = { group: null, mode: 'flat', start: false, back: false, copies: 0 };   // start: the screen is up as the start screen. back: it is waiting behind About, Preferences or Recovery copies

const exFind = id => EX_DATA.list.find(e => e.id === id) || null;
const exSource = e => JSON.parse(EX_DATA.files[e.file]);
const exCurrent = () => S.example ? exFind(S.example) : null;
/* An entry from before the catalogue has none of the newer fields, so each has a default here and the manifest stays as it was. */
function exSizeOf(e) {
  if (e.size) return e.size;
  let m = Infinity; try { const o = exSource(e); m = Math.max(o.w, o.h); } catch (_) {}
  return (EX_SIZE_MAX.find(s => m <= s[0]) || [0, 'scene'])[1];
}
function exMeta(e, k) {
  return { ...e, category: e.category || (e.tier === 'Character' ? 'characters' : 'scenery'), size: exSizeOf(e), mode: e.mode || 'iso', order: e.order === undefined ? EX_ORDER_LAST + k : e.order, lesson: e.lesson || e.summary || '', skills: e.skills || [], author: e.author || (e.id.endsWith('-placeholder') ? 'claude' : 'owner') };
}
const exList = () => EX.list || (EX.list = EX_DATA.list.map(exMeta).sort((a, b) => a.order - b.order));
function exFiltered() {
  const q = EX.query.trim().toLowerCase();
  return exList().filter(e => e.mode === EX.mode && (!EX.cat || e.category === EX.cat) && (!q || [e.title, e.lesson, ...e.skills].join(' ').toLowerCase().includes(q)));
}
const exModeOf = m => m === 'flat' ? '2d' : m;   // New's mode names the grid as S.mode does
function exShowMode(m) { EX.mode = m; EX.cat = ''; exRender(); }
const exShown = () => { const e = exCurrent(); return !!(e && e.tips && e.tips.length) && !EX.off && !S.tipsDismissed; };

/* ---------- opening ---------- */
/* The file handle and identity go too, so the first save asks for a name, and two copies of one example are two projects. */
async function exOpen(id) {
  const e = exFind(id); if (!e) return false;
  commitFloat();
  try { await loadProject(exSource(e)); }
  catch (err) { toast(err.message || 'Could not open that example.'); return false; }
  saveUnbind(); S.name = e.title + ' copy'; S.example = e.id; S.tipsDismissed = false;
  $('projName').value = S.name; hooks.layers(); exSync(); exFrame(); return true;
}
function exBlank(w, h, o = {}) {
  newDoc(w, h, 'untitled'); S.sizeLock = !!o.lock; $('projName').value = S.name;
  if (o.tile) { S.tile = o.tile; tileCustom = false; syncTile(); }
  if (o.mode) setMode(o.mode);
  canvasSync(); fitView(); setDirty(false);   // nothing here is worth a recovery copy, or a card under Continue at the next start
}

/* ---------- the guard ---------- */
function guardThen(fn) {
  if (!S.dirty) { fn(); return; }
  EX.after = fn; openSheet('sheetGuard');
}
function guardDone() { const fn = EX.after; EX.after = null; closeSheets(); if (fn) fn(); }
async function guardSave() {
  const fn = EX.after; EX.after = null; closeSheets();
  await saveProject(); if (fn && !S.dirty) fn();   // a cancelled save keeps the project open
}

/* ---------- New dialog ---------- */
/* Read from the file, so a project the owner drops in needs no thumbnail of its own. */
async function exPixels(e) {
  if (EX.thumbs.has(e.id)) return EX.thumbs.get(e.id);
  const o = exSource(e), n = o.w * o.h, out = new Uint32Array(n);
  for (const d of o.layers) {
    const g = d.group && (o.groups || []).find(x => x.id === d.group);
    if (d.visible === false || d.ghost || (g && g.visible === false)) continue;
    const px = await decodeLayer(d, n), op = (d.opacity === undefined ? 1 : d.opacity) * (g && g.opacity !== undefined ? g.opacity : 1);
    for (let i = 0; i < n; i++) if (px[i] >>> 24) out[i] = over(out[i], px[i], op);
  }
  const t = { px: out, w: o.w, h: o.h }; EX.thumbs.set(e.id, t); return t;
}
/* Whole pixels only: nearest-neighbor by a whole step, then shown at a whole scale, so a thumbnail never blends. `box` crops to the art, so a tiny piece fills its card. */
async function exThumb(cv, e, room) {
  try {
    const t = await exPixels(e), [bx, by, bw, bh] = e.box || [0, 0, t.w, t.h], step = Math.max(1, Math.ceil(Math.max(bw / room[0], bh / room[1]))), w = Math.ceil(bw / step), h = Math.ceil(bh / step), c = cv.getContext('2d'), k = Math.max(1, Math.floor(Math.min(room[0] / w, room[1] / h)));
    cv.width = w; cv.height = h; cv.style.width = w * k + 'px'; cv.style.height = h * k + 'px';
    const img = c.createImageData(w, h), px = new Uint32Array(img.data.buffer);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = t.px[(by + y * step) * t.w + bx + x * step];
    c.putImageData(img, 0, 0);
  } catch (_) { cv.hidden = true; }
}
/* `n` numbers a Start here card. */
function exCard(e, n) {
  const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
  const b = document.createElement('button'), thumb = span('exthumb', ''), c = document.createElement('canvas'), name = document.createElement('b'), tags = span('extags', '');
  b.className = 'excard'; b.dataset.example = e.id; c.width = c.height = 1; name.textContent = e.title;
  thumb.appendChild(c); if (n) thumb.appendChild(span('exnum', n));
  for (const t of e.skills) tags.appendChild(span('extag', t));
  b.append(thumb, name, span('extier', EX_SIZES[e.size] + (e.author === 'claude' ? ', Starter art, redraw it' : '')), span('', e.lesson));
  if (n && e.path) b.appendChild(span('expath', e.path));
  if (e.skills.length) b.appendChild(tags);
  b.onclick = () => { NW.start = false; closeSheets(); guardThen(() => exOpen(e.id)); };
  exThumb(c, e, n ? EX_THUMB_START : EX_THUMB); return b;
}
/* Start here is the path, so it shows only with no filter. The other cards then leave out what it already has. Each grid has its own path, and a category this grid has no example of goes. */
function exRender() {
  const all = exFiltered(), path = !EX.cat && !EX.query.trim(), n = EX_START_N[EX.mode], first = path ? all.slice(0, n) : [], cats = exList().filter(e => e.mode === EX.mode).map(e => e.category);
  document.querySelectorAll('#exModes .chip').forEach(b => press(b, b.dataset.mode === EX.mode));
  document.querySelectorAll('#exChips .chip').forEach(b => { press(b, b.dataset.cat === EX.cat); b.hidden = !!b.dataset.cat && !cats.includes(b.dataset.cat); });
  $('exStartWrap').hidden = !first.length; $('exNone').hidden = all.length > 0;
  $('exStart').replaceChildren(...first.map((e, k) => exCard(e, k + 1)));
  $('exCards').replaceChildren(...(path ? all.slice(n) : all).map(e => exCard(e)));
}
/* One scale per group, so the outlines in a group compare truly. */
function newCards() {
  const host = $('newGroups');
  for (const g of NEW_GROUPS) {
    const box = document.createElement('div'), row = document.createElement('div'), k = NEW_BOX / Math.max(...g.sizes.flat());
    box.className = 'field'; box.dataset.mode = g.mode; box.textContent = g.name; row.className = 'szcards';
    for (const [w, h] of g.sizes) {
      const b = document.createElement('button'), fr = document.createElement('span'), out = document.createElement('span'), name = document.createElement('b');
      b.className = 'szcard'; b.dataset.group = g.name; b.dataset.size = w + 'x' + h; b.setAttribute('aria-label', g.name + ', ' + w + ' x ' + h + ' px');
      fr.className = 'szframe'; out.className = 'szbox'; out.style.width = Math.max(2, Math.round(w * k)) + 'px'; out.style.height = Math.max(2, Math.round(h * k)) + 'px'; name.textContent = w + ' x ' + h;
      fr.appendChild(out); b.append(fr, name); b.onclick = () => newPick(g, w, h); row.appendChild(b);
    }
    box.appendChild(row); host.appendChild(box);
  }
}
function newPick(g, w, h) { NW.group = g; $('newW').value = w; $('newH').value = h; newSync(); }
function newSync() {
  const w = numOf('newW'), h = numOf('newH'), ok = sizeOk(w, h), g = NW.group;
  document.querySelectorAll('.szcard').forEach(b => press(b, !!g && b.dataset.group === g.name && b.dataset.size === w + 'x' + h));
  press($('newFlat'), NW.mode === 'flat'); press($('newIso'), NW.mode === 'iso');
  document.querySelectorAll('#newGroups .field').forEach(f => { f.hidden = f.dataset.mode !== NW.mode; });
  $('newRead').textContent = ok ? w + ' x ' + h + ' px = ' + (w * h).toLocaleString('en-US') + ' pixels' : 'Width and height are 1 to 4096 px.';
  $('newOk').disabled = !ok; $('newPv').hidden = !ok;
  if (ok) { const k = NEW_PV / Math.max(w, h); $('newPv').style.width = Math.max(1, Math.round(w * k)) + 'px'; $('newPv').style.height = Math.max(1, Math.round(h * k)) + 'px'; }
}
function newChoice(m) { const a = (prefGet('newLast') || {})[m]; return Array.isArray(a) && sizeOk(a[1], a[2]) ? a : NEW_FIRST[m]; }
function newPreset(m) {
  const [name, w, h] = newChoice(m); NW.mode = m; NW.group = NEW_GROUPS.find(g => g.mode === m && g.name === name) || null;
  $('newW').value = w; $('newH').value = h; newSync();
}
/* The canvas behind the start screen follows the switch, so every way out of the screen leaves the same blank. */
function newMode(m) { prefSet('startMode', m); exShowMode(exModeOf(m)); newPreset(m); if (NW.start || NW.back) startBlank(); }
const newBlank = (mode, g, w, h) => exBlank(w, h, { mode, lock: !!(g && g.lock), tile: g && g.tile ? w : 0 });
function newCreate() {
  const w = numOf('newW'), h = numOf('newH'), g = NW.group, mode = NW.mode;
  if (!sizeOk(w, h)) return;
  prefSet('newLast', Object.assign({}, prefGet('newLast'), { [mode]: [g ? g.name : '', w, h] }));
  NW.start = false; closeSheets(); guardThen(() => { newBlank(mode, g, w, h); if (g && g.name === 'Sprite' && g.sizes.some(s => s[0] === w && s[1] === h)) sizesTell(w, h); });
}
/* Once per browser: after that the chip speaks for itself. */
function sizesTell(w, h) {
  try { if (localStorage.getItem(SIZES_TOLD_KEY)) return; localStorage.setItem(SIZES_TOLD_KEY, '1'); } catch (_) {}
  toast(w + ' x ' + h + ' canvas, ' + S.brush + ' px brush. Tap the size chip to change the grid.');
}
function newFill() {
  EX.query = ''; $('exSearch').value = ''; exShowMode(exModeOf(prefGet('startMode')));
  $('exWrap').hidden = !EX_DATA.list.length; newPreset(prefGet('startMode'));
  document.querySelectorAll('.stcol').forEach(c => { c.scrollTop = 0; });
}
function newTab(tab) {
  $('stBody').dataset.tab = tab;
  document.querySelectorAll('#stTabs button').forEach(b => press(b, b.dataset.tab === tab));
}
function openNew() {
  newFill(); startCont(null); closeSheets();
  $('startBox').setAttribute('aria-label', 'New'); openSheet('sheetNew'); $('startBox').focus({ preventScroll: true });
}

/* ---------- start screen ---------- */
function startBlank(m) { const a = m || prefGet('startMode'), [name, w, h] = newChoice(a); newBlank(a, NEW_GROUPS.find(g => g.mode === a && g.name === name) || null, w, h); }
function startCard(h, p) {
  const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
  const b = document.createElement('button'), thumb = span('stthumb', ''), text = span('sttext', ''), name = document.createElement('b');
  if (h.thumb) {   // a small canvas shows at a whole scale, as an example's thumbnail does
    const img = document.createElement('img'); img.alt = ''; img.src = h.thumb; thumb.appendChild(img);
    img.onload = () => { const k = Math.max(1, Math.floor(STCARD_THUMB / Math.max(img.naturalWidth, img.naturalHeight))); img.style.width = img.naturalWidth * k + 'px'; img.style.height = img.naturalHeight * k + 'px'; };
  }
  b.className = 'stcard'; name.textContent = h.name; text.append(name, span('mono muted', copyInfo(h, p)), span('btn pri', 'Resume'));
  b.append(thumb, text); b.onclick = () => { NW.start = false; recoverRestore(h); }; return b;
}
/* Null for File, New, which has no Continue. Open a file stays in reach without it, as a person on a new device has only their file. */
function startCont(can) {
  const cards = can ? can.cards : [], last = can && can.last, has = !!(cards.length || last), re = $('stReopen');
  NW.copies = can ? can.heads.length : 0;
  $('stCards').replaceChildren(...cards.map(h => startCard(h, can.projects.find(r => r.pid === h.pid))));
  re.hidden = !last; if (last) { re.textContent = 'Reopen ' + last.fileName; re.onclick = () => reopenLast(last); }
  $('stAll').hidden = !NW.copies; $('stCont').hidden = $('stTabCont').hidden = !has; $('stBody').classList.toggle('nocont', !has);
  (has ? $('stCont') : $('newRow')).insertBefore($('stOpen'), has ? $('stAll') : null);
  const seen = coachSeen(), tour = $('stTour'); $('stHello').hidden = seen; tour.textContent = seen ? 'Take the tour' : 'Take the 1-minute tour'; tour.classList.toggle('pri', !seen);
  newTab(has ? 'cont' : 'new');
}
function startShow() { NW.start = true; $('startBox').setAttribute('aria-label', 'Start'); openSheet('sheetNew'); $('startBox').focus({ preventScroll: true }); }
/* Read each time it shows, as coming back from Recovery copies can find fewer. */
async function startOpen() { const can = await startHeld(); newFill(); startCont(can); startShow(); }
/* From closeSheets, which every way of closing goes through. A way out that goes somewhere clears `start` first. */
function startShut() {
  const closed = NW.start; NW.start = false; NW.back = false;
  if (closed && NW.copies) toast('Your recovery copies are kept, under File, Recovery copies.');
}
function sheetsBack() { const back = NW.back; closeSheets(); if (back) { startShow(); startHeld().then(startCont); } }
/* A file came in: the screen goes, and a preset's lock must not crop a PNG that is the first thing in the project. */
function newTaken() {
  if ($('sheetNew').hidden) return;
  if (NW.start) { NW.start = false; S.sizeLock = false; canvasSync(); }
  closeSheets();
}
function initStart() {
  $('stBrand').append(document.querySelector('.topbar .brand').cloneNode(true)); $('stVer').textContent = APP_VERSION;
  const leave = fn => () => { NW.start = false; closeSheets(); fn(); }, away = open => () => { const on = NW.start; NW.start = false; open(); NW.back = on; };
  $('stTour').onclick = leave(coachStart); $('stTips').onclick = leave(() => tipsShow(true));
  $('stAbout').onclick = away(aboutOpen); $('stPrefs').onclick = away(() => prefsOpen()); $('stAll').onclick = away(recoverOpen);
  $('stOpen').onclick = pickOpen; $('newClose').onclick = closeSheets;
  document.querySelectorAll('#stTabs button').forEach(b => { b.onclick = () => newTab(b.dataset.tab); });
  $('startBox').addEventListener('keydown', e => tabInside(e, $('startBox')));
}

/* ---------- tip strip ---------- */
function exUnsolo() { if (!EX.soloed) return; EX.soloed = false; EX.stage = 0; soloClear(); hooks.layers(); requestRender(); }
/* The stages this example lists, unless someone has since renamed or deleted one in their copy. */
function exStages() { const e = exCurrent(), names = e && e.stages; return names && names.length && names.every(n => S.layers.some(L => L.name === n)) ? names : null; }
function exDots() {
  const box = $('tipStages'), names = exStages(); box.hidden = !names; box.textContent = ''; if (!names) return;
  const dot = (k, text, label) => { const b = document.createElement('button'); b.className = 'chip stagedot'; b.textContent = text; b.setAttribute('aria-label', label); b.dataset.stage = k; press(b, EX.stage === k); b.onclick = () => exStage(k); box.appendChild(b); };
  const word = document.createElement('span'); word.className = 'stageword'; word.textContent = 'Stages'; box.appendChild(word);
  names.forEach((n, k) => dot(k + 1, String(k + 1), 'Show stage ' + n)); dot(0, 'Finished', 'Show the finished piece');
}
/* Solo is a way of looking, never saved and never an undo step, so this leaves the project unchanged. */
function exStage(k) {
  exUnsolo(); const names = exStages();
  if (names && k) {
    const on = [k, EX_STAGE_UNDER[k]].filter(Boolean).map(n => names[n - 1]);
    S.layers.forEach(L => { L.solo = on.includes(L.name); }); EX.stage = k; EX.soloed = true; hooks.layers(); requestRender();
  }
  exDots(); exFrame();
}
/* On a phone the strip can cover a small piece, and a stage nobody can see teaches nothing. A view the strip leaves clear stays as it is. */
function exFrame() {
  const e = exCurrent(), b = e && e.box; if (!b || !exShown()) return;
  if (S.oy + (b[1] + b[3]) * S.z > vh - ($('tipStrip').offsetHeight || 0) - 8) exZoom(b);
}
function exSync() {
  const on = exShown(), strip = $('tipStrip'); strip.hidden = !on;
  if (!on) { exUnsolo(); return; }
  const list = exCurrent().tips, t = list[EX.tip];
  $('tipTitle').textContent = t.title; $('tipText').textContent = t.text; $('tipCount').textContent = (EX.tip + 1) + ' of ' + list.length;
  $('tipShow').hidden = !t.show; $('tipShow').textContent = t.show && t.show.stage ? 'Show me: step ' + t.show.stage : 'Show me'; exDots(); $('tipBack').disabled = EX.tip === 0; $('tipNext').disabled = EX.tip >= list.length - 1;
}
function exStep(by) { exUnsolo(); EX.tip = Math.max(0, Math.min(exCurrent().tips.length - 1, EX.tip + by)); exSync(); }
/* One switch, kept in the browser for later projects and in the project for other browsers. It never marks the project changed: nothing in the art did. */
function exTipsOff(off) {
  EX.off = off; S.tipsDismissed = off; prefSet('tipsOff', off);
  exSync();
}
/* Centers a region of the art in the part of the stage the strip leaves free. */
function exZoom(r) {
  const [x, y, w, h] = r, room = vh - ($('tipStrip').offsetHeight || 0) - 16, fit = Math.min(vw / (w + 8), room / (h + 8));
  S.z = ZOOMS.filter(z => z <= fit).pop() || ZOOMS[0];
  S.ox = Math.round(vw / 2 - (x + w / 2) * S.z); S.oy = Math.round(room / 2 - (y + h / 2) * S.z); requestRender(); hooks.zoom();
}
/* A control in a closed side panel cannot be pointed at. The panel opens, unless the tip has something to look at on the canvas: the panel would cover that, so the Panels button is marked instead. An outline works with reduced motion too. */
function exMark(sel, onCanvas) {
  const side = $('side'), all = [...document.querySelectorAll(sel)]; let el = all.find(e => !e.closest('[hidden]')) || all.find(e => $('sheetPrefs').contains(e)) || all.find(e => side.contains(e)) || all[0]; if (!el) return;   // an action bar can hold a hidden twin of a panel control
  if ($('sheetPrefs').contains(el)) prefsReveal(el);
  if (side.contains(el)) {
    panelReveal(el);
    if (panelClosed()) { if (onCanvas) el = $('panelBtn'); else sidePanel(true); }
  }
  if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
  if (EX.marked) EX.marked.classList.remove('tipmark');
  el.classList.add('tipmark'); EX.marked = el; clearTimeout(EX.markTimer);
  EX.markTimer = setTimeout(() => { el.classList.remove('tipmark'); EX.marked = null; }, EX_MARK_MS);
}
/* A tip's `show` says what to do, in the order a person would: tool, layer, what to select, where to look, then what to point at. */
function exPlay(s) {
  exUnsolo();
  if (s.tool) chooseTool(s.tool);
  if (s.stage !== undefined) exStage(s.stage);
  if (s.layer) {
    const k = S.layers.findIndex(L => L.name === s.layer);
    if (k >= 0) { S.active = k; if (s.solo) { S.layers[k].solo = true; EX.soloed = true; } hooks.layers(); requestRender(); }
  }
  if (s.item) { const L = activeLayer(), o = L.objectLayer && L.objects.find(q => q.lib && q.lib.id === s.item); if (o) objSelectMany([...unitIds(L, o)]); }
  if (s.seam) { TL.last = { i: s.seam[0], j: s.seam[1] }; togglePop('seamPop', true); }
  if (s.region) exZoom(s.region);
  const mark = s.mark || (s.tool && '[data-tool="' + s.tool + '"]'); if (mark) exMark(mark, !!(s.region || s.solo));
}
function initExamples() {
  EX.off = prefGet('tipsOff');
  newCards();
  for (const id of ['newW', 'newH']) { $(id).oninput = () => { NW.group = null; newSync(); }; $(id).onkeydown = e => { if (e.key === 'Enter') newCreate(); }; }   // a typed size is Custom, so it takes no preset's lock
  $('newFlat').onclick = () => newMode('flat'); $('newIso').onclick = () => newMode('iso');
  $('newOk').onclick = newCreate; initStart();
  $('guardSave').onclick = guardSave; $('guardDrop').onclick = guardDone;
  for (const [mode, name] of EX_MODES) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.mode = mode; b.textContent = name; b.onclick = () => exShowMode(mode); $('exModes').appendChild(b); }
  for (const [cat, name] of EX_CATS) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.cat = cat; b.textContent = name; b.onclick = () => { EX.cat = cat; exRender(); }; $('exChips').appendChild(b); }
  $('exSearch').oninput = e => { EX.query = e.target.value; exRender(); };
  $('tipBack').onclick = () => exStep(-1); $('tipNext').onclick = () => exStep(1);
  $('tipShow').onclick = () => { const e = exCurrent(); if (e) exPlay(e.tips[EX.tip].show); };
  $('tipOff').onclick = () => { exTipsOff(true); toast('Tips are off. Turn them back on in Preferences.'); };
  hooks.tips = () => { EX.tip = 0; EX.soloed = false; EX.stage = 0; canvasSync(); exSync(); tipsSync(); };   // a new project: its layers were never soloed by a tip
  exSync();
}

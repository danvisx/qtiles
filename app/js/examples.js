'use strict';
/* qtiles examples: the start screen, which is also the New dialog, the unsaved-changes guard and the tip strip. See app/examples/README.md.
   Projects are kept as JSON text, in a table that a classic script fills, because a page opened from disk cannot fetch. Parsing the text gives a fresh copy each time, so nothing done to an open example can reach its source. */

const EX_DATA = { list: [], files: {}, covers: [] };   // filled by examples/embedded.js, which scripts/build_artifact.py writes from app/examples/
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
const NEW_BOX = 44, NEW_PV = 64, STCARD_THUMB = 64, STCARD_BIG = 96, SIZES_TOLD_KEY = 'qtiles.sizesTold';
/* What most people start with, ahead of every size. Each is a size of a group above, so it takes that group's lock and mode. */
const NEW_BIG = [['Sprite', 16, 16, '16 x 16 sprite', 'Icons and tiny items'], ['Sprite', 64, 64, '64 x 64 sprite', 'Characters and props in 2D'], ['Scene', 352, 224, 'Isometric scene', 'Tiles, objects and shadows']];
const NEW_FIRST = { flat: ['Sprite', 64, 64], iso: ['Scene', 352, 224] };
const NW = { group: null, mode: 'flat', start: false, back: false, copies: 0 };   // start: the screen is up as the start screen. back: it is waiting behind About, Preferences or Recovery copies
/* A build with news to tell raises WELCOME_VERSION, and everyone who saw an older welcome sees it once more. */
const WELCOME_VERSION = 1, COVER_MS = 10000, COVER_PAN_MS = 120, COVER_FADE_MS = 600;
const WC = { up: false, from: false, at: 0, cv: new Map(), k: 1, room: 0, x: 0, dir: 1, pan: null, turn: null, hold: false, still: false };   // up: the screen is showing. from: it was opened as the welcome, so Back goes there

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
const exList = () => EX.list || (EX.list = EX_DATA.list.filter(e => !e.cover).map(exMeta).sort((a, b) => a.order - b.order));   // a cover is reached from the welcome, not the catalogue
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
    const line = document.createElement('div'), arrow = (dir, d) => { const b = document.createElement('button'); b.className = 'szarrow'; b.dataset.dir = dir; b.setAttribute('aria-label', (dir < 0 ? 'Smaller ' : 'Larger ') + g.name + ' sizes'); b.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + d + '"/></svg>'; b.onclick = () => row.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: 'smooth' }); return b; };
    line.className = 'szrow'; row.onscroll = () => szArrows(line);
    for (const [w, h] of g.sizes) {
      const b = document.createElement('button'), fr = document.createElement('span'), out = document.createElement('span'), name = document.createElement('b');
      b.className = 'szcard'; b.dataset.group = g.name; b.dataset.size = w + 'x' + h; b.setAttribute('aria-label', g.name + ', ' + w + ' x ' + h + ' px');
      fr.className = 'szframe'; out.className = 'szbox'; out.style.width = Math.max(2, Math.round(w * k)) + 'px'; out.style.height = Math.max(2, Math.round(h * k)) + 'px'; name.textContent = w + ' x ' + h;
      fr.appendChild(out); b.append(fr, name); b.onclick = () => newPick(g, w, h); row.appendChild(b);
    }
    line.append(arrow(-1, 'M15 6l-6 6 6 6'), row, arrow(1, 'M9 6l6 6-6 6')); box.appendChild(line); host.appendChild(box);
  }
  for (const [name, w, h, title, line] of NEW_BIG) {
    const g = NEW_GROUPS.find(q => q.name === name), b = document.createElement('button'), fr = document.createElement('span'), out = document.createElement('span'), t = document.createElement('b'), d = document.createElement('span'), k = NEW_BOX / Math.max(w, h);
    b.className = 'szcard nbcard'; b.dataset.group = name; b.dataset.size = w + 'x' + h; fr.className = 'szframe'; out.className = 'szbox'; out.style.width = Math.round(w * k) + 'px'; out.style.height = Math.round(h * k) + 'px';
    t.textContent = title; d.textContent = line; fr.appendChild(out); b.append(fr, t, d);
    b.onclick = () => { if (g.mode !== NW.mode) newMode(g.mode); newPick(g, w, h); };
    $('newBig').appendChild(b);
  }
}
const newBigPicked = () => NEW_BIG.some(([name, w, h]) => NW.group && NW.group.name === name && numOf('newW') === w && numOf('newH') === h);
function newMore(on) { $('newMore').hidden = !on; $('newMoreBtn').setAttribute('aria-expanded', on); $('newMoreBtn').textContent = on ? 'Fewer sizes' : 'More sizes'; newRows(); }
function szArrows(line) { const r = line.querySelector('.szcards'), [a, b] = line.querySelectorAll('.szarrow'); a.disabled = r.scrollLeft <= 1; b.disabled = r.scrollLeft + r.clientWidth >= r.scrollWidth - 1; }
/* Only sideways, so a choice never moves the column under the pointer. */
function newRows() {
  document.querySelectorAll('#newGroups .szrow').forEach(line => {
    const r = line.querySelector('.szcards'), b = r.querySelector('[aria-pressed="true"]');
    if (b) { if (b.offsetLeft < r.scrollLeft) r.scrollLeft = b.offsetLeft; else if (b.offsetLeft + b.offsetWidth > r.scrollLeft + r.clientWidth) r.scrollLeft = b.offsetLeft + b.offsetWidth - r.clientWidth; }
    szArrows(line);
  });
}
/* Left and right along a group, up and down to the nearest size of the group above or below. */
function newArrow(e) {
  const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key], card = e.target.closest && e.target.closest('#newGroups .szcard');
  if (!d || !card) return;
  const rows = [...document.querySelectorAll('#newGroups .field:not([hidden]) .szcards')], r = rows.indexOf(card.parentElement), at = [...card.parentElement.children].indexOf(card);
  const row = rows[r + d[0]]; if (!row) return;
  const to = row.children[Math.max(0, Math.min(row.children.length - 1, at + d[1]))];
  e.preventDefault(); if (to !== card || d[0]) { to.click(); to.focus({ preventScroll: true }); }
}
function newPick(g, w, h) { NW.group = g; $('newW').value = w; $('newH').value = h; newSync(); }
function newSync() {
  const w = numOf('newW'), h = numOf('newH'), ok = sizeOk(w, h), g = NW.group;
  document.querySelectorAll('.szcard').forEach(b => press(b, !!g && b.dataset.group === g.name && b.dataset.size === w + 'x' + h));
  press($('newFlat'), NW.mode === 'flat'); press($('newIso'), NW.mode === 'iso');
  document.querySelectorAll('#newGroups .field').forEach(f => { f.hidden = f.dataset.mode !== NW.mode; });
  $('newRead').textContent = ok ? (NW.mode === 'iso' ? 'Isometric, ' : '2D, ') + w + ' x ' + h + ' px' + (g && g.lock ? ', locked' : '') : 'Width and height are 1 to 4096 px.';
  $('newOk').disabled = !ok; $('newPv').hidden = !ok;
  newRows();
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
  $('exWrap').hidden = !EX_DATA.list.length; newPreset(prefGet('startMode')); newMore(!newBigPicked());   // a size from last time that is not a big card stays in sight
  document.querySelectorAll('.stcol').forEach(c => { c.scrollTop = 0; });
}
function newTab(tab) {
  $('stBody').dataset.tab = tab;
  document.querySelectorAll('#stTabs button').forEach(b => press(b, b.dataset.tab === tab));
}
function openNew() {
  newFill(); startCont(null); closeSheets(); startPhone(false); WC.from = false; WC.up = true; startPhase('start'); coverPick();
  openSheet('sheetNew'); $('startBox').focus({ preventScroll: true });
}

/* ---------- start screen ---------- */
function startBlank(m) { const a = m || prefGet('startMode'), [name, w, h] = newChoice(a); newBlank(a, NEW_GROUPS.find(g => g.mode === a && g.name === name) || null, w, h); }
function startCard(h, p, room = STCARD_THUMB) {
  const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
  const b = document.createElement('button'), thumb = span('stthumb', ''), text = span('sttext', ''), name = document.createElement('b');
  if (h.thumb) {   // a small canvas shows at a whole scale, as an example's thumbnail does
    const img = document.createElement('img'); img.alt = ''; img.src = h.thumb; thumb.appendChild(img);
    img.onload = () => { const k = Math.max(1, Math.floor(room / Math.max(img.naturalWidth, img.naturalHeight))); img.style.width = img.naturalWidth * k + 'px'; img.style.height = img.naturalHeight * k + 'px'; };
  }
  b.className = 'stcard'; name.textContent = h.name; text.append(name, span('mono muted', copyInfo(h, p)), span('btn pri', 'Resume'));
  b.append(thumb, text); b.onclick = () => { NW.start = false; recoverRestore(h); }; return b;
}
/* Null for File, New, which has no Continue. Open a file stays in reach without it, as a person on a new device has only their file. */
function startCont(can) {
  const cards = can ? can.cards : [], last = can && can.last, has = !!(cards.length || last), re = $('stReopen');
  NW.copies = can ? can.heads.length : 0;
  $('stCards').replaceChildren(...cards.map((h, k) => startCard(h, can.projects.find(r => r.pid === h.pid), k ? STCARD_THUMB : STCARD_BIG)));   // the newest is the likeliest, so it is the largest
  re.hidden = !last; if (last) { re.textContent = 'Reopen ' + last.fileName; re.onclick = () => reopenLast(last); }
  $('stAll').hidden = !NW.copies; $('stCont').hidden = $('stTabCont').hidden = !has; $('stBody').classList.toggle('nocont', !has);
  (has ? $('stCont') : $('newRow')).insertBefore($('stOpen'), has ? $('stAll') : null);
  const seen = coachSeen(), tour = $('stTour'); $('stHello').hidden = seen; tour.textContent = seen ? 'Take the tour' : 'Take the 1-minute tour'; tour.classList.toggle('pri', !seen);
  $('wcCont').hidden = !has; newTab(has ? 'cont' : 'new');
}
/* Only on the start screen, and the second line only while a phone's own default is drawing with a finger. */
function startPhone(on) { $('stPhone').hidden = !(on && PHONE()); $('stFinger').hidden = !(S.fingerDraws && prefGet('fingers') === null); }
/* Keeps the phase it had, so About or Preferences opened from the welcome come back to the welcome. */
function startShow(start = true) { NW.start = start; WC.up = true; startPhone(true); startPhase($('startBox').dataset.phase); openSheet('sheetNew'); $('startBox').focus({ preventScroll: true }); }
/* Read each time it shows, as coming back from Recovery copies can find fewer. */
async function startOpen(can) { can = can || await startHeld(); newFill(); startCont(can); WC.from = false; $('startBox').dataset.phase = 'start'; coverPick(); startShow(); }
/* From closeSheets, which every way of closing goes through. A way out that goes somewhere clears `start` first. Any way out of the welcome counts as having seen it. */
function startShut() {
  const closed = NW.start; NW.start = false; NW.back = false;
  if (WC.up && $('startBox').dataset.phase === 'welcome') welcomePassed();
  WC.up = false; coverStop();
  if (closed && NW.copies) toast('Your recovery copies are kept, under File, Recovery copies.');
}
function sheetsBack() { const back = NW.back; closeSheets(); if (back) { startShow(); startHeld().then(startCont); } }

/* ---------- the welcome ---------- */
/* No history means someone new. A later build raises WELCOME_VERSION to show it once more, to those who saw an older one; 0 is someone from before the welcome, who knows qtiles already. */
const welcomeDue = (had, seen, v = WELCOME_VERSION) => !had || (seen > 0 && seen < v);
function welcomePassed() { if (prefGet('welcomeSeen') < WELCOME_VERSION) prefSet('welcomeSeen', WELCOME_VERSION); }
/* The first thing on a page load. Switching the start screen off skips it for someone who has been here, never for someone new: there is nothing to skip to. */
async function startFirst() {
  const can = await startHeld(), had = PF.had || RC.old || can.heads.length > 0 || can.projects.length > 0, seen = prefGet('welcomeSeen');
  if (welcomeDue(had, seen) && (!had || prefGet('startScreen'))) { welcomeOpen(can, true); return; }
  if (!seen) prefSet('welcomeSeen', WELCOME_VERSION);
  if (prefGet('startScreen')) await startOpen(can); else await storageResume();
}
/* `start` is false from Preferences: the welcome then sits over the open project like File, New, so nothing in it replaces that project. */
function welcomeOpen(can, start) {
  newFill(); startCont(can); WC.from = true; $('startBox').dataset.phase = 'welcome'; coverPick(); startShow(start);
}
function welcomeAgain() { closeSheets(); startHeld().then(can => welcomeOpen(can, false)); }
/* A card goes on into the start screen, at the column it named. */
function welcomeGo(col) {
  welcomePassed();
  if (col === 'new') { if (NW.mode !== 'flat') newMode('flat'); newPick(NEW_GROUPS[0], 64, 64); newMore(false); }
  startPhase('start'); newTab(col);
  const to = { new: '#newBig [aria-pressed="true"]', ex: '#exStart .excard', cont: '#stCards .stcard, #stReopen:not([hidden]), #stOpen' }[col], el = document.querySelector(to);
  if (el) { el.focus({ preventScroll: true }); if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
}
function startPhase(p) {
  const box = $('startBox'); box.dataset.phase = p; box.setAttribute('aria-label', p === 'welcome' ? 'Welcome' : NW.start ? 'Start' : 'New');
  $('stBack').hidden = !(WC.from && p === 'start'); coverRun(); coverLay();
}

/* ---------- the cover ---------- */
/* Art from the examples, cropped, at a whole scale and moved by whole art pixels, so it never blurs or shimmers. Only the crossfade and the fade at its foot blend, and they are UI. */
const coverList = () => EX_DATA.covers.filter(c => exFind(c.example));
async function coverCanvas(c) {
  if (WC.cv.has(c)) return WC.cv.get(c);
  const t = await exPixels(exFind(c.example)), [x0, y0, cw, ch] = c.crop || [0, 0, t.w, t.h], w = Math.min(cw, t.w - x0), h = Math.min(ch, t.h - y0);
  const cv = document.createElement('canvas'), g = cv.getContext('2d'); cv.width = w; cv.height = h;
  const img = g.createImageData(w, h), px = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = t.px[(y0 + y) * t.w + x0 + x];
  g.putImageData(img, 0, 0); WC.cv.set(c, cv); return cv;
}
/* A random first one. The band is short, so a cover with `band: false` is left out of it. */
function coverPick() {
  const list = coverList(), band = $('startBox').dataset.phase === 'start', ok = list.map((c, k) => k).filter(k => !band || list[k].band !== false);
  $('cvDots').hidden = list.length < 2; coverDots();
  if (ok.length) coverShow(ok[Math.floor(Math.random() * ok.length)]); else $('stCover').classList.add('bare');
}
function coverDots() {
  const list = coverList();
  if ($('cvDots').children.length !== list.length) $('cvDots').replaceChildren(...list.map((c, k) => { const b = document.createElement('button'); b.className = 'cvdot'; b.setAttribute('aria-label', 'Cover ' + (k + 1) + ': ' + (c.title || exFind(c.example).title)); b.onclick = () => { coverShow(k); coverRun(); }; return b; }));
  [...$('cvDots').children].forEach((b, k) => press(b, k === WC.at));
}
/* Decoded off the first frame: the cover shows its ground color at once and the art fades in over it. */
async function coverShow(k) {
  const list = coverList(), at = WC.at = (k + list.length) % list.length, c = list[at], e = exFind(c.example); coverDots();
  $('cvName').textContent = c.title || e.title;
  $('cvOpen').onclick = () => { NW.start = false; closeSheets(); guardThen(() => exOpen(e.id)); };
  let cv; try { cv = await coverCanvas(c); } catch (_) { $('stCover').classList.add('bare'); return; }
  if (at !== WC.at) return;   // another was chosen while this one decoded
  const box = $('cvArt'), old = [...box.children].filter(o => o !== cv);
  $('stCover').classList.remove('bare'); cv.classList.remove('on'); box.appendChild(cv); WC.x = 0; WC.dir = 1; coverLay();
  if (WC.still || $('startBox').dataset.phase === 'start') { WC.x = Math.floor(WC.room / 2); coverLay(); }   // a cover that stands still shows the middle of its crop
  void cv.offsetWidth; cv.classList.add('on');
  setTimeout(() => old.forEach(o => { if (o !== box.lastElementChild) o.remove(); }), WC.still ? 0 : COVER_FADE_MS);
}
/* The scale that covers the box both ways; what is left over across is what the pan travels. */
function coverLay() {
  const box = $('cvArt'), W = box.clientWidth, H = box.clientHeight, top = box.lastElementChild; if (!W || !top) return;
  for (const cv of box.children) {
    const k = Math.max(1, Math.ceil(W / cv.width), Math.ceil(H / cv.height));
    cv.style.width = cv.width * k + 'px'; cv.style.height = cv.height * k + 'px'; cv.style.marginTop = -Math.floor(cv.height * k / 2) + 'px';
    if (cv === top) { WC.k = k; WC.room = Math.max(0, Math.floor((cv.width * k - W) / k)); WC.x = Math.min(WC.x, WC.room); cv.style.left = -WC.x * k + 'px'; }
  }
}
function coverStop() { clearInterval(WC.pan); clearInterval(WC.turn); WC.pan = WC.turn = null; }
/* Only the welcome moves, and never under reduced motion. One small move per step, none per frame. */
function coverRun() {
  coverStop(); if (!WC.up || WC.still || $('startBox').dataset.phase !== 'welcome') return;
  WC.pan = setInterval(() => {
    if (WC.hold || !WC.room) return;
    if ((WC.x + WC.dir < 0) || (WC.x + WC.dir > WC.room)) WC.dir = -WC.dir;
    WC.x += WC.dir; const top = $('cvArt').lastElementChild; if (top) top.style.left = -WC.x * WC.k + 'px';
  }, COVER_PAN_MS);
  if (coverList().length > 1) WC.turn = setInterval(() => { if (!WC.hold) coverShow(WC.at + 1); }, COVER_MS);
}
/* A file came in: the screen goes, and a preset's lock must not crop a PNG that is the first thing in the project. */
function newTaken() {
  if ($('sheetNew').hidden) return;
  if (NW.start) { NW.start = false; S.sizeLock = false; canvasSync(); }
  closeSheets();
}
function initStart() {
  $('stBrand').append(document.querySelector('.topbar .brand').cloneNode(true)); $('wcBrand').append(document.querySelector('.topbar .brand').cloneNode(true)); $('stVer').textContent = APP_VERSION;
  const leave = fn => () => { NW.start = false; closeSheets(); fn(); }, away = open => () => { const on = NW.start; NW.start = false; open(); NW.back = on; };
  $('stTour').onclick = leave(coachStart); $('stTips').onclick = leave(() => tipsShow(true));
  $('stAbout').onclick = away(aboutOpen); $('stPrefs').onclick = away(() => prefsOpen()); $('stFingerPrefs').onclick = away(() => prefsOpen('input')); $('stAll').onclick = away(recoverOpen);
  $('stOpen').onclick = $('wcOpen').onclick = pickOpen; $('newClose').onclick = closeSheets;
  $('wcNew').onclick = () => welcomeGo('new'); $('wcEx').onclick = () => welcomeGo('ex'); $('wcCont').onclick = () => welcomeGo('cont');
  $('wcTour').onclick = leave(coachStart); $('wcAbout').onclick = away(aboutOpen); $('stBack').onclick = () => startPhase('welcome');
  $('newMoreBtn').onclick = () => newMore($('newMore').hidden);
  const cover = $('stCover'); WC.still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  cover.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') WC.hold = true; }); cover.addEventListener('pointerleave', () => { WC.hold = false; });
  if (window.ResizeObserver) new ResizeObserver(coverLay).observe($('cvArt'));
  document.querySelectorAll('#stTabs button').forEach(b => { b.onclick = () => newTab(b.dataset.tab); });
  $('startBox').addEventListener('keydown', e => tabInside(e, $('startBox')));
  $('newGroups').addEventListener('keydown', newArrow);
  $('startBox').addEventListener('keydown', e => {   // a button keeps its own Enter, apart from a size card, which is the choice
    const t = e.target, card = t.closest && t.closest('#stNew .szcard');
    if (e.key !== 'Enter' || e.defaultPrevented || $('startBox').dataset.phase !== 'start' || !(t === $('startBox') || card) || !$('stNew').getClientRects().length) return;
    e.preventDefault(); if (card) card.click(); newCreate();
  });
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

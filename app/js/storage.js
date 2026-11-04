'use strict';
/* qtiles storage: recovery copies in IndexedDB, project identity, the saving status, backups, and history memory.
   The project file stays the master copy. What is kept here is a safety net, and the browser may clear it. */

const DB_NAME = 'qtiles', OLD_DB_NAME = 'isopic', SNAP_KEEP = 3, OFFER_MAX = 5, CONT_MAX = 3, THUMB_SIDE = 64, THUMB_BYTES = 4096, PACK_MIN = 4e6;
const RC = { timer: null, taking: false, ver: -1, at: 0, failed: null, told: null, persisted: false, stuck: false, old: false };   // ver: the docVer of the last copy, failed: why the last one did not land

/* ---------- identity ---------- */
function newProjectId() {
  if (crypto.randomUUID) return crypto.randomUUID();   // only in a secure context, which a page on a local network address is not
  const b = crypto.getRandomValues(new Uint8Array(16)), h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
const cleanProjectId = v => typeof v === 'string' && /^[\w-]{8,64}$/.test(v) ? v : null;
function projId() { return S.projectId || (S.projectId = newProjectId()); }
/* Whether to warn that a file is behind what this browser has seen of the same project. Files from before revisions have no id, so they never warn. */
const fileOlder = (o, known) => !!cleanProjectId(o.projectId) && (o.revision | 0) < known;
/* The highest revision seen of a project: the open one, its last save here, and its recovery copies. */
function revisionOf(pid, cur, projects, heads) {
  let n = cur && cur.pid === pid ? cur.revision : 0;
  for (const r of [...projects, ...heads]) if (r.pid === pid && r.revision > n) n = r.revision;
  return n;
}
async function revisionKnown(pid) {
  const cur = { pid: S.projectId, revision: S.revision };
  if (!cleanProjectId(pid)) return 0;
  try { const { heads, projects } = await recoveryList(); return revisionOf(pid, cur, projects, heads); }
  catch (_) { return revisionOf(pid, cur, [], []); }
}

/* ---------- IndexedDB ---------- */
/* Heads and bodies are apart so that listing what is here never reads a project into memory. */
let idbP = null, dbMoved = null;
function idbCreate() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB_NAME, 1);
    q.onupgradeneeded = () => { const d = q.result; d.createObjectStore('heads', { keyPath: 'id', autoIncrement: true }); d.createObjectStore('bodies', { keyPath: 'id' }); d.createObjectStore('projects', { keyPath: 'pid' }); };
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
/* Nothing reads or writes here until the old database has crossed, so an offer on the first start cannot miss a copy. */
function idbOpen() {
  if (idbP) return idbP;
  idbP = (async () => {
    if (!window.indexedDB) throw new Error('no IndexedDB');
    await (dbMoved || (dbMoved = dbMove()));
    const db = await idbCreate(); db.onclose = () => { idbP = null; }; return db;
  })();
  idbP.catch(() => { idbP = null; });
  return idbP;
}
/* Resolves on commit, so a copy is reported only once it is really there. iPad Safari can drop the connection of a page it suspended, so a dead one is reopened once. */
async function idbRun(stores, mode, fn, again) {
  const db = await idbOpen();
  let tx;
  try { tx = db.transaction(stores, mode); }
  catch (e) { if (again) throw e; idbP = null; return idbRun(stores, mode, fn, true); }
  return txDone(tx, fn);
}
function txDone(tx, fn) {
  return new Promise((res, rej) => {
    let out;
    tx.oncomplete = () => res(out ? out.result : undefined);
    tx.onabort = tx.onerror = () => rej(tx.error || new Error('Storage failed.'));
    out = fn(name => tx.objectStore(name));
  });
}
const recoveryList = async () => { const [heads, projects] = await Promise.all([idbRun(['heads'], 'readonly', st => st('heads').getAll()), idbRun(['projects'], 'readonly', st => st('projects').getAll())]); return { heads, projects }; };
const snapBody = id => idbRun(['bodies'], 'readonly', st => st('bodies').get(id));
function snapDrop(ids) { return idbRun(['heads', 'bodies'], 'readwrite', st => { for (const id of ids) { st('heads').delete(id); st('bodies').delete(id); } }); }

/* ---------- the database from the old name ---------- */
/* Null if there is none. Opening a name that does not exist creates it, so that upgrade is aborted. */
function oldDbOpen() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(OLD_DB_NAME); let none = false;
    q.onupgradeneeded = () => { none = true; q.transaction.abort(); };
    q.onsuccess = () => res(q.result);
    q.onerror = e => { e.preventDefault(); if (none) res(null); else rej(q.error); };
  });
}
/* Pair by pair, so one body at a time is in memory, with ids given afresh, as a failed try can leave this database in use. What has crossed is known by project and time, so another try adds nothing twice. */
async function dbCopy(from, to) {
  const was = (s, f) => txDone(from.transaction([s], 'readonly'), st => f(st(s))), is = (s, f) => txDone(to.transaction([s], 'readonly'), st => f(st(s)));
  const mark = h => h.pid + '|' + h.at, heads = await was('heads', s => s.getAll()), projects = await was('projects', s => s.getAll());
  const crossed = new Set((await is('heads', s => s.getAll())).map(mark)), empty = new Set();
  for (const h of heads) {
    if (crossed.has(mark(h))) continue;
    const b = await was('bodies', s => s.get(h.id)); if (!b) { empty.add(h); continue; }
    const head = Object.assign({}, h); delete head.id;
    await txDone(to.transaction(['heads', 'bodies'], 'readwrite'), st => { const q = st('heads').add(head); q.onsuccess = () => st('bodies').put({ id: q.result, o: b.o }); });
  }
  const known = new Set((await is('projects', s => s.getAll())).map(p => p.pid));
  await txDone(to.transaction(['projects'], 'readwrite'), st => { for (const p of projects) if (!known.has(p.pid)) st('projects').put(p); });
  const now = new Set((await is('heads', s => s.getAll())).map(mark)), held = await is('projects', s => s.getAll()), bodies = await is('bodies', s => s.count());
  if (heads.some(h => !empty.has(h) && !now.has(mark(h))) || bodies < heads.length - empty.size || held.length < projects.length) throw new Error('The counts differ.');
}
/* The old database goes only after its copy checks out. Any failure leaves it, to try again at the next start. */
async function dbMove() {
  let from = null, to = null;
  try {
    from = await oldDbOpen(); if (!from) return;
    RC.old = true;   // copies made under the old name are history, for the welcome
    to = await idbCreate(); await dbCopy(from, to);
    from.close(); from = null;
    await new Promise(res => { const q = indexedDB.deleteDatabase(OLD_DB_NAME); q.onsuccess = q.onerror = q.onblocked = () => res(); });   // blocked: a tab of the old build still has it, and it goes when that closes
  } catch (_) { RC.stuck = true; }
  finally { if (from) from.close(); if (to) to.close(); }
}
/* Said last on a start, as what else opens says something too. */
function storageTell() { if (RC.stuck) toast('Older recovery copies could not be moved. They are kept, and the next start tries again.'); RC.stuck = false; }

/* ---------- which copies stay ---------- */
const newestFirst = (a, b) => b.at - a.at || b.id - a.id;
/* What rotation removes once a project has a new copy. */
const snapDrops = (heads, pid, keep) => heads.filter(h => h.pid === pid).sort(newestFirst).slice(keep).map(h => h.id);
/* What goes first when storage is full: copies of other projects that reached a file, then this project's older ones. */
function snapSpare(heads, projects, pid) {
  const savedAt = id => { const p = projects.find(r => r.pid === id); return p ? p.savedAt || 0 : 0; };
  return [...heads.filter(h => h.pid !== pid && h.at <= savedAt(h.pid)).map(h => h.id), ...snapDrops(heads, pid, 1)];
}
/* The newest copy of each project that holds work no file has, or whose file is gone. */
function recoveryOffers(heads, projects, missing = []) {
  const seen = new Set(), out = [];
  for (const h of heads.slice().sort(newestFirst)) {
    if (seen.has(h.pid)) continue;
    seen.add(h.pid);
    const p = projects.find(r => r.pid === h.pid);
    if (!p || h.at > (p.savedAt || 0) || missing.includes(h.pid)) out.push(h);
  }
  return out.slice(0, OFFER_MAX);
}
/* Work no file has comes first, then saved copies, which are all a browser that keeps no file handle has to go back to. The last file is left out of those, as Reopen stands for it. */
function continueList(heads, projects, missing, last) {
  const offers = recoveryOffers(heads, projects, missing), seen = new Set([...offers.map(h => h.pid), last && last.pid]), rest = [];
  for (const h of heads.slice().sort(newestFirst)) if (!seen.has(h.pid)) { seen.add(h.pid); rest.push(h); }
  return [...offers, ...rest].slice(0, CONT_MAX);
}
const lastFile = projects => projects.filter(p => p.handle).sort((a, b) => b.used - a.used)[0] || null;
async function missingFiles(projects) {
  const out = [];
  for (const p of projects) if (p.handle) { try { if (await filePerm(p.handle) && await diskTime(p.handle) === null) out.push(p.pid); } catch (_) {} }
  return out;
}

/* ---------- taking copies ---------- */
/* Sampled from the layers, so it costs the same on any canvas. A noisy piece may not fit the size limit at full size, and listing copies must stay cheap, so it halves once and then goes without. */
function snapThumb(side = THUMB_SIDE) {
  try {
    const step = Math.max(1, Math.max(S.w, S.h) / side), w = Math.max(1, Math.floor(S.w / step)), h = Math.max(1, Math.floor(S.h / step)), d = new Uint32Array(w * h);
    for (const L of S.layers.filter(shownSet())) {
      const op = opacityOf(L);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = L.px[Math.floor(y * step) * S.w + Math.floor(x * step)]; if (s >>> 24) d[y * w + x] = over(d[y * w + x], s, op); }
    }
    const url = boxCanvas(d, w, 0, 0, w, h).toDataURL('image/png');
    return url.length <= THUMB_BYTES ? url : side === THUMB_SIDE ? snapThumb(side / 2) : undefined;
  } catch (_) { return undefined; }
}
function snapPut(o, at, thumb) {
  const head = { pid: o.projectId, at, name: o.name, w: o.w, h: o.h, layers: o.layers.length, revision: o.revision | 0, thumb };
  return idbRun(['heads', 'bodies'], 'readwrite', st => {
    const heads = st('heads'), q = heads.add(head);
    q.onsuccess = () => {
      st('bodies').put({ id: q.result, o });
      const all = heads.getAll();
      all.onsuccess = () => { for (const id of snapDrops(all.result, head.pid, SNAP_KEEP)) { heads.delete(id); st('bodies').delete(id); } };
    };
  });
}
const quotaFull = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
async function snapStore(o, at, thumb) {
  try { await snapPut(o, at, thumb); }
  catch (e) {
    if (!quotaFull(e)) throw e;
    const { heads, projects } = await recoveryList();
    await snapDrop(snapSpare(heads, projects, o.projectId));
    await snapPut(o, at, thumb);
  }
}
/* Compressing again every 30 s would stall a big project for nothing when one layer changed. A layer's version moves with every flush, and a stroke that is half flushed moves it again when it finishes. Save itself never reads this. */
const ENC = new WeakMap();
async function encodeCached(e) {
  const c = ENC.get(e.L);
  if (c && c.px === e.px && c.ver === e.ver) return c.enc;
  const enc = await encodeLayer(e.px);
  ENC.set(e.L, { px: e.px, ver: e.ver, enc }); return enc;
}
function recoveryFailed(e) {
  const full = quotaFull(e);
  RC.failed = full ? 'full' : 'off'; saveBar();
  if (RC.told !== RC.failed) { RC.told = RC.failed; toast(full ? 'Browser storage is full, so no recovery copy was made. Save the file to keep your work.' : 'This browser is not keeping recovery copies. Save the file to keep your work.'); }
}
const autosaveMs = () => prefGet('autosave') * 1000;
function snapLater(ms) { if (!RC.timer) RC.timer = setTimeout(() => { RC.timer = null; snapNow(); }, ms); }
hooks.autosave = () => snapLater(autosaveMs());
async function snapNow() {
  if (!S.dirty || RC.taking || docVer === RC.ver) return;
  if (FL || stroke || XP.job || H.busy) { snapLater(2000); return; }   // a lifted selection is missing from its layer until it is placed
  RC.taking = true;
  const v = docVer, at = Date.now();
  try {
    const thumb = snapThumb();
    projId(); await snapStore(await serialize({ cache: true }), at, thumb);
    RC.ver = v; RC.at = at; RC.failed = null; RC.told = null; saveBar();
    if (!RC.persisted && navigator.storage && navigator.storage.persist) { RC.persisted = true; navigator.storage.persist().catch(() => {}); }   // asks not to be cleared with the rest of a site's data
  } catch (e) { recoveryFailed(e); }
  finally { RC.taking = false; if (S.dirty && docVer !== RC.ver) snapLater(autosaveMs()); }
}
function projectRecord() {
  if (!S.projectId) return Promise.resolve();
  const rec = { pid: S.projectId, name: S.name, revision: S.revision, savedAt: S.savedAt ? Date.parse(S.savedAt) : 0, handle: fileHandle || undefined, fileName: SV.fileName || undefined, modified: SV.modified, used: Date.now() };
  return idbRun(['projects'], 'readwrite', st => { st('projects').put(rec); });
}
/* After a save. A download cannot tell us it arrived, as iPad Safari's sheet can be cancelled, so the same bytes stay here as well. */
async function afterSave(how, o) {
  const fork = SV.forked; SV.forked = null;
  try {
    await projectRecord();
    if (how === 'download') await snapStore(o, Date.parse(o.savedAt), snapThumb());
    if (fork) { const { heads } = await recoveryList(); await snapDrop(heads.filter(h => h.pid === fork).map(h => h.id)); }   // the file just written holds that work
  } catch (e) { if (window.indexedDB) recoveryFailed(e); }
}

/* ---------- which file this project belongs to ---------- */
function saveUnbind() { fileHandle = null; SV.modified = null; SV.fileName = null; SV.forked = null; S.projectId = null; S.revision = 0; S.savedAt = null; saveBar(); }
hooks.unbind = saveUnbind;
function saveBind(handle, file) {
  fileHandle = handle || null; SV.fileName = handle ? handle.name || file.name : null; SV.modified = handle ? file.lastModified : null; SV.forked = null;
  if (handle) projId();
  saveBar(); projectRecord().catch(() => {});
}
function rebind(pid, projects) {
  const p = projects.find(r => r.pid === pid);
  if (p && p.handle) { fileHandle = p.handle; SV.fileName = p.fileName; SV.modified = p.modified === undefined ? null : p.modified; }
  saveBar();
}

/* ---------- status ---------- */
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function dayTime(ms) {
  const d = new Date(ms), t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return dayKey(d) === dayKey(new Date()) ? t : dayKey(d) + ' ' + t;
}
function saveBar() {
  const toFile = saveMode() === 'file', when = S.savedAt ? ', saved ' + dayTime(Date.parse(S.savedAt)) : ', not saved yet';
  $('saveWhere').textContent = toFile ? SV.fileName || 'Saving to file' : 'Saving by download'; $('saveWhen').textContent = when;
  $('dirtyDot').hidden = !S.dirty;
  const b = $('saveBtn'); b.setAttribute('aria-label', (S.dirty ? 'Save, unsaved changes' : 'Save') + ' (Ctrl+S)');
  b.title = toFile ? (SV.fileName ? 'Saves to ' + SV.fileName + ' with no dialog.' : 'Saves to a file. The first save asks where.') : 'Saves by download. Each save makes a new file.';
  $('fileName').textContent = SV.fileName || S.name; $('fileState').textContent = (toFile ? 'Saving to file' : 'Saving by download') + when;
  const e = $('sbSave'); e.textContent = (S.dirty ? 'Unsaved changes' : 'No unsaved changes') + (RC.failed ? ', no recovery copy' : ''); e.classList.toggle('dirty', S.dirty);
}

/* ---------- recovery on start ---------- */
/* localStorage was too small for a big project. Each key goes only once its copy is safely stored. */
async function recoveryMigrate() {
  for (const key of OLD_AUTOSAVE_KEYS) {
    let s = null; try { s = localStorage.getItem(key); } catch (_) { return; }
    if (!s) continue;
    RC.old = true; const o = JSON.parse(s);
    o.projectId = cleanProjectId(o.projectId) || newProjectId();
    await snapPut(o, Date.parse(o.saved) || Date.now());
    localStorage.removeItem(key);
  }
}
/* What the start screen can offer. Nothing here opens anything. */
async function startHeld() {
  try {
    const { heads, projects } = await recoveryList(), missing = await missingFiles(projects), l = lastFile(projects), last = l && !missing.includes(l.pid) ? l : null;
    return { heads, projects, last, cards: continueList(heads, projects, missing, last) };
  } catch (_) { return { heads: [], projects: [], last: null, cards: [] }; }
}
async function storageStart() { try { await recoveryMigrate(); } catch (_) {} }
/* The start screen is switched off: the newest copy, or a blank 2D canvas. */
async function storageResume() {
  const h = (await startHeld()).heads.sort(newestFirst)[0];
  if (!h || !await copyLoad(h)) startBlank('flat');
}
/* A copy that a save already holds opens as saved, or every start would ask before leaving. */
async function copyLoad(h) {
  try {
    const b = await snapBody(h.id); if (!b) throw new Error('That copy is gone.');
    const { projects } = await recoveryList(), p = projects.find(r => r.pid === h.pid), unsaved = !p || h.at > (p.savedAt || 0);
    await loadProject(b.o); fileHandle = null; SV.modified = null; SV.fileName = null; rebind(h.pid, projects); setDirty(unsaved); RC.ver = docVer;   // it needs no copy of itself
    toast(unsaved ? 'Restored. Save to put this in your file.' : 'Reopened ' + S.name + ' from this browser. If you saved on another device, open that file instead.');
    return true;
  } catch (e) { toast('Could not restore that copy: ' + (e.message || e)); return false; }
}
function recoverRestore(h) { closeSheets(); guardThen(() => copyLoad(h)); }
/* The start screen stays up until the file is in hand, so a refused permission leaves everything on it to choose from. */
async function reopenLast(rec) {
  if (!NW.start) closeSheets();
  try {
    if (!await filePerm(rec.handle, true)) { toast('qtiles was not allowed to open ' + rec.fileName + '.'); return; }
    openFile(await rec.handle.getFile(), rec.handle);
  } catch (_) { toast(rec.fileName + ' could not be opened. It may have moved.'); if (!NW.start) recoverOpen(); }
}
/* Not offered for for the file that is open. The row may appear a moment after the menu, as the list is in IndexedDB. */
async function reopenSync() {
  const b = $('fReopen'); let last = null;
  try {
    const { projects } = await recoveryList(), missing = await missingFiles(projects); last = lastFile(projects);
    if (last && (missing.includes(last.pid) || last.pid === S.projectId)) last = null;
  } catch (_) {}
  b.hidden = !last; if (last) { $('fReopenName').textContent = 'Reopen ' + last.fileName; b.onclick = () => reopenLast(last); }
}
const copyInfo = (h, p) => dayTime(h.at) + ', ' + h.layers + (h.layers === 1 ? ' layer, ' : ' layers, ') + h.w + ' x ' + h.h + (p && h.at <= (p.savedAt || 0) ? ', saved' : '');
function recoverRow(h, projects) {
  const row = document.createElement('div'), txt = document.createElement('div'), name = document.createElement('b'), info = document.createElement('span'), go = document.createElement('button'), drop = document.createElement('button');
  row.className = 'recrow'; name.textContent = h.name; info.className = 'mono muted';
  info.textContent = copyInfo(h, projects.find(r => r.pid === h.pid));
  txt.append(name, info); go.className = 'btn pri'; go.textContent = 'Restore'; go.onclick = () => recoverRestore(h);
  drop.className = 'btn danger'; drop.textContent = 'Discard';
  drop.onclick = async () => {   // nothing brings a discarded copy back, so a stray tap must not be enough
    if (!drop.dataset.sure) { drop.dataset.sure = '1'; drop.textContent = 'Discard for good'; return; }
    await snapDrop([h.id]);
    recoverOpen(true);
  };
  row.append(txt, go, drop); return row;
}
async function recoverOpen(kept) {
  if (kept !== true) { closeSheets(); press($('recKeep'), true); }   // first, as coming back to the start screen is settled as soon as this returns
  let heads = [], projects = [], missing = [], used = null;
  try { ({ heads, projects } = await recoveryList()); missing = await missingFiles(projects); } catch (_) {}
  try { used = (await navigator.storage.estimate()).usage; } catch (_) {}   // the whole site's, as a head holds no size and reading the bodies to add them up would load every project
  const list = heads.slice().sort(newestFirst), last = lastFile(projects), box = $('recList'), re = $('recReopen');
  box.textContent = ''; box.append(...list.map(h => recoverRow(h, projects)));
  $('recEmpty').hidden = !!(list.length || last);
  re.hidden = !last || missing.includes(last.pid); $('recForget').hidden = $('recFile').hidden = !last;
  if (last) { re.textContent = 'Reopen ' + last.fileName; re.onclick = () => reopenLast(last); }
  $('recHead').hidden = !list.length; $('recKeep').hidden = !list.length || !S.dirty;
  $('recCount').textContent = list.length + (list.length === 1 ? ' copy' : ' copies') + (used ? ', ' + (used < 1e6 ? Math.ceil(used / 1e3) + ' KB' : (used / 1e6).toFixed(1) + ' MB') : '');
  recShown = list; delete $('recAll').dataset.sure; recAllSync();
  saveBar();
  if (kept !== true) openSheet('sheetRecover');
}
/* Two taps, like Discard. While this project has unsaved changes its newest copy stays unless the switch is off, as it is the only safety net that work has; later work reaches it on the usual timer. */
let recShown = [];
const recKept = list => S.dirty && $('recKeep').getAttribute('aria-pressed') === 'true' && list.find(h => h.pid === S.projectId) || null;
function recAllSync() {
  const b = $('recAll'), n = recShown.length - (recKept(recShown) ? 1 : 0);
  b.textContent = b.dataset.sure ? 'Delete ' + n + (n === 1 ? ' copy?' : ' copies?') : 'Delete all'; b.disabled = !n; $('recAllNo').hidden = !b.dataset.sure;
}
async function recoverAll() {
  const b = $('recAll'); if (!b.dataset.sure) { b.dataset.sure = '1'; recAllSync(); return; }
  delete b.dataset.sure;
  try {
    const list = (await recoveryList()).heads.sort(newestFirst), keep = recKept(list), ids = list.filter(h => h !== keep).map(h => h.id);
    await snapDrop(ids);
    toast('Deleted ' + ids.length + (ids.length === 1 ? ' recovery copy.' : ' recovery copies.') + (keep ? ' The copy of this project is kept.' : ''));
  } catch (e) { toast('Could not delete the copies: ' + (e.message || e)); }
  recoverOpen(true);
}
/* Only the handles go: a project's record still says which copies a file holds. */
async function forgetFiles() {
  try {
    await idbRun(['projects'], 'readwrite', st => { const all = st('projects').getAll(); all.onsuccess = () => { for (const p of all.result) if (p.handle) { delete p.handle; st('projects').put(p); } }; });
    toast('qtiles will no longer offer to reopen that file.');
  } catch (e) { toast('Could not forget the file: ' + (e.message || e)); }
  recoverOpen(true); reopenSync();
}

/* ---------- backup ---------- */
async function exportBackup() {
  commitFloat(); projId();
  const blob = await xpJob('Saving a backup', async job => new Blob([JSON.stringify(await serialize({ job }))], { type: 'application/json' }), 'Backup');
  if (blob && await deliver(safeName() + ' ' + dayKey(new Date()) + '.qtiles.json', blob)) toast('Backup saved.');
}

/* ---------- history memory ---------- */
const layerParts = list => list.flatMap(L => L.ids ? [[L, 'px'], [L, 'ids'], [L, 'faces']] : [[L, 'px']]);
const historySetBytes = (e, n) => { if (H.stack.includes(e)) H.bytes += n - (e.bytes || 0); e.bytes = n; };
let packQueue = Promise.resolve();
/* Big steps are mostly flat color and shrink a lot. Compressing is asynchronous and undo is not, so the arrays stay usable until the moment all of them are done, and an entry that was stepped or dropped meanwhile keeps them. */
function historyPack(e) {
  if (!e.parts || e.gz || !window.CompressionStream || !window.DecompressionStream) return;
  const gen = e.gen | 0, parts = e.parts().filter(([o, k]) => o[k]);
  if (parts.reduce((n, [o, k]) => n + o[k].byteLength, 0) < PACK_MIN) return;
  const live = () => (e.gen | 0) === gen && H.stack.includes(e);
  H.packing++;
  packQueue = packQueue.then(async () => {
    try {
      const gz = [];
      for (const [o, k] of parts) {
        if (!live()) return;
        const a = o[k];
        gz.push({ o, k, type: a.constructor, len: a.length, data: await pipe(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new CompressionStream('gzip')) });
      }
      if (!live()) return;
      for (const g of gz) g.o[g.k] = null;
      e.gz = gz; historySetBytes(e, gz.reduce((n, g) => n + g.data.length, 0));
    } catch (_) {}   // it stays as it was, only larger
    finally { H.packing--; if (!H.packing) { historyTrim(); hooks.history && hooks.history(); } }
  });
}
async function historyUnpack(e, then) {
  H.busy = true;
  let ok = false;
  try {
    ok = await xpJob('Unpacking a large step', async job => {
      const raw = [];
      for (let k = 0; k < e.gz.length; k++) { const g = e.gz[k], u = await pipe(g.data, new DecompressionStream('gzip')); raw.push(new g.type(u.buffer, u.byteOffset, g.len)); await xpTick(job, k + 1, e.gz.length); }
      e.gz.forEach((g, k) => { g.o[g.k] = raw[k]; });
      historySetBytes(e, raw.reduce((n, a) => n + a.byteLength, 0)); e.gz = null; return true;
    }, 'Undo');
  } finally { H.busy = false; }
  if (ok) then();
}
const historySteps = () => { const left = H.pos, back = H.stack.length - H.pos; return left + (left === 1 ? ' undo step' : ' undo steps') + (back ? ', ' + back + ' to redo' : ''); };
const historyUse = () => Math.round(H.bytes / 1e6) + ' MB of ' + Math.round(H_CAP / 1e6) + ' MB';
const historyLine = () => historySteps() + ', ' + historyUse();
function historySync() {
  if ($('histPop').hidden) return;
  $('histSteps').textContent = historySteps();
  $('histUse').textContent = historyUse();
  $('histBar').style.width = Math.min(100, H.bytes / H_CAP * 100) + '%';
  $('histClear').disabled = !H.stack.length;
}
async function historyClear() {
  if (await askSheet('sheetHistClear') !== 'clear') return;
  resetHistory(); toast('Undo history cleared.');
}

function initStorage() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') snapNow(); });
  window.addEventListener('pagehide', snapNow);
  window.addEventListener('beforeunload', e => { if (!S.dirty) return; snapNow(); e.preventDefault(); e.returnValue = ''; });   // the question gives the copy time to land. iPad Safari never asks, which is what hidden is for
  $('saveInfo').onclick = fileMenuOpen;
  $('fBackup').onclick = () => { closeSheets(); exportBackup(); };
  $('fRecover').onclick = () => recoverOpen();
  $('recAll').onclick = recoverAll; $('recAllNo').onclick = () => { delete $('recAll').dataset.sure; recAllSync(); }; $('recForget').onclick = forgetFiles;
  $('recKeep').onclick = () => { press($('recKeep'), $('recKeep').getAttribute('aria-pressed') !== 'true'); recAllSync(); };
  const hist = () => { closeSheets(); togglePop('histPop', $('histPop').hidden); };
  $('fHistory').onclick = hist; $('histBtn').onclick = hist; $('histClear').onclick = historyClear;
  for (const [id, v] of [['conCopy', 'copy'], ['conOver', 'over'], ['oldOpen', 'open'], ['oldRecover', 'recover'], ['histClearOk', 'clear']]) $(id).onclick = () => sheetAnswer(v);
  saveBar();
}

'use strict';
/* qtiles files: project .json (layers gzip + base64), PNG export/import. Recovery copies and history memory are in storage.js.
   Saving works two ways: straight back to a file (Chromium), or by download, through the claude.ai `downloads` capability or a plain link. */

let fileHandle = null;
const SV = { busy: false, noPicker: false, modified: null, fileName: null, forked: null };   // modified: the file's lastModified as we left it. forked: the id a Save as copy left behind
const FORMAT = 'qtiles', FORMAT_VERSION = 2;
const OLD_FORMAT = ['isopic', 'isopolis'], OLD_AUTOSAVE_KEYS = ['isopolis.recovery', 'isopic.recovery'];   // the app's earlier names: files and recovery copies made under them must still open

function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
async function encodeLayer(px) {
  const raw = new Uint8Array(px.buffer, px.byteOffset, px.byteLength);
  if (window.CompressionStream) return { enc: 'gzip', data: b64(await pipe(raw, new CompressionStream('gzip'))) };
  return { enc: 'raw', data: b64(raw) };
}
async function decodeLayer(o, n) {
  let u = unb64(o.data);
  if (o.enc === 'gzip') u = await pipe(u, new DecompressionStream('gzip'));
  if (u.length !== n * 4) throw new Error('Layer data has the wrong size.');
  return new Uint32Array(u.buffer, u.byteOffset, n);
}
/* Everything but the pixels is read at once, and so are the arrays: a resize replaces layers rather than changing them, so a save that takes seconds cannot mix two sizes. */
async function serialize(opt = {}) {
  const list = S.layers.map(L => ({ L, px: L.px, ver: L.ver | 0, d: { id: L.id, shadowFor: L.shadowFor, outlineFor: L.outlineFor, name: L.name, visible: L.visible, opacity: L.opacity, locked: L.locked, kind: L.kind, objectLayer: L.objectLayer, objects: L.objects, shadows: L.shadows, live: L.live, pivot: L.pivot, onTile: L.onTile || undefined, mirrorOf: L.mirrorOf, ghost: L.ghost || undefined, group: L.group, tag: L.tag } }));
  const groups = S.groups.filter(g => S.layers.some(L => L.group === g.id)).map(({ solo, ...g }) => g);   // an undo step may keep a record whose layers are gone
  const out = { app: FORMAT, version: FORMAT_VERSION, name: S.name, sizeLock: S.sizeLock || undefined, projectId: S.projectId || undefined, revision: (opt.revision === undefined ? S.revision : opt.revision) || undefined, savedAt: opt.savedAt || S.savedAt || undefined, w: S.w, h: S.h, gox: S.gox, goy: S.goy, mirrorX: S.mirrorX, mirrorY: S.mirrorY, axisX: S.axisX, axisY: S.axisY, mode: S.mode, tile: S.tile, level: S.level || undefined, edgeRun: S.edgeRun, tileSeed: S.tileSeed, scatterSeed: S.scatterSeed, example: S.example || undefined, tipsDismissed: S.tipsDismissed || undefined, checklist: S.checklist.length ? S.checklist : undefined, animations: S.anims.length ? S.anims : undefined, groups: groups.length ? groups : undefined, ...sceneSaved(), library: S.library.length ? S.library.map(({ mine, ...x }) => x) : undefined, nudgeX: S.nudgeX, nudgeY: S.nudgeY, cell: S.cell, major: S.major, snap: S.snap === 'pixel' ? undefined : S.snap,
    palette: S.palette, ramps: S.pal.ramps, paletteId: S.pal.id, paletteName: S.pal.name, paletteCredit: S.pal.credit, myPalettes: S.myPalettes, color: S.color, color2: S.color2, light: S.light, active: S.active, layers: [], saved: new Date().toISOString() };
  for (let k = 0; k < list.length; k++) {
    const e = list[k];
    out.layers.push(Object.assign(e.d, opt.cache ? await encodeCached(e) : await encodeLayer(e.px)));
    if (opt.job) await xpTick(opt.job, k + 1, list.length);
  }
  return out;
}
const projectLike = o => !!o && (o.app === FORMAT || OLD_FORMAT.includes(o.app)) && Array.isArray(o.layers) && sizeOk(o.w, o.h);
async function loadProject(o) {
  if (!projectLike(o)) throw new Error('This is not a qtiles project file.');
  const layers = [];
  for (const d of o.layers) {
    const px = await decodeLayer(d, o.w * o.h);
    const kinds = LAYER_KINDS.map(k => k[0]);
    layers.push({ id: d.id, shadowFor: d.shadowFor, outlineFor: d.outlineFor, shadows: typeof d.shadows === 'boolean' ? d.shadows : undefined, live: !!d.live, pivot: cleanPivot(d.pivot), onTile: !!d.onTile, mirrorOf: d.mirrorOf, ghost: !!d.ghost, group: d.group, tag: cleanTag(d.tag), objects: d.objectLayer ? d.objects : null, locked: !!d.locked, kind: kinds.includes(d.kind) ? d.kind : 'layer', name: String(d.name || 'Layer'), visible: d.visible !== false, opacity: Math.max(0, Math.min(1, Number.isFinite(+d.opacity) && d.opacity !== null && d.opacity !== undefined ? +d.opacity : 1)), px });
  }
  if (!layers.length) throw new Error('The project has no layers.');
  // Files without ids get fresh ones, numbered past any id the file does use, dangling links included.
  for (const d of layers) for (const n of [d.id, d.shadowFor, d.outlineFor, d.mirrorOf, d.group]) if (Number.isInteger(n) && n >= layerSeq) layerSeq = n + 1;
  selReset(); S.w = o.w; S.h = o.h; S.layers = layers.map(d => { const L = makeLayer(d.name, d.px); if (Number.isInteger(d.id)) L.id = d.id; if (Number.isInteger(d.shadowFor)) L.shadowFor = d.shadowFor; if (Number.isInteger(d.outlineFor)) L.outlineFor = d.outlineFor; L.visible = d.visible; L.opacity = d.opacity; L.locked = d.locked; L.kind = d.kind; L.shadows = d.shadows; L.live = d.live; L.pivot = d.pivot; L.onTile = d.onTile; L.ghost = d.ghost; L.tag = d.tag; if (Number.isInteger(d.group)) L.group = d.group; if (Number.isInteger(d.mirrorOf)) L.mirrorOf = d.mirrorOf; flush(L); if (d.objects) { L.objectLayer = true; L.objects = cleanObjects(d.objects); L.ids = new Uint32Array(S.w * S.h); L.faces = new Uint8Array(S.w * S.h); } return L; });
  cleanGroups(o.groups); charLoaded(o); sceneLoad(o);
  S.gox = Number.isFinite(o.gox) ? o.gox : Math.floor(o.w / 2); S.goy = Number.isFinite(o.goy) ? o.goy : 0;
  S.mirrorX = !!o.mirrorX; S.mirrorY = !!o.mirrorY; S.axisX = Number.isFinite(o.axisX) ? o.axisX : o.w - 1; S.axisY = Number.isFinite(o.axisY) ? o.axisY : o.h - 1;
  S.active = Math.max(0, Math.min(S.layers.length - 1, o.active | 0)); S.name = String(o.name || 'untitled');
  S.sizeLock = !!o.sizeLock; S.tile = o.tile >= 8 && o.tile <= 256 && o.tile % 4 === 0 ? o.tile : 32; S.level = o.level > 0 ? o.level : 0; S.edgeRun = [2, 3, 4].includes(o.edgeRun) ? o.edgeRun : 2;
  S.projectId = cleanProjectId(o.projectId); S.revision = Number.isInteger(o.revision) && o.revision > 0 ? o.revision : 0; S.savedAt = typeof o.savedAt === 'string' ? o.savedAt : null;
  S.example = typeof o.example === 'string' ? o.example : null; S.tipsDismissed = !!o.tipsDismissed; S.checklist = cleanChecklist(o.checklist);
  S.tileSeed = Number.isInteger(o.tileSeed) ? o.tileSeed : 1; S.scatterSeed = Number.isInteger(o.scatterSeed) ? o.scatterSeed : 1; S.library = cleanLibrary(o.library); S.libPick = null; S.nudgeX = o.nudgeX | 0; S.nudgeY = o.nudgeY | 0; TL.last = null; S.cell = Number.isInteger(o.cell) && o.cell >= 1 && o.cell <= CELL_MAX ? o.cell : cellDefault(o.w, o.h); S.major = MAJORS.includes(o.major) ? o.major : majorDefault(S.cell, o.w, o.h); S.snap = SNAPS.includes(o.snap) ? o.snap : 'pixel';
  loadPalette(o);
  S.light = LIGHTS.includes(o.light) ? o.light : 'left'; S.color2 = o.color2 && hexToRgb(o.color2) ? o.color2 : '#24593f';
  $('projName').value = S.name; tileCustom = false; syncTile();
  resetHistory(); syncMirror(); renderPalette(); setColor(o.color && hexToRgb(o.color) ? o.color : S.color); setMode(o.mode === 'flat' ? 'flat' : 'iso'); setLight(S.light); hooks.canvas();
  hooks.layers(); hooks.tips && hooks.tips(); fitView(); setDirty(false);
}

/* Files from before ramps have only the flat list. One with the default colors is the default palette; any other becomes a project palette. */
function loadPalette(o) {
  S.myPalettes = (Array.isArray(o.myPalettes) ? o.myPalettes : []).map(cleanPalette).filter(Boolean);
  const mine = S.myPalettes.find(p => p.id === o.paletteId);
  if (mine) { usePalette(mine); return; }
  const renamed = OLD_FORMAT.includes(o.paletteId);   // the default palette carried the app's name, and two entries for it would show in the list
  const kept = cleanPalette({ id: renamed ? PALETTES[0].id : o.paletteId, name: renamed ? PALETTES[0].name : o.paletteName, credit: o.paletteCredit, ramps: o.ramps });
  if (kept) { S.pal = kept; syncFlat(); return; }
  if (!Array.isArray(o.palette) || !o.palette.length) { usePalette(PALETTES[0]); return; }
  const flat = o.palette.filter(h => hexToRgb(h)).slice(0, 256).map(h => h.toLowerCase()), base = new Set(flatPalette(PALETTES[0]));
  if (flat.length === base.size && flat.every(h => base.has(h))) usePalette(PALETTES[0]);
  else { S.pal = { id: 'project', name: 'Project palette', ramps: rampsFromFlat(flat) }; syncFlat(); }
}

/* ---------- saving ---------- */
function safeName() { return (S.name || 'untitled').trim().replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'untitled'; }
/* A framed page cannot show a picker, whatever the browser supports. */
function saveMode() { return window.claude || SV.noPicker || !window.showSaveFilePicker || window.top !== window.self ? 'download' : 'file'; }
async function deliver(filename, blob) {
  let dl = null;
  try { dl = window.claude && await window.claude.use('downloads'); } catch (_) { dl = null; }
  if (dl) {
    try { await dl.save({ filename, data: blob }); return true; }
    catch (e) { if (e && e.code === 'declined') return false; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); return true;
}
/* ---------- saving straight back to a file ---------- */
/* Null means the file is gone. Anything else is the caller's to report. */
async function diskTime(h) {
  try { return (await h.getFile()).lastModified; }
  catch (e) { if (e && e.name === 'NotFoundError') return null; throw e; }
}
/* What to do about a file, given when we last left it and when it says it changed. No `known` means the artist just chose this file. */
function saveGuard(known, disk) { return known === null ? 'ok' : disk === null ? 'missing' : disk === known ? 'ok' : 'changed'; }
async function filePerm(h, ask) {
  if (!h.queryPermission) return true;
  const o = { mode: 'readwrite' };
  return await h.queryPermission(o) === 'granted' || (!!ask && await h.requestPermission(o) === 'granted');
}
async function pickFile(suggestedName) {
  const h = await window.showSaveFilePicker({ suggestedName, types: [{ description: 'qtiles project', accept: { 'application/json': ['.json'] } }] });
  fileHandle = h; SV.fileName = h.name || suggestedName; SV.modified = null; return h;
}
/* Returns 'ok', 'fork' when the project moved to a new file, or null to stop. */
async function saveResolve() {
  const st = saveGuard(SV.modified, await diskTime(fileHandle));
  if (st === 'ok') return 'ok';
  $('conTitle').textContent = st === 'missing' ? 'The file is gone' : 'The file changed on disk';
  $('conText').textContent = st === 'missing' ? SV.fileName + ' is no longer where it was. It may have been moved, renamed or deleted.' : SV.fileName + ' changed after this project was opened, perhaps on another device. Overwriting replaces that version.';
  $('conOver').hidden = st === 'missing';
  const c = await askSheet('sheetConflict');
  if (c === 'over') { SV.modified = null; return 'ok'; }
  if (c !== 'copy') return null;
  try { await pickFile(safeName() + ' copy.qtiles.json'); } catch (e) { if (e && e.name === 'AbortError') return null; throw e; }
  SV.forked = S.projectId; S.projectId = null; saveBar(); return 'fork';   // two files going their own ways are two projects
}
/* The picker comes before any slow work: it needs the tap, and a tap does not last through seconds of compressing. Returns 'file', 'download', or null to stop. */
async function saveReady() {
  if (!fileHandle) {
    try { await pickFile(safeName() + '.qtiles.json'); saveBar(); return 'file'; }
    catch (e) {
      if (e && e.name === 'AbortError') return null;
      SV.noPicker = true; saveBar(); toast('This page cannot write to files here, so it is saving by download.'); return 'download';
    }
  }
  if (!await filePerm(fileHandle, true)) { toast('qtiles was not allowed to write to ' + SV.fileName + '.'); return null; }
  return await saveResolve() ? 'file' : null;
}
async function fileWrite(blob) {
  const w = await fileHandle.createWritable();
  try { await w.write(blob); await w.close(); }
  catch (e) { try { await w.abort(); } catch (_) {} throw e; }   // an unfinished write never reaches the file
}
async function saveRun(tail = '') {
  commitFloat();
  const how = saveMode() === 'file' ? await saveReady() : 'download';
  if (!how) return false;
  projId();
  const v = docVer, at = new Date().toISOString(), rev = S.revision + 1;
  const made = await xpJob('Saving', async job => { const o = await serialize({ job, revision: rev, savedAt: at }); return { o, blob: new Blob([JSON.stringify(o)], { type: 'application/json' }) }; }, 'Save');
  if (!made) return false;
  if (how === 'file') {
    const st = await saveResolve();   // compressing can take long enough for the file to change again
    if (!st) return false;
    if (st === 'fork') return saveRun();
    await fileWrite(made.blob);
    SV.modified = await diskTime(fileHandle);
  } else if (!await deliver(safeName() + tail + '.qtiles.json', made.blob)) return false;
  S.revision = rev; S.savedAt = at; if (docVer === v) setDirty(false); saveBar();   // anything drawn during the save is still unsaved
  await afterSave(how, made.o);
  toast(how === 'file' ? 'Saved to ' + SV.fileName + '.' : 'Project saved. Open it again from the same place to keep going.');
  return true;
}
async function saveProject() {
  if (SV.busy) { toast('Already saving.'); return false; }
  SV.busy = true;
  try { return await saveRun(); }
  catch (e) { toast('Could not save: ' + (e.message || e) + '. Export backup still works.'); return false; }
  finally { SV.busy = false; }
}
/* The same fork as Save as copy in the changed-file guard: from here on this is a new project, in the new file. */
async function saveCopy() {
  if (SV.busy) { toast('Already saving.'); return false; }
  SV.busy = true;
  try {
    const toFile = saveMode() === 'file';
    if (toFile) { try { await pickFile(safeName() + ' copy.qtiles.json'); } catch (e) { if (e && e.name === 'AbortError') return false; throw e; } }
    SV.forked = S.projectId; S.projectId = null; saveBar();
    return await saveRun(toFile ? '' : ' copy');
  } catch (e) { toast('Could not save: ' + (e.message || e) + '. Export backup still works.'); return false; }
  finally { SV.busy = false; }
}
async function exportPalette(ext, text) {
  const name = S.pal.name.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'palette';
  if (await deliver(name + ext, new Blob([text], { type: 'text/plain' }))) toast('Palette exported.');
}

/* ---------- opening ---------- */
async function importPng(file) {
  const bmp = await createImageBitmap(file), box = { x0: 0, y0: 0, x1: bmp.width - 1, y1: bmp.height - 1 }, ow = S.w, oh = S.h;
  if (!await new Promise(r => fitGate(box, file.name, () => null, () => r(true), () => r(false)))) return;
  if (pastEdge(box)) growToInclude(box.x0, box.y0, box.x1, box.y1, 0);
  const c = document.createElement('canvas'); c.width = S.w; c.height = S.h;
  const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
  const L = makeLayer(file.name.replace(/\.png$/i, '').slice(0, 30) || 'Imported', new Uint32Array(x.getImageData(0, 0, S.w, S.h).data.buffer));
  L.group = activeLayer().group; const idx = aboveFamily(activeLayer()); insertLayer(L, idx);
  pushHistory({ bytes: S.w * S.h * 4, undo: () => removeLayer(S.layers.indexOf(L)), redo: () => insertLayer(L, idx) });
  toast(bmp.width > S.w || bmp.height > S.h ? 'Imported as a new layer, cropped to the canvas.' : S.w > ow || S.h > oh ? 'Imported as a new layer. Canvas extended by ' + (S.w - ow) + ' x ' + (S.h - oh) + ' px.' : 'Imported as a new layer at the top left.');
}
/* A warning that lands on a project the artist is about to lose has to come first, which is why this waits for the file: only a project replaces anything, a PNG does not. */
async function openProject(o, file, handle) {
  try {
    const known = await revisionKnown(o.projectId);
    if (fileOlder(o, known)) {
      $('oldText').textContent = 'This browser has seen revision ' + known + ' of ' + (o.name || 'this project') + ', and this file is revision ' + (o.revision | 0) + '. It may not have synced yet.';
      const c = await askSheet('sheetOlder');
      if (c === 'recover') { recoverOpen(); return; }
      if (c !== 'open') return;
    }
    await loadProject(o);
    S.revision = Math.max(S.revision, known);   // revisions only climb, so a save from here still outranks what came before
    saveBind(handle, file);
    const told = animTell(); toast('Opened ' + S.name + '.' + (told ? ' Its animations are kept. Preferences, Labs shows them.' : ''), told ? { label: 'Preferences', run: () => prefsOpen('labs') } : undefined);
  } catch (e) { toast(e.message || 'Could not open that file.'); }
}
async function openFile(file, handle) {
  newTaken(); commitFloat();
  try {
    if (/\.png$/i.test(file.name) || file.type === 'image/png') { await importPng(file); return; }
    const o = JSON.parse(await file.text());
    if (libLike(o)) { libImport(o); return; }
    if (!projectLike(o)) throw new Error('This is not a qtiles project file.');
    guardThen(() => openProject(o, file, handle));
  } catch (e) { toast(e.message || 'Could not open that file.'); }
}
async function pickOpen() {
  if (saveMode() !== 'file' || !window.showOpenFilePicker) { $('openInput').click(); return; }
  let h;
  try { [h] = await window.showOpenFilePicker({ types: [{ description: 'qtiles project or PNG', accept: { 'application/json': ['.qtiles.json', '.isopic.json', '.isopolis.json', '.json'], 'image/png': ['.png'] } }] }); }
  catch (e) { if (!e || e.name !== 'AbortError') $('openInput').click(); return; }
  openFile(await h.getFile(), h);
}
function initFiles() {
  $('openInput').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); };
  for (const st of [$('stage'), $('sheetNew')]) {   // a file let go over the start screen would otherwise replace the page
    st.addEventListener('dragover', e => e.preventDefault());
    st.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });
  }
}

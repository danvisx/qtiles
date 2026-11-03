// The user's work is safe: saving, older files, recovery copies, and the guards.

/* A small IndexedDB, enough for the real code to run on. An aborted transaction writes nothing. */
function fakeDb(w) {
  const dbs = {}, one = name => {
  const db = dbs[name] = { stores: {}, full: false, up: false };
  const objectStore = (st, tx) => {
    const wait = f => { const r = {}; tx.n++; setTimeout(() => { if (tx.dead) return; r.result = f(); if (r.onsuccess) r.onsuccess(); if (!--tx.n) tx.oncomplete(); }); return r; };
    const write = f => { if (db.full) { tx.dead = true; tx.error = { name: 'QuotaExceededError' }; setTimeout(() => tx.onabort()); return {}; } return wait(f); };
    return { add: v => write(() => { const id = ++st.seq; st.rows.set(id, Object.assign({}, v, { id })); return id; }), put: v => write(() => { st.rows.set(v[st.key], v); return v[st.key]; }), get: k => wait(() => st.rows.get(k)), getAll: () => wait(() => [...st.rows.values()]), count: () => wait(() => st.rows.size), delete: k => write(() => { st.rows.delete(k); }) };
  };
  const conn = db.conn = { close() {}, createObjectStore: (name, o) => { db.stores[name] = { key: o.keyPath, seq: 0, rows: new Map() }; }, transaction: () => { const tx = { n: 0, objectStore: name => objectStore(db.stores[name], tx) }; setTimeout(() => { if (!tx.n && !tx.dead) tx.oncomplete(); }); return tx; } };
  return db; };
  w.indexedDB = {
    open: name => { const d = dbs[name], q = { result: d && d.conn, transaction: { abort() {} } }; setTimeout(() => { if (!d) { q.onupgradeneeded(); q.onerror({ preventDefault() {} }); return; } if (!d.up) { d.up = true; q.onupgradeneeded(); } q.onsuccess(); }); return q; },
    deleteDatabase: name => { const q = {}; delete dbs[name]; setTimeout(() => q.onsuccess()); return q; }
  };
  const db = one('qtiles'); db.dbs = dbs;
  // The database the build before the rename left behind.
  db.old = () => { const o = one('isopic'); o.up = true; for (const [n, k] of [['heads', 'id'], ['bodies', 'id'], ['projects', 'pid']]) o.conn.createObjectStore(n, { keyPath: k }); return o; };
  return db;
}

// A layer as a file holds it: raw, or gzipped as saves are in a real browser.
const pxData = (t, w, h, f, zip) => { const px = new Uint32Array(w * h); for (let k = 0; k < px.length; k++) px[k] = f(k); const raw = Buffer.from(px.buffer); return zip ? { enc: 'gzip', data: t.gz(raw).toString('base64') } : { enc: 'raw', data: raw.toString('base64') }; };
const RED = 0xff0000ff;

const LAYER_FIELDS = ['id', 'name', 'visible', 'opacity', 'locked', 'kind', 'shadowFor', 'outlineFor', 'pivot', 'onTile', 'mirrorOf', 'ghost', 'group', 'tag', 'objectLayer', 'shadows', 'live'];
const SETTINGS = ['name', 'mode', 'tile', 'level', 'edgeRun', 'gox', 'goy', 'mirrorX', 'mirrorY', 'axisX', 'axisY', 'tileSeed', 'scatterSeed', 'nudgeX', 'nudgeY', 'cell', 'major', 'snap', 'sizeLock', 'light', 'color', 'color2', 'active', 'views', 'sections', 'secOn', 'secW', 'secH', 'anims', 'checklist', 'example', 'tipsDismissed'];

module.exports = async t => {
  const { ev, fn, w, $, check, wait } = t;
  const sheet = id => !$(id).hidden, esc = () => t.key('Escape');

  /* one project with something in every saved field */
  ev(`(() => {
    T.reset(160, 128);
    const L = T.l0; L.name = 'Ground'; L.kind = 'terrain'; L.opacity = 0.5; L.tag = 3; T.fill(4, 4, 40, 20, '#ff0000', L); L.locked = true;
    addLayer('Outline'); addLayer('Shadow'); addLayer('Hero'); addLayer('Twin'); addLayer('Hidden');
    const [, out, sh, hero, twin, off] = S.layers;
    T.fill(10, 10, 30, 30, '#00ff00', hero); T.fill(50, 10, 70, 30, '#0000ff', twin); T.fill(1, 1, 2, 2, '#ffff00', off);
    out.outlineFor = hero.id; out.kind = 'layer'; sh.shadowFor = hero.id; sh.kind = 'shadow';
    hero.kind = 'character'; hero.pivot = { x: 20, y: 30 }; hero.onTile = true; twin.kind = 'character'; twin.mirrorOf = hero.id;
    off.visible = false; off.ghost = true; off.kind = 'prop';
    S.groups = [{ id: 900, name: 'Family', collapsed: false, visible: true, locked: false, opacity: 0.75, tag: 2 }];
    for (const x of [out, sh, hero, twin]) x.group = 900;
    S.active = 3; addObjectLayer(); const O = T.L(); O.shadows = true; objEdit(O, [T.box({ i: 2, j: 2, w: 4, d: 4, h: 16, shadow: true })]);
    objEdit(O, O.objects.concat(detailPin(objNew({ id: objSeq++, type: 'window', parent: O.objects[0].id, face: 1, u: 4, v: 8, h: 1, w: 0, d: 0, look: lookFrom('#e8e4d8'), params: {} }), O.objects[0])));
    Object.assign(S, { name: 'rich', level: 12, edgeRun: 3, mirrorX: true, axisX: 101, mirrorY: true, axisY: 77, gox: 84, goy: 6, tileSeed: 5, scatterSeed: 8, nudgeX: 1, nudgeY: 2, cell: 8, major: 4, sizeLock: true, tipsDismissed: true, example: 'crate',
      views: [{ name: 'Door', x: 10, y: 20, z: 4 }], sections: { '1,0': { done: true, note: 'sky' } }, secOn: true, secW: 64, secH: 32, anims: [{ name: 'Walk', frames: [{ id: hero.id, ms: 120 }, { id: twin.id, ms: 80 }] }], checklist: ['a', 'b'] });
    setLight('right'); setColor('#7bb661'); S.color2 = '#123456'; removeColor('#0b132b');
    objSelectMany(O.objects.filter(o => !o.parent).map(o => o.id)); libSaveSel('Mine', 'Props'); objSelect(null);
    S.projectId = 'abcd-1234-efgh'; S.revision = 4; S.savedAt = '2026-01-02T03:04:05.000Z'; objRefresh();
  })()`);
  const fields = JSON.stringify(LAYER_FIELDS);
  const layersNow = () => JSON.parse(ev(`JSON.stringify(S.layers.map(L => Object.fromEntries(${fields}.map(k => [k, L[k] === undefined || L[k] === null || L[k] === false ? '' : L[k]]))))`));
  const pixelsNow = () => ev(`JSON.stringify(S.layers.map(L => T.hash(L.px)))`);
  const recordsNow = () => ev(`JSON.stringify(S.layers.map(T.recs))`);
  const settingsNow = () => JSON.parse(ev(`JSON.stringify(Object.fromEntries(${JSON.stringify(SETTINGS)}.map(k => [k, S[k]])))`));
  const palNow = () => ev(`JSON.stringify([S.pal.id, S.pal.name, S.pal.ramps, S.palette, S.myPalettes.map(p => p.name)])`);

  const before = { layers: layersNow(), px: pixelsNow(), recs: recordsNow(), set: settingsNow(), pal: palNow(), groups: ev('JSON.stringify(S.groups)'), lib: ev('JSON.stringify(S.library)') };
  const file = await t.saved();
  ev(`newDoc(16, 16, 'gone');`);
  await t.load(file);

  check('save and load keeps every layer field', (() => { const now = layersNow(); let bad = ''; before.layers.forEach((a, k) => { for (const f of LAYER_FIELDS) if (!bad && JSON.stringify(a[f]) !== JSON.stringify(now[k] && now[k][f])) bad = a.name + '.' + f; }); if (bad) console.log('  differs: ' + bad); return !bad && now.length === before.layers.length; })());
  check('save and load keeps every pixel and the groups', pixelsNow() === before.px && ev('JSON.stringify(S.groups)') === before.groups && before.groups.includes('Family'));
  check('save and load keeps object records and their render', recordsNow() === before.recs && ev('(S.active = S.layers.findIndex(L => L.objectLayer), T.fullSame())'));
  check('save and load keeps every project setting', (() => { const now = settingsNow(); const bad = SETTINGS.filter(k => JSON.stringify(now[k]) !== JSON.stringify(before.set[k])); if (bad.length) console.log('  differs: ' + bad.join()); return !bad.length; })());
  check('save and load keeps palettes, the library and project identity', palNow() === before.pal && ev('JSON.stringify(S.library)') === before.lib && ev('S.projectId') === 'abcd-1234-efgh' && ev('S.revision') === 4 && ev('S.savedAt') === file.savedAt);
  { const canon = o => JSON.stringify(o, (k, v) => v === false || k === 'saved' ? undefined : v); check('saved again after loading gives the same file; new objects take unused ids', canon(await t.saved()) === canon(file) && ev('objSeq') > ev('Math.max(...S.layers.flatMap(L => (L.objects || []).map(o => o.id)))')); }

  /* older files */
  const flat = ['#ABCDEF', '#123123', '#3f8a4f'];
  const oldFile = name => ({ name: name, type: 'application/json', text: async () => JSON.stringify(w.fileBody) });
  const open = async (o, name) => { w.fileBody = o; w.fileIn = oldFile(name); await ev('openFile(window.fileIn, null)'); await wait(30); };
  ev(`setDirty(false);`);
  await open({ app: 'isopolis', version: 1, name: 'first', w: 16, h: 8, palette: flat, color: '#ff0000', layers: [{ name: 'Layer 1', visible: true, ...pxData(t, 16, 8, k => k === 3 ? RED : 0) }] }, 'first.isopolis.json');
  check('a version 1 file opens', ev('S.name') === 'first' && ev('S.w') === 16 && ev('T.l0.px[3]') === RED && ev('T.l0.opacity') === 1 && ev('T.l0.kind') === 'layer');
  ev(`setDirty(false);`);
  await open({ app: 'isopolis', version: 2, name: 'polis', w: 8, h: 8, layers: [{ name: 'A', kind: 'prop', ...pxData(t, 8, 8, k => k === 9 ? RED : 0, true) }, { name: 'B', ...pxData(t, 8, 8, () => 0) }], palette: flat, tile: 64, mode: 'flat' }, 'polis.isopolis.json');
  check('an .isopolis.json file opens, gzipped layers included', ev('S.name') === 'polis' && ev('S.layers.length') === 2 && ev('T.l0.px[9]') === RED && ev('S.tile') === 64 && ev('S.mode') === 'flat' && ev('T.l0.kind') === 'prop');
  { const a = ev('S.pal.id') === 'project' && ev('S.palette.length') === 3 && ev("rampOf('#abcdef').ramp.name") === 'Loose' && ev("rampOf('#3f8a4f').ramp.name") === 'Greens';
    await t.load({ app: 'qtiles', version: 2, w: 8, h: 8, palette: ev('DEFAULT_PALETTE.slice().reverse()'), layers: [{ ...pxData(t, 8, 8, () => 0) }] });
    check('a flat palette from before ramps: foreign colors loose, the default list as the default', a && ev('S.pal.id') === 'qtiles' && ev("rampStep('#3f8a4f', -1)") === '#24593f'); }
  ev(`setDirty(false);`);
  await open({ app: 'isopic', version: 2, name: 'pic', w: 8, h: 8, paletteId: 'isopic', paletteName: 'Isopic', ramps: [{ name: 'A', colors: ['#112233'] }], layers: [{ name: 'A', ...pxData(t, 8, 8, k => k === 9 ? RED : 0) }] }, 'pic.isopic.json');
  { const again = await t.saved(); ev(`setDirty(false); newDoc(8, 8, 'x'); setDirty(false);`); await open(again, 'pic.qtiles.json'); check('an .isopic.json file opens and saves as qtiles', again.app === 'qtiles' && ev('S.name') === 'pic' && ev('T.l0.px[9]') === RED && ev('S.pal.id') === 'qtiles' && ev('S.pal.name') === 'qtiles'); }
  await t.load({ app: 'qtiles', version: 2, name: 'pre', w: 32, h: 32, gox: 16, goy: 0, tile: 32, mode: 'iso', light: 'right', palette: flat, layers: [{ name: 'Art', visible: true, opacity: 1, locked: false, kind: 'terrain', ...pxData(t, 32, 32, k => k === 40 ? RED : 0, true) }] });
  check('a file from before objects opens with no object layer', !ev('S.layers.some(L => L.objectLayer)') && ev('T.l0.px[40]') === RED && ev('T.l0.kind') === 'terrain' && ev('canEdit(T.l0)'));
  await t.load({ app: 'qtiles', version: 2, w: 8, h: 4, layers: [{ ...pxData(t, 8, 4, () => RED) }] });
  const bare = ev('S.name') === 'untitled' && ev('S.tile') === 32 && ev('S.mode') === 'iso' && ev('S.edgeRun') === 2 && ev('S.light') === 'left' && ev('S.gox') === 4 && ev('T.l0.name') === 'Layer' && ev('T.l0.visible') === true && ev('S.groups.length') === 0 && ev('S.views.length') === 0 && ev('T.l0.px[0]') === RED && ev('S.pal.id') === 'qtiles';
  { const o = await t.saved(), opt = ['groups', 'views', 'sections', 'sectionGrid', 'animations', 'library', 'checklist', 'level', 'projectId', 'revision', 'savedAt']; check('a file with no optional fields opens and saves without them', bare && opt.every(k => !(k in o)) && o.version === 2); }
  { const o = await t.saved(); o.layers = [Object.assign({}, o.layers[0], { objectLayer: true, objects: [{ id: 'x', i: 2, j: 2, w: -3 }, null, { id: 77, i: 2, j: 2, look: { color: 'nope' }, outline: 'huge', facing: 9 }, { id: 77, type: 'future', i: 3, j: 2, w: 2, d: 2, h: 8 }] })];
    Object.assign(o, { groups: [{ id: 'x' }, null], views: [{ x: 'a' }, null, { name: 'ok', x: 1, y: 2, z: 999 }], sections: { 'a,b': { done: true }, '3,4': null }, sectionGrid: { w: -4, h: 1e9, ox: 'x' }, animations: [{ name: 'A', frames: 'no' }], tile: 7, edgeRun: 9, light: 'moon', snap: 'x', opacity: 'x' });
    await t.load(o); check('damaged fields open with defaults and unique object ids', ev('T.L().objects.length') === 3 && new Set(ev('T.L().objects.map(o => o.id)')).size === 3 && ev('S.views.length') === 1 && ev('S.secW') === 256 && ev('S.tile') === 32 && ev('S.edgeRun') === 2 && ev('S.light') === 'left' && ev('S.groups.length') === 0); }
  { ev(`newDoc(16, 16, 'kept'); T.fill(1, 1, 2, 2, '#ff0000');`); const a = ev('T.doc()'); let msg = 0;
    for (const o of [{ app: 'other', w: 8, h: 8, layers: [] }, { app: 'qtiles', w: 8, h: 8, layers: [] }, { app: 'qtiles', w: 8, h: 8, layers: [{ enc: 'raw', data: 'AAAA' }] }]) await t.load(o).catch(() => { msg++; });
    check('a non-project or damaged file is refused and the open project stays', msg === 3 && ev('T.doc()') === a); }

  /* references: overlays, in the file only when kept */
  { w.createImageBitmap = async () => ({ width: 4, height: 3 }); ev(`newDoc(32, 32, 'refs'); T.fill(1, 1, 9, 9, '#ff0000'); for (const k of [1, 2]) RF.list.push(refNew({ name: 'r' + k, img: new Image(), data: 'data:image/png;base64,AAAA', w: 4, h: 3, x: k, scaleY: 2, rot: 45, opacity: 100, locked: true, keep: k < 2 }));`);
    const o = await t.saved(), all = await ev('serialize({ cache: true }).then(o => o.refs.length)'); w.urlLen = 2.1e6; const big = ev('refEncode({ width: 9, height: 9 })'); w.urlLen = 64;
    o.refs.push({ ...o.refs[0], data: 'data:text/html;base64,AAAA' }, { ...o.refs[0], data: 'data:image/png;base64,' + 'A'.repeat(2.1e6) }); await t.load(o);
    check('references: a file keeps the kept, a recovery copy all; oversized or broken ones are dropped', o.refs.length === 3 && all === 2 && big === null && ev(`(r => RF.list.length === 1 && r.x === 1 && r.scaleY === 2 && r.rot === 45 && r.locked)(RF.list[0])`));
    ev(`window.got = []; window.pb = pngBlob; pngBlob = async px => { got.push(T.hash(px) + snapThumb()); };`);
    for (const k of [0, 1]) { ev(`RF.list[0].hidden = ${!k}; render();`); await ev(`exportPng(1, {})`); }
    check('export and thumbnail are the same with a reference shown or hidden', ev('pngBlob = pb, got.length === 2 && got[0] === got[1]'));
    check('Make a pixel layer: opaque chosen colors or empty, the same each time', await ev(`(async () => { const s = new Uint8ClampedArray(12288).map((v, i) => i % 4 < 3 ? i * (i % 4 + 7) & 255 : i % 256 < 32 ? 40 : 255), run = async () => { const a = await refShrink(s, 64, 48, 32, 24), c = refMedian(a, 8); return [c, Array.from(await refMap(a, 32, 24, c, 4))]; }, [c, px] = await run(), ok = new Set(c.map(packHex));
      return c.length > 1 && c.length <= 8 && JSON.stringify([c, px]) === JSON.stringify(await run()) && px.every(v => !v || ok.has(v)) && px.includes(0) && px.some(v => v); })()`)); }

  /* recovery copies */
  const db = fakeDb(w); ev(`idbP = null;`);
  const heads = () => [...db.stores.heads.rows.values()], dropAll = () => ev(`snapDrop(${JSON.stringify(heads().map(h => h.id))})`), bodies = () => db.stores.bodies.rows.size, drawn = () => ev('Array.from(T.l0.px).join()');
  const edit = (x = 5) => ev(`S.active = 0; beginStroke(T.l0); plotLayer(${x}, 6, packHex('#ff0000')); endStroke();`);
  ev(`newDoc(64, 64, 'rec'); setDirty(false);`); await ev('snapNow()');
  await ev('recoveryList()'); check('a clean project makes no recovery copy', heads().length === 0);
  for (let k = 0; k < 5; k++) { edit(10 + k); await ev('snapNow()'); await wait(2); }
  check('recovery keeps the newest 3 copies of a project', heads().length === 3 && bodies() === 3 && heads().every(h => h.id > 2) && heads()[0].pid === ev('S.projectId'));
  const want = drawn(); ev(`setDirty(false); newDoc(64, 64, 'other');`);
  { await ev('startOpen()'); const card = w.document.querySelector('.stcard'); ev(`setColor('#00ff00'); closeSheets();`); const told = $('toast').textContent.includes('Recovery copies'); t.tap(3, 3);
    check('Continue lists a card a project; closing keeps the copies and a blank that paints', !$('stCont').hidden && !!card && w.document.querySelectorAll('.stcard').length === 1 && told && heads().length === 3 && ev('T.painted()') === 1 && !ev('S.example')); ev(`setDirty(false)`); }
  { const a = heads()[2], long = (w.urlLen = 5000, ev('snapThumb()')); w.urlLen = 0; const none = ev(`startCard({ name: 'old', at: 1, layers: 1, w: 8, h: 8 })`).querySelector('img');
    check('a head has a thumbnail stays under the limit; one without still lists', a.thumb.startsWith('data:image/png') && a.thumb.length <= 4096 && long === undefined && none === null); }
  w.document.querySelector('.stcard').click(); await wait(30);
  check('restoring gives back exactly what was there, as unsaved', drawn() === want && ev('S.name') === 'rec' && ev('S.dirty') === true);
  ev(`setDirty(false); newDoc(64, 64, 'other'); setDirty(false);`); await ev('recoverOpen()'); await wait(10);
  { const drop = () => w.document.querySelector('.recrow .btn.danger'); drop().click(); const asked = heads().length === 3; drop().click(); await wait(30); check('Discard asks once, then removes that copy', asked && heads().length === 2); await dropAll(); }
  check('which copies are offered', fn(`const c = at => ({ id: at, pid: 'a', at }), s = [{ pid: 'a', savedAt: 10 }], n = (h, p, m) => recoveryOffers(h, p, m).length; return [n([c(20)], s), n([c(10)], s), n([c(10)], s, ['a']), n([c(10)], []), recoveryOffers([c(10), c(30), c(20)], [])[0].id].join();`) === '1,0,1,1,30');
  { ev(`newDoc(32, 32, 'mig'); T.l0.px[3] = packHex('#ff0000'); flush(T.l0);`); const legacy = await t.saved();
    w.localStorage.setItem('isopolis.recovery', JSON.stringify(Object.assign({}, legacy, { app: 'isopolis', name: 'older' }))); w.localStorage.setItem('isopic.recovery', JSON.stringify(legacy));
    db.full = true; await ev('recoveryMigrate()').catch(() => {}); db.full = false;
    check('a failed recovery migration keeps the old copies', !!w.localStorage.getItem('isopolis.recovery') && !!w.localStorage.getItem('isopic.recovery') && heads().length === 0);
    await ev('recoveryMigrate()');
    check('copies made under the old name move across and restore', heads().length === 2 && !w.localStorage.getItem('isopolis.recovery') && (await ev(`recoverRestore(${JSON.stringify(heads().find(h => h.name === 'older'))})`), await wait(30), ev('T.l0.px[3]')) === RED);
    await dropAll(); ev(`setDirty(false)`); }
  { w.localStorage.setItem('isopic.sizesTold', '1'); ev('keysMove()');
    const old = db.old(); old.stores.heads.rows.set(7, { id: 7, pid: 'p', at: 5, name: 'old' }); old.stores.bodies.rows.set(7, { id: 7, o: { tag: 1 } }); old.stores.projects.rows.set('p', { pid: 'p', handle: { h: 1 } });
    db.full = true; await ev('dbMove()'); db.full = false;
    const kept = db.dbs.isopic === old && old.stores.bodies.rows.size === 1 && ev('RC.stuck') && (ev('storageTell()'), $('toast').textContent.includes('could not be moved'));
    await ev('dbMove()'); const h = heads()[0];
    check('the old name: keys and database move; a failed copy keeps the old one', kept && w.localStorage.getItem('qtiles.sizesTold') === '1' && w.localStorage.getItem('isopic.sizesTold') === null && !db.dbs.isopic && heads().length === 1 && h.name === 'old' && db.stores.bodies.rows.get(h.id).o.tag === 1 && db.stores.projects.rows.get('p').handle.h === 1);
    await ev(`snapDrop([${h.id}])`); db.stores.projects.rows.clear(); w.localStorage.removeItem('qtiles.sizesTold'); }
  { ev(`newDoc(32, 32, 'q'); setDirty(false);`); edit(1); db.full = true; await ev('snapNow()'); db.full = false;
    const told = $('sbSave').textContent.includes('no recovery copy'); await ev('snapNow()'); await wait(5); edit(2); await ev('snapNow()');
    check('a full store is reported, and the next copy clears it', told && !$('sbSave').textContent.includes('no recovery copy')); }
  { const h0 = db.stores.heads.seq; edit(20); Object.defineProperty(w.document, 'visibilityState', { value: 'hidden', configurable: true }); w.document.dispatchEvent(new w.Event('visibilitychange')); await wait(30); check('going to the background takes a copy', db.stores.heads.seq === h0 + 1); Object.defineProperty(w.document, 'visibilityState', { value: 'visible', configurable: true }); }

  /* saving to a file, and the guards */
  ev(`setDirty(false); newDoc(32, 32, 'id');`);
  let picks = 0, disk = 1000, writes = [];
  const handle = { name: 'mine.qtiles.json', getFile: async () => { if (disk === null) { const e = new w.Error('gone'); e.name = 'NotFoundError'; throw e; } return { lastModified: disk }; }, queryPermission: async () => 'granted', createWritable: async () => ({ write: async b => { writes.push(b); }, close: async () => { disk += 1; } }) };
  w.showSaveFilePicker = async () => { picks++; return handle; };
  await ev('saveProject()'); const pid = ev('S.projectId');
  const lastText = () => new Promise(r => { const f = new w.FileReader(); f.onload = () => r(JSON.parse(f.result)); f.readAsText(writes[writes.length - 1]); });
  { const o = await lastText(); await ev('saveProject()'); check('a save writes an id and a counting revision, asking only the first time', /^[\w-]{36}$/.test(pid) && o.projectId === pid && o.revision === 1 && ev('S.revision') === 2 && picks === 1 && writes.length === 2 && ev('S.dirty') === false); }
  check('the changed-on-disk decision', ev('[saveGuard(5, 5), saveGuard(5, 6), saveGuard(5, null), saveGuard(null, 6), saveGuard(null, null)].join()') === 'ok,changed,missing,ok,ok');
  const go = () => (saving = ev('saveProject()'), wait(20)); disk += 500; let n = writes.length, saving; await go();
  check('a file changed on disk stops the save and asks', sheet('sheetConflict') && !$('conOver').hidden && writes.length === n);
  $('conCopy').click(); await saving; check('Save as copy goes to a new file as a new project', picks === 2 && ev('S.projectId') !== pid && writes.length === n + 1);
  const pid2 = ev('S.projectId'); disk += 500; await go(); esc(); await saving; const held = writes.length === n + 1 && !sheet('sheetConflict');
  await go(); $('conOver').click(); await saving; check('there Cancel writes nothing, Overwrite the same file', held && writes.length === n + 2 && ev('S.projectId') === pid2);
  disk = null; await go(); check('a file that is gone cannot be overwritten', sheet('sheetConflict') && $('conOver').hidden); esc(); await saving; disk = 9000; ev('SV.modified = 9000;');
  { edit(30); let release; handle.createWritable = async () => ({ write: async () => { await new Promise(r => { release = r; }); }, close: async () => {} });
    await go(); edit(31); release(); await saving; check('anything drawn during a save stays unsaved', ev('S.dirty') === true);
    handle.createWritable = async () => ({ write: async () => { throw new w.Error('disk full'); }, abort: async () => { writes.push('aborted'); }, close: async () => {} }); const rev = ev('S.revision');
    check('a failed write keeps the project unsaved', await ev('saveProject()') === false && ev('S.dirty') === true && ev('S.revision') === rev && writes[writes.length - 1] === 'aborted');
    handle.createWritable = async () => ({ write: async x => { writes.push(x); }, close: async () => { disk += 1; } }); ev(`SV.modified = ${disk};`);
    check('a second save while one runs is turned away', (await ev('Promise.all([saveProject(), saveProject()])'))[1] === false); }
  { ev('window.torn = serialize(); applyResize(128, 64, 0, 0);'); const o = await ev('window.torn'); check('a resize during a save cannot mix two sizes', o.w === 32 && atob(o.layers[0].data).length === 32 * 32 * 4); ev('undo(); setDirty(false);'); }
  { ev(`T.fill(1, 1, 3, 3, '#ff0000'); selectContent(); copySel(); selectNone();`); const n = ev('T.painted()'); ev(`pasteBuf(clip, { x: 20, y: 20 });`); await ev('saveProject()'); check('saving places a floating selection first', ev('FL') === null && ev('T.painted()') > n); ev('selectNone(); setDirty(false);'); }
  { ev(`newDoc(32, 32, 'cache'); setDirty(true);`); await ev('serialize({ cache: true })'); ev(`beginStroke(T.l0); plotLayer(3, 3, 123456 | 0xff000000); endStroke(); undo(); redo();`);
    check('a cached layer encoding is never stale', await ev('serialize({ cache: true }).then(a => serialize().then(b => JSON.stringify(a.layers) === JSON.stringify(b.layers)))')); }

  ev(`setDirty(false); newDoc(32, 32, 'held');`); const same = await t.saved();
  const sent = o => ({ name: 'f.qtiles.json', type: 'application/json', lastModified: 777, text: async () => JSON.stringify(o) });
  ev('S.revision = 7; S.projectId = "abcd-1234-held";'); const older = Object.assign({}, same, { projectId: 'abcd-1234-held', revision: 1, name: 'older one' });
  w.fileIn = sent(older); await ev('openFile(window.fileIn, null)'); await wait(30);
  check('a file behind this session warns first', ev(`fileOlder({ projectId: 'abcd-1234', revision: 5 }, 5) === false && !fileOlder({ revision: 1 }, 5)`) && sheet('sheetOlder') && ev('S.name') === 'held');
  $('oldOpen').click(); await wait(40); check('Open anyway opens it, and revisions still climb', ev('S.name') === 'older one' && ev('S.revision') === 7);
  ev(`T.fill(0, 0, 1, 1, '#ff0000'); setDirty(true);`); const name0 = ev('S.name'); w.fileIn = sent(Object.assign({}, same, { projectId: undefined, name: 'second' })); await ev('openFile(window.fileIn, null)'); await wait(30);
  { const asked = sheet('sheetGuard') && ev('S.name') === name0; esc(); await wait(10); check('opening over unsaved work asks, and Cancel keeps it', asked && ev('S.name') === name0 && ev('S.dirty') === true); }
  { const leave = () => { const e = new w.Event('beforeunload', { cancelable: true }); w.dispatchEvent(e); return e.defaultPrevented; }; const a = leave(); ev('setDirty(false);'); check('leaving is stopped only with unsaved changes', a && !leave()); }
  ev(`exBlank(64, 64); setDirty(false);`); check('a new blank project cannot save over the last file', ev('fileHandle') === null && ev('S.projectId') === null && ev('SV.fileName') === null);

  delete w.showSaveFilePicker; ev('saveBar();');
  { ev(`window.d0 = deliver; window.got = []; deliver = async (n, b) => { got.push(n); return true; }; newDoc(32, 32, 'dl');`); await ev('saveProject()'); await wait(30); check('a download save also keeps its bytes here', heads().some(h => h.pid === ev('S.projectId')) && ev('got.length') === 1); ev('deliver = d0;'); }
  delete w.indexedDB; ev(`idbP = null; RC.told = null; RC.failed = null; clearTimeout(RC.timer); RC.timer = null; setDirty(false);`);
};

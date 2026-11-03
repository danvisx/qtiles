// Builds the placeholder example projects with the app's own tools and writes them to app/examples/. Not part of the product.
// Run:  python3 scripts/build_artifact.py && node scripts/make_examples.js && python3 scripts/build_artifact.py
// With --px it builds only the scripts/example_art/*.px sources, which is what build_artifact.py runs when one of them changes.
// The owner's own drawings replace the character and scene: save them from qtiles into app/examples/, as app/examples/README.md describes.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { parsePx, buildPx, buildScene } = require('./px_example.js');
const SCENES = require('./example_art/scenes.js');
const root = path.join(__dirname, '..'), out = path.join(root, 'app', 'examples'), artDir = path.join(__dirname, 'example_art'), pxOnly = process.argv.includes('--px');
const html = fs.readFileSync(path.join(root, 'dist', 'qtiles.html'), 'utf8');

const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.detail || e.message || e)));
const dom = new JSDOM('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<link[^>]*>/g, '') + '</body></html>',
  { runScripts: 'dangerously', url: 'https://example.test/', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    const noop = () => {}, ctx = new Proxy({}, { get: (t, k) => k === 'createImageData' || k === 'getImageData' ? (a, b) => ({ data: new Uint8ClampedArray(a * b * 4 || 4) }) : k === 'createPattern' ? () => ({ setTransform: noop }) : (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = () => ctx;
    w.Element.prototype.getBoundingClientRect = () => ({ width: 800, height: 500, left: 0, top: 0, right: 800, bottom: 500 });
    w.ResizeObserver = class { observe() {} }; w.matchMedia = () => ({ matches: false, addEventListener() {} });
  } });
const w = dom.window, ev = s => w.eval(s);

/* Pixel sprites, one letter per pixel, every letter a color on a ramp of the qtiles palette, so the shade tool and sel-out work on them.
   Lit from the left: on each form the left is a step lighter, the right a step darker. */
const INKS = { A: '#2a1a12', B: '#5a3624', C: '#8f5a3a', D: '#c68a62', E: '#e8b998', F: '#f6dcc4', t: '#0d3b66', u: '#1f6fb2', v: '#3da5d9', w: '#7ad3e8', y: '#8a5a14', z: '#c98a1b', n: '#2b2d42', o: '#4a4e69', p: '#6c7086', q: '#4a1f1f', r: '#7a2e2a', s: '#b04a3a' };
const FRONT = [
  '.........CCCCCCB........',
  '.......CCCCCCCCBBB......',
  '......CCCCCCCCCCBBB.....',
  '.....CCCCCCCCCCCBBBB....',
  '.....CCCCCCCBBBBBBBB....',
  '.....CCCBBBBBBBBBBBB....',
  '.....CCBBFFEEEEBBEBB....',
  '.....CCBFFFEEEEEEEDB....',
  '.....CBEFFAAEEEAAEDD....',
  '.....CBEFFAAEEEAAEDD....',
  '.....BBEFFEEEEEEEEDD....',
  '.....BBEFEEEEDEEEEDD....',
  '......BDEEEEEEEEEDD.....',
  '.......DEEEEDDDEEDD.....',
  '........DDEEEEEDD.......',
  '..........DDDDD.........',
  '.......wvvvDDDvvuu......',
  '......wwvvvvvvvvuuu.....',
  '.....wwvtvvvvvvvutuu....',
  '.....wvvtvvvvvvvutuut...',
  '.....wvvtvvvvvvuutuut...',
  '.....wvvtvvvvvvuutuut...',
  '.....wvvtvvvvvvuutuut...',
  '.....wvvtvvvvvuuutuut...',
  '.....vvvtzzzzzzyytuut...',
  '.....vvvtvvvvvuuutuut...',
  '.....vvvtvvvvvuuutuut...',
  '.....EEEtvvvvuuuutDDD...',
  '.....FEEDvvvvuuuuuDDD...',
  '.....EEDDtttttttttDDD...',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pooon.oonnn.....',
  '........ssrrr.rrrqq.....',
  '........ssrrr.rrrqq.....',
  '.......sssrrr.rrrqqq....',
  '.......sssrrr.rrrqqq....',
  '.......rrrrrq.rrqqqq....'
];
const BACK = [
  '.........CCCCCCB........',
  '.......CCCCCCCCBBB......',
  '......CCCCCCCCCCBBB.....',
  '.....CCCCCCCCCCCCBBB....',
  '.....CCCCCCCCCCCBBBB....',
  '.....CCCCCCCCCCCBBBB....',
  '.....CCCCCCCCCCBBBBB....',
  '.....CCCCCCCCCCBBBBB....',
  '.....CCCCCCCCCBBBBBB....',
  '.....CCCCCCCCCBBBBBB....',
  '.....CCCCCCCCBBBBBBB....',
  '.....CCCCCCCBBBBBBBB....',
  '......CCCCCBBBBBBBB.....',
  '.......BBBBBBBBBBA......',
  '........BBBBBBAAA.......',
  '..........DDDDD.........',
  '.......wvvvvvvvvuu......',
  '......wwvvvvvvvvuuu.....',
  '.....wwvtvvvvvvvutuu....',
  '.....wvvtvvvvvvvutuut...',
  '.....wvvtvvvvvvuutuut...',
  '.....wvvtvvvvvvuutuut...',
  '.....wvvtvvvvvvuutuut...',
  '.....wvvtvvvvvuuutuut...',
  '.....vvvtzzzzzzyytuut...',
  '.....vvvtvvvvvuuutuut...',
  '.....vvvtvvvvvuuutuut...',
  '.....EEEtvvvvuuuutDDD...',
  '.....FEEDvvvvuuuuuDDD...',
  '.....EEDDtttttttttDDD...',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pppoo.oonnn.....',
  '........pooon.oonnn.....',
  '........ssrrr.rrrqq.....',
  '........ssrrr.rrrqq.....',
  '.......sssrrr.rrrqqq....',
  '.......sssrrr.rrrqqq....',
  '.......rrrrrq.rrqqqq....'
];
/* The same figure at half the size, for a 32 x 16 tile. */
const SMALL = [
  '...CCCCB....',
  '..CCCCCBB...',
  '.CCCCBBBBB..',
  '.CCBFFEEBB..',
  '.CBEFAEAED..',
  '.BBEFEEEED..',
  '..BDEEEDD...',
  '....DDD.....',
  '..wvvvvuu...',
  '.wvtvvvutu..',
  '.wvtvvvutu..',
  '.vvtzzyytu..',
  '.vvtvvuutu..',
  '.EEtvvuutD..',
  '.ED.tttt.D..',
  '...poo.on...',
  '...poo.on...',
  '...poo.on...',
  '...poo.on...',
  '...ssr.rq...',
  '..sssr.rqq..'
];

setTimeout(async () => {
  const fail = () => { console.error(errors.join('\n')); process.exit(1); };
  if (errors.length) fail();
  ev(`
    const EX_INKS = ${JSON.stringify(INKS)};
    /* Plain pixels go through a stroke, like any tool. */
    function sprite(L, rows, x0, y0) {
      for (const r of rows) if (r.length !== rows[0].length) throw new Error('uneven sprite row: ' + r);
      beginStroke(L); rows.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') plotLayer(x0 + x, y0 + y, packHex(EX_INKS[c])); })); endStroke();
    }
    function tiles(L, list, opt) {
      Object.assign(S, { tileRim: 'none', tileH: 0, tileVariants: 4, tileRandom: true }, opt.tile); setColor(opt.color);
      S.tileTex = opt.tex; beginStroke(L); list.sort((p, q) => p[0] + p[1] - q[0] - q[1]).forEach(([i, j]) => tileP(i, j, plotLayer)); endStroke();
    }
    function rect(i0, j0, i1, j1) { const out = []; for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push([i, j]); return out; }
    function layerOf(name, kind) { addLayer(name); const L = activeLayer(); L.kind = kind; return L; }
    function objectLayer(name, kind, shadows) { addObjectLayer(); const L = activeLayer(); L.name = name; L.kind = kind; if (shadows !== undefined) setLayerShadows(L, shadows); return L; }
    function put(id, i, j, turn) {
      const L = activeLayer(), list = libInstance(libFind(id), { a: 2 * i, b: 2 * j, z: 0 }, { turn: turn || 0, flip: false });
      objCommit(L, L.objects.concat(list), list); return list;
    }
    /* A scatter stroke through the same code as the brush. */
    function scatter(opt, pts) {
      Object.assign(S, { scMode: 'paint', scSpacing: 2, scJitter: 40, scSize: 0, scDensity: 100, scTurn: false, scAvoid: true }, opt); syncScatter();
      const d = scNew(activeLayer()); for (const [i, j] of pts) scAddPoint(d, { a: 2 * i, b: 2 * j, z: 0 });
      pvClear(); scCommit(d); S.scVariants = [];
    }
    function terrain(cells) {
      const L = makeLayer('Terrain'); objLayerInit(L); L.kind = 'terrain'; pushHistory(layerListEntry(S.layers.concat(L))); S.active = S.layers.indexOf(L);
      const map = new Map(), look = terrainLook(), key = JSON.stringify(look);
      for (const [i, j, n] of cells) map.set(cellKey(i, j), { i, j, n, look, key });
      terrainCommit(L, map); return L;
    }
    function fresh(w, h, tile, gox, goy, light, name) {
      newDoc(w, h, name); usePalette(PALETTES[0]); syncFlat();
      Object.assign(S, { tile, gox, goy, level: 0, edgeRun: 2, mode: 'iso', mirrorX: false, mirrorY: false, light, tileSeed: 7, scatterSeed: 11, castLen: 100, shadowEdge: 'hard', outN: 4, outSide: 'outside', outColor: 'sel', outSteps: 1 });
      setLight(light); setTool('pencil'); S.layers[0].name = 'Ground'; S.layers[0].kind = 'terrain';
    }
    function character() {
      fresh(320, 208, 64, 160, 40, 'left', 'character');
      tiles(S.layers[0], rect(0, 0, 3, 3), { color: '#7bb661', tex: 'grass', tile: { tileH: 6 } });
      const hero = layerOf('Villager', 'character'), feet = (i, j) => { const c = cellCorner(i, j); return [c.x - 12, c.y + 16 - 44]; };
      sprite(hero, FRONT, ...feet(2, 1)); sprite(hero, BACK, ...feet(1, 2)); flush(hero);
      S.castLen = 50; castShadow(); S.active = S.layers.indexOf(hero); outlineLayer();
      outlineOf(hero).kind = 'character'; S.active = S.layers.indexOf(hero);
    }
    function element() {
      fresh(384, 256, 32, 192, 76, 'right', 'element');
      tiles(S.layers[0], rect(0, 0, 7, 7), { color: '#7bb661', tex: 'grass', tile: { tileH: 8 } });
      objectLayer('Props', 'prop'); put('house', 3, 0); put('well', 5, 4); put('tree-medium', 0, 0); put('crate-stack', 1, 4);
      S.active = S.layers.findIndex(L => L.name === 'Props');
    }
    function scene() {
      fresh(512, 384, 32, 256, 96, 'left', 'scene');
      const g = S.layers[0], sky = makeLayer('Background'); sky.kind = 'background'; S.layers.unshift(sky); S.active = 1;
      const hi = packHex('#7ad3e8'), lo = packHex('#a8e6ef');
      for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) sky.px[y * S.w + x] = bayerOn(x, y, Math.max(0, Math.min(16, Math.round((y - 96) / 16)))) ? lo : hi;
      flush(sky);
      const lake = new Set([[10,1],[11,1],[12,1],[9,2],[10,2],[11,2],[12,2],[9,3],[10,3],[11,3],[12,3],[10,4],[11,4]].map(c => c.join()));
      const path = new Set([...rect(7, 6, 7, 10), ...rect(7, 10, 13, 10)].map(c => c.join()));
      const cells = set => [...set].map(c => c.split(',').map(Number));
      tiles(g, rect(0, 0, 13, 13).filter(c => !lake.has(c.join()) && !path.has(c.join())), { color: '#7bb661', tex: 'grass', tile: { tileH: 8 } });
      tiles(g, cells(path), { color: '#c9ccd6', tex: 'stone', tile: { tileRim: 'lower', tileH: 8 } });
      tiles(g, cells(lake), { color: '#3da5d9', tex: 'water' });
      setColor('#7bb661'); S.terSide = 'dirt'; S.terMat = { materialTop: 'grass' };
      const hill = []; for (let i = 0; i <= 4; i++) for (let j = 8; j <= 13; j++) hill.push([i, j, i <= 2 && j >= 10 ? 2 : 1]);
      terrain(hill); setLayerShadows(activeLayer(), true);
      objectLayer('Props', 'prop'); put('house', 5, 2);
      const fence = { scMode: 'path', scVariants: [{ id: 'fence-run' }], scSpacing: 2, scJitter: 0 };
      scatter(fence, [[5, 6], [7, 6]]); scatter(fence, [[8, 6], [10, 6]]);
      const trees = v => ({ scVariants: v.map(id => ({ id })), scSpacing: 3, scJitter: 25 });
      scatter(Object.assign(trees(['tree-pine', 'tree-medium', 'tree-small']), { scatterSeed: 11 }), [[1, 1], [1, 7]]);
      scatter(Object.assign(trees(['tree-small', 'tree-pine']), { scatterSeed: 12 }), [[4, 1], [4, 4]]);
      scatter(Object.assign(trees(['tree-small', 'bush']), { scatterSeed: 14, scSpacing: 2 }), [[9, 12], [13, 12]]);
      scatter({ scVariants: [{ id: 'tree-pine' }], scJitter: 0 }, [[12, 7]]);
      scatter({ scVariants: [{ id: 'rock' }, { id: 'bush' }], scSpacing: 2, scJitter: 30, scatterSeed: 23 }, [[8, 0], [13, 0]]);
      scatter({ scVariants: [{ id: 'rock' }, { id: 'bush' }], scSpacing: 2, scJitter: 30, scatterSeed: 29 }, [[6, 11], [6, 13]]);
      const hero = layerOf('Villager', 'character'), c = cellCorner(10, 10); sprite(hero, SMALL, c.x - 6, c.y + 8 - 20); flush(hero);
      S.castLen = 50; castShadow(); S.active = S.layers.indexOf(hero); outlineLayer();
      outlineOf(hero).kind = 'character'; S.active = S.layers.indexOf(hero);
    }
  `.replace('function character', 'const FRONT = ' + JSON.stringify(FRONT) + ', BACK = ' + JSON.stringify(BACK) + ', SMALL = ' + JSON.stringify(SMALL) + ';\n    function character'));
  w.eval('window.exBuild = { character, element, scene };');

  /* jsdom has no CompressionStream, so the layers are gzipped here. */
  const writeProject = async file => {
    const o = await ev('serialize()'); delete o.saved;
    for (const L of o.layers) { L.data = zlib.gzipSync(Buffer.from(L.data, 'base64'), { level: 9 }).toString('base64'); L.enc = 'gzip'; }
    const text = JSON.stringify(o); fs.writeFileSync(path.join(out, file), text);
    return { o, text };
  };
  const idx = path.join(out, 'index.json'), list = JSON.parse(fs.readFileSync(idx, 'utf8'));
  const sources = fs.existsSync(artDir) ? fs.readdirSync(artDir).filter(f => f.endsWith('.px')).sort() : [], palettes = JSON.parse(ev('JSON.stringify(PALETTES)'));
  const parsed = [];   // all of them first, so a bad source stops the build with nothing half written
  try {
    for (const f of sources) {
      const p = parsePx(fs.readFileSync(path.join(artDir, f), 'utf8'), palettes, f);
      if (p.id + '.px' !== f) throw new Error(f + ': the file name must be the id, ' + p.id + '.px');
      parsed.push(p);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
  for (const p of parsed) {
    const entry = buildPx(w, p); if (errors.length) fail();
    const { text } = await writeProject(entry.file), at = list.findIndex(e => e.id === entry.id);
    if (at >= 0) list[at] = entry; else list.push(entry);
    console.log(p.id + '.px', p.pixels.length + ' pixels', p.colors + ' colors', p.w + ' x ' + p.h, (text.length / 1024).toFixed(1) + ' KB', entry.layers + ' layers');
  }
  const byId = Object.fromEntries(parsed.map(p => [p.id, p]));
  for (const sc of SCENES) {
    const entry = buildScene(w, sc, byId); if (errors.length) fail();
    const { text } = await writeProject(entry.file), at = list.findIndex(e => e.id === entry.id);
    if (at >= 0) list[at] = entry; else list.push(entry);
    console.log(sc.id, entry.layers + ' layers', entry.objects + ' objects', (text.length / 1024).toFixed(1) + ' KB');
  }
  if (pxOnly) { fs.writeFileSync(idx, JSON.stringify(list, null, 2) + '\n'); process.exit(0); }

  const made = { 'character-placeholder.qtiles.json': 'character', 'element-cottage.qtiles.json': 'element', 'scene-placeholder.qtiles.json': 'scene' };
  const counts = {};
  for (const [file, fn] of Object.entries(made)) {
    const have = path.join(out, file);   // a file with any other project name is the owner's drawing, which this must never replace
    if (fs.existsSync(have) && JSON.parse(fs.readFileSync(have, 'utf8')).name !== fn) { console.log(file, 'kept: it is not a generated placeholder'); continue; }
    w.exBuild[fn](); ev('objRefresh(); shadowTidy(); resetHistory();');
    if (errors.length) fail();
    const { o, text } = await writeProject(file);
    counts[file] = { layers: o.layers.length, objects: o.layers.reduce((n, L) => n + (L.objects ? L.objects.length : 0), 0) };
    console.log(file, (text.length / 1024).toFixed(0) + ' KB', counts[file], o.layers.map(L => L.name + ':' + L.kind + (L.live ? ':live' : '')).join(', '));
  }
  // The counts go into the manifest; everything else there is written by hand.
  for (const e of list) if (counts[e.file]) Object.assign(e, counts[e.file]);
  fs.writeFileSync(idx, JSON.stringify(list, null, 2) + '\n');
  process.exit(0);
}, 400);

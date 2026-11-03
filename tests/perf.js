// Timing budgets, run by npm run perf, not npm test.
const { boot } = require('./boot');

(async () => {
  const t0 = Date.now(), t = await boot(), { ev, fn, check } = t;
  const info = s => console.log('INFO ' + s);
  const budget = (name, r, move) => { info(name + ': full render ' + r.full.toFixed(0) + ' ms, local edit median ' + r.med.toFixed(1) + ' ms'); check(name.replace('5000', '5,000') + ' render in under 1 s', r.full < 1000); check(move + ' stays under 50 ms', r.med < 50); };
  try {
    ev(`window.P = { move(L, apply, n) { const r = rng(8), times = []; for (let k = 0; k < n; k++) { const o = L.objects[Math.floor(r() * L.objects.length)], m = Object.assign({}, o, { i: o.i + 1 }), a = performance.now(); apply(L, L.objects.map(q => q === o ? m : q)); times.push(performance.now() - a); } times.sort((a, b) => a - b); return times[n >> 1]; }, run(L, apply) { return P.run(L, apply); } };`);

    ev(`newDoc(2048, 2048, 'perf'); S.tile = 32; S.gox = 1024; S.goy = 0; addObjectLayer();`);
    const plain = fn(`const r = rng(5), C = ['#3f8a4f', '#e07a5f', '#3da5d9', '#9a9fb5', '#f2b632'].map(lookFrom), list = []; for (let k = 0; k < 5000; k++) list.push(objNew({ id: objSeq++, i: Math.floor(r() * 120), j: Math.floor(r() * 120), z: k % 7 === 0 ? 16 : 0, w: 1 + Math.floor(r() * 6), d: 1 + Math.floor(r() * 6), h: 8 + Math.floor(r() * 48), look: C[k % 5], outline: ['dark', 'sel', 'none'][k % 3] })); const L = activeLayer(); L.objects = list; objRenderAll(L); return P.run(L, objEdit);`);
    budget('5000 boxes on 2048 x 2048', plain, 'moving one');
    const mixed = fn(`const L = activeLayer(), N = Object.keys(SHAPE_DEFS); L.objects = L.objects.map((o, k) => shapeFit(Object.assign({}, o, { type: N[k % N.length], facing: k % 4, w: 4, d: 4 }), { w: 4 })); return P.run(L, objApply);`);
    budget('5000 objects of all shapes', mixed, 'moving one');
    const tex = fn(`const L = activeLayer(), M = Object.keys(MATERIALS).slice(1); objApply(L, L.objects.map((o, k) => Object.assign({}, o, { look: Object.assign({}, o.look, { material: M[k % M.length], seed: 1 }) }))); return P.run(L, objApply);`);
    budget('5000 textured objects', tex, 'moving a textured one');

    ev(`newDoc(2048, 2048, 'shadows'); S.tile = 32; S.gox = 1024; S.goy = 0; S.light = 'left'; addObjectLayer();`);
    const cast = fn(`const L = activeLayer(), q = rng(4), N = Object.keys(SHAPE_DEFS), look = lookFrom('#7bb661'), list = []; for (let k = 0; k < 5000; k++) list.push(shapeFit(objNew({ id: objSeq++, type: N[k % N.length], i: Math.floor(q() * 120), j: Math.floor(q() * 120), w: 4, d: 4, h: 16, facing: k % 4, outline: 'none', look, shadow: true }), { w: 4 })); objEdit(L, list); return P.move(L, objEdit, 30);`);
    info('5000 casting objects: local edit median ' + cast.toFixed(1) + ' ms'); check('moving one of 5,000 casting objects with its shadow, under 50 ms', cast < 50);

    const hills = fn(`const m = new Map(), look = lookFrom('#7bb661'); for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { const v = 2 + Math.sin(i / 6) + Math.cos(j / 5) + Math.sin((i + j) / 9), n = Math.max(0, Math.min(8, Math.round(v * 1.2))); if (n) m.set(cellKey(i, j), { i, j, n, look, key: 'k' }); } const a = performance.now(), n = terrainRects(m).length; return { n, ms: performance.now() - a };`);
    info('64 x 64 terrain: ' + hills.n + ' boxes in ' + hills.ms.toFixed(1) + ' ms'); check('a 64 x 64 rolling map stays under 2,000 boxes', hills.n < 2000);

    ev(`newDoc(1024, 1024, 'scatter'); S.tile = 32; S.level = 0; S.gox = 512; S.goy = 64; usePalette(PALETTES[0]); syncFlat(); addObjectLayer(); setTool('scatter'); Object.assign(S, { scMode: 'paint', scSpacing: 1, scJitter: 100, scVariants: [{ id: 'tree-small' }], scDensity: 100, scAvoid: false });`);
    const trees = fn(`const a = (x, y) => ({ x, y }), s = performance.now(); scatterStart(a(40, 120)); for (let k = 1; k <= 260; k++) scatterMove(a(40 + k * 3.5, 120 + (k % 40) * 8)); scatterEnd(); const ms = performance.now() - s, r = performance.now(); scReroll(); return { ms, reroll: performance.now() - r, n: activeLayer().objects.length };`);
    info('scatter of ' + trees.n + ' trees: ' + trees.ms.toFixed(0) + ' ms, reroll ' + trees.reroll.toFixed(0) + ' ms'); check('scattering 200 trees, and a reroll, take under a second each', trees.n >= 200 && trees.ms < 1000 && trees.reroll < 1000);

    ev(`newDoc(4096, 4096, 'lim'); addLayer(); S.tile = 8; S.z = 8; render(); S.z = 0.125; S.tile = 32; S.ox = S.oy = 0; render();`);
    check('a frame at 4096 x 4096 reads only the tiles it shows', ev('CP.tiles.size') <= 12 && ev('mipLevel(S.z, dpr)') === 3);
    { ev(`resetHistory(); addObjectLayer(); const L = activeLayer(), recs = []; for (let k = 0; k < 500; k++) recs.push(T.box({ i: k % 40, j: (k / 40) | 0, w: 1, d: 1, h: 8 })); window.n0 = H.bytes; objEdit(L, recs); window.n1 = H.bytes; objEdit(L, recs.slice(1)); window.n2 = H.bytes;`);
      info('500 objects on 4096 x 4096 cost ' + ev('n1 - n0') + ' bytes to place and ' + ev('n2 - n1') + ' to delete one'); check('object layers keep only records in history', ev('n1 - n0') < 5000 && ev('n2 - n1') < 9000); }
  } catch (e) { t.errors.push(e.stack || String(e)); }
  t.check('no runtime errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : ''), t.errors.length === 0);
  console.log((t.failed ? t.failed + ' FAILED of ' : 'all PASS, ') + (t.passed + t.failed) + ' timing checks in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(process.exitCode || 0);
})();

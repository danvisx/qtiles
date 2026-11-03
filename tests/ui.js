// Each tool does its main job once, and the interface stays usable.

module.exports = async t => {
  const { ev, check, every, tap, drag, path } = t;
  const fresh = (mode = 'iso') => ev(`T.reset(256, 160, '${mode}'); T.fill(40, 40, 60, 50, '#3f8a4f'); resetHistory(); S.active = 0;`);
  const cell = (i, j) => ev(`(() => { const c = cellCorner(${i}, ${j}); return [c.x, c.y + S.tile / 4]; })()`);
  const count = () => ev('T.painted()'), steps = () => ev('H.pos'), tool = k => ev(`setTool('${k}');`);

  fresh();
  tool('eraser'); { const n = count(); tap(50, 45); check('tool: eraser clears', count() === n - 1); }
  ev(`setColor('#ff0000');`);
  tool('picker'); { const want = ev(`packedHex(S.layers[0].px[45 * S.w + 45])`); ev(`setColor('#123456');`); tap(45, 45); check('tool: picker reads the color under it', ev('S.color') === want); }
  ev(`SEL.wandAll = false;`); tool('wand'); tap(5, 5); check('tool: wand selects by color', ev('SEL.mask !== null')); ev('selectNone();');
  tool('hand'); { const n = steps(), x = ev('S.ox'), h = ev('T.hash(S.layers[0].px)'); drag(100, 100, 140, 120); check('tool: hand pans and draws nothing', ev('S.ox') !== x && steps() === n && ev('T.hash(S.layers[0].px)') === h); }
  fresh(); tool('shadow'); { const n = ev('S.layers.length'); drag(120, 120, 128, 120); check('tool: shadow ellipse makes a linked layer below', ev('S.layers.length') === n + 1 && ev('S.layers[S.active - 1].kind') === 'shadow'); }
  fresh(); ev(`Object.assign(S, { tileTex: 'plain', tileRim: 'none', tileH: 0 }); addLayer(); setTool('tile');`); tap(...cell(3, 2)); check('tool: tile stamps one diamond', count() === 256);
  fresh(); ev(`addObjectLayer();`); ev(`pickShape('box'); S.objH = 16; setTool('place');`); tap(...cell(3, 2)); check('tool: place adds an object', ev('activeLayer().objects.length') === 1);
  tool('pick'); { const [x, y] = ev(`(() => { const L = activeLayer(); for (let i = 0; i < L.ids.length; i++) if (L.ids[i]) return [i % S.w, Math.floor(i / S.w) + 8]; })()`); ev('objSelect(null);'); tap(x, y); check('tool: select picks an object', ev('OB.sel') === ev('activeLayer().objects[0].id')); }
  fresh(); ev(`S.terMode = 'raise'; S.terBrush = 1; setTool('terrain');`); tap(...cell(3, 2)); check('tool: terrain raises a cell', ev(`terrainLayer().objects.length`) === 1);
  fresh(); ev(`addObjectLayer(); Object.assign(S, { scMode: 'paint', scSpacing: 2, scJitter: 0, scAvoid: true, scDensity: 100, scVariants: [{ id: 'tree-small' }] }); setTool('scatter');`); path([[60, 60], [90, 80], [120, 90], [160, 100]]); check('tool: scatter places objects', ev('activeLayer().objects.length') > 0);
  fresh(); ev(`S.layers[0].kind = 'character'; S.pivotMode = 'set'; hooks.layers(); setTool('pivot');`); tap(...cell(3, 2)); check('tool: pivot sets a pivot', !!ev('S.layers[0].pivot'));
  every('every tool in the rail has a row in the panel table and help', ev(`[...document.querySelectorAll('#tools [data-tool], .railview [data-tool]')].map(b => b.dataset.tool)`), k => ev(`!!TOOL_PANELS['${k}'] && TOOL_HELP['${k}'].every(Boolean)`));

  ev(`(() => { closeSheets(); T.reset(352, 224); $('lObj').click(); setTool('place'); $('placeTabLib').click(); $('placeTabShapes').click(); const L = activeLayer(); objApply(L, [{ id: 1, type: 'box', i: 2, j: 2, z: 0, w: 4, d: 4, h: 16, facing: 0, look: { color: S.color } }]); setTool('pick'); objSelect(1); })()`);
  { const r = ev(`(() => { const seen = new Set(), bad = []; for (const open of [() => {}, ...[...document.querySelectorAll('.scrim')].map(s => () => { closeSheets(); openSheet(s.id); })]) { open(); for (const e of document.querySelectorAll('button, input, select, [role=slider], [role=menuitem]')) { if (seen.has(e) || e.type === 'file' || e.hidden || e.closest('#coach') || e.dataset.popClose) continue; seen.add(e); const h = helpFor(e); if (!h.name || (!h.desc && !e.closest('.scrim') && !e.dataset.close)) bad.push(e.id ? e.id : e.outerHTML.slice(0, 140)); } } closeSheets(); return { n: seen.size, bad }; })()`);
    check('every control has a name and a help description (' + r.n + ')' + (r.bad.length ? ', first failing: ' + r.bad[0] : ''), r.n > 300 && r.bad.length === 0); }
  { const rows = 'New Open Reopen Save SaveCopy Resize Export ExportLayers ExportTiles Sprite Frame Backup Recover History TipsOpen Prefs About'.split(' ');
    every('File menu: each row, icon and help', rows, k => ev(`$('fileMenu').querySelectorAll('.mitem').length === ${rows.length} && !!$('f${k}').querySelector('svg') && HELP.some(h => $('f${k}').matches(h[0]))`)); }
  ev('aboutOpen();'); every('About credits every palette with a credit', ev('PALETTES.flatMap(p => p.credit || [])'), c => ev(`$('aboutBody').textContent.includes(${JSON.stringify(c)})`));
  check('no element id repeats', ev(`(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.length === new Set(ids).size; })()`));
  check('each Preferences row resolves to its one row in the dialog', ev(`new Set(PREFS.map(p => p.key)).size === PREFS.length && document.querySelectorAll('.prow').length === PREFS.length && PREFS.every(p => document.querySelector('[data-pref="' + p.key + '"]') && p.label && p.desc && PREF_CATS.some(c => c[0] === p.cat))`));
  check('the app makes no network calls', !/\bfetch\(|XMLHttpRequest/.test(ev('[...document.scripts].map(s => s.textContent).join("\\n")').replace(/EX_DATA\.files\[.*$/gm, '')));
  const ids = JSON.parse(ev('JSON.stringify(EX_DATA.list.map(e => e.id))'));
  { let bad, flat = 0, wrong; for (const id of ids) { ev('setDirty(false);'); await ev(`exOpen(${JSON.stringify(id)})`); if (ev(`S.example`) !== id || !ev(`S.layers.length`) || !ev(`S.layers.some(L => T.painted(L))`)) { bad = id; break; } if (ev(`exFind(S.example).mode === '2d'`)) { flat++; if (!ev(`S.mode === 'flat' && S.sizeLock && S.cell === 1 && exStages().length === 5`)) wrong = wrong || id; } } check('every example loads (' + ids.length + ')' + (bad ? ', first failing: ' + bad : ''), !bad && ids.length > 20); check('every 2D example opens in 2D, locked, with its stages (' + flat + ')' + (wrong ? ', first failing: ' + wrong : ''), !wrong && flat >= 4); }
  ev('setDirty(false); closeSheets();');
};

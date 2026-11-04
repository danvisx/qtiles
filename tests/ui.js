// Each tool does its main job once, and the interface stays usable.

module.exports = async t => {
  const { ev, fn, check, every, tap, drag } = t;
  const fresh = (mode = 'iso') => ev(`T.reset(256, 160, '${mode}'); T.fill(40, 40, 60, 50, '#3f8a4f'); resetHistory(); S.active = 0;`);
  const cell = (i, j) => fn(`const c = cellCorner(${i}, ${j}); return [c.x, c.y + S.tile / 4];`);
  const count = () => ev('T.painted()'), steps = () => ev('H.pos'), tool = k => ev(`setTool('${k}');`);

  fresh();
  tool('eraser'); { const n = count(); tap(50, 45); const a = count() === n - 1, want = ev(`packedHex(T.l0.px[45 * S.w + 45])`); ev(`setColor('#123456');`); tool('picker'); tap(45, 45); check('tool: eraser clears, picker reads the color', a && ev('S.color') === want); }
  ev(`SEL.wandAll = false;`); tool('wand'); tap(5, 5); { const a = ev('!!SEL.mask'), n = steps(); tool('pencil'); tap(-2, -2); const b = !ev('SEL.mask') && steps() === n; tool('marquee'); drag(-2, -2, 6, 5); check('tool: wand selects; a tap outside clears, a drag selects', a && b && ev("Object.values(SEL.box) + ''") === '0,0,6,5'); } ev('selectNone();');
  tool('hand'); { const n = steps(), x = ev('S.ox'), h = ev('T.h0'); drag(100, 100, 140, 120); check('tool: hand pans and draws nothing', ev('S.ox') !== x && steps() === n && ev('T.h0') === h); }
  ev(`T.reset(32, 32, 'flat'); Object.assign(S, { z: 10, ox: 240 }); viewSet('flip');`); tap(5, 9);
  check('Flip paints the pixel shown; gray is Rec. 709; silhouette keeps alpha', fn(`viewSet('flip'); return T.l0.px[314] && T.painted() === 1 && grayPx(0xff0000ff) === 0xff363636 && grayPx(0xff00ff00) === 0xffb6b6b6 && !silPx(0, 5) && silPx(0x80aabbcc, 0x123456) === 0x80123456;`));
  fresh(); tool('shadow'); { const n = ev('S.layers.length'); drag(120, 120, 128, 120); const a = ev(`S.layers.length === ${n + 1} && S.layers[S.active - 1].kind === 'shadow'`);
    fresh(); ev(`T.l0.kind = 'character'; S.pivotMode = 'set'; hooks.layers(); setTool('pivot');`); tap(...cell(3, 2)); check('tool: shadow adds a linked layer below; pivot sets one', a && !!ev('T.l0.pivot')); }
  fresh(); ev(`addObjectLayer(); pickShape('box'); S.objH = 16; setTool('place');`); tap(...cell(3, 2));
  tool('pick'); { const [x, y] = fn(`const L = T.L(); for (let i = 0; i < L.ids.length; i++) if (L.ids[i]) return [i % S.w, Math.floor(i / S.w) + 8];`); ev('objSelect(null);'); tap(x, y); const a = ev('OB.sel') === ev('T.L().objects[0].id'); tool('place'); tap(-2, -2); check('tool: select picks an object; a tap outside drops it', a && ev('OB.sel === null && T.L().objects.length === 1')); }
  every('each rail tool has a panel row and help', ev(`[...document.querySelectorAll('#tools [data-tool], .railview [data-tool]')].map(b => b.dataset.tool)`), k => ev(`!!TOOL_PANELS['${k}'] && TOOL_HELP['${k}'].every(Boolean)`));

  fn(`closeSheets(); T.reset(352, 224); $('lObj').click(); setTool('place'); $('placeTabLib').click(); $('placeTabShapes').click(); const L = T.L(); objApply(L, [{ id: 1, type: 'box', i: 2, j: 2, z: 0, w: 4, d: 4, h: 16, facing: 0, look: { color: S.color } }]); setTool('pick'); objSelect(1);`);
  { const r = fn(`const seen = new Set(), bad = []; for (const open of [() => {}, ...[...document.querySelectorAll('.scrim')].map(s => () => { closeSheets(); openSheet(s.id); })]) { open(); for (const e of document.querySelectorAll('button, input, select, [role=slider], [role=menuitem]')) { if (seen.has(e) || e.type === 'file' || e.hidden || e.closest('#coach') || e.dataset.popClose) continue; seen.add(e); const h = helpFor(e); if (!h.name || (!h.desc && !e.closest('.scrim') && !e.dataset.close)) bad.push(e.id || e.outerHTML.slice(0, 140)); } } closeSheets(); return { n: seen.size, bad };`);
    check('every control has a name and a help description (' + r.n + ')' + (r.bad.length ? ', first failing: ' + r.bad[0] : ''), r.n > 300 && r.bad.length === 0); }
  { const rows = 'New Open Reopen Ref Save SaveCopy Resize Export ExportLayers ExportTiles Sprite Frame Backup Recover History TipsOpen Prefs About'.split(' ');
    every('File menu: each row, icon and help', rows, k => ev(`$('fileMenu').querySelectorAll('.mitem').length === ${rows.length} && !!$('f${k}').querySelector('svg') && HELP.some(h => $('f${k}').matches(h[0]))`)); }
  ev('aboutOpen();'); every('About credits every palette with a credit', ev('PALETTES.flatMap(p => p.credit || [])'), c => ev(`$('aboutBody').textContent.includes(${J(c)})`));
  check('tips: unique ids, title and body, links there; old ticks show', fn(`const a = TIPS.flatMap(s => s.tips); S.checklist = 'lines light faces palette ramps pixels seams feet shadows outline'.split(' '); tipsShow(true); const n = $('tipsBody').querySelectorAll(':checked').length; tipsShow(false); S.checklist = []; return new Set(a.map(t => t.id)).size === a.length && a.every(t => t.title && t.body && tipLinks(t).every(tipLinkOk)) && n === 10;`));
  check('analytics: SITE.host only, a token, no GPC', fn(`const h = SITE.host, k = SITE.analytics, a = siteBeacon(h) && !siteBeacon(h, 1) && !siteBeacon('localhost'); SITE.analytics = ''; const b = !siteBeacon(h); SITE.analytics = k; return a && b;`));
  check('no element id repeats', fn(`const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.length === new Set(ids).size;`));
  check('each Preferences row is once in the dialog', ev(`new Set(PREFS.map(p => p.key)).size === PREFS.length && document.querySelectorAll('.prow').length === PREFS.length && PREFS.every(p => document.querySelector('[data-pref="' + p.key + '"]') && p.label && p.desc && PREF_CATS.some(c => c[0] === p.cat))`));
  check('the app makes no network calls', !/\bfetch\(|XMLHttpRequest/.test(ev('[...document.scripts].map(s => s.textContent).join("\\n")').replace(/EX_DATA\.files\[.*$/gm, '')));
  const ids = JSON.parse(ev('J(EX_DATA.list.map(e => e.id))'));
  { let bad, flat = 0, wrong; for (const id of ids) { ev('setDirty(false);'); await ev(`exOpen(${J(id)})`); if (ev(`S.example`) !== id || !ev(`S.layers.length`) || !ev(`S.layers.some(L => T.painted(L))`)) { bad = id; break; } if (ev(`exFind(S.example).mode === '2d'`)) { flat++; if (!ev(`S.mode === 'flat' && S.sizeLock && S.cell === 1 && exStages().length === 5`)) wrong = wrong || id; } } bad = bad || wrong; check('every example loads; 2D ones in 2D, locked, staged (' + ids.length + ', ' + flat + ')' + (bad ? ', first failing: ' + bad : ''), !bad && ids.length > 20 && flat >= 4); }
  ev('setDirty(false); closeSheets();');
};

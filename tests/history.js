// Undo and redo are exact, comparing pixels and records.

module.exports = async t => {
  const { ev, w, check, wait, undoExact, drag, tap } = t;
  const art = `T.fill(10, 10, 30, 20, '#3f8a4f'); T.fill(14, 14, 40, 30, '#ff0000'); resetHistory();`;
  const fresh = () => ev(`T.reset(96, 64); ${art}`);

  fresh();
  check('undo: pencil stroke', undoExact(() => { ev(`setTool('pencil'); setBrush(3); setColor('#0000ff');`); drag(5, 5, 50, 30); }));
  ev('setBrush(1);');
  t.every('undo: line and rectangle', [['line', 2, 2, 40, 21], ['rect', 50, 10, 80, 40]], ([k, ...p]) => undoExact(() => { ev(`setTool('${k}');`); drag(...p); }));
  check('undo: fill', undoExact(() => { ev(`S.fillAll = false; setTool('fill'); setColor('#00ff00');`); tap(60, 50); }));
  check('undo: a stroke that grows the canvas steps back through it', undoExact(() => { ev(`setTool('pencil');`); drag(90, 30, 110, 30); }, { steps: 3 }));

  t.every('undo: add and duplicate a layer', ['addLayer()', 'dupLayer()'], undoExact);
  ev(`addLayer('Top'); T.fill(0, 0, 20, 20, '#0000ff'); resetHistory();`);
  t.every('undo: move, merge down and delete a layer', ['moveLayer(-1)', 'mergeDown()', 'deleteLayer()'], undoExact);
  check('undo: group, group edit, ungroup', (() => { const mark = `LG.marks = new Set(S.layers.map(L => L.id)); hooks.layers();`; ev(mark); const a = undoExact('groupMake()'); ev(mark + 'groupMake(); resetHistory();'); const b = undoExact(`groupEdit(S.groups[0].id, { opacity: 0.5, name: 'x' })`), c = undoExact('ungroup(S.groups[0])'); return a && b && c; })());
  fresh();
  check('undo: outline and cast shadow, which add linked layers', undoExact(`S.outSide = 'outside'; outlineLayer()`) && undoExact('castShadow()'));

  fresh();
  const selHash = () => ev('SEL.mask ? T.hash(SEL.mask) : 0');
  { ev(`setTool('marquee');`); drag(8, 8, 32, 24); const m = selHash(); const ok = undoExact(() => { drag(14, 14, 60, 40); t.key('Enter'); }); check('undo: moving a selection, and the selection with it', ok && selHash() === m); ev('selectNone();'); }
  check('undo: transform of a layer', undoExact(`transform('rot90')`));
  ev('selectContent(); copySel(); selectNone();');
  ev(`S.active = 0; setTool('marquee'); pasteBuf(clip, { x: 70, y: 50 });`);
  { const a = t.doc(); ev('undo();'); check('undo during a float cancels it and leaves the art', ev('FL') === null && t.doc() === a); ev('selectNone();'); }

  ev(`T.reset(256, 160); addObjectLayer(); setTool('pick'); objEdit(T.L(), [T.box({ i: 2, j: 2, w: 4, d: 4, h: 16, shadow: true }), T.box({ i: 8, j: 2, w: 2, d: 2, h: 24 })]); resetHistory();`);
  check('undo: object edit', undoExact(`objEdit(T.L(), T.L().objects.map((o, n) => n ? o : Object.assign({}, o, { i: 3, h: 32 })))`));
  check('undo: under a light set after the edit', (() => { ev(`objEdit(T.L(), T.L().objects.slice(1)); setLight('right');`); const a = t.doc(); ev('undo(); redo();'); const ok = t.doc() === a && ev('T.fullSame()'); ev(`setLight('left'); undo();`); return ok; })());
  check('undo: resize under object layers redraws them', undoExact('extendBy(32, 16, 0, 0)') && ev('T.fullSame()'));
  check('undo: bake', undoExact('bakeObjects()') && ev('T.L().objectLayer') === true);
  ev(`objSelectMany(T.L().objects.map(o => o.id));`);
  check('undo: make, turn and mirror an assembly', undoExact('asmMake()') && (ev(`asmMake(); objSelectMany(T.L().objects.map(o => o.id)); resetHistory();`), undoExact('asmTurn(1)') && undoExact('asmFlip()')));

  { ev(`T.reset(96, 64); ${art} addObjectLayer(); objEdit(T.L(), [T.box({ i: 1, j: 1, w: 4, d: 4, h: 16 })]); S.active = 0; resetHistory();`);
    const h = ev('H.pos'), plain = ev('T.hash(T.l0.px)'), objs = ev('T.hash(S.layers[1].px)');
    ev(`usePalette(PALETTES[12]); syncFlat(); objRefresh();`); const moved = ev('T.hash(S.layers[1].px)'); ev(`usePalette(PALETTES[0]); syncFlat(); objRefresh();`);
    check('a palette change is no undo step, and back restores objects', moved !== objs && ev(`H.pos === ${h} && T.hash(T.l0.px) === ${plain} && T.hash(S.layers[1].px) === ${objs}`)); }

  /* Big steps shrink behind a queue, and unpacking takes as long as it takes. */
  ev(`window.pipe0 = pipe; pipe = async (u8, s) => s.gz ? window.gz(u8) : window.gunz(u8); window.CompressionStream = class { constructor() { this.gz = true; } }; window.DecompressionStream = class { };`);
  w.gz = b => new w.Uint8Array(t.gz(b));
  w.gunz = b => { const z = t.gunz(b), c = new w.Uint8Array(z.length); c.set(z); return c; };
  const settle = async () => { await ev('packQueue'); await wait(1); };
  const stepped = async op => { const p = ev('H.pos'); ev(op); for (let k = 0; k < 400 && (ev('H.busy') || ev('H.pos') === p); k++) await wait(5); await settle(); };
  ev(`newDoc(800, 800, 'pk'); T.l0.px.fill(packHex('#ff0000'), 0, 90000); flush(T.l0); addLayer('b'); S.layers[1].px.fill(packHex('#00ff00'), 40000, 200000); flush(S.layers[1]); resetHistory();`);
  { const a = t.doc(); ev('mergeDown();'); const b = t.doc(); await settle(); const small = !!ev('H.stack[0].gz') && ev('H.bytes') < 1e6;
    await stepped('undo()'); const u = t.doc() === a; await stepped('redo()'); check('a merge shrinks in history and undoes and redoes exactly', small && u && t.doc() === b); await stepped('undo()'); }
  ev('resetHistory();');
  { const a = t.doc(); ev('extendBy(50, 50, 0, 0);'); const b = t.doc(); await settle(); const gone = ev('H.stack[0].gz.every(g => g.o[g.k] === null)');
    await stepped('undo()'); const u = t.doc() === a; await stepped('redo()'); const r = t.doc() === b; await stepped('undo()');
    ev('resetHistory(); extendBy(10, 0, 0, 0); extendBy(10, 0, 0, 0);'); await settle(); await stepped('undo()'); await stepped('undo()'); check('resizes shrink in history, share no layers, and undo exactly', gone && u && r && t.doc() === a); }
  ev(`pipe = pipe0; delete window.CompressionStream; window.DecompressionStream = class {}; newDoc(64, 64, 'h'); resetHistory();`);
  { const big = n => ev(`pushHistory({ bytes: ${n}, undo() {}, redo() {} })`); big(100e6); big(40e6); big(40e6); const a = ev('H.stack.length === 2 && H.bytes === 80e6'); ev('resetHistory()'); big(200e6); check('history drops the oldest steps over its cap, never the newest', a && ev('H.stack.length') === 1); ev('resetHistory(); setDirty(false);'); }
};

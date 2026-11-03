// Turns a scripts/example_art/*.px source into an example project. Not part of the product. app/examples/README.md documents the format.
// parsePx is plain Node, so a bad source fails before the app is involved. buildPx runs inside a loaded app, so the outline, shadow and mirror are the app's own result.
const STAGES = ['1 Block-in', '2 Base colors', '3 Shading', '4 Details', '5 Outline'];
const CATEGORIES = ['scenery', 'characters', 'animals', 'transport', 'objects'], LIGHTS = ['left', 'right', 'overhead'], MODES = ['iso', '2d'], OUTLINES = { sel: 'sel', darkest: 'dark' };
const REQUIRED = ['id', 'title', 'category', 'order', 'lesson', 'skills', 'light', 'palette'];
const KNOWN = REQUIRED.concat('tile', 'facings', 'shadow', 'cast', 'after', 'path', 'anchor', 'author', 'mode', 'lock', 'outline');
const TIPS_MIN = 3, TIPS_MAX = 5, MARGIN = 2, TILE_2D = 32;   // the margin holds the outline and keeps the art off the canvas edge. A 2D piece has none: its rows are the canvas

const midOf = ramp => ramp.colors[Math.floor(ramp.colors.length / 2)];

function parsePx(text, palettes, file = 'example.px') {
  const bad = (n, msg) => { throw new Error(file + (n ? ' line ' + n : '') + ': ' + msg); };
  const head = {}, legend = {}, rows = [], tips = [];
  let part = 'head', palette = null;
  const paletteOf = n => palette || (palette = palettes.find(p => p.name === head.palette) || bad(n, 'no palette called "' + head.palette + '" (there are ' + palettes.map(p => p.name).join(', ') + ')'));

  text.split('\n').forEach((raw, k) => {
    const line = raw.trim(), n = k + 1, field = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!line || line[0] === '#') return;
    if (line === 'legend:' || line === 'art:') { part = line.slice(0, -1); return; }
    if (field && field[1] === 'tip') {
      part = 'tail'; const [stage, title, say, tool, more] = field[2].split('|').map(s => s.trim()), seam = /^seam (\d+) (\d+)$/.exec(more || '');
      if (!/^[0-5]?$/.test(stage)) bad(n, 'a tip starts with its stage, 1 to 5, or nothing for the finished piece');
      if (!title || !say) bad(n, 'a tip is: stage | title | text');
      if (more && !seam) bad(n, 'after the tool a tip can only have: seam i j');
      tips.push({ stage: Number(stage), title, text: say, tool, seam: seam ? [Number(seam[1]), Number(seam[2])] : undefined }); return;
    }
    if (part === 'head') {
      if (!field) bad(n, 'expected "name: value"');
      if (!KNOWN.includes(field[1])) bad(n, 'unknown header "' + field[1] + '"');
      head[field[1]] = field[2]; return;
    }
    if (part === 'legend') {
      const m = /^([A-Za-z])\s*=\s*(.+?)\s+(\d+)$/.exec(line); if (!m) bad(n, 'a legend line is: a = Ramp name 3');
      const ramp = paletteOf(n).ramps.find(r => r.name === m[2]);
      if (!ramp) bad(n, 'palette "' + palette.name + '" has no ramp "' + m[2] + '" (it has ' + palette.ramps.map(r => r.name).join(', ') + ')');
      const step = Number(m[3]); if (step < 1 || step > ramp.colors.length) bad(n, 'ramp "' + m[2] + '" has steps 1 to ' + ramp.colors.length + ', not ' + step);
      if (legend[m[1]]) bad(n, 'letter ' + m[1] + ' is in the legend twice');
      legend[m[1]] = { ramp, color: ramp.colors[step - 1] }; return;
    }
    if (part === 'art') {
      if (rows.length && line.length !== rows[0].length) bad(n, 'row is ' + line.length + ' wide, the first row is ' + rows[0].length);
      const letter = [...line].find(c => c !== '.' && !legend[c]); if (letter) bad(n, 'letter ' + letter + ' is not in the legend');
      rows.push(line); return;
    }
    bad(n, 'expected a tip');
  });

  for (const f of REQUIRED) if (!head[f]) bad(0, 'the header needs "' + f + '"');
  if (!rows.length) bad(0, 'there are no art rows');
  if (!CATEGORIES.includes(head.category)) bad(0, 'category must be one of ' + CATEGORIES.join(', '));
  if (!LIGHTS.includes(head.light)) bad(0, 'light must be one of ' + LIGHTS.join(', '));
  const mode = head.mode || 'iso', flat = mode === '2d';
  if (!MODES.includes(mode)) bad(0, 'mode must be one of ' + MODES.join(', '));
  if (head.lock && !['true', 'false'].includes(head.lock)) bad(0, 'lock must be true or false');
  if (head.outline && !OUTLINES[head.outline]) bad(0, 'outline must be one of ' + Object.keys(OUTLINES).join(', '));
  if (flat && (head.facings || head.shadow || head.anchor || head.tile)) bad(0, 'a 2D piece has no tile, facings, shadow or anchor');
  if (!flat && !head.tile) bad(0, 'the header needs "tile"');
  const tile = flat ? TILE_2D : Number(head.tile), order = Number(head.order), facings = Number(head.facings || 1);
  if (!Number.isInteger(tile) || tile % 4 || tile < 8 || tile > 256) bad(0, 'tile must be a multiple of 4 from 8 to 256');
  if (!Number.isFinite(order)) bad(0, 'order must be a number');
  if (facings !== 1 && facings !== 2) bad(0, 'facings must be 1 or 2');
  if (head.shadow && !['true', 'false'].includes(head.shadow)) bad(0, 'shadow must be true or false');
  if (tips.length < TIPS_MIN || tips.length > TIPS_MAX) bad(0, TIPS_MIN + ' to ' + TIPS_MAX + ' tips are needed, this has ' + tips.length);

  const cast = Number(head.cast || 100), after = (head.after || '').split(/[ ,]+/).filter(Boolean);
  if (!Number.isInteger(cast) || cast < 25 || cast > 200) bad(0, 'cast is a shadow length, 25 to 200 percent');
  const lost = after.find(c => !legend[c]); if (lost) bad(0, 'after: letter ' + lost + ' is not in the legend');
  const pixels = [], use = new Map();
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === '.') return; const q = legend[c];
    pixels.push({ x, y, letter: c, color: q.color, base: midOf(q.ramp), detail: c !== c.toLowerCase(), after: after.includes(c) });
    use.set(q.ramp, (use.get(q.ramp) || 0) + 1);
  }));
  if (!pixels.length) bad(0, 'the art is empty');
  if (flat && pixels.some(q => !q.after && (!q.x || !q.y || q.x === rows[0].length - 1 || q.y === rows.length - 1))) bad(0, 'a 2D piece leaves its outermost pixels empty, for the outline');
  const main = [...use].sort((a, b) => b[1] - a[1])[0][0], w = rows[0].length, h = rows.length, block = midOf(main);
  const xs = pixels.filter(q => !q.after).map(q => q.x), bottom = Math.max(...pixels.map(q => q.y));
  // two facings need feet on a cell center, and the middle of the art at its lowest row is where the pivot goes
  const anchor = head.anchor ? head.anchor.split(/[ ,]+/).map(Number) : facings === 2 ? [Math.floor((Math.min(...xs) + Math.max(...xs) + 1) / 2), bottom + 1 - tile / 4] : [Math.floor(w / 2), 0];
  if (anchor.length !== 2 || anchor.some(v => !Number.isInteger(v))) bad(0, 'anchor is the art pixel on a tile corner: x, y');
  return {
    id: head.id, title: head.title, category: head.category, order, lesson: head.lesson, skills: head.skills.split(',').map(s => s.trim()).filter(Boolean),
    tile, light: head.light, palette: head.palette, facings, shadow: head.shadow === 'true', cast, path: head.path || undefined, author: head.author || 'claude',
    mode, lock: head.lock === 'true', outline: OUTLINES[head.outline || 'sel'], margin: flat ? 0 : MARGIN, w, h, anchor, block, pixels, tips, colors: new Set(pixels.map(q => q.color)).size
  };
}

/* Runs inside the app, as the same steps a person would take. */
function inApp(p, STAGES) {
  const M = p.margin, flat = p.mode === '2d';
  newDoc(p.w + 2 * M, p.h + 2 * M, p.id); usePalette(PALETTES.find(q => q.name === p.palette)); syncFlat();
  Object.assign(S, { tile: p.tile, gox: flat ? 0 : M + p.anchor[0], goy: flat ? 0 : M + p.anchor[1], cell: flat ? 1 : S.cell, level: 0, edgeRun: 2, mode: flat ? 'flat' : 'iso', mirrorX: false, mirrorY: false, tileSeed: 7, castLen: p.cast, shadowEdge: 'hard', outN: 4, outSide: 'outside', outColor: p.outline, outSteps: 1 });
  setLight(p.light); setTool('pencil');
  const kind = flat ? 'layer' : p.facings === 2 || p.category === 'characters' || p.category === 'animals' ? 'character' : 'prop';
  const group = { id: layerSeq++, name: p.title, collapsed: false, visible: true, locked: false, opacity: 1 };
  S.groups = [...S.groups, group]; S.layers[0].name = STAGES[0]; S.layers[0].group = group.id;
  STAGES.slice(1, 4).forEach(name => addLayer(name));
  const paint = (name, list, color) => { const L = S.layers.find(x => x.name === name); beginStroke(L); for (const q of list) plotLayer(M + q.x, M + q.y, packHex(color(q))); endStroke(); L.kind = kind; flush(L); return L; };
  paint(STAGES[0], p.pixels, () => p.block);
  paint(STAGES[1], p.pixels, q => q.base);
  paint(STAGES[2], p.pixels.filter(q => !q.detail), q => q.color);
  const art = paint(STAGES[3], p.pixels.filter(q => !q.after), q => q.color).id, arrange = id => { S.active = S.layers.findIndex(L => L.id === id); };
  const outline = (id, name) => {   // the Outline button, then the outline above its source so the layer list reads in build order
    arrange(id); outlineLayer(); const src = layerById(id), O = outlineOf(src); O.name = name; O.kind = kind;
    S.layers.splice(S.layers.indexOf(O), 1); S.layers.splice(S.layers.indexOf(src) + 1, 0, O);
  };
  if (p.shadow) { arrange(art); castShadow(); shadowOf(layerById(art)).name = 'Shadow'; }
  outline(art, STAGES[4]);
  { const L = layerById(art); beginStroke(L); for (const q of p.pixels) if (q.after) plotLayer(M + q.x, M + q.y, packHex(q.color)); endStroke(); flush(L); }   // a dither pattern added after the outline, which would otherwise fill its gaps
  if (p.facings === 2) {   // the twin keeps a pivot of its own, a whole number of tiles along, so Update mirror leaves it beside the original
    const hit = contentBox(layerById(art)), steps = Math.ceil((hit.x1 - hit.x0 + 1 + 2 * M) / S.tile), pivot = { x: Math.floor((hit.x0 + hit.x1 + 1) / 2), y: hit.y1 + 1 };
    layerById(art).pivot = pivot; arrange(art); mirrorFacing();
    const twin = mirrorsOf(layerById(art))[0]; twin.name = 'Mirrored'; twin.pivot = { x: pivot.x + steps * S.tile, y: pivot.y };
    arrange(twin.id); mirrorUpdate(); outline(twin.id, 'Mirrored outline');
    if (p.shadow) { arrange(twin.id); castShadow(); shadowOf(layerById(twin.id)).name = 'Mirrored shadow'; }
  }
  S.layers.forEach(L => { if (STAGES.slice(0, 3).includes(L.name)) L.visible = false; });
  S.sizeLock = p.lock; arrange(art); hooks.layers(); shadowTidy(); resetHistory();
  let x0 = S.w, y0 = S.h, x1 = -1, y1 = -1;
  for (const L of S.layers) { const b = L.visible && contentBox(L); if (b) { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); } }
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/* Runs inside the app, after the make_examples.js helpers. Each part is a layer of its own, feet on a cell center, drawn with the same outline as the example.
   The sprites cast nothing, so plain boxes on a layer at 0 opacity stand in for them: those cast the live shadows. */
function inScene(sc, parts) {
  newDoc(sc.w, sc.h, sc.id); usePalette(PALETTES.find(q => q.name === sc.palette)); syncFlat();
  Object.assign(S, { tile: sc.tile, gox: sc.gox, goy: sc.goy, level: 0, edgeRun: 2, mode: 'iso', mirrorX: false, mirrorY: false, tileSeed: 7, outN: 4, outSide: 'outside', outColor: 'sel', outSteps: 1, sizeLock: true });
  setLight(sc.light); setTool('pencil');
  const ground = S.layers[0]; ground.name = 'Ground'; ground.kind = 'terrain';
  const near = new Map(), inPalette = hex => {   // a part keeps its look in the scene's palette, so every pixel stays on a ramp
    if (!near.has(hex)) { const c = hexToRgb(hex), d = h => hexToRgb(h).reduce((n, v, k) => n + (v - c[k]) ** 2, 0); near.set(hex, S.palette.reduce((a, b) => d(b) < d(a) ? b : a)); }
    return near.get(hex);
  };
  if (sc.fill) { beginStroke(ground); for (const [x0, y0, x1, y1, hex] of sc.fill) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) plotLayer(x, y, packHex(hex)); endStroke(); flush(ground); }
  for (const t of sc.ground) tiles(ground, t.cells, { color: t.color, tex: t.tex, tile: t.tile || {} });
  if (sc.marks) { beginStroke(ground); for (const m of sc.marks) for (const [x, y] of m.pixels) plotLayer(x, y, packHex(m.color)); endStroke(); flush(ground); }
  if (sc.objects) { objectLayer('Buildings', 'prop'); for (const [id, i, j, turn] of sc.objects) put(id, i, j, turn); }
  const stand = objectLayer('Shadow shapes', 'prop', true), look = lookFrom(S.palette[0]), boxes = [];
  for (const q of sc.parts) if (q.stand) { const [w, d, h] = q.stand; boxes.push(objNew({ id: objSeq++, i: Math.round(2 * q.at[0] + 1 - w / 2) / 2, j: Math.round(2 * q.at[1] + 1 - d / 2) / 2, z: q.z || 0, w, d, h, look, outline: 'none', shadow: true })); }
  objCommit(stand, boxes, boxes);
  const deep = q => q.at ? q.at[0] + q.at[1] : Infinity;   // a part placed by `xy` stands off the grid, in front of it
  const order = sc.parts.map((q, k) => [q, k]).sort((a, b) => deep(a[0]) - deep(b[0]) || (a[0].z || 0) - (b[0].z || 0) || a[1] - b[1]).map(a => a[0]);
  for (const q of order) {
    const p = parts[q.of], L = layerOf(q.name, q.kind || 'prop'), xs = p.pixels.map(r => r.x), ys = p.pixels.map(r => r.y);
    const c = q.xy ? { x: q.xy[0], y: q.xy[1] - S.tile / 4 } : cellCorner(q.at[0], q.at[1]), [footX, footY] = q.xy ? [Math.min(...xs), Math.max(...ys) + 1] : q.foot || [p.anchor[0], p.anchor[1] + p.tile / 4];   // xy: the left edge and the row the art stands on
    const x0 = c.x + (q.dx || 0), y0 = c.y + S.tile / 4 - (q.z || 0) + (q.dy || 0), at = r => [x0 + (q.flip ? footX - 1 - r.x : r.x - footX), y0 + r.y - footY];
    const keep = p.pixels.filter(r => !(q.drop || '').includes(r.letter)), put1 = list => { for (const r of list) { const [x, y] = at(r); plotLayer(x, y, packHex(inPalette(r.color))); } };
    beginStroke(L); put1(keep.filter(r => !r.after)); endStroke(); flush(L);
    const line = []; outlineP(L, (x, y, v) => line.push([x, y, v])); beginStroke(L); for (const [x, y, v] of line) plotLayer(x, y, v); put1(keep.filter(r => r.after)); endStroke(); flush(L);
  }
  for (const s of sc.sprites || []) {
    const L = layerOf(s.name, s.kind || 'prop'); beginStroke(L);
    for (const [px, py] of s.at) s.rows.forEach((r, y) => [...r].forEach((k, x) => { if (k !== '.') plotLayer(px + x, py + y, packHex(s.inks[k])); }));
    endStroke(); flush(L); if (s.outline) { const line = []; outlineP(L, (x, y, v) => line.push([x, y, v])); beginStroke(L); for (const [x, y, v] of line) plotLayer(x, y, v); endStroke(); flush(L); }
  }
  stand.opacity = 0; S.sizeLock = false; S.active = S.layers.indexOf(ground); objRefresh(); hooks.layers(); shadowTidy(); resetHistory();
}
function buildScene(w, sc, parts) {
  w.eval('(' + inScene + ')')(sc, parts);
  const read = s => w.eval(s);
  return { id: sc.id, title: sc.title, tier: 'Scene', category: 'scenery', size: 'scene', order: sc.order, lesson: sc.lesson, summary: sc.lesson, skills: sc.skills, author: sc.author || 'claude',
    parts: [...new Set(sc.parts.map(q => q.of))], file: sc.id + '.qtiles.json', tips: sc.tips, ...(sc.cover ? { cover: true } : {}), layers: read('S.layers.length'), objects: read('S.layers.reduce((n, L) => n + (L.objects ? L.objects.length : 0), 0)') };
}

/* Leaves the project open in the app and returns its manifest entry. */
function buildPx(w, p) {
  const box = w.eval('(' + inApp + ')')(p, STAGES), read = s => w.eval(s);
  const m = read('Math.max(S.w, S.h)'), size = m <= 32 ? 'tiny' : m <= 64 ? 'small' : m <= 160 ? 'medium' : 'scene';
  const tips = p.tips.map(t => ({ title: t.title, text: t.text, show: Object.assign(t.tool ? { tool: t.tool } : {}, t.seam ? { seam: t.seam } : {}, { stage: t.stage, region: [...box] }) }));
  const entry = { id: p.id, title: p.title, category: p.category, size, order: p.order, lesson: p.lesson, summary: p.lesson, skills: p.skills, stages: STAGES, author: p.author, box: [...box], file: p.id + '.qtiles.json', tips };
  if (p.path) entry.path = p.path;
  if (p.mode === '2d') entry.mode = p.mode;
  entry.layers = read('S.layers.length'); entry.objects = 0;
  return entry;
}

module.exports = { parsePx, buildPx, buildScene, STAGES };

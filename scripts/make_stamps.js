// Turns scripts/stamp_art/*.px into app/library/stamps.js. Not part of the product; build_artifact.py runs it when a source changes.
// Plain Node: the palettes come from the app's own core.js and palettes.js, run in a sandbox, so a role names the same ramps the app has.
//   node scripts/make_stamps.js                     write app/library/stamps.js
//   node scripts/make_stamps.js --sheet a.png       also draw every stamp at 8x on one sheet, to check that each one reads
//     --palette db32 --scale 4 --only chef,cat      on another palette, at another scale, or only some
//
// A source holds one stamp or several, each starting at its id line. Fields:
//   id, name, category (characters animals household food plants icons effects), mode (2d iso both), tags (comma separated),
//   author (claude or owner, default claude), pivot (x y of a pixel corner, or feet, default none), tile (for feet in iso, default 32),
//   facings (mirror adds the drawing flipped as a second facing), palette (default qtiles: where the roles' ramps come from)
// then sections:
//   roles:   skin = Skin and hair        a role and its ramp, or "Palette / Ramp" from another palette
//   legend:  s = skin 4                  a letter, a role and a step from 1, dark to light; or "w = #ffffff" for a color that never changes
//   art:     rows of letters, . is empty; a second art: is a second facing
// A stamp with no roles or legend of its own uses the last ones given in the same file.
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const root = path.join(__dirname, '..'), artDir = path.join(__dirname, 'stamp_art'), outFile = path.join(root, 'app', 'library', 'stamps.js');
const CATS = { characters: 'Characters', animals: 'Animals', household: 'Household', food: 'Food', plants: 'Plants', icons: 'Icons', effects: 'Effects' };
const MODES = ['2d', 'iso', 'both'], KNOWN = ['id', 'name', 'category', 'mode', 'tags', 'author', 'pivot', 'tile', 'facings', 'palette'];

const box = { console }; vm.createContext(box);
for (const f of ['core', 'palettes', 'stamps']) vm.runInContext(fs.readFileSync(path.join(root, 'app', 'js', f + '.js'), 'utf8'), box, { filename: f + '.js' });
const appPalettes = () => vm.runInContext('PALETTES', box);

function parseFile(text, palettes, file) {
  const out = [], bad = (n, msg) => { throw new Error(file + (n ? ' line ' + n : '') + ': ' + msg); };
  let st = null, part = 'head', roles = null, legend = null;
  const finish = () => { if (st) { if (!st.roles) st.roles = roles; if (!st.legend) st.legend = legend; out.push(check(st, palettes, m => bad(st.line, st.head.id + ': ' + m))); roles = st.roles; legend = st.legend; } };
  text.split('\n').forEach((raw, k) => {
    const line = raw.trim(), n = k + 1, field = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!line || line[0] === '#') return;
    if (field && field[1] === 'id') { finish(); st = { line: n, head: { id: field[2] }, faces: [] }; part = 'head'; return; }
    if (!st) bad(n, 'a stamp starts with its id line');
    if (line === 'roles:') { st.roles = []; part = 'roles'; return; }
    if (line === 'legend:') { st.legend = {}; part = 'legend'; return; }
    if (line === 'art:') { st.faces.push([]); part = 'art'; return; }
    if (part === 'head') {
      if (!field || !KNOWN.includes(field[1])) bad(n, 'expected one of ' + KNOWN.join(', ') + ', or roles:, legend:, art:');
      st.head[field[1]] = field[2]; return;
    }
    if (part === 'roles') {
      const m = /^([a-z][a-z-]*)\s*=\s*(?:(.+?)\s*\/\s*)?(.+)$/.exec(line); if (!m) bad(n, 'a role line is: skin = Ramp name, or skin = Palette / Ramp name');
      const pal = palettes.find(p => p.name === (m[2] || st.head.palette || 'qtiles')) || bad(n, 'no palette called "' + (m[2] || st.head.palette) + '"');
      const ramp = pal.ramps.find(r => r.name === m[3]) || bad(n, 'palette ' + pal.name + ' has no ramp "' + m[3] + '" (it has ' + pal.ramps.map(r => r.name).join(', ') + ')');
      if (st.roles.some(r => r.name === m[1])) bad(n, 'role ' + m[1] + ' is there twice');
      st.roles.push({ name: m[1], ramp: ramp.name, colors: ramp.colors.slice() }); return;
    }
    if (part === 'legend') {
      const m = /^(\S)\s*=\s*(?:([a-z][a-z-]*)\s+(\d+)|(#[0-9a-fA-F]{6}))$/.exec(line); if (!m) bad(n, 'a legend line is: s = skin 4, or w = #ffffff');
      if (st.legend[m[1]]) bad(n, 'letter ' + m[1] + ' is in the legend twice');
      st.legend[m[1]] = m[4] ? { hex: m[4].toLowerCase() } : { role: m[2], step: Number(m[3]), n }; return;
    }
    if (part === 'art') { st.faces[st.faces.length - 1].push(line); return; }
  });
  finish();
  return out;
}

/* Roles and letters the art never uses are dropped, so the role bar shows only what changes something. */
function check(st, palettes, bad) {
  const h = st.head;
  for (const f of ['name', 'category']) if (!h[f]) bad('the header needs "' + f + '"');
  if (!CATS[h.category]) bad('category must be one of ' + Object.keys(CATS).join(', '));
  const mode = h.mode || '2d'; if (!MODES.includes(mode)) bad('mode must be one of ' + MODES.join(', '));
  if (!st.roles || !st.legend) bad('no roles or legend, here or earlier in the file');
  if (!st.faces.length || !st.faces[0].length) bad('there are no art rows');
  if (h.facings && h.facings !== 'mirror') bad('facings can only be mirror');
  if (h.facings && st.faces.length > 1) bad('a stamp with two drawings needs no facings: mirror');
  const used = new Set(), letters = new Set(st.faces.flat().join('').replace(/\./g, ''));
  st.faces.forEach(rows => rows.forEach((r, y) => {
    if (r.length !== rows[0].length) bad('art row ' + (y + 1) + ' is ' + r.length + ' wide, the first is ' + rows[0].length);
  }));
  for (const c of letters) {
    const q = st.legend[c]; if (!q) bad('letter ' + c + ' is not in the legend');
    if (q.hex) continue;
    const r = st.roles.find(x => x.name === q.role); if (!r) bad('letter ' + c + ': no role ' + q.role);
    if (q.step < 1 || q.step > r.colors.length) bad('letter ' + c + ': ' + r.ramp + ' has steps 1 to ' + r.colors.length);
    used.add(q.role);
  }
  const roles = st.roles.filter(r => used.has(r.name)), legend = {}, loose = [...letters].filter(c => st.legend[c].hex);
  if (loose.length) roles.push({ name: 'fixed', ramp: 'Loose', colors: loose.map(c => st.legend[c].hex), fixed: true });
  for (const c of [...letters].sort()) {
    const q = st.legend[c];
    legend[c] = q.hex ? [roles.length - 1, loose.indexOf(c)] : [roles.findIndex(r => r.name === q.role), q.step - 1];
  }
  const faces = st.faces.map(rows => ({ rows, pivot: pivotOf(rows, h, mode, bad) }));
  if (h.facings === 'mirror') { const rows = faces[0].rows.map(r => [...r].reverse().join('')), p = faces[0].pivot; faces.push({ rows, pivot: p && { x: rows[0].length - p.x, y: p.y } }); }
  const tags = (h.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  return { id: h.id, name: h.name, category: CATS[h.category], mode, tags, author: h.author || 'claude', roles, legend, facings: faces.map(f => f.pivot ? f : { rows: f.rows }) };
}
/* Feet: the middle of what stands on the lowest two rows. In Iso that point is a quarter tile below the cell center, as in the examples. */
function pivotOf(rows, h, mode, bad) {
  if (!h.pivot || h.pivot === 'none') return undefined;
  if (h.pivot !== 'feet') { const m = /^(\d+)\s+(\d+)$/.exec(h.pivot); if (!m) bad('pivot is: x y, or feet'); return { x: +m[1], y: +m[2] }; }
  let bottom = -1; rows.forEach((r, y) => { if (/[^.]/.test(r)) bottom = y; });
  const xs = []; for (const y of [bottom, bottom - 1]) [...(rows[y] || '')].forEach((c, x) => { if (c !== '.') xs.push(x); });
  const tile = Number(h.tile || 32); if (mode !== '2d' && (tile % 4 || tile < 8)) bad('tile must be a multiple of 4');
  return { x: Math.floor((Math.min(...xs) + Math.max(...xs) + 1) / 2), y: bottom + 1 - (mode === '2d' ? 0 : tile / 4) };
}

/* ---------- the contact sheet ---------- */
function png(w, h, rgba) {
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/* The colors the app gives a stamp on that palette, from its own code. */
function sheetColors(st, pal) {
  vm.runInContext('S', box).pal = pal;
  const run = vm.runInContext('(x => { const st = cleanStamp(x); return stmInks(st, stmMap(st)).map(r => r.map(packedHex)); })', box);
  return run(st);
}
function sheet(list, pal, scale) {
  const pad = 2, cells = list.flatMap(st => st.facings.map(f => ({ st, f }))), cw = Math.max(...cells.map(c => c.f.rows[0].length)) + pad * 2, ch = Math.max(...cells.map(c => c.f.rows.length)) + pad * 2;
  const cols = Math.min(cells.length, Math.max(4, Math.floor(2400 / (cw * scale)))), rowsN = Math.ceil(cells.length / cols), W = cols * cw * scale, H = rowsN * ch * scale, buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, cx = Math.floor(x / (cw * scale)), cy = Math.floor(y / (ch * scale)), g = (cx + cy) & 1 ? 214 : 232; buf[i] = buf[i + 1] = buf[i + 2] = g; buf[i + 3] = 255; }
  cells.forEach(({ st, f }, n) => {
    const ink = sheetColors(st, pal), ox = (n % cols) * cw + pad, oy = Math.floor(n / cols) * ch + pad;
    f.rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === '.') return; const [k, s] = st.legend[c], hex = ink[k][s], v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const i = (((oy + y) * scale + dy) * W + (ox + x) * scale + dx) * 4; buf[i] = v[0]; buf[i + 1] = v[1]; buf[i + 2] = v[2]; }
    }));
    if (f.pivot) for (let d = -2; d <= 2; d++) for (const [px, py] of [[(ox + f.pivot.x) * scale + d, (oy + f.pivot.y) * scale], [(ox + f.pivot.x) * scale, (oy + f.pivot.y) * scale + d]]) {
      if (px < 0 || py < 0 || px >= W || py >= H) continue; const i = (py * W + px) * 4; buf[i] = 255; buf[i + 1] = 0; buf[i + 2] = 200;
    }
  });
  return png(W, H, buf);
}

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
try {
  const palettes = appPalettes(), files = fs.readdirSync(artDir).filter(f => f.endsWith('.px')).sort(), list = [];
  for (const f of files) list.push(...parseFile(fs.readFileSync(path.join(artDir, f), 'utf8'), palettes, f));
  const ids = new Set(); for (const st of list) { if (ids.has(st.id)) throw new Error('two stamps are called ' + st.id); ids.add(st.id); }
  const order = Object.values(CATS); list.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  const lines = ["'use strict';", '/* Written by scripts/make_stamps.js from scripts/stamp_art/*.px. Do not edit: change a source and build. One stamp per line. */', 'STAMP_BUILT.push('];
  lines.push(list.map(st => '  ' + JSON.stringify(st)).join(',\n'), ');');
  fs.writeFileSync(outFile, lines.join('\n') + '\n');
  const by = {}; for (const st of list) by[st.category] = (by[st.category] || 0) + 1;
  console.log('wrote ' + path.relative(root, outFile) + ': ' + list.length + ' stamps (' + Object.entries(by).map(([k, v]) => v + ' ' + k.toLowerCase()).join(', ') + ')');
  const out = arg('--sheet');
  if (out) {
    const pal = palettes.find(p => p.id === (arg('--palette') || 'qtiles')), only = arg('--only');
    fs.writeFileSync(out, sheet(only ? list.filter(st => only.split(',').includes(st.id)) : list, pal, Number(arg('--scale') || 8)));
    console.log('sheet: ' + out);
  }
} catch (e) { console.error(e.message); process.exit(1); }

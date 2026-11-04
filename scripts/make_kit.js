// Turns scripts/kit_art into app/library/kit.js, the character kit's parts and cast (048). Not part of the product; build_artifact.py runs it when a source changes.
// Plain Node: the palettes and the composing come from the app's own code, run in a sandbox, so what the check and the sheet see is what the app builds.
//   node scripts/make_kit.js                          write app/library/kit.js and report the fit check
//   node scripts/make_kit.js --check                  also list every combination that spills or leaves a gap
//   node scripts/make_kit.js --sheet a.png            draw every part, and the cast, at 8x
//     --only small --scale 6 --palette db32          one template, another scale, another palette
//     --cast                                         the cast alone
//
// kit_art/kit.px     the roles' own colors: "skin = Palette / Ramp", resampled to six steps
// kit_art/cast.px    the cast: blocks starting "preset: id", with name, template, the part of each slot, accessory (up to two, comma separated), outline, and role colors as above
// kit_art/<template>/template.px    name, size (w h), mode (2d or iso), views, tile (iso), and "anchor: view build | eye x y | neck x y | waist x y | hand x y | feet x y"
// kit_art/<template>/<slot>/<part>.px   name, anchor (what it follows on a build it has no drawing for), layer (to draw it above or below its slot), wide (yes: may reach past the body),
//   masks (slots its mask clears), excludes (parts it cannot be worn with); then "view: <view> <build>" blocks of art:, behind: (drawn under every part) and mask: rows,
//   full template size, in the letters below. A body part's view line has no build: the body is the build.
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const root = path.join(__dirname, '..'), artDir = path.join(__dirname, 'kit_art'), outFile = path.join(root, 'app', 'library', 'kit.js');
const SLOTS = ['body', 'head', 'eyes', 'hair', 'top', 'bottom', 'shoes', 'accessory'], BUILDS = ['average', 'slim', 'broad', 'child', 'seated'], ANCHORS = ['eye', 'neck', 'waist', 'hand', 'feet'];
const PART_KEYS = ['name', 'anchor', 'layer', 'wide', 'masks', 'excludes'], TPL_KEYS = ['name', 'size', 'mode', 'views', 'tile'];
const CAST_KEYS = ['name', 'template', 'body', 'head', 'eyes', 'hair', 'top', 'bottom', 'shoes', 'accessory', 'outline'];

const box = { console }; vm.createContext(box);
for (const f of ['core', 'palettes', 'stamps', 'shadow', 'kit']) vm.runInContext(fs.readFileSync(path.join(root, 'app', 'js', f + '.js'), 'utf8'), box, { filename: f + '.js' });
const ev = s => vm.runInContext(s, box), LETTERS = ev('KIT_LETTER'), ROLES = ev('KIT_ROLES');

const fail = (file, n, msg) => { throw new Error(path.relative(root, file) + (n ? ' line ' + n : '') + ': ' + msg); };
const lines = file => fs.readFileSync(file, 'utf8').split('\n').map((raw, k) => ({ line: raw.trim(), n: k + 1 })).filter(l => l.line && l.line[0] !== '#');
const field = l => /^([a-z]+):\s*(.*)$/.exec(l);
/* "Palette / Ramp" (or a ramp of the qtiles palette), as six steps. A shorter ramp repeats steps, a longer one skips them, keeping both ends. */
function rampColors(spec, palettes, file, n) {
  const m = /^(?:(.+?)\s*\/\s*)?(.+)$/.exec(spec), pal = palettes.find(p => p.name === (m[1] || 'qtiles')) || fail(file, n, 'no palette called "' + m[1] + '"');
  const r = pal.ramps.find(q => q.name === m[2]) || fail(file, n, 'palette ' + pal.name + ' has no ramp "' + m[2] + '" (it has ' + pal.ramps.map(q => q.name).join(', ') + ')');
  return { ramp: r.name, colors: Array.from({ length: 6 }, (_, k) => r.colors[Math.round(k * (r.colors.length - 1) / 5)]) };
}
function roleLine(l, palettes, file) {
  const m = /^([a-z][a-z-]*)\s*=\s*(.+)$/.exec(l.line); if (!m || !ROLES.includes(m[1])) fail(file, l.n, 'a role line is: skin = Palette / Ramp, with a role of ' + ROLES.join(', '));
  return [m[1], rampColors(m[2], palettes, file, l.n)];
}
function trim(rows) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }));
  return x1 < 0 ? null : [x0, y0, rows.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1))];
}

function readTemplate(id, palettes) {
  const dir = path.join(artDir, id), file = path.join(dir, 'template.px'), t = { id, anchors: {}, parts: {} };
  for (const l of lines(file)) {
    const f = field(l.line); if (!f) fail(file, l.n, 'expected "name: value"');
    if (f[1] === 'anchor') {
      const [head, ...rest] = f[2].split('|').map(s => s.trim()), [view, build] = head.split(/\s+/), a = {};
      if (!BUILDS.includes(build)) fail(file, l.n, 'no build ' + build);
      for (const p of rest) { const m = /^([a-z]+) (\d+) (\d+)$/.exec(p); if (!m || !ANCHORS.includes(m[1])) fail(file, l.n, 'an anchor is: name x y, one of ' + ANCHORS.join(', ')); a[m[1]] = [+m[2], +m[3]]; }
      if (ANCHORS.some(k => !a[k])) fail(file, l.n, 'every anchor is needed: ' + ANCHORS.join(', '));
      (t.anchors[view] = t.anchors[view] || {})[build] = a; continue;
    }
    if (!TPL_KEYS.includes(f[1])) fail(file, l.n, 'expected one of ' + TPL_KEYS.join(', ') + ', or anchor');
    t[f[1]] = f[2];
  }
  const size = /^(\d+) (\d+)$/.exec(t.size || '') || fail(file, 0, 'size is: w h');
  Object.assign(t, { w: +size[1], h: +size[2], views: (t.views || '').split(/\s+/).filter(Boolean), tile: t.tile ? +t.tile : undefined }); delete t.size;
  if (!['2d', 'iso'].includes(t.mode)) fail(file, 0, 'mode is 2d or iso');
  for (const v of t.views) if (!t.anchors[v] || !t.anchors[v].average) fail(file, 0, 'no anchors for ' + v + ' average');
  for (const slot of SLOTS) {
    const sd = path.join(dir, slot); if (!fs.existsSync(sd)) fail(sd, 0, 'missing');
    t.parts[slot] = fs.readdirSync(sd).filter(f => f.endsWith('.px')).sort().map(f => readPart(t, slot, f.slice(0, -3), path.join(sd, f)));
  }
  return t;
}
function readPart(t, slot, id, file) {
  const p = { id, v: {} }; let blk = null, part = null;
  for (const l of lines(file)) {
    const f = field(l.line);
    if (f && f[1] === 'view') {
      const [view, build = slot === 'body' ? id : ''] = f[2].split(/\s+/);
      if (!t.views.includes(view)) fail(file, l.n, 'template ' + t.id + ' has views ' + t.views.join(', '));
      if (!BUILDS.includes(build)) fail(file, l.n, 'a view line is: view <' + t.views.join('|') + '> <' + BUILDS.join('|') + '>');
      blk = (p.v[view] = p.v[view] || {})[build] = { a: [], b: null, m: null, n: l.n }; part = null; continue;
    }
    if (['art:', 'behind:', 'mask:'].includes(l.line)) { if (!blk) fail(file, l.n, 'a drawing comes after its view line'); part = l.line[0] === 'a' ? 'a' : l.line[0]; if (part !== 'a') blk[part] = []; continue; }
    if (part) { blk[part].push(l.line); continue; }
    if (!f || !PART_KEYS.includes(f[1])) fail(file, l.n, 'expected one of ' + PART_KEYS.join(', ') + ', or view:');
    p[f[1]] = f[2];
  }
  if (!p.name) fail(file, 0, 'the header needs "name"');
  if (p.anchor && !ANCHORS.includes(p.anchor)) fail(file, 0, 'anchor is one of ' + ANCHORS.join(', '));
  const out = { id, name: p.name };
  if (p.anchor) out.anchor = p.anchor;
  if (p.layer) out.layer = Number(p.layer);
  if (p.wide === 'yes') out.wide = 1;
  if (p.masks) out.masks = p.masks.split(',').map(s => s.trim());
  if (p.excludes) out.excludes = p.excludes.split(',').map(s => s.trim());
  out.v = {};
  for (const v of t.views) {
    const vb = p.v[v]; if (!vb || !vb[slot === 'body' ? id : 'average']) fail(file, 0, 'no drawing for view ' + v + (slot === 'body' ? '' : ' average'));
    out.v[v] = {};
    for (const [b, d] of Object.entries(vb)) {
      for (const k of ['a', 'b', 'm']) if (d[k]) {
        if (d[k].length !== t.h || d[k].some(r => r.length !== t.w)) fail(file, d.n, 'every drawing is ' + t.w + ' x ' + t.h + ' (view ' + v + ' ' + b + ')');
        const ok = k === 'm' ? /^[.#]*$/ : new RegExp('^[' + LETTERS.replace('.', '\\.') + ']*$');
        d[k].forEach((r, y) => { if (!ok.test(r)) fail(file, d.n, 'row ' + (y + 1) + ' of view ' + v + ' ' + b + ' has a letter that is no role step' + (k === 'm' ? ' (a mask is . and #)' : '')); });
      }
      const blk = { a: trim(d.a) }; if (d.b) blk.b = trim(d.b); if (d.m) blk.m = trim(d.m);
      out.v[v][b] = blk.a || blk.b ? Object.fromEntries(Object.entries(blk).filter(([, x]) => x)) : null;
    }
  }
  return out;
}
function readCast(palettes, templates) {
  const file = path.join(artDir, 'cast.px'), list = []; let p = null;
  for (const l of lines(file)) {
    const f = field(l.line);
    if (f && f[1] === 'preset') { p = { id: f[2], colors: {}, names: {}, n: l.n }; list.push(p); continue; }
    if (!p) fail(file, l.n, 'a preset starts with its "preset: id" line');
    if (f && CAST_KEYS.includes(f[1])) { p[f[1]] = f[2]; continue; }
    const [role, c] = roleLine(l, palettes, file); p.colors[role] = c.colors; p.names[role] = c.ramp;
  }
  const ids = new Set();
  return list.map(p => {
    if (ids.has(p.id)) fail(file, p.n, 'two presets are called ' + p.id); ids.add(p.id);
    const t = templates.find(x => x.id === p.template) || fail(file, p.n, 'no template ' + p.template);
    const o = { id: p.id, name: p.name || fail(file, p.n, 'a preset needs a name'), t: t.id, outline: p.outline || 'dark', colors: p.colors, names: p.names };
    const acc = (p.accessory || '').split(',').map(s => s.trim()).filter(Boolean); if (acc.length > 2) fail(file, p.n, 'two accessories at most');
    o.acc1 = acc[0] || ''; o.acc2 = acc[1] || '';
    for (const s of ['body', 'head', 'eyes', 'hair', 'top', 'bottom', 'shoes']) { if (!t.parts[s].some(x => x.id === p[s])) fail(file, p.n, 'template ' + t.id + ' has no ' + s + ' "' + p[s] + '"'); o[s] = p[s]; }
    for (const a of acc) if (!t.parts.accessory.some(x => x.id === a)) fail(file, p.n, 'no accessory "' + a + '"');
    return o;
  });
}

/* ---------- the fit check ---------- */
/* Every body with every top and bottom, the other slots fixed. A spill is a pixel of a part not marked wide that falls off the body; a hole is an empty pixel shut in by the character;
   a gap is skin showing in the two rows above the waist anchor, inside the bottom's own width, where the top and bottom should meet. */
function fitCheck(templates) {
  const found = [];
  for (const t of templates) for (const v of t.views) for (const body of t.parts.body) for (const top of t.parts.top) for (const bot of t.parts.bottom) {
    const base = { t: t.id, body: body.id, head: 'round', eyes: 'dots', hair: 'bald', top: top.id, bottom: bot.id, shoes: 'sneakers', acc1: '', acc2: '', outline: 'none' };
    const one = slots => ev('(c => kitCompose(c, ' + JSON.stringify(v) + '))')(Object.assign({}, base, slots));   // not cleaned, so an empty slot stays empty
    const all = one({}), bodyOnly = one({ head: '', eyes: '', top: '', bottom: '', shoes: '' }), w = t.w, h = t.h;
    const tag = t.id + ' ' + v + ' ' + body.id + ' + ' + top.id + ' + ' + bot.id, say = (kind, n) => found.push({ kind, tag, n });
    for (const part of [top, bot]) if (!part.wide) {
      let n = 0;
      const d = ev('(t, p, v, b) => kitBlock(kitTpl(t), p, v, b)')(t.id, part, v, body.id); if (!d) continue;
      for (const key of ['a', 'b']) { const g = d.blk[key]; if (!g) continue; g[2].forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '.') return; const x = g[0] + i + d.dx, y = g[1] + j + d.dy; if (x >= 0 && y >= 0 && x < w && y < h && !bodyOnly[y * w + x]) n++; })); }
      if (n) say('spill', n);
    }
    // holes: empty pixels the outside cannot reach
    const seen = new Uint8Array(w * h), stack = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) { const i = stack.pop(); if (seen[i] || all[i]) continue; seen[i] = 1; const x = i % w, y = (i / w) | 0; if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1); if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w); }
    let holes = 0; for (let i = 0; i < w * h; i++) if (!all[i] && !seen[i]) holes++;
    if (holes) say('hole', holes);
    if (bot.id !== 'none') {
      const wy = t.anchors[v][body.id] ? t.anchors[v][body.id].waist[1] : t.anchors[v].average.waist[1], only = one({ head: '', eyes: '', top: 'x', shoes: 'x' });
      let x0 = w, x1 = -1; for (let x = 0; x < w; x++) { const k = only[wy * w + x]; if (k && Math.floor((k - 1) / 6) === ROLES.indexOf('cloth-b')) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
      let gap = 0; for (const y of [wy - 1, wy]) for (let x = x0; x <= x1; x++) { const k = all[y * w + x]; if (k && Math.floor((k - 1) / 6) === 0) gap++; }
      if (gap) say('gap', gap);
    }
  }
  return found;
}

/* ---------- the contact sheet ---------- */
function png(w, h, rgba) {
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/* One row a slot: each part on the template's first cast member, or a plain figure; then the cast. Every view side by side. */
function sheet(templates, cast, pal, scale, castOnly) {
  ev('S').pal = pal; ev('S').palette = pal.ramps.flatMap(r => r.colors);
  const color = ev('(raw, face) => { const st = cleanStamp(raw); return stmPixels(st, face, stmMap(st)).px; }');
  const tiles = [];
  for (const t of templates) {
    const base = Object.assign({ t: t.id, body: 'average', head: 'round', eyes: 'dots', hair: 'short', top: 't-shirt', bottom: 'trousers', shoes: 'sneakers', acc1: '', acc2: '', outline: 'dark' });
    const row = list => tiles.push(list.map(c => ({ t, raw: ev('(c => kitStamp(kitClean(c)))')(c) })));
    if (!castOnly) for (const slot of ['body', 'head', 'eyes', 'hair', 'top', 'bottom', 'shoes']) row(t.parts[slot].map(p => Object.assign({}, base, { [slot]: p.id })));
    if (!castOnly) row(t.parts.accessory.map(p => Object.assign({}, base, { acc1: p.id, hair: p.id === 'hat' ? 'curly' : 'short' })));
    if (!castOnly) row(['slim', 'broad', 'child', 'seated'].map(b => Object.assign({}, base, { body: b, top: 'dress', bottom: 'none' })).concat(['slim', 'broad', 'child', 'seated'].map(b => Object.assign({}, base, { body: b, top: 'coat', bottom: 'skirt', acc1: 'backpack' }))));
    const mine = cast.filter(c => c.t === t.id); for (let k = 0; k < mine.length; k += 8) row(mine.slice(k, k + 8));
  }
  const pad = 2, cw = Math.max(...templates.map(t => t.w * 2 + pad * 3)), ch = Math.max(...templates.map(t => t.h)) + pad * 2;
  const cols = Math.max(...tiles.map(r => r.length)), W = cols * cw * scale, H = tiles.length * ch * scale, buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, g = (Math.floor(x / (cw * scale)) + Math.floor(y / (ch * scale))) & 1 ? 214 : 232; buf[i] = buf[i + 1] = buf[i + 2] = g; buf[i + 3] = 255; }
  tiles.forEach((list, ry) => list.forEach(({ t, raw }, cx) => [0, 1].forEach(face => {
    const px = color(raw, face), ox = cx * cw + pad + face * (t.w + pad), oy = ry * ch + pad;
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const v = px[y * t.w + x]; if (!(v >>> 24)) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const i = (((oy + y) * scale + dy) * W + (ox + x) * scale + dx) * 4; buf[i] = v & 255; buf[i + 1] = (v >>> 8) & 255; buf[i + 2] = (v >>> 16) & 255; }
    }
  })));
  return png(W, H, buf);
}

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
try {
  const palettes = ev('PALETTES'), roles = {};
  for (const l of lines(path.join(artDir, 'kit.px'))) { const [r, c] = roleLine(l, palettes, path.join(artDir, 'kit.px')); roles[r] = c; }
  for (const r of ROLES) if (!roles[r]) fail(path.join(artDir, 'kit.px'), 0, 'no colors for ' + r);
  const ids = fs.readdirSync(artDir).filter(d => fs.existsSync(path.join(artDir, d, 'template.px'))).sort((a, b) => ['chibi', 'small', 'medium', 'iso'].indexOf(a) - ['chibi', 'small', 'medium', 'iso'].indexOf(b));
  const templates = ids.map(id => readTemplate(id, palettes));
  const KB = ev('KIT_BUILT'); KB.roles = ROLES.map(r => ({ name: r, ramp: roles[r].ramp, colors: roles[r].colors })); KB.templates = templates;
  const cast = readCast(palettes, templates); KB.cast = cast;
  const out = ["'use strict';", '/* Written by scripts/make_kit.js from scripts/kit_art. Do not edit: change a source and build. A drawing is [x, y, rows], trimmed; one part per line. */'];
  out.push('KIT_BUILT.roles = ' + JSON.stringify(KB.roles) + ';');
  templates.forEach((t, k) => {
    const { parts, ...head } = t; out.push('KIT_BUILT.templates.push(' + JSON.stringify(Object.assign(head, { parts: {} })) + ');');
    for (const slot of SLOTS) out.push('KIT_BUILT.templates[' + k + '].parts[' + JSON.stringify(slot) + '] = [', parts[slot].map(p => '  ' + JSON.stringify(p)).join(',\n'), '];');
  });
  out.push('KIT_BUILT.cast.push(', cast.map(c => '  ' + JSON.stringify(c)).join(',\n'), ');');
  fs.writeFileSync(outFile, out.join('\n') + '\n');
  const nParts = templates.reduce((n, t) => n + SLOTS.reduce((m, s) => m + t.parts[s].length, 0), 0);
  console.log('wrote ' + path.relative(root, outFile) + ': ' + templates.length + ' templates, ' + nParts + ' parts, ' + cast.length + ' in the cast (' + Math.round(fs.statSync(outFile).size / 1024) + ' KB)');
  const found = fitCheck(templates);
  const by = k => found.filter(f => f.kind === k).length, combos = templates.reduce((n, t) => n + t.views.length * t.parts.body.length * t.parts.top.length * t.parts.bottom.length, 0);
  console.log('fit check: ' + combos + ' combinations of body, top and bottom; ' + by('spill') + ' spill, ' + by('hole') + ' with holes, ' + by('gap') + ' with a gap at the waist' + (found.length && !process.argv.includes('--check') ? ' (--check lists them)' : ''));
  if (process.argv.includes('--check')) for (const f of found) console.log('  ' + f.kind + ' ' + f.n + ' px: ' + f.tag);
  const file = arg('--sheet');
  if (file) {
    const only = arg('--only'), pal = palettes.find(p => p.id === (arg('--palette') || 'qtiles'));
    const ts = only ? templates.filter(t => only.split(',').includes(t.id)) : templates;
    fs.writeFileSync(file, sheet(ts, cast.filter(c => ts.some(t => t.id === c.t)), pal, Number(arg('--scale') || 8), process.argv.includes('--cast')));
    console.log('sheet: ' + file);
  }
} catch (e) { console.error(e.message); process.exit(1); }

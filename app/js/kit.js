'use strict';
/* qtiles character kit (048): a character built from parts that fit one template. Parts are drawn by role, as stamps are (047), with no outline of their own:
   the kit lays them in order, clears what a mask hides, and adds the outline around the whole, so no two parts ever meet at a seam.
   What it builds is a stamp, so recoloring, placing and saving it are the stamp's own. app/library/kit.js holds the parts and the cast, written by scripts/make_kit.js. */

const KIT_ROLES = ['skin', 'hair', 'cloth-a', 'cloth-b', 'shoes', 'accessory', 'outline'];
const KIT_CH = ['abcdef', 'ghijkl', 'mnopqr', 'stuvwx', 'yzABCD', 'EFGHIJ', 'KLMNOP'];   // each role's six steps, dark to light, as the sources write them
const KIT_LETTER = '.' + KIT_CH.join('');   // a code is role * 6 + step + 1, and 0 is empty
const KIT_Z = { body: 10, head: 20, eyes: 25, shoes: 30, bottom: 40, top: 50, accessory: 60, hair: 70 };
const KIT_SLOTS = [['body', 'body', 'Body'], ['head', 'head', 'Head'], ['eyes', 'eyes', 'Eyes'], ['hair', 'hair', 'Hair'], ['top', 'top', 'Top'], ['bottom', 'bottom', 'Bottom'], ['shoes', 'shoes', 'Shoes'], ['acc1', 'accessory', 'Accessory'], ['acc2', 'accessory', 'Second accessory']];
const KIT_OUTLINES = ['none', 'dark', 'sel'];
const KIT_BUILT = { roles: [], templates: [], cast: [] };   // app/library/kit.js fills it

const kitTpl = id => KIT_BUILT.templates.find(t => t.id === id) || KIT_BUILT.templates[0];
const kitPart = (t, kind, id) => (t.parts[kind] || []).find(p => p.id === id) || null;
const kitKind = slot => KIT_SLOTS.find(s => s[0] === slot)[1];

/* A choice that names only parts the template has, and nothing a chosen part excludes. Accessories may be empty; nothing else is. */
function kitClean(c, tid) {
  const t = kitTpl(tid || (c && c.t)), o = { t: t.id };
  for (const [slot, kind] of KIT_SLOTS) {
    const want = c && c[slot], list = t.parts[kind] || [];
    o[slot] = kitPart(t, kind, want) ? want : kind === 'accessory' ? '' : (list.find(p => p.id === 'none') || list[0] || { id: '' }).id;
  }
  if (o.acc2 === o.acc1) o.acc2 = '';
  const ex = new Set(); for (const [slot, kind] of KIT_SLOTS) { const p = kitPart(t, kind, o[slot]); if (p && p.excludes) p.excludes.forEach(x => ex.add(x)); }
  for (const s of ['acc1', 'acc2']) if (ex.has(o[s])) o[s] = '';
  o.outline = KIT_OUTLINES.includes(c && c.outline) ? c.outline : 'dark';
  o.colors = {};
  KIT_ROLES.forEach((n, k) => { const v = c && c.colors && c.colors[n]; o.colors[n] = Array.isArray(v) && v.length === 6 && v.every(h => hexToRgb(h)) ? v.map(h => h.toLowerCase()) : KIT_BUILT.roles[k].colors.slice(); });
  o.names = {}; KIT_ROLES.forEach((n, k) => { const v = c && c.names && c.names[n]; o.names[n] = typeof v === 'string' && v ? v.slice(0, 40) : KIT_BUILT.roles[k].ramp; });
  return o;
}
/* A part's drawing for a build, or the average one moved by the anchor the part follows. */
function kitBlock(t, p, view, build) {
  const v = p.v[view]; if (!v) return null;
  if (v[build]) return { blk: v[build], dx: 0, dy: 0 };
  if (!v.average) return null;
  const A = t.anchors[view], a = p.anchor && A.average[p.anchor], b = p.anchor && (A[build] || A.average)[p.anchor];
  return { blk: v.average, dx: a ? b[0] - a[0] : 0, dy: a ? b[1] - a[1] : 0 };
}
/* A trimmed drawing is [x, y, rows]. */
const kitAt = (d, x, y) => { const r = d[2][y - d[1]]; return r ? r.charCodeAt(x - d[0]) : 0; };
function kitCompose(c, view) {
  const t = kitTpl(c.t), w = t.w, h = t.h, code = new Uint8Array(w * h), list = [];
  for (const [slot, kind] of KIT_SLOTS) {
    const p = kitPart(t, kind, c[slot]), b = p && kitBlock(t, p, view, c.body);
    if (b) list.push(Object.assign({ p, kind, z: p.layer || KIT_Z[kind] }, b));
  }
  list.sort((a, b) => a.z - b.z);
  const masks = list.filter(e => e.p.masks && e.blk.m), dot = '.'.charCodeAt(0);
  const hidden = (kind, x, y) => masks.some(e => e.p.masks.includes(kind) && kitAt(e.blk.m, x - e.dx, y - e.dy) === 35);   // '#'
  for (const key of ['b', 'a']) for (const e of list) {
    const d = e.blk[key]; if (!d) continue;
    d[2].forEach((row, j) => {
      const y = d[1] + j + e.dy; if (y < 0 || y >= h) return;
      for (let i = 0; i < row.length; i++) {
        const ch = row.charCodeAt(i), x = d[0] + i + e.dx; if (ch === dot || x < 0 || x >= w || hidden(e.kind, x, y)) continue;
        const k = KIT_LETTER.indexOf(row[i]); if (k > 0) code[y * w + x] = k;
      }
    });
  }
  if (c.outline === 'none') return code;
  const out = code.slice(), dark = KIT_ROLES.indexOf('outline') * 6 + 1, at = (x, y) => x >= 0 && y >= 0 && x < w && y < h ? code[y * w + x] : 0;
  outlineWalk(at, { x0: 0, y0: 0, x1: w - 1, y1: h - 1 }, N4, false, (x, y, v) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    out[y * w + x] = c.outline === 'dark' ? dark : v - Math.min((v - 1) % 6, 2);   // sel-out: the neighbour's own role, two steps darker
  });
  return out;
}
const kitRows = (code, w) => { const rows = []; for (let i = 0; i < code.length; i += w) rows.push(Array.from(code.subarray(i, i + w), k => KIT_LETTER[k]).join('')); return rows; };
/* Feet at the template's middle, below the lowest row drawn; in Iso a quarter tile higher, so the pivot lands on a cell center as other stamps' do. */
function kitPivot(t, code, view, body) {
  let bottom = -1; for (let i = code.length - 1; i >= 0; i--) if (code[i]) { bottom = Math.floor(i / t.w); break; }
  const a = (t.anchors[view][body] || t.anchors[view].average).feet;
  return { x: a[0], y: Math.max(0, bottom + 1 - (t.mode === 'iso' ? (t.tile || 32) / 4 : 0)) };
}
const KIT_SAY = { short: 'short hair', long: 'long hair', curly: 'curly hair', tied: 'tied-back hair', bun: 'a bun', braids: 'braids', buzz: 'a buzz cut', bald: 'bald', hijab: 'hijab', 'cap-hair': 'cap' };
function kitName(c) { const t = kitTpl(c.t), top = kitPart(t, 'top', c.top); return 'Character, ' + (KIT_SAY[c.hair] || c.hair) + (top ? ', ' + top.name.toLowerCase() : ''); }
/* The stamp a choice makes: both views, every role with the colors it was given. */
function kitStamp(c, name, id) {
  const t = kitTpl(c.t), legend = {};
  for (let k = 1; k < KIT_LETTER.length; k++) legend[KIT_LETTER[k]] = [Math.floor((k - 1) / 6), (k - 1) % 6];
  const facings = t.views.map(v => { const code = kitCompose(c, v); return { rows: kitRows(code, t.w), pivot: kitPivot(t, code, v, c.body) }; });
  if (t.views.length === 1) { const f = facings[0]; facings.push({ rows: f.rows.map(r => [...r].reverse().join('')), pivot: { x: t.w - f.pivot.x, y: f.pivot.y } }); }
  const tags = ['kit', t.name.toLowerCase(), c.body, c.hair, c.top, c.bottom].concat([c.acc1, c.acc2].filter(Boolean));
  return { id: id || 'kit-' + Date.now().toString(36), name: name || kitName(c), category: 'Characters', mode: t.mode === 'iso' ? 'iso' : '2d', tags, author: 'claude',
    roles: KIT_ROLES.map(n => ({ name: n, ramp: c.names[n], colors: c.colors[n] })), legend, facings };
}
/* The cast (048): presets made with the kit, built again from the parts each time the app starts, so a better part makes better people. */
const kitCast = () => KIT_BUILT.cast.map(p => kitStamp(kitClean(p), p.name, 'kit-' + p.id));

/* ---------- shuffle ---------- */
/* Skin and hair take the cast's own tones, so on a palette with one skin ramp people still differ; clothes, shoes and accessories take other ramps of the project palette. */
const kitTones = role => { const seen = new Map(); for (const p of KIT_BUILT.cast) if (p.colors[role]) seen.set(p.colors[role].join(), [p.colors[role], p.names[role]]); return [...seen.values()]; };
function kitShuffle(c, seed, locks) {
  const rnd = mulberry32(seed), t = kitTpl(c.t), o = Object.assign({}, c, { colors: Object.assign({}, c.colors), names: Object.assign({}, c.names) }), pick = a => a[Math.floor(rnd() * a.length)];
  for (const [slot, kind] of KIT_SLOTS) {
    let ids = (t.parts[kind] || []).map(p => p.id);
    if (kind === 'accessory') ids = ids.concat(slot === 'acc1' ? ['', ''] : ['', '', '', '', '', '']);   // most people carry one thing or nothing
    const v = pick(ids); if (!locks.has(slot)) o[slot] = v;
  }
  const map = {};
  if (!locks.has('colors')) {
    for (const role of ['skin', 'hair']) { const tones = kitTones(role); if (tones.length) { const [colors, name] = pick(tones); o.colors[role] = colors.slice(); o.names[role] = name; } }
    const ramps = stmRamps().filter(r => !/skin/i.test(r.name) && r.colors.length >= 3).map(r => r.name), taken = new Set();
    for (const role of ['cloth-a', 'cloth-b', 'shoes', 'accessory']) { const free = ramps.filter(n => !taken.has(n)), n = free.length ? pick(free) : null; if (n) { map[role] = n; taken.add(n); } }
  }
  return { c: kitClean(o), map };
}

/* ---------- the dialog ---------- */
const KIT_THUMB = 64;
const KT = { c: null, map: {}, seed: 1, locks: new Set(), past: [], name: '' };   // map: ramps chosen by role name; a role not in it takes its default
/* The stamp for the dialog's choice and the ramps it is painted with. */
function kitNow() { const st = cleanStamp(kitStamp(KT.c, KT.name.trim() || kitName(KT.c))), def = stmMap(st); return { st, map: KIT_ROLES.map((n, k) => (KT.map[n] && rampNamed(KT.map[n]) ? KT.map[n] : def[k])) }; }
/* Drawn at a whole scale, both views side by side with a pixel gap between. */
function kitDraw(cv, st, map, k, faces = [0, 1]) {
  const f = st.facings[0], gap = faces.length > 1 ? 4 : 0, w = (f.w * faces.length + gap * (faces.length - 1)) * k, h = f.h * k;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h), out = new Uint32Array(img.data.buffer);
  faces.forEach((face, n) => {
    const b = stmPixels(st, face, map), ox = n * (f.w + gap) * k;
    for (let y = 0; y < h; y++) for (let x = 0; x < f.w * k; x++) { const v = b.px[Math.floor(y / k) * f.w + Math.floor(x / k)]; if (v) out[y * w + ox + x] = v; }
  });
  ctx.putImageData(img, 0, 0);
}
function kitSync() {
  const t = kitTpl(KT.c.t), { st, map } = kitNow();
  $('kitTpls').querySelectorAll('button').forEach(b => press(b, b.dataset.tpl === t.id));
  $('kitOut').querySelectorAll('button').forEach(b => press(b, b.dataset.out === KT.c.outline));
  $('kitSeed').value = KT.seed; $('kitUndo').disabled = !KT.past.length; $('kitName').placeholder = kitName(KT.c);
  $('kitViews').textContent = t.views.length > 1 ? 'Front and side, at 6x and 1x.' : 'Down-right and its mirror, down-left, at 6x and 1x.';
  kitDraw($('kitBig'), st, map, 6); kitDraw($('kitOne'), st, map, 1);
  // one row a slot, each part shown on this character
  const host = $('kitSlots'), key = t.id;
  if (host.dataset.key !== key) {
    host.dataset.key = key; host.textContent = '';
    for (const [slot, kind, label] of KIT_SLOTS) {
      const sec = document.createElement('div'), head = document.createElement('div'), lock = document.createElement('button'), strip = document.createElement('div');
      sec.className = 'kitslot'; head.className = 'row between'; strip.className = 'kitparts'; strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', label);
      lock.className = 'chip'; lock.dataset.lock = slot; lock.textContent = 'Keep'; lock.setAttribute('aria-label', 'Keep the ' + label.toLowerCase() + ' when shuffling');
      lock.onclick = () => { KT.locks.has(slot) ? KT.locks.delete(slot) : KT.locks.add(slot); press(lock, KT.locks.has(slot)); };
      head.append(Object.assign(document.createElement('b'), { textContent: label }), lock);
      const ids = (kind === 'accessory' ? [{ id: '', name: 'None' }] : []).concat(t.parts[kind] || []);
      for (const p of ids) {
        const b = document.createElement('button'), cv = document.createElement('canvas'); b.className = 'shapecard'; b.dataset.slot = slot; b.dataset.part = p.id; b.setAttribute('aria-label', label + ': ' + p.name);
        b.append(cv, p.name); b.onclick = () => kitSet(slot, p.id); strip.appendChild(b);
      }
      sec.append(head, strip); host.appendChild(sec);
    }
  }
  host.querySelectorAll('[data-lock]').forEach(b => press(b, KT.locks.has(b.dataset.lock)));
  for (const b of host.querySelectorAll('.shapecard')) {
    const slot = b.dataset.slot, on = KT.c[slot] === b.dataset.part; press(b, on);
    const c = kitClean(Object.assign({}, KT.c, { [slot]: b.dataset.part })), dis = c[slot] !== b.dataset.part; b.disabled = dis;   // a part another one excludes
    const one = cleanStamp(kitStamp(c, 'x')), k = Math.max(1, Math.floor(KIT_THUMB / Math.max(t.w, t.h)));
    if (b.dataset.sig !== JSON.stringify(c) + map) { b.dataset.sig = JSON.stringify(c) + map; kitDraw(b.firstChild, one, map, k, [0]); }
  }
  // one row a role, as the stamp's role bar
  const rows = $('kitColors'), names = stmRamps().map(r => r.name), ink = stmInks(st, map);
  if (rows.dataset.key !== names.join()) {
    rows.dataset.key = names.join(); rows.textContent = '';
    KIT_ROLES.forEach((n, k) => {
      const row = document.createElement('label'), sw = document.createElement('span'), sel = document.createElement('select');
      row.className = 'field stmrole'; sw.className = 'stmsw'; sel.dataset.role = n; sel.setAttribute('aria-label', 'Ramp for ' + n.replace('-', ' '));
      for (const r of [''].concat(names)) { const o = document.createElement('option'); o.value = r; o.textContent = r || 'Not used'; o.hidden = !r; sel.appendChild(o); }
      sel.onchange = () => { KT.map = Object.assign({}, KT.map, { [n]: sel.value }); kitSync(); };
      row.append(n.replace('-', ' '), sw, sel); rows.appendChild(row);
    });
  }
  rows.querySelectorAll('select').forEach(sel => {
    const k = KIT_ROLES.indexOf(sel.dataset.role), sw = sel.previousSibling; sel.value = map[k] || ''; sel.disabled = !names.length || !map[k]; sw.textContent = '';
    for (const s of st.used[k]) { const d = document.createElement('i'); d.style.background = packedHex(ink[k][s]); sw.appendChild(d); }
  });
  press($('kitKeepColors'), KT.locks.has('colors'));
  const from = $('kitFrom'), have = S.kitPresets.map(p => p.name).join() + '|' + KIT_BUILT.cast.length;
  if (from.dataset.key !== have) {
    from.dataset.key = have; from.textContent = '';
    const add = (host, v, txt) => { const o = document.createElement('option'); o.value = v; o.textContent = txt; host.appendChild(o); };
    add(from, '', 'Choose a starting point');
    const group = (label, list, pre) => { if (!list.length) return; const g = document.createElement('optgroup'); g.label = label; list.forEach((p, k) => add(g, pre + k, p.name + ', ' + kitTpl(p.t).name)); from.appendChild(g); };
    group('This project', S.kitPresets, 'p'); group('Cast', KIT_BUILT.cast, 'c');
  }
  from.value = '';
}
function kitSet(slot, id) { KT.c = kitClean(Object.assign({}, KT.c, { [slot]: id })); kitSync(); }
function kitRemember() { KT.past.push({ c: KT.c, map: KT.map, seed: KT.seed }); if (KT.past.length > 50) KT.past.shift(); }
function kitDoShuffle(seed) { kitRemember(); KT.seed = seed; const r = kitShuffle(KT.c, seed, KT.locks); KT.c = r.c; KT.map = r.map; kitSync(); }
function kitLoad(p) { kitRemember(); KT.c = kitClean(p); KT.map = Object.assign({}, p.map || {}); KT.name = p.name || ''; if (Number.isInteger(p.seed)) KT.seed = p.seed; $('kitName').value = KT.name; kitSync(); }
function kitOpen() {
  commitFloat();
  if (!KT.c || (kitTpl(KT.c.t).mode === 'iso') !== (S.mode === 'iso')) {
    KT.c = kitClean({ t: S.mode === 'iso' ? 'iso' : 'small', body: 'average', head: 'round', eyes: 'dots', hair: 'short', top: 't-shirt', bottom: 'trousers', shoes: 'sneakers' }); KT.name = ''; KT.map = {};
  }
  KT.past = []; $('kitName').value = KT.name; openSheet('sheetKit'); kitSync();
}
/* Each role painted with the ramp it shows, so the stamp keeps those colors wherever it is placed: a role's colors become its ramp, and each step the place it landed. */
function kitBake(st, map) {
  const ink = stmInks(st, map), legend = {};
  const roles = st.roles.map((r, k) => { const q = map[k] && rampNamed(map[k]); return q ? { name: r.name, ramp: q.name, colors: q.colors.slice() } : r; });
  for (const [ch, [k, s]] of Object.entries(st.legend)) { if (ink[k][s] === undefined) continue; legend[ch] = roles[k] === st.roles[k] ? [k, s] : [k, roles[k].colors.indexOf(packedHex(ink[k][s]))]; }
  return { roles, legend };
}
function kitSaveStamp() {
  const { st, map } = kitNow(), b = kitBake(st, map);
  const x = cleanStamp(Object.assign(stmSaved(st), b, { id: 'mine-' + Date.now().toString(36) + '-' + S.stamps.length, author: 'owner', mode: st.mode }), true);
  if (!x) return null;
  stmAdd(x); toast('Saved as a stamp, under Mine and Characters.'); return x;
}
function kitSavePreset() {
  const name = KT.name.trim() || kitName(KT.c), p = Object.assign({}, KT.c, { name, map: Object.keys(KT.map).length ? Object.assign({}, KT.map) : undefined, seed: KT.seed });
  const k = S.kitPresets.findIndex(q => q.name === name);
  S.kitPresets = k >= 0 ? S.kitPresets.map((q, n) => n === k ? p : q) : S.kitPresets.concat(p);
  setDirty(true); kitSync(); toast(k >= 0 ? 'Preset ' + name + ' replaced.' : 'Kept as a preset in this project. Start from shows it.');
}
/* What a file may hold: a choice the kit can build, its name, the ramps picked by role, and the shuffle's seed. */
function cleanKitPresets(list) {
  return (Array.isArray(list) ? list : []).slice(0, 500).filter(p => p && typeof p === 'object' && KIT_BUILT.templates.some(t => t.id === p.t)).map(p => {
    const map = {}; if (p.map && typeof p.map === 'object') for (const n of KIT_ROLES) if (typeof p.map[n] === 'string') map[n] = p.map[n].slice(0, 40);
    return Object.assign(kitClean(p), { name: String(p.name || 'Character').slice(0, 40), map: Object.keys(map).length ? map : undefined, seed: Number.isInteger(p.seed) ? p.seed : 1 });
  });
}
/* A new Character layer with its pivot on the feet, at the middle of the view: on a cell center in Iso, on a cell's bottom edge in 2D with Snap = Cell.
   Iso adds the mirror as a linked layer, 2D the side view beside it, or in the same place but hidden where the canvas has no room. Growing the canvas, if it must, is its own step. */
function kitAdd() {
  commitFloat();
  const { st, map } = kitNow(), name = st.name, t = kitTpl(KT.c.t), f = st.facings[0], pv = f.pivot;
  const snap = p => { if (S.mode === 'iso') return cellCenter(p.x, p.y); if (!cellBrush()) return p; const c = cellCenter(p.x, p.y); return { x: c.x, y: Math.round(p.y / S.cell) * S.cell }; };
  const v = viewCenter();
  let p = snap({ x: Math.max(pv.x, Math.min(v.x, S.w - f.w + pv.x)), y: Math.max(pv.y, Math.min(v.y, S.h - f.h + pv.y)) });
  const second = t.views.length > 1, side = st.facings[1], beside = second && f.w * 2 + 2 <= S.w ? { x: p.x + f.w + 2, y: p.y } : null;
  let s = second ? beside || p : p;
  if (beside && s.x - side.pivot.x + side.w > S.w) { s = { x: p.x - f.w - 2, y: p.y }; if (s.x - side.pivot.x < 0) s = p; }
  const boxes = [[p.x - pv.x, p.y - pv.y, p.x - pv.x + f.w - 1, p.y - pv.y + f.h - 1], second ? [s.x - side.pivot.x, s.y - side.pivot.y, s.x - side.pivot.x + side.w - 1, s.y - side.pivot.y + side.h - 1] : [2 * p.x - 1 - (p.x - pv.x + f.w - 1), p.y - pv.y, 2 * p.x - 1 - (p.x - pv.x), p.y - pv.y + f.h - 1]];
  const g = growToInclude(Math.min(boxes[0][0], boxes[1][0]), Math.min(boxes[0][1], boxes[1][1]), Math.max(boxes[0][2], boxes[1][2]), Math.max(boxes[0][3], boxes[1][3]), 0);
  if (!g) { toast('The canvas is at its size limit.'); return null; }
  p = { x: p.x + g.dx, y: p.y + g.dy }; s = { x: s.x + g.dx, y: s.y + g.dy };
  const A = activeLayer(), make = (nm, face, at) => {
    const L = makeLayer(nm), b = stmPixels(st, face, map), q = st.facings[face].pivot, ox = at.x - q.x, oy = at.y - q.y;
    L.kind = 'character'; L.group = A.group; L.pivot = { x: at.x, y: at.y };
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const v2 = b.px[y * b.w + x], X = ox + x, Y = oy + y; if (v2 && X >= 0 && Y >= 0 && X < S.w && Y < S.h) L.px[Y * S.w + X] = v2; }
    flush(L); return L;
  };
  const L1 = make(name, 0, p);
  let L2;
  if (second) { L2 = make(name + ', side', 1, s); if (s === p || (s.x === p.x && s.y === p.y)) L2.visible = false; }
  else { L2 = makeLayer(name + ' (mirrored)'); L2.kind = 'character'; L2.group = A.group; L2.mirrorOf = L1.id; L2.pivot = L1.pivot; L2.px.set(mirrorPx(L1.px, mirrorMap(L1, null))); flush(L2); }
  const list = S.layers.slice(), idx = aboveFamily(A); list.splice(idx, 0, L1, L2);
  pushHistory(layerListEntry(list)); S.active = S.layers.indexOf(L1); hooks.layers && hooks.layers(); shadowTidy();
  closeSheets();
  toast(second ? (L2.visible ? 'Added on two layers: front, and the side view beside it.' : 'Added on two layers. The side view is in the same place, hidden; show it with its eye.') : 'Added, with its mirror for the other facing on a linked layer.');
  return L1;
}
function initKit() {
  const tpls = $('kitTpls');
  for (const t of KIT_BUILT.templates) { const b = document.createElement('button'); b.dataset.tpl = t.id; b.textContent = t.name; b.onclick = () => { KT.c = kitClean(KT.c, t.id); kitSync(); }; tpls.appendChild(b); }
  $('kitOut').querySelectorAll('button').forEach(b => { b.onclick = () => { KT.c = Object.assign({}, KT.c, { outline: b.dataset.out }); kitSync(); }; });
  $('kitShuffle').onclick = () => kitDoShuffle(KT.seed + 1);
  $('kitSeed').onchange = () => { const n = Math.round(+$('kitSeed').value); if (Number.isInteger(n) && n > 0) kitDoShuffle(n); else kitSync(); };
  $('kitUndo').onclick = () => { const p = KT.past.pop(); if (p) { KT.c = p.c; KT.map = p.map; KT.seed = p.seed; kitSync(); } };
  $('kitKeepColors').onclick = () => { KT.locks.has('colors') ? KT.locks.delete('colors') : KT.locks.add('colors'); kitSync(); };
  $('kitOwn').onclick = () => { KT.map = {}; kitSync(); };
  $('kitName').oninput = e => { KT.name = e.target.value; };
  $('kitFrom').onchange = e => { const v = e.target.value; if (!v) return; const p = v[0] === 'p' ? S.kitPresets[+v.slice(1)] : KIT_BUILT.cast[+v.slice(1)]; if (p) kitLoad(p); };
  $('kitAdd').onclick = kitAdd; $('kitStampBtn').onclick = kitSaveStamp; $('kitPreset').onclick = kitSavePreset;
  $('kitOpen').onclick = kitOpen; $('charKit').onclick = kitOpen;
}

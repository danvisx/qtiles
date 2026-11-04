'use strict';
/* qtiles stamps (047): small pixel art, placed like a paste. A stamp is stored by color role, not by color: each pixel is a role and a step
   along that role's own ramp, and the role lands on a ramp of the project palette, by name or else the nearest by color. Recoloring is choosing another ramp.
   On the pen a stamp is an ordinary floating selection that remembers where each of its pixels came from (`FL.st.idx`), so a ramp chosen after a flip still recolors it. */

const STAMP_CATS = ['Characters', 'Animals', 'Household', 'Food', 'Plants', 'Icons', 'Effects', 'Mine'], STAMP_MODES = ['2d', 'iso', 'both'], STAMP_THUMB = 48, STAMP_MAX = 256;
const STAMP_BUILT = [];   // app/library/stamps.js adds to it
const SM = { built: [], cat: 'All', q: '', tab: 'objects', seed: 1, keep: false };
const STAMP_KEYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/* ---------- stamps ---------- */
/* The checked form: rows of letters, a legend from letter to [role, step], and for each facing the codes worked out once, role * 256 + step + 1, with 0 empty. */
function cleanStamp(x, mine) {
  if (!x || !Array.isArray(x.roles) || !x.roles.length || !x.legend || !Array.isArray(x.facings) || !x.facings.length) return null;
  const roles = x.roles.slice(0, 64).map(r => {
    const colors = (Array.isArray(r && r.colors) ? r.colors : []).filter(h => hexToRgb(h)).slice(0, 256).map(h => h.toLowerCase());
    return colors.length ? { name: String(r.name || 'color').slice(0, 24), ramp: String(r.ramp || '').slice(0, 40), colors, fixed: !!r.fixed || undefined } : null;
  });
  if (roles.some(r => !r)) return null;
  const legend = {}, used = roles.map(() => new Set());
  for (const [k, v] of Object.entries(x.legend)) if (k.length === 1 && k !== '.' && Array.isArray(v) && roles[v[0]] && Number.isInteger(v[1]) && v[1] >= 0 && v[1] < roles[v[0]].colors.length) legend[k] = [v[0], v[1]];
  const facings = [];
  for (const f of x.facings.slice(0, 2)) {
    const rows = Array.isArray(f && f.rows) ? f.rows.map(String) : [], w = rows.length ? rows[0].length : 0, h = rows.length;
    if (!w || w > STAMP_MAX || h > STAMP_MAX || rows.some(r => r.length !== w)) return null;
    const code = new Uint16Array(w * h);
    rows.forEach((r, y) => { for (let i = 0; i < w; i++) { const q = legend[r[i]]; if (q) { code[y * w + i] = q[0] * 256 + q[1] + 1; used[q[0]].add(q[1]); } } });
    if (!code.some(Boolean)) return null;
    const p = f.pivot, pivot = p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h ? { x: p.x, y: p.y } : null;
    facings.push({ rows, w, h, code, pivot });
  }
  if (!facings.length) return null;
  return { id: String(x.id || 'stamp-' + Date.now().toString(36)), name: String(x.name || 'Stamp').slice(0, 40), category: STAMP_CATS.includes(x.category) ? x.category : 'Mine', mode: STAMP_MODES.includes(x.mode) ? x.mode : 'both',
    tags: (Array.isArray(x.tags) ? x.tags : []).map(t => String(t).toLowerCase().slice(0, 24)).slice(0, 12), author: x.author === 'claude' ? 'claude' : 'owner', mine: !!mine,
    roles, legend, facings, used: used.map(s => [...s].sort((a, b) => a - b)) };
}
const cleanStamps = list => (Array.isArray(list) ? list : []).map(x => cleanStamp(x, true)).filter(Boolean);
/* What a file keeps: the worked-out parts are made again on load. */
const stmSaved = x => ({ id: x.id, name: x.name, category: x.category, mode: x.mode, tags: x.tags.length ? x.tags : undefined, author: x.author, roles: x.roles, legend: x.legend, facings: x.facings.map(f => ({ rows: f.rows, pivot: f.pivot || undefined })) });
const stmItems = () => SM.built.concat(S.stamps);
const stmFind = id => stmItems().find(x => x.id === id) || null;

/* ---------- roles and ramps ---------- */
const stmRamps = () => paletteRamps().filter(r => !isLoose(r) && r.colors.length);
const rampNamed = n => stmRamps().find(r => r.name === n) || null;
/* Where the steps a role uses land on a ramp m long, kept in order and apart while the ramp has room. By default at the same places along it,
   so a darker ramp chosen gives a darker part; with `cost`, wherever it is least, which is how a ramp found by color is fitted. */
function stmSteps(n, used, m, cost = (i, j) => (j - (n > 1 ? used[i] * (m - 1) / (n - 1) : (m - 1) / 2)) ** 2) {
  const k = used.length, gap = m >= k ? 1 : 0, back = [];
  let prev = null;
  for (let i = 0; i < k; i++) {
    const cur = new Array(m).fill(Infinity), from = new Array(m).fill(-1);
    for (let j = 0; j < m; j++) {
      const c = cost(i, j);
      if (!i) { cur[j] = c; continue; }
      for (let q = 0; q <= j - gap; q++) if (prev[q] + c < cur[j]) { cur[j] = prev[q] + c; from[j] = q; }
    }
    back.push(from); prev = cur;
  }
  const out = new Array(k), best = Math.min(...prev); let j = prev.indexOf(best);
  for (let i = k - 1; i >= 0; i--) { out[i] = j; j = back[i][j]; }
  out.cost = best; return out;
}
/* Weighted toward green, as the eye is, so a skin finds a brown before a yellow of the same brightness. */
const rgbFar = (a, b) => { const p = hexToRgb(a), q = hexToRgb(b); return 2 * (p[0] - q[0]) ** 2 + 4 * (p[1] - q[1]) ** 2 + 3 * (p[2] - q[2]) ** 2; };
const stmFit = (r, used, q) => stmSteps(r.colors.length, used, q.colors.length, (i, j) => rgbFar(r.colors[used[i]], q.colors[j]));
/* A role's own ramp by name, or the ramp whose colors come nearest its own. Null keeps the stamp's own colors. */
function stmDefault(st, k) {
  const r = st.roles[k]; if (r.fixed || !st.used[k].length) return null;
  const named = rampNamed(r.ramp); if (named) return named.name;
  let best = null, bd = Infinity;
  const skins = /skin/i.test(r.name) ? stmRamps().filter(q => /skin/i.test(q.name)) : [];   // a skin finds a skin ramp where the palette has one, never a brick of the same color
  for (const q of skins.length ? skins : stmRamps()) { const d = stmFit(r, st.used[k], q).cost; if (d < bd) { bd = d; best = q.name; } }
  return best;
}
/* Worked out once per stamp and palette: S.palette is a new array whenever the ramps change. */
const stmDefs = new WeakMap();
function stmMap(st) {
  const c = stmDefs.get(st); if (c && c.pal === S.palette) return c.map.slice();
  const map = st.roles.map((r, k) => stmDefault(st, k)); stmDefs.set(st, { pal: S.palette, map }); return map.slice();
}
/* Packed colors by role and step, for one choice of ramps. */
function stmInks(st, map) {
  const def = stmMap(st);
  return st.roles.map((r, k) => {
    const ramp = map[k] ? rampNamed(map[k]) : null, used = st.used[k], out = [];
    const to = ramp && used.length && (map[k] === def[k] ? stmFit(r, used, ramp) : stmSteps(r.colors.length, used, ramp.colors.length));   // the default ramp fits by color, a chosen one by place
    used.forEach((s, i) => { out[s] = packHex(ramp ? ramp.colors[to[i]] : r.colors[s]); });
    return out;
  });
}
function stmPixels(st, face, map) {
  const f = st.facings[face] || st.facings[0], ink = stmInks(st, map), px = new Uint32Array(f.w * f.h), idx = new Uint32Array(f.w * f.h);
  for (let i = 0; i < px.length; i++) { const c = f.code[i]; if (c) { px[i] = ink[(c - 1) >> 8][(c - 1) & 255]; idx[i] = i + 1; } }
  return { w: f.w, h: f.h, px, idx };
}
/* Other ramps, from a seed, so the same press gives the same stamp. An outline keeps its ramp, and skin moves only among ramps named for skin. */
function stmShuffle(st, map, seed) {
  const rnd = mulberry32(seed), ramps = stmRamps(), taken = new Set();
  return st.roles.map((r, k) => {
    if (r.fixed || !map[k] || /outline/i.test(r.name)) return map[k];
    const skin = /skin/i.test(r.name), pool = ramps.filter(q => q.colors.length >= Math.min(3, st.used[k].length) && (!skin || /skin/i.test(q.name))), free = pool.filter(q => !taken.has(q.name));
    if ((skin && pool.length < 2) || !pool.length) return map[k];
    const q = (free.length ? free : pool)[Math.floor(rnd() * (free.length ? free : pool).length)]; taken.add(q.name); return q.name;
  });
}

/* ---------- on the pen ---------- */
/* The same path as a paste: a float on the active layer, at the view's center or the point given, its pivot there if it has one. */
function stmPlace(st, at, map = stmMap(st), face = 0) {
  const b = stmPixels(st, face, map), p = at || viewCenter(), pv = (st.facings[face] || st.facings[0]).pivot;
  if (!pasteBuf(b, p)) return false;
  FL.st = { id: st.id, face, map, idx: b.idx, pv: pv ? { x: pv.x, y: pv.y } : null };
  if (pv) { FL.x = p.x - pv.x; FL.y = p.y - pv.y; }
  floatSnap(); selRefresh(); return true;
}
/* Another copy of what was just placed, as it was, flips and colors and all. */
function stmAgain(f, at) {
  if (!pasteBuf({ w: f.w, h: f.h, px: f.px }, at)) return;
  FL.st = Object.assign({}, f.st, { idx: f.st.idx.slice(), pv: f.st.pv && Object.assign({}, f.st.pv) });
  if (!at) { FL.x = f.x; FL.y = f.y; } else if (FL.st.pv) { FL.x = at.x - FL.st.pv.x; FL.y = at.y - FL.st.pv.y; }
  floatSnap(); selRefresh();
}
const stmOnPen = () => FL && FL.st ? stmFind(FL.st.id) : null;
function stmRecolor(map) {
  const f = FL, st = stmOnPen(); if (!st) return;
  const face = st.facings[f.st.face] || st.facings[0], ink = stmInks(st, map);
  f.st.map = map;
  for (let i = 0; i < f.px.length; i++) { const k = f.st.idx[i]; if (k) { const c = face.code[k - 1] - 1; f.px[i] = ink[c >> 8][c & 255]; } }
  floatCanvas(f); requestRender(); stmBarSync();
}
/* A facing is a different drawing, so it starts unflipped where the last one stood. */
function stmFace(face) {
  const f = FL, st = stmOnPen(); if (!st || face === f.st.face) return;
  const old = f.st.pv ? { x: f.x + f.st.pv.x, y: f.y + f.st.pv.y } : { x: f.x + (f.w >> 1), y: f.y + (f.h >> 1) };
  const map = f.st.map; FL = null; selRefresh(); stmPlace(st, old, map, face);
}

/* ---------- my stamps ---------- */
/* Each color on a palette ramp becomes that ramp's role at its step; a color on no ramp joins a loose role that keeps it as it is. */
function stmCapture(name, category) {
  let w, h, px, ox, oy, L = FL ? FL.L : activeLayer();
  if (FL) { w = FL.w; h = FL.h; px = FL.px; ox = FL.x; oy = FL.y; }
  else if (SEL.mask) { const g = grabSel(L); w = g.w; h = g.h; px = g.px; ox = SEL.box.x0; oy = SEL.box.y0; }
  else return null;
  const b = maskBox(px.map(v => v >>> 24 ? 1 : 0), w, h); if (!b) return null;
  const roles = [], legend = {}, byColor = new Map(), keys = [...STAMP_KEYS];
  const roleOf = (ramp, colors, fixed) => { let k = roles.findIndex(r => r.ramp === ramp); if (k < 0) { k = roles.push({ name: fixed ? 'loose' : ramp.toLowerCase(), ramp, colors, fixed: fixed || undefined }) - 1; } return k; };
  const rows = [];
  for (let y = b.y0; y <= b.y1; y++) {
    let row = '';
    for (let x = b.x0; x <= b.x1; x++) {
      const v = px[y * w + x]; if (!(v >>> 24)) { row += '.'; continue; }
      if (!byColor.has(v)) {
        const hex = packedHex(v), ramp = stmRamps().find(r => r.colors.includes(hex)), key = keys.length ? keys.shift() : String.fromCharCode(192 + byColor.size);
        let q;
        if (ramp) q = [roleOf(ramp.name, ramp.colors.slice()), ramp.colors.indexOf(hex)];
        else { const k = roleOf(LOOSE, [], true); roles[k].colors.push(hex); q = [k, roles[k].colors.length - 1]; }
        byColor.set(v, key); legend[key] = q;
      }
      row += byColor.get(v);
    }
    rows.push(row);
  }
  const x0 = ox + b.x0, y0 = oy + b.y0, cw = b.x1 - b.x0 + 1, ch = b.y1 - b.y0 + 1;
  const lp = FL && FL.pv ? { x: FL.x + FL.pv.x, y: FL.y + FL.pv.y } : L.pivot, pivot = lp && lp.x >= x0 && lp.y >= y0 && lp.x <= x0 + cw && lp.y <= y0 + ch ? { x: lp.x - x0, y: lp.y - y0 } : undefined;
  return cleanStamp({ id: 'mine-' + Date.now().toString(36) + '-' + S.stamps.length, name, category, mode: 'both', author: 'owner', roles, legend, facings: [{ rows, pivot }] }, true);
}
function stmSaveSel(name, category) {
  if (!FL && !SEL.mask) { toast('Select something first.'); return null; }
  const w = FL ? FL.w : SEL.box.x1 - SEL.box.x0 + 1, h = FL ? FL.h : SEL.box.y1 - SEL.box.y0 + 1;
  if (w > STAMP_MAX || h > STAMP_MAX) { toast('A stamp is at most ' + STAMP_MAX + ' x ' + STAMP_MAX + ' px.'); return null; }
  const st = stmCapture(name, category); if (!st) { toast('The selection is empty.'); return null; }
  stmAdd(st); toast('Saved as a stamp, under Mine.'); return st;
}
function stmAdd(st) { const k = S.stamps.findIndex(x => x.id === st.id); if (k >= 0) S.stamps[k] = st; else S.stamps.push(st); setDirty(true); syncLibrary(); }
function stmRemove(id) { S.stamps = S.stamps.filter(x => x.id !== id); setDirty(true); syncLibrary(); stmBarSync(); }

/* ---------- panel ---------- */
/* The largest whole scale that fits, so a pixel stays square. */
function stmThumb(cv, st) {
  const sig = st.id + S.pal.ramps.map(r => r.name + r.colors.join()).join(); if (cv.dataset.sig === sig) return; cv.dataset.sig = sig;
  const f = st.facings[0], k = Math.max(1, Math.floor(STAMP_THUMB / Math.max(f.w, f.h))), b = stmPixels(st, 0, stmMap(st)), ctx = cv.getContext('2d'), img = ctx.createImageData(STAMP_THUMB, STAMP_THUMB), out = new Uint32Array(img.data.buffer);
  const ox = Math.floor((STAMP_THUMB - f.w * k) / 2), oy = Math.floor((STAMP_THUMB - f.h * k) / 2);
  for (let y = 0; y < STAMP_THUMB; y++) for (let x = 0; x < STAMP_THUMB; x++) {
    const sx = Math.floor((x - ox) / k), sy = Math.floor((y - oy) / k);
    if (sx >= 0 && sy >= 0 && sx < f.w && sy < f.h) out[y * STAMP_THUMB + x] = b.px[sy * f.w + sx];
  }
  ctx.putImageData(img, 0, 0);
}
/* The Place tool shows stamps: always in 2D, where there are no objects, and in Iso on the Library's Stamps tab. A tap on the canvas then places nothing. */
const stmView = () => S.mode !== 'iso' || (S.placeTab === 'library' && SM.tab === 'stamps');
const stmFits = x => x.mode === 'both' || (x.mode === 'iso') === (S.mode === 'iso');
function stmShown() {
  const q = SM.q.trim().toLowerCase();
  return stmItems().filter(x => stmFits(x) && (SM.cat === 'All' || (SM.cat === 'Mine' ? x.mine : x.category === SM.cat)) && (!q || x.name.toLowerCase().includes(q) || x.tags.some(t => t.includes(q))));
}
function stmSync() {
  const flat = S.mode !== 'iso', on = flat || SM.tab === 'stamps';
  $('placeFrom').hidden = flat; if (flat) { $('placeShapes').hidden = true; $('placeLib').hidden = false; } $('libKinds').hidden = flat; press($('libKindStamps'), on); press($('libKindObjects'), !on); $('libStamps').hidden = !on; $('libObjects').hidden = on;
  if (!on) return;
  const has = new Set(stmItems().filter(stmFits).map(x => x.category));
  document.querySelectorAll('[data-stm-cat]').forEach(b => { const c = b.dataset.stmCat; b.hidden = c !== 'All' && c !== 'Mine' && !has.has(c); press(b, c === SM.cat); });
  const host = $('stmGrid'), list = stmShown(), key = list.map(x => x.id + x.name).join() + S.mode;
  if (host.dataset.key !== key) {
    host.dataset.key = key; host.textContent = '';
    for (const x of list) {
      const b = document.createElement('button'), c = document.createElement('canvas'); b.className = 'shapecard'; b.dataset.stamp = x.id; c.width = c.height = STAMP_THUMB;
      b.setAttribute('aria-label', x.name + (x.author === 'claude' ? ', starter art' : '') + (x.tags.length ? '. ' + x.tags.join(', ') : ''));
      b.append(c, x.name);
      if (x.author === 'claude') { const s = document.createElement('small'); s.className = 'starter'; s.textContent = 'Starter art'; b.appendChild(s); }
      b.onclick = () => { if (stmPlace(x)) { stmBarSync(); panelReveal($('stmBar')); panelJump(); } };
      host.appendChild(b);
    }
  }
  for (const b of host.children) stmThumb(b.firstChild, stmFind(b.dataset.stamp));
  $('stmEmpty').hidden = list.length > 0;
  $('stmEmpty').textContent = SM.cat === 'Mine' ? 'Nothing here yet. Select some pixels, then Save as stamp in the selection bar.' : 'No stamps match.';
}
/* The role bar: one row per role, while a stamp is on the pen. */
function stmBarSync() {
  const st = stmOnPen(), bar = $('stmBar'); bar.hidden = !st; if (!st) { bar.dataset.key = ''; return; }
  const map = FL.st.map, names = stmRamps().map(r => r.name), key = st.id + FL.st.face + names.join();
  $('stmName').textContent = st.name; $('stmBy').textContent = st.author === 'claude' ? 'Starter art, redraw it' : ''; $('stmDel').hidden = !st.mine;
  const faces = $('stmFaces'); faces.hidden = st.facings.length < 2;
  faces.querySelectorAll('button').forEach(b => press(b, +b.dataset.face === FL.st.face));
  if (bar.dataset.key !== key) {
    bar.dataset.key = key; const host = $('stmRows'); host.textContent = '';
    st.roles.forEach((r, k) => {
      if (r.fixed || !map[k] || !st.used[k].length) return;
      const row = document.createElement('label'), sw = document.createElement('span'), sel = document.createElement('select');
      row.className = 'field stmrole'; sw.className = 'stmsw'; sel.dataset.role = k; sel.setAttribute('aria-label', 'Ramp for ' + r.name);
      for (const n of names) { const o = document.createElement('option'); o.value = o.textContent = n; sel.appendChild(o); }
      sel.onchange = () => { const m = FL.st.map.slice(); m[k] = sel.value; stmRecolor(m); };
      row.append(r.name.replace(/-/g, ' '), sw, sel); host.appendChild(row);
    });
  }
  const ink = stmInks(st, map);
  $('stmRows').querySelectorAll('select').forEach(sel => {
    const k = +sel.dataset.role, sw = sel.previousSibling; sel.value = map[k]; sw.textContent = '';
    for (const s of st.used[k]) { const d = document.createElement('i'); d.style.background = packedHex(ink[k][s]); sw.appendChild(d); }
  });
}
function initStamps() {
  const row = $('stmCats');
  for (const c of ['All'].concat(STAMP_CATS)) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.stmCat = c; b.textContent = c; b.onclick = () => { SM.cat = c; stmSync(); }; row.appendChild(b); }
  for (const c of STAMP_CATS) { const o = document.createElement('option'); o.textContent = c; $('stmCat').appendChild(o); }
  $('stmSearch').oninput = e => { SM.q = e.target.value; stmSync(); };
  $('libKindStamps').onclick = () => { SM.tab = 'stamps'; S.libPick = null; pvClear(); syncLibrary(); };
  $('libKindObjects').onclick = () => { SM.tab = 'objects'; syncLibrary(); };
  $('stmShuffle').onclick = () => { const st = stmOnPen(); if (st) stmRecolor(stmShuffle(st, FL.st.map, SM.seed++)); };
  $('stmOwn').onclick = () => { const st = stmOnPen(); if (st) stmRecolor(stmMap(st)); };
  $('stmFaces').querySelectorAll('button').forEach(b => { b.onclick = () => stmFace(+b.dataset.face); });
  $('stmKeep').onclick = () => { SM.keep = !SM.keep; press($('stmKeep'), SM.keep); };
  $('stmDel').onclick = () => { const st = stmOnPen(); if (st && st.mine) { cancelFloat(); stmRemove(st.id); toast('Stamp removed. Copies already placed stay.'); } };
  $('stmSaveOk').onclick = () => { closeSheets(); stmSaveSel($('stmSaveName').value.trim() || 'Stamp', $('stmCat').value); };
  SM.built = STAMP_BUILT.concat(kitCast()).map(x => cleanStamp(x, false)).filter(Boolean);   // the kit's cast (048) after the drawn stamps
}
function openStampSave() {
  if (!FL && !SEL.mask) { toast('Select something first.'); return; }
  $('stmSaveName').value = 'My stamp'; $('stmCat').value = 'Mine'; openSheet('sheetStamp');
}

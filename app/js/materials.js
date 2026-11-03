'use strict';
/* qtiles materials: surface patterns that stay inside an object's ramp.
   A material's shade(u, v, ctx) gives a ramp offset for one face-space pixel: -1, 0 or +1. DETAIL_UP and DETAIL_DOWN mark a joint, which takes the accent ramp when the look has one, and otherwise steps one way along the object's own ramp.
   Coordinates come from the grid and the face's plane, not from the object, so two objects on one plane continue each other's pattern when seed and scale match. */

const DETAIL_UP = 2, DETAIL_DOWN = -2, MAT_SCALE_MAX = 4;
/* A plain integer mix rather than hash3: this runs once per textured pixel, and hash3 makes a closure each time. */
function matHash(a, b, c) {
  let t = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791);
  t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const fmod = (n, m) => ((n % m) + m) % m;
const MATERIALS = {};
function addMaterial(m) { MATERIALS[m.id] = m; }
const matOf = id => MATERIALS[id] || MATERIALS.plain;

/* Stone blocks vary in width and height. Each block's right edge and top edge are chosen by the block, so joints stay closed however the blocks differ. */
function stoneShade(u, v, c) {
  const W = 8, R = 5, row = Math.floor(v / R), uu = u + Math.floor(matHash(row, 7, c.seed) * W), slot = Math.floor(uu / W), jit = k => Math.floor(matHash(k, row, c.seed) * 3);
  const col = fmod(uu, W) < jit(slot) ? slot - 1 : slot, end = (col + 1) * W + jit(col + 1) - 1, up = R - 1 - (matHash(col, row, c.seed + 1) < 0.4 ? 1 : 0), rv = fmod(v, R);
  if (uu === end || rv === up) return -1;
  if (rv > up) return matHash(col, row + 1, c.seed + 2) < 0.25 ? 1 : 0;   // the short block's gap belongs to the course above
  return matHash(col, row, c.seed + 2) < 0.25 ? 1 : 0;
}
/* Rows are 4 high and tiles 6 wide. v runs up the face, so the rounded lower edge of a tile is the low row at its middle and the row above at its corners. */
function tilesShade(u, v, c) {
  const row = Math.floor(v / 4), uu = u + (row & 1) * 3, slot = Math.floor(uu / 6), a = fmod(uu, 6), b = fmod(v, 4), rim = a === 0 || a === 5 ? 1 : 0;
  if (a === 5 && b > 1) return -1;
  if (b === rim) return -1;
  if (b < rim) return 0;
  return b === 3 && a > 1 && a < 4 && matHash(slot, row, c.seed) < 0.5 ? 1 : 0;
}

for (const m of [
  { id: 'plain', name: 'Plain', shade: () => 0 },
  { id: 'brick', name: 'Brick', shade(u, v, c) {   // rows 3 high, bricks 6 wide, running bond
    const row = Math.floor(v / 3), uu = u + (row & 1) * 3;
    if (fmod(v, 3) === 2 || fmod(uu, 6) === 5) return DETAIL_UP;
    return matHash(Math.floor(uu / 6), row, c.seed) < 0.18 ? -1 : 0;
  } },
  { id: 'planks', name: 'Planks', seeded: true, dirs: true, shade(u, v, c) {
    const along = c.dir === 'h' ? u : v, across = c.dir === 'h' ? v : u, P = 5, n = Math.floor(across / P), run = along + Math.floor(matHash(n, 3, c.seed) * 16), slot = Math.floor(run / 16);
    if (fmod(across, P) === P - 1) return matHash(n, slot, c.seed + 1) < 0.2 ? 0 : DETAIL_DOWN;   // some gaps are closed
    if (fmod(run, 16) === 15) return -1;
    return matHash(across, Math.floor(run / 5), c.seed + 2) < 0.1 ? -1 : 0;   // grain
  } },
  { id: 'stone', name: 'Stone', seeded: true, shade: stoneShade },
  { id: 'tiles', name: 'Roof tiles', seeded: true, shade: tilesShade },
  { id: 'grass', name: 'Grass', seeded: true, shade(u, v, c) {
    if (matHash(Math.floor(u / 6), Math.floor(v / 6), c.seed + 3) < 0.6) for (let k = 0; k < 3; k++) if (matHash(u, v - k, c.seed + 4) < 0.09) return k < 2 ? 1 : 0;   // a blade, tip at its top
    return matHash(u, v, c.seed) < 0.12 ? -1 : 0;
  } },
  { id: 'concrete', name: 'Concrete', seeded: true, shade(u, v, c) { const r = matHash(u, v, c.seed); return r < 0.05 ? -1 : r > 0.975 ? 1 : 0; } },
  { id: 'glass', name: 'Glass', shade(u, v) {
    if (fmod(u, 8) === 7 || fmod(v, 8) === 7) return DETAIL_DOWN;
    return fmod(u + v, 24) < 3 ? 1 : 0;   // the glint crosses panes
  } },
  { id: 'water', name: 'Water', seeded: true, shade(u, v, c) {
    const row = Math.floor(v / 3); if (fmod(v, 3)) return 0;
    const a = fmod(u + Math.floor(matHash(row, 5, c.seed) * 16), 16); return a < 5 ? 1 : a >= 10 && a < 13 ? -1 : 0;
  } }
]) addMaterial(m);

const lookScale = k => Math.max(1, Math.min(MAT_SCALE_MAX, k.scale | 0 || 1));
/* The roof of a house is its material, so a shape that is mostly slope reads `materialTop` for its end walls, and they stay plain by default. */
function faceMaterial(o, g, f, m) {
  const k = o.look; if (f && f.mat) return f.mat;
  if (k.side && f && f.n && f.n[2] > 0) return k.materialTop || 'plain';   // terrain: a slope is ground, not wall
  if (g.endsTop && m > 0 && m < 4) return k.materialTop || 'plain';
  return (m === 1 && k.materialTop) || k.material || 'plain';
}
/* How a face maps pixels to (u, v). A plane's contour lines project to the stair, so a wall or a slope reads the same way:
   u is the screen column and v counts rows up from the stair line through the object's near edge, whatever the slope. Rows stay level along the face and stay one pixel high.
   Which of the two stairs depends on the axis the contours run along, which the normal gives. */
function faceKind(g, f, m) {
  if (m === 1) return 'top';
  if (!f || !f.n || f.round) return g.uv ? 'round' : 'screen';
  if (Math.abs(f.n[0]) < 1e-9 && Math.abs(f.n[1]) < 1e-9) return 'top';
  return Math.abs(f.n[1]) < 1e-9 ? 'right' : 'left';
}
/* A pattern is read through a table, filled as pixels ask for it, because hashing every pixel of a large scene is seconds of work. The period is a multiple of every row and block size above, so the wrap shows no joint. */
const MAT_PERIOD = 240, MAT_UNSET = 127, matTables = new Map(), UV = [0, 0];   // round faces hand back their coordinates here
function matTable(mat, ctx) {
  const key = [mat.id, ctx.seed, ctx.kind, ctx.dir].join();
  let t = matTables.get(key);
  if (!t) { if (matTables.size >= 96) matTables.clear(); t = new Int8Array(MAT_PERIOD * MAT_PERIOD).fill(MAT_UNSET); matTables.set(key, t); }
  return t;
}
const KIND_TOP = 1, KIND_LEFT = 2, KIND_RIGHT = 3, KIND_ROUND = 4, KIND_SCREEN = 5, KINDS = { top: KIND_TOP, left: KIND_LEFT, right: KIND_RIGHT, round: KIND_ROUND, screen: KIND_SCREEN };
/* One function for all of an object's marks, returning null when the object is plain all over: that is the common case, and it must stay as cheap as it was. A single function, not one per mark, because this is the hottest loop in a textured scene. */
function objPainter(o, s, g, faces, wx, w) {
  const k = o.look; if (!s.paint || (!g.attach && !k.materialTop && (!k.material || k.material === 'plain'))) return null;
  const mats = faces.map((f, m) => { const q = m ? matOf(faceMaterial(o, g, f, m)) : null; return q && q.id !== 'plain' ? q : null; });
  if (!mats.some(Boolean)) return null;
  const n = mats.length, kinds = new Uint8Array(n), tables = new Array(n), pals = new Array(n), ctxs = new Array(n), scale = lookScale(k), seed = k.seed | 0;
  mats.forEach((mat, m) => { if (!mat) return; const kind = faceKind(g, faces[m], m); kinds[m] = KINDS[kind]; ctxs[m] = { seed, scale, kind, dir: k.dir }; tables[m] = matTable(mat, ctxs[m]); pals[m] = s.paint(m); });
  const D = S.tile / 4, Ka = (2 * o.i + o.w) * D - 1, Kb = (2 * o.j + o.d) * D - 1, e1 = new Int32Array(w), e2 = new Int32Array(w), gx = S.gox, gy = S.goy, uv = g.uv ? g.uv(o) : null;
  const wrapped = new Int32Array(w);   // the column, which walls use as u, already scaled and wrapped. Scale divides the coordinates, so a pattern grows by whole pixels and nothing lands between them
  for (let c = 0; c < w; c++) { const X = c + wx - gx; e1[c] = edgeY(-1 - X); e2[c] = edgeY(X); wrapped[c] = fmod(Math.floor(X / scale), MAT_PERIOD); }
  /* It returns a slot in tex.pals[f], not the color: packed colors do not fit a small integer, and returning one per pixel allocates. */
  const tex = (f, x, y) => {
    const kd = kinds[f]; if (!kd) return -1;
    const c = x - wx, Y = y - gy; let u, v;
    switch (kd) {
      case KIND_TOP: u = Y - e1[c]; v = Y - e2[c]; break;
      case KIND_LEFT: u = wrapped[c]; v = e2[c] + Kb - Y; break;
      case KIND_RIGHT: u = MAT_PERIOD - 1 - wrapped[c]; v = e1[c] + Ka - Y; break;
      case KIND_ROUND: uv(x, y); u = UV[0]; v = UV[1]; break;
      default: u = x; v = -y;
    }
    if (scale > 1) { if (kd !== KIND_LEFT && kd !== KIND_RIGHT) u = Math.floor(u / scale); v = Math.floor(v / scale); }
    if (u < 0 || u >= MAT_PERIOD) { u %= MAT_PERIOD; if (u < 0) u += MAT_PERIOD; }   // most pixels skip this, and a division per pixel shows
    if (v < 0 || v >= MAT_PERIOD) { v %= MAT_PERIOD; if (v < 0) v += MAT_PERIOD; }
    const t = tables[f], q = v * MAT_PERIOD + u; let r = t[q]; if (r === MAT_UNSET) r = t[q] = mats[f].shade(u, v, ctxs[f]);
    return r + 2;
  };
  tex.pals = pals; return tex;
}

/* ---------- picker ---------- */
const MAT_PX = 32;
/* A swatch is the real renderer on a small box, so it shows what the look will give. */
function drawMatSwatch(cv, id, look) {
  const keep = [S.tile, S.gox, S.goy, S.edgeRun, S.level], ctx = cv.getContext('2d'), img = ctx.createImageData(MAT_PX, MAT_PX), px = new Uint32Array(img.data.buffer);
  Object.assign(S, { tile: 16, gox: 16, goy: 14, edgeRun: 2, level: 0 });
  try {
    const o = objNew({ w: 4, d: 4, h: 12, outline: 'none', look: Object.assign({}, look, { material: id, materialTop: undefined }) });
    objStamp(o, { x0: 0, y0: 0, x1: MAT_PX - 1, y1: MAT_PX - 1 }, (x, y, v) => { px[y * MAT_PX + x] = v; });
  } finally { [S.tile, S.gox, S.goy, S.edgeRun, S.level] = keep; }
  ctx.putImageData(img, 0, 0);
}
/* Built once per host, then only their values change, as with renderParams. `set` takes a look patch. A Sides and Top switch shares one grid of swatches, which would otherwise take a screen each. */
function renderMat(host, type, look, set) {
  if (!host.firstChild) {
    const seg = document.createElement('div'); seg.className = 'seg wide gap-top'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Faces the material applies to');
    for (const [v, label] of [['side', 'Sides'], ['top', 'Top']]) { const b = document.createElement('button'); b.textContent = label; b.dataset.part = v; b.onclick = () => { host.dataset.part = v; host.dataset.seen = ''; renderMat(host, host.dataset.type, host.look, host.set); }; seg.appendChild(b); }
    const grid = document.createElement('div'); grid.className = 'shapes mats gap-top';
    for (const id in MATERIALS) {
      const b = document.createElement('button'), c = document.createElement('canvas'); b.className = 'shapecard'; b.dataset.mat = id; c.width = c.height = MAT_PX; b.append(c, MATERIALS[id].name);
      b.onclick = () => host.set(host.dataset.part === 'top' ? { materialTop: id } : { material: id }); grid.appendChild(b);
    }
    const num = (label, hint, get, apply, min, max) => {
      const c = document.createElement('div'), st = document.createElement('span'), dn = document.createElement('button'), up = document.createElement('button'), n = document.createElement('input'), to = v => Math.max(min, Math.min(max, v));
      c.className = 'field'; c.textContent = label; hintOn(c, hint); st.className = 'stepper wide'; dn.className = up.className = 'btn sm'; dn.innerHTML = '&minus;'; up.textContent = '+'; dn.setAttribute('aria-label', label + ' down'); up.setAttribute('aria-label', label + ' up');
      n.type = 'number'; n.setAttribute('aria-label', label); dn.onclick = () => apply(to(get() - 1)); up.onclick = () => apply(to(get() + 1)); n.onchange = () => { const v = parseInt(n.value, 10); if (Number.isFinite(v)) apply(to(v)); };
      st.append(dn, n, up); c.appendChild(st); c.input = n; return c;
    };
    const row = document.createElement('div'); row.className = 'ofields gap-top';
    const scale = num('Pattern scale', 'Makes the pattern 1 to 4 times larger, in whole pixels.', () => lookScale(host.look), v => host.set({ scale: v }), 1, MAT_SCALE_MAX), seed = num('Pattern seed', 'Objects side by side continue one pattern when their seed and scale match.', () => host.look.seed | 0, v => host.set({ seed: v }), 0, 9999);
    row.append(scale, seed);
    const dir = document.createElement('div'); dir.className = 'field gap-top'; dir.textContent = 'Planks run'; hintOn(dir, 'The direction of the boards on this face.');
    const ds = document.createElement('div'); ds.className = 'seg wide'; ds.setAttribute('role', 'group'); ds.setAttribute('aria-label', 'Planks run');
    for (const [v, label] of [['v', 'Up'], ['h', 'Along']]) { const b = document.createElement('button'); b.textContent = label; b.dataset.dir = v; b.onclick = () => host.set({ dir: v }); ds.appendChild(b); }
    dir.appendChild(ds);
    const acc = document.createElement('label'); acc.className = 'field gap-top'; acc.textContent = 'Accent ramp'; hintOn(acc, 'A second ramp for brick mortar, gaps between planks and glass frames.');
    const sel = document.createElement('select'), swatches = document.createElement('div'); swatches.className = 'ramprow gap-top'; acc.appendChild(sel);
    const none = document.createElement('button'); none.className = 'chip gap-top'; none.textContent = 'No accent'; none.onclick = () => host.set({ accent: undefined });
    host.append(seg, grid, row, dir, acc, swatches, none);
    Object.assign(host, { parts: { seg, grid, scale, seed, dir, ds, acc, sel, swatches, none } });
  }
  host.look = look; host.set = set; host.dataset.type = type; host.dataset.part = host.dataset.part || 'side';
  const P = host.parts, g = defOf(type), top = host.dataset.part === 'top' && !g.noTop, cur = top ? look.materialTop || (g.endsTop ? 'plain' : look.material || 'plain') : look.material || 'plain', ramps = paletteRamps().filter(r => !isLoose(r));
  P.seg.children[1].textContent = g.endsTop ? 'Ends' : 'Top'; P.seg.hidden = !!g.noTop || !!g.plainOnly;
  P.grid.hidden = P.scale.parentNode.hidden = !!g.plainOnly;
  P.seg.querySelectorAll('button').forEach(b => press(b, b.dataset.part === host.dataset.part));
  const key = [S.color, look.ramp, look.base, look.color, lookScale(look), look.seed | 0, look.dir, JSON.stringify(look.accent), S.light, JSON.stringify(ramps)].join('|');
  P.grid.querySelectorAll('[data-mat]').forEach(b => { press(b, b.dataset.mat === cur); if (host.dataset.seen !== key) drawMatSwatch(b.firstChild, b.dataset.mat, look); });
  host.dataset.seen = key;
  for (const [c, v] of [[P.scale, lookScale(look)], [P.seed, look.seed | 0]]) if (document.activeElement !== c.input) c.input.value = v;
  P.dir.hidden = !!g.plainOnly || (look.material !== 'planks' && look.materialTop !== 'planks'); P.ds.querySelectorAll('button').forEach(b => press(b, b.dataset.dir === (look.dir || 'v')));
  const a = look.accent; P.acc.hidden = P.swatches.hidden = !ramps.length; P.none.hidden = !a;
  rampPicker(P.sel, P.swatches, a ? a.ramp : '', a ? a.base : 0, (r, n) => host.set({ accent: { ramp: r.name, base: n, color: r.colors[n] } }));
}

'use strict';
/* qtiles ground tiles: seeded textures on ramp offsets, stamped by cell, and the 3 x 3 seam preview.
   A tile is its base texture, which repeats with the tile grid and is the same for every variant, plus details that stay away from the edges.
   So the border of any variant matches the border of any other, and neighbors cannot show a seam. */

const TL = { drag: null, last: null, cache: new Map() };   // the drag in progress, the last stamped cell, and built variant details
const TILE_SIZES = [16, 32, 64, 128], SEAM_MAX = 256;
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash3 = (a, b, c) => mulberry32(Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791))();
const wrap = (n, m) => ((n % m) + m) % m;

/* Each base takes (A, B), the pixel's position along the two grid axes, wrapped to the tile width. Moving one tile along either axis changes neither.
   It returns a ramp offset. A dab is a detail: [dx, dy, offset] pixels, placed inside a tile by the variant's seed. */
const TEXTURES = {
  plain: { name: 'Plain color', base: () => 0, dab: [] },
  flat: { name: 'Flat', base: () => 0, dab: [[0, 0, -1], [1, 0, -1], [2, 0, -1], [1, 1, -1]], every: 400 },
  speckle: { name: 'Speckle', base: (A, B, w, s) => { const r = hash3(A, B, s); return r < 0.1 ? -1 : r > 0.93 ? 1 : 0; }, dab: [[0, 0, 1]], every: 150 },
  grass: { name: 'Grass blades', dab: [[0, 0, 1], [0, 1, 1], [0, 2, 0]], every: 120, base: (A, B, w, s) => {
    for (let k = 0; k < 3; k++) if (hash3(wrap(A - 2 * k, w), wrap(B - 2 * k, w), s) < 0.035) return k ? 0 : 1;
    return hash3(A, B, s + 1) < 0.08 ? -1 : 0;
  } },
  stone: { name: 'Stone', dab: [[0, 0, -1], [1, 0, -1]], every: 200, base: (A, B, w, s) => {
    const n = Math.max(2, Math.round(w / 12)), cell = q => Math.floor(q * n / w), ca = cell(A), cb = cell(B);
    if (cell(wrap(A - 2, w)) !== ca || cell(wrap(B - 2, w)) !== cb) return -2;
    const r = hash3(ca, cb, s); return r < 0.3 ? -1 : r > 0.8 ? 1 : 0;
  } },
  wood: { name: 'Wood grain', dab: [[0, 0, -2], [1, 0, -2], [-1, 0, -1], [2, 0, -1]], every: 500, base: (A, B, w, s) => {
    const n = Math.max(2, Math.round(w / 8)), plank = q => Math.floor(q * n / w), p = plank(B);
    if (plank(wrap(B - 2, w)) !== p) return -2;
    return (B & 2) && hash3(p, A >> 3, s) < 0.4 ? -1 : 0;
  } },
  water: { name: 'Water ripples', dab: [[0, 0, 2], [1, 0, 2], [2, 0, 1]], every: 300, base: (A, B, w, s) => {
    const tri = q => Math.abs(2 * wrap(q, w) - w), t = (tri(2 * A + s) + tri(3 * B + s * 7)) / (2 * w);
    return t > 0.8 ? 1 : t < 0.2 ? -1 : 0;
  } }
};
/* Wrapped position of a pixel on the two grid axes, counted from the tile-grid origin. */
function tileAxes(x, y) { const u = x - S.gox, v = 2 * (y - S.goy), w = S.tile; return [wrap(v + u, w), wrap(v - u, w)]; }
function texBase(tex, x, y) { const [A, B] = tileAxes(x, y); return TEXTURES[tex].base(A, B, S.tile, S.tileSeed); }

/* Offsets a variant adds, keyed by pixel position inside the tile. They keep clear of the edges, whatever the edge run. */
function tileDetails(tex, variant) {
  const t = TEXTURES[tex], w = S.tile, key = [w, tex, S.tileSeed, variant].join();
  if (TL.cache.has(key)) return TL.cache.get(key);
  const hw = w / 2, hh = w / 4, out = new Map(), rng = mulberry32(Math.imul(S.tileSeed, 31) + Math.imul(variant + 1, 1009));
  const inner = (u, v) => Math.abs(u + 0.5) + 2 * Math.abs(v + 0.5 - hh) <= hw - 6;
  let left = Math.ceil(w * hh / (t.every || 1));
  for (let tries = 40 * left; t.dab.length && left > 0 && tries > 0; tries--) {   // a tile too small for the dab has none, so its variants match
    const u = Math.floor(rng() * w) - hw, v = Math.floor(rng() * hw);
    if (t.dab.every(d => inner(u + d[0], v + d[1]))) { for (const d of t.dab) out.set((u + d[0]) + ',' + (v + d[1]), d[2]); left--; }
  }
  if (TL.cache.size > 64) TL.cache.clear();
  TL.cache.set(key, out); return out;
}
const variantAt = (i, j) => S.tileRandom ? Math.floor(hash3(i, j, S.tileSeed) * S.tileVariants) : Math.min(S.tileVar, S.tileVariants) - 1;

/* Packed colors by ramp offset from the first color. A color on no ramp steps through the block multipliers instead. */
function tileShades() {
  const hex = S.color, memo = new Map();
  return off => {
    if (!memo.has(off)) { const r = rampStep(hex, off); memo.set(off, r ? packHex(r) : off >= 0 ? inkV() : shadeHex(hex, off > -2 ? FACE_LEFT : FACE_RIGHT)); }
    return memo.get(off);
  };
}
function tileP(i, j, plot) {
  const c = cellCorner(i, j), tex = S.tileTex, rim = S.tileRim, shade = tileShades(), det = tileDetails(tex, variantAt(i, j)), f = faceShades(S.color), low = new Map();
  for (let y = c.y - 1; y <= c.y + S.tile / 2 + 1; y++) for (let x = c.x - S.tile / 2 - 1; x <= c.x + S.tile / 2 + 1; x++) {
    if (!inCell(x, y, i, j)) continue;
    const edge = rim !== 'none' && (!inCell(x, y + 1, i, j) || (rim === 'full' && !inCell(x, y - 1, i, j)));
    plot(x, y, shade(edge ? -2 : texBase(tex, x, y) + (det.get((x - c.x) + ',' + (y - c.y)) || 0)));
    low.set(x, y);
  }
  if (S.tileH) for (const [x, y] of low) for (let k = 1; k <= S.tileH; k++) plot(x, y + k, x < c.x ? f.left : f.right);
}
/* The dragged rectangle of cells plus their mirrored cells, back to front so a front tile covers the walls behind it.
   A cell mirrors as a cell, not as flipped pixels, or its lit and shaded walls would change sides. */
function tileCells() {
  const { a, b } = TL.drag, seen = new Map();
  for (let i = Math.min(a.i, b.i); i <= Math.max(a.i, b.i); i++) for (let j = Math.min(a.j, b.j); j <= Math.max(a.j, b.j); j++) {
    const c = cellCorner(i, j);
    for (const p of mirrorPoints(c.x, c.y + S.tile / 4)) { const m = tileCell(p[0], p[1]); seen.set(m.i + ',' + m.j, m); }
  }
  return [...seen.values()].sort((p, q) => (p.i + p.j) - (q.i + q.j) || p.i - q.i);
}
function tilesP(plot) { for (const c of tileCells()) tileP(c.i, c.j, plot); }
function tileStart(a) { const c = tileCell(a.x, a.y); TL.drag = { a: c, b: c }; pvDraw(tilesP); }
function tileMove(a) {
  const c = tileCell(a.x, a.y), b = TL.drag.b;
  if (c.i !== b.i || c.j !== b.j) { TL.drag.b = c; pvDraw(tilesP); }
}
function tileCommit() {
  pvClear(); growForShape(tilesP);
  beginStroke(activeLayer()); tilesP(plotLayer); endStroke();
  TL.last = TL.drag.b; TL.drag = null; seamTick();
}

/* ---------- grid origin ---------- */
let originStep = null;
function moveOrigin(dx, dy) { S.gox += dx; S.goy += dy; S.nudgeX += dx; S.nudgeY += dy; syncOrigin(); objRefresh(); requestRender(); }
/* Pressing or holding a nudge is one undo step until 600 ms pass without one. The entry stores a relative move, so it stays right after any later resize. */
function nudgeOrigin(dx, dy) {
  const now = performance.now(), g = originStep;
  moveOrigin(dx, dy);
  if (g && now - g.t < 600 && H.pos > 0 && H.stack[H.pos - 1] === g.e) { g.dx += dx; g.dy += dy; g.t = now; setDirty(true); return; }
  const o = { dx, dy, t: now, e: null };
  o.e = { undo: () => moveOrigin(-o.dx, -o.dy), redo: () => moveOrigin(o.dx, o.dy) };
  originStep = o; pushHistory(o.e);
}
function resetOrigin() { if (S.nudgeX || S.nudgeY) { originStep = null; nudgeOrigin(-S.nudgeX, -S.nudgeY); originStep = null; } }

/* ---------- seam preview ---------- */
/* What repeats: the selection, or the last stamped tile. A selection steps by as many tiles as it is wide, so a block of tiles repeats as a block. */
function seamSource() {
  if (SEL.box) { const b = SEL.box, m = SEL.mask; return { b, n: Math.max(1, Math.round((b.x1 - b.x0 + 1) / S.tile)), has: (x, y) => m[y * S.w + x] }; }
  if (!TL.last) return null;
  const { i, j } = TL.last, c = cellCorner(i, j), hw = S.tile / 2, b = { x0: Math.max(0, c.x - hw), y0: Math.max(0, c.y), x1: Math.min(S.w - 1, c.x + hw - 1), y1: Math.min(S.h - 1, c.y + hw - 1) };
  return b.x0 <= b.x1 && b.y0 <= b.y1 ? { b, n: 1, has: (x, y) => inCell(x, y, i, j) } : null;
}
function seamBuf() {
  const s = seamSource(); if (!s) return null;
  const b = s.b, W = b.x1 - b.x0 + 1, Ht = b.y1 - b.y0 + 1; if (W > SEAM_MAX || Ht > SEAM_MAX) return { big: true };
  const sx = s.n * S.tile / 2, sy = s.n * S.tile / 4, w = W + 4 * sx, h = Ht + 4 * sy, px = new Uint32Array(w * h), src = [];
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (s.has(x, y)) { const v = flatAt(y * S.w + x); if (v >>> 24) src.push(x - b.x0, y - b.y0, v); }
  for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) {
    const ox = (a - c + 2) * sx, oy = (a + c) * sy;
    for (let k = 0; k < src.length; k += 3) px[(src[k + 1] + oy) * w + src[k] + ox] = src[k + 2];
  }
  return { px, w, h };
}

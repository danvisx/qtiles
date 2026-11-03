'use strict';
/* qtiles objects: small parametric solids on the iso grid.
   Records are never changed in place: an edit makes a new record and a new array, so a history step is two array references.
   The layer's pixels and its id buffer are a cache of the records, rebuilt from them region by region. */

const OBJ_MSG = 'This layer holds objects. Bake it to paint.', OBJ_BUCKET = 128, OBJ_MERGE_MS = 600;
const FACINGS = ['down-right', 'down-left', 'up-left', 'up-right'];
const OBJ_FIELDS = { i: ['Tile i', -999, 999, 1], j: ['Tile j', -999, 999, 1], z: ['Raised levels', 0, 4096, 4], u: ['Along', 0, 9999, 2], v: ['Up', 0, 9999, 2], w: ['Width', 1, 256, 1], d: ['Depth', 1, 256, 1], h: ['Height levels', 1, 1024, 4] };
const OBJ_LEVEL = { z: 1, h: 1 };   // shown in levels, stored in pixels
const inLevels = f => OBJ_LEVEL[f] && prefGet('heights') !== 'pixels';
const FACE_TOP = 1, FACE_LIT = 2, FACE_SHADED = 3, FACE_SLOPE = 4;   // the face buffer
const PL = { drag: null, ghost: null, drafts: [] }, PK = { drag: null, box: null, alt: false };
let objSeq = 1, objMarks = new Uint8Array(1 << 16), objStep = null, objDark = null;
const rng = seed => mulberry32(seed | 0);
const objTool = t => t === 'place' || t === 'pick';
const levelPx = () => S.level || S.tile / 2;

/* ---------- records ---------- */
/* The nearest color on a real ramp: a Loose color has no neighbors to shade with. Null when the palette has no ramps at all. */
function nearestOnRamp(hex) {
  const c = hexToRgb(hex); let best = null, bd = Infinity;
  for (const ramp of paletteRamps()) if (!isLoose(ramp)) ramp.colors.forEach((h, index) => {
    const q = hexToRgb(h), d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2;
    if (d < bd) { bd = d; best = { ramp, index }; }
  });
  return best;
}
/* look.color keeps the base color itself, so an object can find the nearest ramp once its own ramp has left the palette. */
function lookFrom(hex) {
  const r = nearestOnRamp(hex);
  return { ramp: r ? r.ramp.name : LOOSE, base: r ? r.index : 0, color: r ? r.ramp.colors[r.index] : hex, material: 'plain', scale: 1, seed: 0 };
}
function objNew(f) {
  return Object.assign({ id: 0, type: 'box', i: 0, j: 0, z: 0, w: 4, d: 4, h: levelPx(), facing: 0, params: {}, look: lookFrom(S.color), outline: S.objOutline, shadow: S.objShadow, order: 0 }, f);
}
/* Keeps only what the shape knows and can draw. Unknown keys of a newer build stay, so opening and saving a file does not lose them. */
function cleanParams(o) {
  const out = Object.assign({}, o.params && typeof o.params === 'object' ? o.params : {}), spec = shapeOf(o).params;
  for (const k in spec) {
    const p = spec[k], v = out[k];
    if (v === undefined) continue;
    if (p.text) { out[k] = signText(v); continue; }
    if (p.options ? !p.options.some(q => q[0] === v) : !Number.isFinite(v)) delete out[k];
    else if (!p.options) out[k] = Math.max(p.min, Math.min(p.max, Math.round(v)));
  }
  return out;
}
function cleanObjects(list) {
  const int = (v, min, fb) => Number.isFinite(v) ? Math.max(min, Math.round(v)) : fb, half = v => Number.isFinite(v) ? Math.round(v * 2) / 2 : 0, ids = new Set(), out = [];
  const path = g => (Array.isArray(g) ? g : [g]).filter(Number.isInteger).slice(0, ASM_DEPTH);
  for (const o of Array.isArray(list) ? list : []) if (o) for (const n of [o.id, ...path(o.group), o.lib && o.lib.g]) if (Number.isInteger(n) && n >= objSeq) objSeq = n + 1;
  for (const o of Array.isArray(list) ? list : []) {
    if (!o || typeof o !== 'object') continue;
    const k = o.look && typeof o.look === 'object' ? o.look : {}, id = Number.isInteger(o.id) && o.id > 0 && !ids.has(o.id) ? o.id : objSeq++; ids.add(id);
    const part = DETAIL_DEFS[o.type] ? v => Number.isFinite(v) ? v : 0 : null;   // a detail's footprint is worked out in pixels, so it need not be whole tiles or even wide
    const group = path(o.group), lib = o.lib && Number.isInteger(o.lib.g) ? { id: String(o.lib.id), g: o.lib.g, turn: int(o.lib.turn, 0, 0) % 4, flip: !!o.lib.flip } : undefined;
    out.push(Object.assign({}, o, { id, group: group.length ? group : undefined, lib, type: String(o.type || 'box'), i: part ? part(o.i) : half(o.i), j: part ? part(o.j) : half(o.j), z: int(o.z, 0, 0), w: part ? part(o.w) : int(o.w, 1, 4), d: part ? part(o.d) : int(o.d, 1, 4), h: int(o.h, 1, levelPx()),
      facing: int(o.facing, 0, 0) % 4, params: cleanParams(o), outline: ['none', 'dark', 'sel'].includes(o.outline) ? o.outline : 'dark', shadow: !!o.shadow, order: int(o.order, -1e6, 0),
      look: Object.assign({}, k, { ramp: String(k.ramp || LOOSE), base: int(k.base, 0, 0), color: hexToRgb(k.color) ? String(k.color).toLowerCase() : '#808080' }) }));
  }
  /* A detail with no parent left cannot be drawn on its wall. One that stands on something can stand on the ground. fit is a cache, and the tile size is not known yet. */
  const by = new Map(out.map(o => [o.id, o]));
  return out.filter(o => {
    if (o.parent === undefined) return true;
    const p = by.get(o.parent); delete o.fit;
    if (p && !p.parent && p !== o) { o.u = Number.isFinite(o.u) ? o.u : 0; o.v = Number.isFinite(o.v) ? o.v : 0; if (o.face !== 'top') o.face = int(o.face, 0, 0) % 4; return true; }
    if (typeof o.face === 'number') return false;
    delete o.parent; delete o.face; delete o.u; delete o.v; o.i = Math.round(o.i); o.j = Math.round(o.j); return true;
  });
}

/* ---------- geometry ---------- */
/* A half-tile line is the tile stair moved along itself, so footprints share the exact pixels of tiles at every edge run. */
/* Bounds from the grid origin, so a canvas resize leaves them, and the spatial index built on them, valid. The stair can pass a straight corner by up to one run. */
function objBox(o) {
  const D = S.tile / 4, a0 = 2 * o.i, b0 = 2 * o.j, a1 = a0 + o.w, b1 = b0 + o.d, g = shapeOf(o), p = g.pad ? g.pad(o) : 0, r = S.edgeRun + 2 * p, up = g.above ? g.above(o) : 0;
  return { x0: Math.floor((a0 - b1) * D) - r, x1: Math.ceil((a1 - b0) * D) + r, y0: Math.floor((a0 + b0) * D / 2) - r - o.z - o.h - up, y1: Math.ceil((a1 + b1) * D / 2) + r - o.z };
}
function objPixelBox(o) { const b = objBox(o); return { x0: b.x0 + S.gox, y0: b.y0 + S.goy, x1: b.x1 + S.gox, y1: b.y1 + S.goy }; }
const joinBox = (p, q) => p ? { x0: Math.min(p.x0, q.x0), y0: Math.min(p.y0, q.y0), x1: Math.max(p.x1, q.x1), y1: Math.max(p.y1, q.y1) } : q;
const listBox = list => list.reduce((b, o) => joinBox(b, objPixelBox(o)), null);
/* The pixels themselves, for what fits. A record's box is its footprint with room to spare, so a tree well inside its box would otherwise read as sticking out. It costs a draw, only near an edge. */
function artBox(list) {
  const near = listBox(list); if (!near || !pastEdge(near)) return near;
  let b = null; objsP(list, (x, y) => { if (!b) b = { x0: x, y0: y, x1: x, y1: y }; else { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; } });
  return b;
}

/* ---------- shapes ---------- */
/* A shape has a table of faces, indexed by the marks it writes into a window of pixels. Marks 1 to 3 are always top, left wall and right wall, the three a look can override.
   n is the normal in (a, b, up), and p decides which of two touching faces carries the outline. A world half tile is as long as tile / 4 pixels of height.
   Straight polygons only fit a stair of runs of 2, and even there they differ from tiles by a pixel. So every edge comes from the tile stair: a box part is the stair moved by whole rows, and a slope is read through it (heightMark). */
const UP = [0, 0, 1], LEFT_N = [0, 1, 0], RIGHT_N = [1, 0, 0];
const BOX_FACES = [null, { n: UP, p: 3 }, { n: LEFT_N, p: 1 }, { n: RIGHT_N, p: 2 }];
const FRONTS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const pn = (o, k) => { const v = o.params[k]; return v === undefined ? shapeOf(o).params[k].def : v; };
const slopeN = (ua, ub, tan) => { const q = Math.hypot(tan, 1); return [-ua * tan / q, -ub * tan / q, 1 / q]; };   // (ua, ub) points uphill
const withFaces = (...extra) => BOX_FACES.concat(extra);

/* Local axes of a faced shape: s runs from the back to the front that `facing` points at, t across it, both in half tiles from the local back corner. Left of someone walking up against the front is high t. */
function frame(o) {
  const a0 = 2 * o.i, b0 = 2 * o.j, a1 = a0 + o.w, b1 = b0 + o.d;
  switch (o.facing) {
    case 1: return { L: o.d, W: o.w, s: (a, b) => b - b0, t: a => a1 - a, box: (s0, s1, t0, t1) => [a1 - t1, a1 - t0, b0 + s0, b0 + s1] };
    case 2: return { L: o.w, W: o.d, s: a => a1 - a, t: (a, b) => b1 - b, box: (s0, s1, t0, t1) => [a1 - s1, a1 - s0, b1 - t1, b1 - t0] };
    case 3: return { L: o.d, W: o.w, s: (a, b) => b1 - b, t: a => a - a0, box: (s0, s1, t0, t1) => [a0 + t0, a0 + t1, b1 - s1, b1 - s0] };
    default: return { L: o.w, W: o.d, s: a => a - a0, t: (a, b) => b - b0, box: (s0, s1, t0, t1) => [a0 + s0, a0 + s1, b0 + t0, b0 + t1] };
  }
}
/* A solid from z0 to z1 pixels over the rows of a box (half tiles, rounded to rows). A column's footprint is one span, so a part costs one edgeY pair per column. Later parts cover earlier ones. */
function markBox(W, box, z0, z1) {
  const D = S.tile / 4, a0 = Math.round(box[0] * D), a1 = Math.round(box[1] * D), b0 = Math.round(box[2] * D), b1 = Math.round(box[3] * D), front = a1 - b1, m = W.m, w = W.w, wy = W.wy, last = wy + W.h - 1;
  const span = (from, to, face, x) => { const y0 = Math.max(from, wy), y1 = Math.min(to, last); for (let y = y0, k = (y0 - wy) * w + x; y <= y1; y++, k += w) m[k] = face; };
  for (let x = 0; x < w; x++) {
    const u = x + W.wx - S.gox, e1 = edgeY(-1 - u), e2 = edgeY(u), lo = Math.max(e1 + a0, e2 + b0), hi = Math.min(e1 + a1, e2 + b1) - 1;
    if (lo > hi) continue;
    span(lo + W.lift - z1, hi + W.lift - z1, 1, x);
    span(hi + W.lift - z1 + 1, hi + W.lift - z0, u < front ? 2 : 3, x);
  }
}
/* A surface over the footprint, grown by pad rows, walked front to back along each column. surf(a, b) gives the height in pixels at a pixel's center and sets W.f.
   a and b are read through the stair, so a slope of one tile per level steps exactly like a tile edge. Only the front row can hang over nothing, so only it has a wall below,
   and only on the sides in `walls` ([left, right]). On a sloped edge those rows are the slope, however steep.
   A slope above one tile per level (`rise` pixels per half tile against tile / 4) cannot follow the stair on the footprint's edge: its silhouette would jump several rows every run. The edge rows read true coordinates, which step evenly, and a ridge further in keeps the stair. */
function heightMark(o, W, pad, walls, rise, surf) {
  const D = S.tile / 4, steep = rise > D, a0 = 2 * o.i * D - pad, b0 = 2 * o.j * D - pad, a1 = (2 * o.i + o.w) * D + pad, b1 = (2 * o.j + o.d) * D + pad, front = a1 - b1, m = W.m, w = W.w, wy = W.wy, last = wy + W.h - 1, lift = W.lift;
  const fill = (from, to, face, x) => { const y0 = Math.max(from, wy), y1 = Math.min(to, last); for (let y = y0, k = (y0 - wy) * w + x; y <= y1; y++, k += w) m[k] = face; };
  for (let x = 0; x < w; x++) {
    const u = x + W.wx - S.gox, e1 = edgeY(-1 - u), e2 = edgeY(u), lo = Math.max(e1 + a0, e2 + b0), hi = Math.min(e1 + a1, e2 + b1) - 1;
    if (lo > hi) continue;
    let seen = 1e9;
    for (let g = hi; g >= lo; g--) {
      const H = Math.max(0, steep && (g === hi || g === lo) ? surf((g + 0.5 + (u + 0.5) / 2) / D, (g + 0.5 - (u + 0.5) / 2) / D) : surf((g + 0.5 - e1) / D, (g + 0.5 - e2) / D)), top = g + lift - H;
      if (g === hi) { fill(top, top, W.f, x); fill(top + 1, g + lift, H > 1 && walls[u < front ? 0 : 1] ? (u < front ? 2 : 3) : W.f, x); seen = top; }
      else if (top < seen) { fill(top, seen - 1, W.f, x); seen = top; }
    }
  }
}
const markAt = (W, x, y, f) => { const u = x - W.wx, v = y - W.wy; if (u >= 0 && v >= 0 && u < W.w && v < W.h) W.m[v * W.w + u] = f; };

function boxMark(o, W) { const a = 2 * o.i, b = 2 * o.j; markBox(W, [a, a + o.w, b, b + o.d], 0, o.h); }

/* Openings are as wide as the piers between them, and reach the floor. They stay empty: a door or window is a detail on the wall's face. */
function wallGaps(o) {
  const n = pn(o, 'openings'), W = frame(o).W, unit = W / (2 * n + 1), out = [];
  for (let k = 0; k < n; k++) out.push({ t0: (2 * k + 1) * unit, t1: (2 * k + 2) * unit, z1: Math.max(1, Math.round(o.h * 0.75)) });
  return out;
}
function wallMark(o, W) {
  const f = frame(o), gaps = wallGaps(o), parts = []; let t = 0;
  for (const g of gaps) { parts.push([t, g.t0, 0], [g.t0, g.t1, g.z1]); t = g.t1; }
  parts.push([t, f.W, 0]);
  if (o.facing === 1 || o.facing === 2) parts.reverse();   // t runs away from the eye on these two
  for (const [t0, t1, z] of parts) markBox(W, f.box(0, f.L, t0, t1), z, o.h);
}

const railH = () => Math.max(2, S.tile / 8);
/* Slabs stacked from the bottom, each reaching from its step's front edge back to the high end, so one side wall runs the whole flight and only true risers show.
   Rails go last on the two facings that point at the eye, high step first, because nothing stands in front of them. On the other two, nearer steps are higher and must cover the rails behind them. */
function stairsMark(o, W) {
  const f = frame(o), n = pn(o, 'steps'), rail = pn(o, 'railing'), near = o.facing === 0 || o.facing === 3 ? 'left' : 'right', far = near === 'left' ? 'right' : 'left', tw = 2 / (S.tile / 4), rh = railH(), back = o.facing < 2;
  const has = side => rail === 'both' || rail === side, band = side => side === 'left' ? [f.W - tw, f.W] : [0, tw], topOf = k => Math.round(o.h * (n - k) / n);
  const rails = (k, side) => { if (has(side)) markBox(W, f.box(k * f.L / n, (k + 1) * f.L / n, ...band(side)), topOf(k), topOf(k) + rh); };
  for (let k = n - 1; k >= 0; k--) {
    if (!back) rails(k, far);
    markBox(W, f.box(0, (k + 1) * f.L / n, 0, f.W), k + 1 < n ? topOf(k + 1) : 0, topOf(k));
    if (!back) rails(k, near);
  }
  if (back) for (let k = 0; k < n; k++) { rails(k, far); rails(k, near); }
}
/* Treads and risers already differ in shade, and a line on every step would leave no tread on a small flight. The lines stay on the silhouette and where a step meets the side. */
function stairsFaces(o) {
  const set = (t, l, r) => [null, { n: UP, p: t }, { n: LEFT_N, p: l }, { n: RIGHT_N, p: r }];
  return o.facing === 0 ? set(2, 1, 2) : o.facing === 1 ? set(2, 2, 1) : BOX_FACES;
}

function stairsSurf(o, a, b) { const f = frame(o), n = pn(o, 'steps'); return Math.round(o.h * (n - Math.max(0, Math.min(n - 1, Math.floor(f.s(a, b) * n / f.L)))) / n); }

const rampLow = o => { const f = frame(o); return Math.max(0, o.h - rampRise(f.L, pn(o, 'slope'))); };
const rampRise = (L, run) => Math.round(L / 2 / run * levelPx());
const rampSurf = (o, f, low, a, b) => Math.round(low + (o.h - low) * (f.L - f.s(a, b)) / f.L);
function rampMark(o, W) {
  const f = frame(o), low = rampLow(o);
  W.f = 4; heightMark(o, W, 0, [true, true], (o.h - low) / f.L, (a, b) => rampSurf(o, f, low, a, b));
}
function rampFaces(o) {
  const f = FRONTS[o.facing], tan = (o.h - rampLow(o)) / (S.tile / 4) / frame(o).L;
  return withFaces({ n: slopeN(-f[0], -f[1], tan), p: 4 });
}

/* The ridge runs along s. Overhang grows the footprint on all sides at eave height, so the eaves stay on the top of the walls below. */
const gableSpan = o => frame(o).W / 2 + pn(o, 'overhang') / (S.tile / 4);
const gableSurf = (o, half, mid, t) => Math.round(o.h * (1 - Math.abs(t - mid) / half));
function gableMark(o, W) {
  const f = frame(o), half = gableSpan(o), mid = f.W / 2;
  heightMark(o, W, pn(o, 'overhang'), o.facing % 2 ? [true, false] : [false, true], o.h / half, (a, b) => { const t = f.t(a, b); W.f = t < mid ? 4 : 5; return gableSurf(o, half, mid, t); });
}
function gableFaces(o) {
  const f = FRONTS[(o.facing + 1) % 4], tan = o.h / (S.tile / 4) / gableSpan(o);
  return withFaces({ n: slopeN(f[0], f[1], tan), p: 4 }, { n: slopeN(-f[0], -f[1], tan), p: 5 });
}

/* Four planes from the footprint's edges. On a square they meet at an apex, otherwise along a ridge on the long axis. */
function hipMark(o, W) {
  const a0 = 2 * o.i, b0 = 2 * o.j, a1 = a0 + o.w, b1 = b0 + o.d, slope = o.h / (Math.min(o.w, o.d) / 2);
  heightMark(o, W, 0, [false, false], slope, (a, b) => {
    let e = a - a0, f = 4; if (a1 - a < e) { e = a1 - a; f = 5; } if (b - b0 < e) { e = b - b0; f = 6; } if (b1 - b < e) { e = b1 - b; f = 7; }
    W.f = f; return Math.round(slope * e);
  });
}
function hipSurf(o, a, b) { const a0 = 2 * o.i, b0 = 2 * o.j; return Math.round(o.h / (Math.min(o.w, o.d) / 2) * Math.min(a - a0, a0 + o.w - a, b - b0, b0 + o.d - b)); }
function hipFaces(o) {
  const tan = o.h / (S.tile / 4) / (Math.min(o.w, o.d) / 2);
  return withFaces({ n: slopeN(1, 0, tan), p: 4 }, { n: slopeN(-1, 0, tan), p: 5 }, { n: slopeN(0, 1, tan), p: 6 }, { n: slopeN(0, -1, tan), p: 7 });
}

/* The circle inscribed in a square footprint, as a 2:1 ellipse. (cx, cy) is a pixel corner, as for isoEllipseP, in window pixels. */
function roundBase(o) {
  const D = S.tile / 4, a = 2 * o.i, b = 2 * o.j;
  return { rx: Math.max(1, Math.round(o.w / 2 * D * Math.SQRT2)), cx: S.gox + (a - b) * D, cy: Math.round(S.goy + (a + b + o.w) * D / 2 - o.z) };
}
const ROUND_BANDS = 12, CONE_BANDS = 16;
function cylinderMark(o, W) {
  const { rx, cx, cy } = roundBase(o), low = new Map();
  isoEllipseP((x, y) => { if (!(low.get(x) >= y)) low.set(x, y); }, cx, cy, rx);
  for (const [x, y] of low) {
    const band = 4 + Math.min(ROUND_BANDS - 1, Math.floor(Math.acos(Math.max(-1, Math.min(1, (x + 0.5 - cx) / rx))) / Math.PI * ROUND_BANDS));
    for (let k = 0; k < o.h; k++) markAt(W, x, y - k, band);
  }
  isoEllipseP((x, y) => markAt(W, x, y, 1), cx, cy - o.h, rx);
}
/* Around the curve by arc length, and up from the curved foot, so rows wrap the cylinder. */
function cylinderUv(o) {
  const { rx, cx, cy } = roundBase(o), yc = cy - (rx >> 1) + rx / 2 + o.z, dx = x => Math.max(-1, Math.min(1, (x + 0.5 - cx) / rx));
  return (x, y) => { const d = dx(x); UV[0] = Math.round(rx * Math.acos(d)); UV[1] = Math.floor(yc + rx * Math.sqrt(1 - d * d) / 2) - y; };
}
/* Bands across the front half, from the right edge of the ellipse round to the left. */
const CYL_FACES = withFaces(...Array.from({ length: ROUND_BANDS }, (_, k) => { const f = (k + 0.5) / ROUND_BANDS * Math.PI - Math.PI / 4; return { n: [Math.cos(f), Math.sin(f), 0], round: true, p: 1 }; }));
/* Each pixel solves for the highest point of the cone on its line of sight, so the sides come out exact at any size. Below the sides, the base is the same ellipse as a cylinder's. */
function coneSolver(o) {
  const { rx, cx, cy } = roundBase(o), H = o.h, yc = cy - (rx >> 1) + rx / 2, R2 = rx * rx, A = 4 - R2 / (H * H);
  return { rx, cx, yc, z(X, Y) {
    const B = 8 * Y + 2 * R2 / H, C = X * X + 4 * Y * Y - R2; let z = -1;
    if (Math.abs(A) < 1e-9) { const q = -C / B; if (q >= 0 && q <= H) z = q; }
    else { const e = B * B - 4 * A * C; if (e >= 0) { const q = Math.sqrt(e); for (const v of [(-B + q) / (2 * A), (-B - q) / (2 * A)]) if (v >= 0 && v <= H && v > z) z = v; } }
    return z;
  } };
}
/* The ground point below, in (a, b) directions. */
const coneAngle = (X, Y, z) => { const g = Y + z; return (Math.atan2(g - X / 2, g + X / 2) + 2 * Math.PI) % (2 * Math.PI); };
function coneMark(o, W) {
  const c = coneSolver(o), { rx, cx, yc } = c;
  for (let y = W.wy; y < W.wy + W.h; y++) for (let x = W.wx; x < W.wx + W.w; x++) {
    const X = x + 0.5 - cx, Y = y + 0.5 - yc; if (Math.abs(X) >= rx) continue;
    let z = c.z(X, Y);
    if (z < 0) { if (Math.abs(X) < isoHalf(rx, Y)) z = 0; else continue; }
    markAt(W, x, y, 4 + Math.floor(coneAngle(X, Y, z) / (2 * Math.PI) * CONE_BANDS) % CONE_BANDS);
  }
}
/* Rows are heights, so they ring the cone. */
function coneUv(o) {
  const c = coneSolver(o);
  return (x, y) => { const X = x + 0.5 - c.cx, Y = y + 0.5 - c.yc, z = Math.max(0, c.z(X, Y)); UV[0] = Math.round(coneAngle(X, Y, z) * c.rx); UV[1] = Math.round(z) + o.z; };
}
function coneFaces(o) {
  const tan = o.h / (S.tile / 4) / (o.w / 2);
  return withFaces(...Array.from({ length: CONE_BANDS }, (_, k) => { const f = (k + 0.5) / CONE_BANDS * 2 * Math.PI; return { n: slopeN(-Math.cos(f), -Math.sin(f), tan), round: true, p: 1 }; }));
}

const coneSurf = (o, a, b) => Math.round(o.h * (1 - Math.hypot(a - 2 * o.i - o.w / 2, b - 2 * o.j - o.d / 2) / (o.w / 2)));

/* Lobes of 3:2 inside the object's box, back ones first. The first is the big low one, and each later lobe starts on the rim of an earlier one, so the blob stays in one piece. */
function blobLobes(o) {
  const D = S.tile / 4, r = rng(o.look.seed), n = pn(o, 'lobes'), a = 2 * o.i, b = 2 * o.j, Rx = (o.w + o.d) * D * 0.34, cx = S.gox + (a - b + (o.w - o.d) / 2) * D;
  const yb = S.goy + (a + b + (o.w + o.d) / 2) * D / 2 + Rx / 3 - o.z, T = Math.max(4, o.h + Rx / 3), max = Math.min(Rx, T * 0.75), lim = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const first = max * 0.85, out = [{ rx: first, ry: first * 2 / 3, x: cx, y: Math.round(yb - first * 2 / 3) }];
  for (let k = 1; k < n; k++) {
    const p = out[Math.floor(r() * k)], t = r() * 2 * Math.PI, rx = max * (0.4 + 0.3 * r()), ry = rx * 2 / 3;
    out.push({ rx, ry, x: Math.round(lim(p.x + Math.cos(t) * p.rx * 0.8, cx - Rx + rx, cx + Rx - rx)), y: Math.round(lim(p.y + Math.sin(t) * p.ry * 0.8, yb - T + ry, yb - ry)) });
  }
  return out.sort((p, q) => p.y - q.y);
}
const SIN45 = Math.SQRT1_2, EYE = 0.57735, UPS = 0.40825, UPZ = 0.8165;
function blobMark(o, W) {
  for (const l of blobLobes(o)) {
    const y0 = Math.max(W.wy, Math.floor(l.y - l.ry)), y1 = Math.min(W.wy + W.h - 1, Math.ceil(l.y + l.ry));
    for (let y = y0; y <= y1; y++) {
      const py = (y + 0.5 - l.y) / l.ry, q = 1 - py * py; if (q < 0) continue;
      const hw = l.rx * Math.sqrt(q), x0 = Math.max(W.wx, Math.ceil(l.x - hw - 0.5)), x1 = Math.min(W.wx + W.w - 1, Math.floor(l.x + hw - 0.5));
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5 - l.x) / l.rx, pz = Math.sqrt(Math.max(0, q - px * px));   // a ball's normal, turned from the screen into the world
        markAt(W, x, y, 4 + shadeStep([px * SIN45 + py * UPS + pz * EYE, -px * SIN45 + py * UPS + pz * EYE, -py * UPZ + pz * EYE], true));
      }
    }
  }
}
const BLOB_FACES = withFaces(...[0, 1, 2, 3].map(step => ({ step, p: 1 })));

const levels = n => () => Math.max(1, Math.round(n * levelPx()));
const pitchFit = o => { o.h = Math.max(1, Math.round(pn(o, 'pitch') * levelPx())); return o; };
const PITCH = { label: 'Pitch', min: 1, max: 3, def: 1, hint: 'How many levels the ridge rises above the eaves.' };
const SIZES = { w: 'Width', d: 'Depth', h: 'Height px' };
const roundFit = o => { o.w = o.d = 2 * pn(o, 'radius'); return o; };
const roundDrag = (o, di, dj) => ({ params: Object.assign({}, o.params, { radius: Math.max(di, dj) + 1 }) });
const RADIUS = { label: 'Radius', min: 1, max: 64, def: 2, hint: 'Radius in half tiles.' };
const clampH = (o, max) => { o.h = Math.min(max, o.h); return o; };
/* How each shape behaves. w and d are the default footprint in half tiles, the same at any tile size, and h() is its default height, in levels so that it scales. fit() keeps a record valid after an edit; `patch` says what changed. */
const SHAPE_DEFS = {
  box: { name: 'Box', group: 'Basic', w: 4, d: 4, h: levels(1), mark: boxMark, flat: true, sizes: () => SIZES, params: {} },
  slab: { name: 'Slab', group: 'Basic', w: 4, d: 4, h: () => Math.max(1, Math.min(8, Math.round(S.tile / 8))), mark: boxMark, flat: true, sizes: () => SIZES, params: {}, fit: o => clampH(o, 8) },
  wall: { name: 'Wall', group: 'Basic', w: 1, d: 8, h: levels(2), mark: wallMark, flat: true, faced: true, rotateSwapsFootprint: true, preview: { d: 4 },
    sizes: o => o.facing % 2 ? { w: 'Length', d: 'Thickness', h: SIZES.h } : { w: 'Thickness', d: 'Length', h: SIZES.h },
    params: { openings: { label: 'Openings', min: 0, max: 2, def: 0, hint: 'Cut-outs through the wall, for doors and windows.' } },
    fit: o => { const k = o.facing % 2 ? 'd' : 'w'; o[k] = Math.min(4, o[k]); return o; },
    drag: (o, di, dj) => di > dj ? { facing: 1, w: 2 * (di + 1), d: 1 } : { facing: 0, w: 1, d: 2 * (dj + 1) } },
  stairs: { name: 'Stairs', group: 'Structure', w: 4, d: 4, h: levels(2), mark: stairsMark, faces: stairsFaces, surf: stairsSurf, faced: true, rotateSwapsFootprint: true, sizes: () => SIZES,
    above: o => pn(o, 'railing') === 'none' ? 0 : railH(),
    mirror: n => { const r = pn(n, 'railing'); return r === 'left' || r === 'right' ? Object.assign(n, { params: Object.assign({}, n.params, { railing: r === 'left' ? 'right' : 'left' }) }) : n; },
    params: { steps: { label: 'Steps', min: 2, max: 12, def: 4, hint: 'Number of steps from the ground to the full height.' },
      railing: { label: 'Railing', options: [['none', 'None'], ['left', 'Left'], ['right', 'Right'], ['both', 'Both']], def: 'none', hint: 'Sides with a rail, as seen walking up the stairs.' } } },
  ramp: { name: 'Ramp', group: 'Structure', w: 4, d: 4, h: levels(1), mark: rampMark, faces: rampFaces, noTop: true, surf: (o, a, b) => rampSurf(o, frame(o), rampLow(o), a, b), faced: true, rotateSwapsFootprint: true, sizes: () => SIZES,
    params: { slope: { label: 'Tiles per level', min: 1, max: 6, def: 2, hint: 'How many tiles the ramp runs to rise one level. Changing this or the length sets the height.' } },
    fit: (o, patch) => { if ('w' in patch || 'd' in patch || 'params' in patch) o.h = Math.max(1, rampRise(frame(o).L, pn(o, 'slope'))); return o; } },
  gable: { name: 'Gable', group: 'Roofs', w: 4, d: 4, h: levels(1), mark: gableMark, faces: gableFaces, endsTop: true, surf: (o, a, b) => { const f = frame(o); return Math.max(0, gableSurf(o, gableSpan(o), f.W / 2, f.t(a, b))); }, faced: true, rotateSwapsFootprint: true, sizes: () => ({ w: 'Width', d: 'Depth' }), pad: o => pn(o, 'overhang'), fit: pitchFit,
    params: { pitch: PITCH, overhang: { label: 'Overhang px', min: 0, max: 2, def: 0, hint: 'Pixels the roof reaches past the walls below it.' } } },
  hip: { name: 'Hip', group: 'Roofs', w: 6, d: 4, h: levels(2), mark: hipMark, faces: hipFaces, noTop: true, surf: hipSurf, preview: { w: 4 }, sizes: () => ({ w: 'Width', d: 'Depth' }), params: { pitch: Object.assign({}, PITCH, { def: 2 }) }, fit: pitchFit },
  pyramid: { name: 'Pyramid', group: 'Roofs', w: 4, d: 4, h: levels(1.5), mark: hipMark, faces: hipFaces, noTop: true, surf: hipSurf, sizes: () => ({ w: 'Side', h: 'Height px' }), params: {}, fit: o => { o.d = o.w; return o; }, drag: (o, di, dj) => ({ w: 2 * (Math.max(di, dj) + 1) }) },
  cylinder: { name: 'Cylinder', group: 'Round', w: 4, d: 4, h: levels(1), mark: cylinderMark, faces: () => CYL_FACES, uv: cylinderUv, flat: true, round: true, sizes: () => ({ h: 'Height px' }), params: { radius: RADIUS }, fit: roundFit, drag: roundDrag },
  cone: { name: 'Cone', group: 'Round', w: 4, d: 4, h: levels(2), mark: coneMark, faces: coneFaces, uv: coneUv, noTop: true, round: true, surf: coneSurf, sizes: () => ({ h: 'Height px' }), params: { radius: RADIUS }, fit: roundFit, drag: roundDrag },
  blob: { name: 'Blob', group: 'Organic', w: 4, d: 4, h: levels(1.5), mark: blobMark, faces: () => BLOB_FACES, noTop: true, round: true, sizes: () => SIZES, reroll: true,
    params: { lobes: { label: 'Lobes', min: 3, max: 7, def: 5, hint: 'How many ellipses make up the rock or bush.' } } }
};
const SHAPE_GROUPS = ['Basic', 'Structure', 'Roofs', 'Round', 'Organic', 'Details'];
for (const t in SHAPE_DEFS) { const g = SHAPE_DEFS[t]; if (!g.faces) g.faces = () => BOX_FACES; }
/* A type from a newer build draws as a box and keeps its record. */
const shapeOf = o => SHAPE_DEFS[o.type] || DETAIL_DEFS[o.type] || SHAPE_DEFS.box;
const defOf = type => shapeOf({ type });
function shapeFit(o, patch) { const g = shapeOf(o); return g.fit ? g.fit(o, patch) : o; }

/* ---------- shading ---------- */
/* A face's step down the ramp: intensity = dot(normal, light), quantized, never blended. The vectors give a box its base, one and two steps. Round sides quantize finer, or a curve would be two flat bands. */
const LIGHT_VEC = { left: [-0.25, 0.35, 1], right: [0.35, -0.25, 1], overhead: [0.35, 0.35, 1] };
function shadeStep(n, round) {
  const L = LIGHT_VEC[S.light] || LIGHT_VEC.left, I = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
  return Math.max(0, Math.min(round ? 3 : 2, Math.round((round ? 2.4 : 1.6) * (1 - I))));
}
/* Top is never darker than the lit side, and the lit side never darker than the shaded side. */
function shadeOrdered(steps) {
  const t = shadeStep(UP), a = shadeStep(RIGHT_N), b = shadeStep(LEFT_N), lit = S.light === 'right' ? a : b, dark = S.light === 'right' ? b : a;
  return t <= lit && lit <= dark && steps.every(n => n >= t);
}
/* The ramp a look stands on: its own by name, or the nearest real ramp once that has left the palette. Null with no usable ramp at all. */
function lookRamp(k) {
  const named = paletteRamps().find(r => r.name === k.ramp && !isLoose(r)), near = named ? null : nearestOnRamp(k.color);
  if (!named && !near) return null;
  const colors = (named || near.ramp).colors; return { colors, base: Math.min(named ? k.base : near.index, colors.length - 1) };
}
/* Packed colors by face mark, stepped along the object's own ramp. With no usable ramp in the palette it falls back to faceShades and its multipliers.
   A face may ask for the accent ramp, step lighter (`up`), or be `bare`, with no outline. paint(m) gives the colors a material reaches from that face, by offset + 2. */
function objShades(o) {
  const k = o.look, faces = shapeOf(o).faces(o), steps = faces.map(f => !f ? 0 : f.step !== undefined ? f.step : shadeStep(f.n, f.round));
  console.assert(shadeOrdered(steps), 'face shading out of order', o.type, S.light);
  const prio = faces.map(f => f ? f.p : 0), own = lookRamp(k);
  if (!own) {
    const f = faceShades(k.color), by = [f.top, S.light === 'right' ? f.right : f.left, S.light === 'right' ? f.left : f.right, f.edge], s = steps.map((n, m) => m ? by[n] : 0);
    return { faces, face: s, edge: o.outline === 'none' ? s : s.map((v, m) => m ? f.edge : 0), prio };
  }
  const acc = k.accent ? lookRamp(k.accent) : null, side = k.side ? lookRamp(k.side) : null, fix = k.faces || {}, pick = (r, n) => packHex(r.colors[Math.max(0, Math.min(r.colors.length - 1, n))]);
  const rampAt = m => { const f = faces[m]; return f && f.accent && acc ? acc : side && f && f.n && !f.n[2] ? side : own; };   // look.side: terrain walls on their own ramp
  const at = steps.map((n, m) => { const f = [, fix.top, fix.left, fix.right][m], up = faces[m] && faces[m].up || 0; return f === undefined ? Math.max(0, rampAt(m).base - n) + up : f; });
  const paint = m => { const r = rampAt(m), n = at[m], joint = d => acc ? pick(acc, acc.base - steps[m]) : pick(r, n + d); return [joint(-1), pick(r, n - 1), pick(r, n), pick(r, n + 1), joint(1)]; };
  return { faces, face: at.map((n, m) => m ? pick(rampAt(m), n) : 0), edge: at.map((n, m) => !m ? 0 : faces[m].bare ? pick(rampAt(m), n) : pick(rampAt(m), o.outline === 'sel' ? n - 1 : 0)), prio, paint };
}
/* What each mark writes to the face buffer. Lit and shaded follow the light, the way a pixel looks; details.js turns them back into walls. */
function faceCodes(faces) {
  const lit = S.light === 'right' ? RIGHT_N : LEFT_N;
  return faces.map(f => !f ? 0 : f.n === UP ? FACE_TOP : f.n === LEFT_N || f.n === RIGHT_N ? (f.n === lit ? FACE_LIT : FACE_SHADED) : FACE_SLOPE);
}
/* The next darker color along whichever ramp holds this one. Sel-out of a detail reads the surface behind it, which may be on any ramp. */
function darkerOf(v) {
  if (!objDark) { objDark = new Map(); for (const r of paletteRamps()) r.colors.forEach((h, n) => { if (n && !objDark.has(packHex(h))) objDark.set(packHex(h), packHex(r.colors[n - 1])); }); }
  return objDark.get(v);
}

/* ---------- drawing one object ---------- */
/* Writes the part of an object inside box b through put(x, y, value, face). The window is one pixel larger so edges are found by the real neighbor, even at the rim of b. read(x, y), when given, is what lies behind. */
function objStamp(o, b, put, read) {
  const r = objPixelBox(o), x0 = Math.max(b.x0, r.x0), y0 = Math.max(b.y0, r.y0), x1 = Math.min(b.x1, r.x1), y1 = Math.min(b.y1, r.y1);
  if (x0 > x1 || y0 > y1) return;
  const wx = x0 - 1, wy = y0 - 1, w = x1 - x0 + 3, h = y1 - y0 + 3, n = w * h;
  if (objMarks.length < n) objMarks = new Uint8Array(n * 2);
  const m = objMarks; m.fill(0, 0, n);
  const g = shapeOf(o); g.mark(o, { m, wx, wy, w, h, lift: S.goy - o.z, f: 1 });
  const s = objShades(o), lined = o.outline !== 'none', face = s.face, edge = s.edge, pr = s.prio, code = faceCodes(s.faces), tex = objPainter(o, s, g, s.faces, wx, w), under = o.parent && o.outline === 'sel' ? read : null, bare = g.attach ? s.faces.map(f => !!f && !!f.bare) : null;
  for (let y = y0; y <= y1; y++) for (let x = x0, k = (y - wy) * w + 1; x <= x1; x++, k++) {
    const f = m[k]; if (!f) continue;
    const l = m[k - 1], r2 = m[k + 1], t = m[k - w], u = m[k + w], p = pr[f];
    if (lined && !(bare && bare[f]) && (!l || !r2 || !t || !u || pr[l] < p || pr[r2] < p || pr[t] < p || pr[u] < p)) put(x, y, under && darkerOf(under(x, y)) || edge[f], code[f]);   // where two faces meet, the line goes on the one with the higher p
    else { const n = tex ? tex(f, x, y) : -1; put(x, y, n < 0 ? face[f] : tex.pals[f][n], code[f]); }
  }
}
/* The face mark of one pixel of an object, or 0. */
function objMarkAt(o, x, y) {
  const r = objPixelBox(o); if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) return 0;
  const n = 49; if (objMarks.length < n) objMarks = new Uint8Array(n * 2);
  objMarks.fill(0, 0, n); shapeOf(o).mark(o, { m: objMarks, wx: x - 3, wy: y - 3, w: 7, h: 7, lift: S.goy - o.z, f: 1 });
  return objMarks[24];
}
/* Draws a list off the layer, for a ghost. Sel-out on a detail reads what is behind it, so that much is remembered, and a ghost matches what placing gives. */
/* Not clipped to the canvas: a ghost shows what sticks out. */
function objsP(list, plot) {
  const b = listBox(list), seen = list.some(o => o.parent && o.outline === 'sel') ? new Map() : null; if (!b) return;
  const put = !seen ? plot : (x, y, v) => { seen.set(y * OUT_ROW + x, v); plot(x, y, v); }, read = seen && ((x, y) => seen.get(y * OUT_ROW + x));
  for (const o of list) objStamp(o, b, put, read);
}

/* ---------- depth order ---------- */
const depthKey = o => 2 * (o.i + o.j) + o.w + o.d;
const byDepth = (p, q) => depthKey(p) - depthKey(q) || p.z - q.z || p.order - q.order || p.id - q.id;
/* Negative when p draws first. A plane between two objects settles it, as the side nearer the eye is in front. Planes that disagree mean no line of sight meets both, so neither order matters.
   Only solids that interpenetrate have no plane, and there `order` is the artist's say. The depth key alone cannot do this: a small box on the back corner of a large one has the smaller key and would vanish behind it. */
function objFront(p, q) {
  if (p.parent === q.id) return 1;   // a detail stays on its parent, even where it sinks into a roof
  if (q.parent === p.id) return -1;
  const a = 2 * p.i, b = 2 * p.j, c = 2 * q.i, d = 2 * q.j;
  const pBack = a + p.w <= c || b + p.d <= d || p.z + p.h <= q.z, qBack = c + q.w <= a || d + q.d <= b || q.z + q.h <= p.z;
  if (pBack !== qBack) return pBack ? -1 : 1;
  return pBack ? 0 : p.order - q.order || restsOn(p, q) - restsOn(q, p) || byDepth(p, q);
}
/* 1 when o stands on p's slope: their boxes share volume, but p belongs behind it. */
const restsOn = (o, p) => o.z > p.z && shapeOf(p).surf && o.z >= p.z + surfAt(p, 2 * o.i + o.w / 2, 2 * o.j + o.d / 2) ? 1 : 0;
/* Each pair whose bounds overlap gets an edge, then a depth-first walk in depth-key order emits everything behind an object before it.
   Any two objects that share a pixel are both in the list and keep their pair order, so a region draws the same as the whole. A cycle of three is broken at the first object reached. */
function objOrder(list) {
  const items = list.slice().sort(byDepth), n = items.length; if (n < 2) return items;
  const box = items.map(objBox), byX = items.map((_, k) => k).sort((p, q) => box[p].x0 - box[q].x0), behind = items.map(() => []);
  for (let s = 0; s < n; s++) {
    const p = byX[s], P = box[p];
    for (let t = s + 1; t < n; t++) {
      const q = byX[t], Q = box[q]; if (Q.x0 > P.x1) break;
      if (Q.y0 > P.y1 || Q.y1 < P.y0) continue;
      const f = objFront(items[p], items[q]);
      if (f < 0) behind[q].push(p); else if (f > 0) behind[p].push(q);
    }
  }
  const seen = new Uint8Array(n), out = [];
  const visit = k => { seen[k] = 1; for (const b of behind[k]) if (!seen[b]) visit(b); out.push(items[k]); };
  for (let k = 0; k < n; k++) if (!seen[k]) visit(k);
  return out;
}

/* ---------- spatial index: buckets by grid-relative pixel, plus records by id ---------- */
function indexEach(o, fn) {
  const b = o.shadow ? joinBox(objBox(o), castBox(o)) : objBox(o), f = v => Math.floor(v / OBJ_BUCKET);   // the shadow counts, so a region of the shadow layer finds what falls on it
  for (let q = f(b.y0); q <= f(b.y1); q++) for (let p = f(b.x0); p <= f(b.x1); p++) fn(p + ',' + q);
}
function indexAdd(I, o) { I.byId.set(o.id, o); indexEach(o, k => { let s = I.cells.get(k); if (!s) I.cells.set(k, s = new Set()); s.add(o); }); }
function indexDrop(I, o) { I.byId.delete(o.id); indexEach(o, k => { const s = I.cells.get(k); if (s && s.delete(o) && !s.size) I.cells.delete(k); }); }
function objQuery(L, b, boxOf = objBox) {
  const x0 = b.x0 - S.gox, y0 = b.y0 - S.goy, x1 = b.x1 - S.gox, y1 = b.y1 - S.goy, f = v => Math.floor(v / OBJ_BUCKET), hit = new Set();
  for (let q = f(y0); q <= f(y1); q++) for (let p = f(x0); p <= f(x1); p++) {
    const s = L.index.cells.get(p + ',' + q); if (!s) continue;
    for (const o of s) if (!hit.has(o)) { const r = boxOf(o); if (r.x0 <= x1 && r.x1 >= x0 && r.y0 <= y1 && r.y1 >= y0) hit.add(o); }
  }
  return [...hit];
}

/* ---------- rendering ---------- */
/* Everything outside the records that decides an object's pixels. A layer drawn under another signature is out of date. The origin counts only through the nudges: a resize moves pixels and origin together. */
function objSig() { return [S.light, S.tile, S.edgeRun, S.level, S.nudgeX, S.nudgeY, JSON.stringify(S.pal.ramps)].join('|'); }
function objRender(L, b) {
  const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(S.w - 1, b.x1), y1 = Math.min(S.h - 1, b.y1); if (x0 > x1 || y0 > y1) return;
  const W = S.w, px = L.px, ids = L.ids, faces = L.faces, c = { x0, y0, x1, y1 }; let id = 0; objDark = null;
  for (let y = y0; y <= y1; y++) { px.fill(0, y * W + x0, y * W + x1 + 1); ids.fill(0, y * W + x0, y * W + x1 + 1); faces.fill(0, y * W + x0, y * W + x1 + 1); }
  const put = (x, y, v, f) => { const i = y * W + x; px[i] = v; ids[i] = id; faces[i] = f; }, read = (x, y) => px[y * W + x];
  for (const o of objOrder(objQuery(L, c))) { id = o.id; objStamp(o, c, put, read); }
  flush(L, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}
function objRenderAll(L) {
  L.objects = objFits(L.objects);
  const I = { cells: new Map(), byId: new Map() }; for (const o of L.objects) indexAdd(I, o);
  L.index = I; L.sig = objSig(); objRender(L, { x0: 0, y0: 0, x1: S.w - 1, y1: S.h - 1 });
}
/* Light, palette, tile size, edge style and grid nudges are project settings, so objects follow them. Without this the next edit would redraw only its own region under the new setting and leave a patch. */
function objRefresh() { const sig = objSig(); for (const L of S.layers) if (L.objectLayer && L.sig !== sig) objRenderAll(L); shadowTidy(); objSync(); }
/* Two boxes that do not touch stay two, so a long move does not redraw the span between them. */
const boxPair = (p, q) => !p || !q ? [p || q].filter(Boolean) : p.x0 <= q.x1 && q.x0 <= p.x1 && p.y0 <= q.y1 && q.y0 <= p.y1 ? [joinBox(p, q)] : [p, q];
/* Undo, redo and every live edit pass through here: the two arrays differ by the records that changed, and only those records' boxes are drawn again. */
function objApply(L, next) {
  next = objFits(next); const prev = L.objects; L.objects = next;
  if (L.sig !== objSig()) { objRenderAll(L); shadowTidy(); return; }
  const had = new Set(prev), has = new Set(next), was = { box: null, cast: null }, now = { box: null, cast: null };
  const seen = (o, s) => { s.box = joinBox(s.box, objPixelBox(o)); if (o.shadow) s.cast = joinBox(s.cast, castPixelBox(o)); };
  for (const o of prev) if (!has.has(o)) { indexDrop(L.index, o); seen(o, was); }
  for (const o of next) if (!had.has(o)) { indexAdd(L.index, o); seen(o, now); }
  const drawn = boxPair(was.box, now.box); for (const b of drawn) objRender(L, b);
  shadowEdit(L, prev, boxPair(was.cast, now.cast));
  if (L.kind === 'terrain') for (const b of drawn) shadowCovered(L, b);
}
/* New canvas area, or the part of an object a crop cut off, has no cached pixels yet. Only the area outside the old canvas is drawn. */
/* What a resize would cut from a strip of the canvas. It walks the strip, not the canvas. A live shadow is left out, as it comes back from its records. An object layer's pixels are a cache, so there it counts objects: those showing in the strip, and those whose footprint lies in it behind something else. */
function stripHolds(x0, y0, x1, y1) {
  let pixels = 0, layers = 0; const objects = new Set(), W = S.w;
  for (const L of S.layers) {
    if (L.live) continue;
    if (L.objectLayer) {
      for (let y = y0; y <= y1; y++) for (let x = x0, i = y * W + x0; x <= x1; x++, i++) if (L.ids[i]) { const o = L.index.byId.get(L.ids[i]); objects.add(o && o.parent || L.ids[i]); }
      for (const o of L.objects) {
        if (o.parent) continue;
        const a = cellCorner(o.i, o.j), b = cellCorner(o.i + o.w / 2, o.j), c = cellCorner(o.i, o.j + o.d / 2), d = cellCorner(o.i + o.w / 2, o.j + o.d / 2);
        if (b.x > x0 && c.x <= x1 && d.y - o.z > y0 && a.y - o.z <= y1) objects.add(o.id);
      }
      continue;
    }
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let i = y * W + x0, e = y * W + x1; i <= e; i++) if (L.px[i] >>> 24) n++;
    if (n) { pixels += n; layers++; }
  }
  return { pixels, layers, objects: objects.size };
}
function objNewArea(L, ox, oy, ow, oh) {
  const W = S.w - 1, B = S.h - 1, r = ox + ow, d = oy + oh;
  for (const b of [{ x0: 0, y0: 0, x1: W, y1: oy - 1 }, { x0: 0, y0: d, x1: W, y1: B }, { x0: 0, y0: oy, x1: ox - 1, y1: d - 1 }, { x0: r, y0: oy, x1: W, y1: d - 1 }]) if (b.x0 <= b.x1 && b.y0 <= b.y1) objRender(L, b);
}

/* ---------- history ---------- */
/* Undo restores the records and draws them again rather than replaying stored pixels, which a later light or palette change would have made wrong. */
function objPush(L, prev, next, tag) {
  const now = performance.now(), g = objStep;
  if (tag && g && g.tag === tag && now - g.t < OBJ_MERGE_MS && H.pos > 0 && H.stack[H.pos - 1] === g.e) { g.next = next; g.t = now; setDirty(true); return; }
  const s = { tag, t: now, next, e: null };
  s.e = { bytes: 64 + 8 * (prev.length + next.length), undo: () => objApply(L, prev), redo: () => objApply(L, s.next) };
  objStep = s; pushHistory(s.e);
}
function objEdit(L, next, tag) { const prev = L.objects; objApply(L, next); objPush(L, prev, next, tag); }
/* Commits new records. Past the edge the canvas grows first, which is its own undo step and replaces the layer object. */
function objCommit(L, next, fresh, tag) {
  const id = L.id, b = artBox(fresh);
  if (b && pastEdge(b) && !growTold(b, 8)) toast('The canvas is at its size limit.');
  objEdit(layerById(id), next, tag); objSync();
}

/* ---------- layers ---------- */
function objLayerInit(L) { L.objectLayer = true; L.objects = []; L.ids = new Uint32Array(S.w * S.h); L.faces = new Uint8Array(S.w * S.h); L.index = { cells: new Map(), byId: new Map() }; L.sig = objSig(); }
function addObjectLayer() { addLayer('Objects ' + (S.layers.filter(L => L.objectLayer).length + 1), L => { objLayerInit(L); L.kind = 'prop'; }); }
/* A copy has its own index, since edits change an index in place. */
function objCopyLayer(src, L) { L.objectLayer = true; L.objects = src.objects; L.ids = new Uint32Array(S.w * S.h); L.faces = new Uint8Array(S.w * S.h); objRenderAll(L); }
function bakeObjects() {
  const L = activeLayer(); if (!L.objectLayer || !canTouch(L)) return;
  const keep = { objectLayer: true, objects: L.objects, ids: L.ids, faces: L.faces, index: L.index, sig: L.sig }, off = { objectLayer: undefined, objects: undefined, ids: undefined, faces: undefined, index: undefined, sig: undefined };
  const sh = liveOf(L), live = v => { if (sh) sh.live = v; };   // its shadow stays, as a plain bake like the art
  Object.assign(L, off); live(false); OB.sel = null;
  let baked = true;
  pushHistory({ bytes: 8 * keep.objects.length + keep.ids.length * 5, undo: () => { baked = false; Object.assign(L, keep); live(true); }, redo: () => { baked = true; Object.assign(L, off); live(false); }, parts: () => baked ? [[keep, 'ids'], [keep, 'faces']] : [] });
  hooks.layers(); toast('Baked. The layer now holds plain pixels.');
}

/* ---------- picking ---------- */
function objAt(L, x, y) {
  if (x < 0 || y < 0 || x >= S.w || y >= S.h) return null;
  return L.index.byId.get(L.ids[y * S.w + x]) || null;
}
const objSelected = () => { const L = activeLayer(); return L && L.objectLayer && OB.sel !== null ? L.index.byId.get(OB.sel) || null : null; };
/* The topmost shown, unlocked object under a pixel, across all object layers. */
function objHit(x, y) {
  const sh = shownSet();
  for (let k = S.layers.length - 1; k >= 0; k--) { const L = S.layers[k]; if (!L.objectLayer || !sh(L) || lockedOf(L)) continue; const o = objAt(L, x, y); if (o) return { k, o }; }
  return null;
}
function placeSurface(a) {
  const L = activeLayer(), g = defOf(S.objType);
  if (g.attach && !libPicked()) {
    const spot = detailSpot(L, a.x, a.y, placeBase());
    if (spot) return { spot, x: a.x, y: a.y };
    if (g.attach === 'wall') return { none: true };
  }
  return surfaceCell(surfaceUnder(a.x, a.y), a.x, a.y);
}

/* ---------- symmetry ---------- */
/* Mirrors in cell space, like a block: redrawn with width and depth swapped, not flipped by pixel, or its lit and shaded walls would change sides.
   Top-bottom reflects the footprint on the ground, so the old front corner becomes the new back corner. The solid stays upright. */
function objMirror(o, mx, my) {
  const hw = S.tile / 2, hh = S.tile / 4; let x = S.gox + (o.i - o.j) * hw, y = S.goy + (o.i + o.j) * hh;
  if (my) { x += (o.w - o.d) * hw / 2; y = S.axisY - (y + (o.w + o.d) * hh / 2); }
  if (mx) x = S.axisX - x;
  const q = Math.round((x - S.gox) / hw), s = Math.round((y - S.goy) / hh), i = Math.floor((s + q) / 2), swap = mx !== my;
  const g = shapeOf(o), n = Object.assign({}, o, { i, j: s - i, w: swap ? o.d : o.w, d: swap ? o.w : o.d, facing: my ? 3 - (mx ? o.facing ^ 1 : o.facing) : mx ? o.facing ^ 1 : o.facing });
  return swap && g.mirror ? g.mirror(n) : n;   // one reflection turns left into right, two cancel
}
function objTwins(o) {
  const out = [], key = q => [q.i, q.j, q.w, q.d].join(), seen = new Set([key(o)]);
  for (const [mx, my] of [[S.mirrorX, false], [false, S.mirrorY], [S.mirrorX, S.mirrorY]]) {
    if (!mx && !my) continue;
    const t = objMirror(o, mx, my); if (!seen.has(key(t))) { seen.add(key(t)); out.push(t); }
  }
  return out;
}

/* ---------- Place object ---------- */
/* What a new object of a type looks like: the current color, or a detail's own colors, then whatever the place options chose. */
function lookNew(type) {
  const g = defOf(type), k = lookFrom(g.color || S.color);
  if (g.accent) { const a = lookFrom(g.accent); k.accent = { ramp: a.ramp, base: a.base, color: a.color }; }
  if (g.side) { const a = lookFrom(g.side); k.side = { ramp: a.ramp, base: a.base, color: a.color }; }
  if (g.material) k.material = g.material;
  return Object.assign(k, { seed: 1 }, S.objMat[type]);
}
/* The record the place options describe, at no position yet. */
function placeBase() {
  const t = S.objType, g = defOf(t);
  return shapeFit(objNew({ type: t, w: S.objW, d: S.objD, h: S.objH || g.h(), facing: S.objFacing, params: S.objP, look: lookNew(t), outline: g.outline || S.objOutline }), {});
}
/* Dragged: the rectangle of cells on the surface it started on. Not dragged: the size in the options, at the cell. */
function placeDrafts(d) {
  if (libPicked()) return objOrder(libDrafts(d));
  if (d.spot) return detailDrafts(d);
  const di = Math.abs(d.a.i - d.b.i), dj = Math.abs(d.a.j - d.b.j), g = shapeOf({ type: S.objType }), base = placeBase();
  let o = Object.assign(base, { i: Math.min(d.a.i, d.b.i), j: Math.min(d.a.j, d.b.j), z: d.z });
  if (!di && !dj) keepOn(o, d.on);
  if (di || dj) {
    Object.assign(o, g.drag ? g.drag(o, di, dj) : { w: 2 * (di + 1), d: 2 * (dj + 1) });
    o = shapeFit(o, { w: o.w });
  }
  return !g.reroll ? [o, ...objTwins(o)] : [o, ...objTwins(o)].map((q, k) => Object.assign(q, { look: Object.assign({}, q.look, { seed: objSeq + k }) }));   // the seed the placed object will get, so a blob's ghost is the blob
}
const placeName = () => { const l = libPicked(); return l ? l.name : defOf(S.objType).name; };
function placeShow(d) {
  PL.drafts = placeDrafts(d); pvDraw(plot => objsP(PL.drafts, plot)); pvCast(PL.drafts);
  fitNote(artBox(PL.drafts), placeName(), { again: () => placeShow(d), inside: d.spot ? null : q => { PL.drag = null; placeFinish(d, q); } });
}
function placeHover(a) {
  const s = placeSurface(a), q = s.spot;
  if (s.none) { PL.ghost = null; pvClear(); return; }
  const k = q ? [q.p.id, q.face, q.u, q.v].join() : [s.cell.i, s.cell.j, s.z].join();
  if (k === PL.ghost && pvShown()) return;
  PL.ghost = k; placeShow(q ? s : { a: s.cell, b: s.cell, z: s.z, on: s.on });
}
function placeStart(a) {
  const L = activeLayer(); if (L.objectLayer && !canTouch(L)) return false;
  const s = placeSurface(a);
  if (s.none) { toast(WALL_NOT_FOUND); return false; }
  PL.drag = s.spot ? s : { a: s.cell, b: s.cell, z: s.z, on: s.on };
  placeShow(PL.drag); return true;
}
function placeMove(a) {
  const d = PL.drag; if (!d) return;
  if (d.spot) { const s = placeSurface(a); if (s.spot) { PL.drag = s; placeShow(s); } return; }
  const c = tileCell(a.x, a.y + d.z); if (c.i === d.b.i && c.j === d.b.j) return;
  d.b = c; placeShow(d);
}
/* A whole set moves together, and its details follow from their parents. */
function objsShift(list, q) {
  const by = new Map(), up = list.map(o => { if (o.parent) return o; const n = Object.assign({}, o, { i: o.i + q.a / 2, j: o.j + q.b / 2 }); by.set(o.id, n); return n; });
  return up.map(o => o.parent && by.has(o.parent) ? detailFit(o, by.get(o.parent)) : o);
}
function placeCommit() {
  const d = PL.drag; PL.drag = null;
  const lib = libPicked(), drafts = lib ? libDrafts(d) : placeDrafts(d);
  fitGate(artBox(drafts), placeName(), d.spot ? () => null : b => fitShift(b, 1), q => placeFinish(d, q));
}
function placeFinish(d, q) {
  const lib = libPicked(); let fresh = lib ? libDrafts(d, () => objSeq++) : placeDrafts(d); pvClear(); CAST.slow = Infinity;
  if (q) fresh = objsShift(fresh, q);
  if (!activeLayer().objectLayer) addObjectLayer();
  const L = activeLayer();
  if (lib) { const g = fresh[0].lib.g, tops = fresh.filter(o => !o.parent && o.lib.g === g).map(o => o.id); OB.sel = tops[0]; OB.ids = tops.length > 1 ? tops : []; }
  else { for (const o of fresh) { o.id = objSeq++; if (shapeOf(o).reroll) o.look = Object.assign({}, o.look, { seed: o.id }); } OB.sel = fresh[0].id; }
  objCommit(L, L.objects.concat(fresh), fresh);
}

/* ---------- edits of the selected object ---------- */
/* A patch may be a function of the record, so one edit can act on a whole selection. */
function objPatchSet(L, list, patch, tag, kid) {
  let next = L.objects; const fresh = [];
  for (const o of list) {
    const f = typeof patch === 'function' ? patch(o) : patch, p = o.parent ? L.index.byId.get(o.parent) : null; let n = shapeFit(Object.assign({}, o, f), f);
    if (p) n = 'u' in f || 'v' in f ? detailPin(n, p) : detailFit(n, p);
    next = objSwap(next, o, n, kid); fresh.push(n);
  }
  objCommit(L, next, next.filter(q => fresh.includes(q) || fresh.some(n => q.parent === n.id)), tag);
}
function objPatch(patch, tag, kid) { const L = activeLayer(); if (objSelected() && canTouch(L)) objPatchSet(L, objSet(), patch, tag, kid); }
function objSetField(f, v, tag) {
  const [, min, max] = OBJ_FIELDS[f], n = Math.max(min, Math.min(max, f === 'i' || f === 'j' ? Math.round(v * 2) / 2 : Math.round(v)));
  if (Number.isFinite(n)) objPatch({ [f]: n }, tag); else objSync();
}
/* A stepper lands on the next whole level, so a height of 20 px at 16 px a level goes to 32, not 36. Each object of a selection steps from its own value. */
function objStepField(f, sign) {
  const [, min, max] = OBJ_FIELDS[f], s = levelStep(), to = v => Math.max(min, Math.min(max, Math.round((sign > 0 ? Math.floor(v / s + 1e-9) + 1 : Math.ceil(v / s - 1e-9) - 1) * s)));
  objPatch(o => ({ [f]: to(o[f]) }), f);
}
function objSetLook(patch) { if (objSelected()) objPatch(o => ({ look: Object.assign({}, o.look, patch) })); }
/* Facing steps 0 to 3. A shape built along its facing keeps its length, so its footprint swaps on each quarter turn. Others keep theirs, and four turns are the identity either way. */
function turned(o, by) {
  const swap = shapeOf(o).rotateSwapsFootprint && by % 2;
  return Object.assign({ facing: (o.facing + by + 4) % 4 }, swap ? { w: o.d, d: o.w } : null);
}
function objTurn(by) { const o = objSelected(); if (o) objPatch(turned(o, by), 'facing', shapeOf(o).rotateSwapsFootprint ? q => detailSpin(q, o, by) : null); }
function objSetParam(k, v, tag) { const o = objSelected(); if (o) objPatch({ params: Object.assign({}, o.params, { [k]: v }) }, tag); }
function objDelete() {
  const L = activeLayer(), gone = new Set(objSet().map(o => o.id)); if (!gone.size || !canTouch(L)) return;
  OB.sel = null; objEdit(L, L.objects.filter(q => !gone.has(q.id) && !gone.has(q.parent))); objSync();
}
function objDuplicate() {
  const L = activeLayer(), set = objSet(), o = set[0]; if (!o || !canTouch(L)) return;
  if (o.parent) {   // a copy of a detail stays on the same parent, beside the original
    const n = detailPin(Object.assign({}, o, { id: objSeq++, u: o.u + (o.face === 'top' ? o.w : shapeOf(o).span(o).len + 4) }), L.index.byId.get(o.parent)); OB.sel = n.id;
    objCommit(L, L.objects.concat(n), [n]); return;
  }
  const ids = new Set(set.map(q => q.id)), kept = L.objects.filter(q => ids.has(q.id) || ids.has(q.parent)), made = asmCopy(kept, () => objSeq++, AS.path.length), by = new Map(), fresh = [];
  for (const q of made) if (!q.parent) { const n = Object.assign(q, { i: q.i + 1, j: q.j + 1 }); by.set(n.id, n); fresh.push(n); }
  const tops = fresh.map(q => q.id);
  for (const q of made) if (q.parent) fresh.push(detailFit(q, by.get(q.parent)));
  OB.sel = tops[0]; OB.ids = tops.length > 1 ? tops : [];
  objCommit(L, L.objects.concat(fresh), fresh);
}
/* Arrows follow the grid axes: left and right along i, up and down along j. */
function objKey(k, mod, shift) {
  if (!mod && libKey(k)) return true;
  if (k === 'escape' && AS.path.length) { asmExit(); return true; }
  if (!objTool(heldTool()) || !objSelected()) return false;
  if (mod && k === 'g') { if (shift) asmExplode(); else asmMake(); return true; }
  const arrow = { arrowleft: ['i', -1], arrowright: ['i', 1], arrowup: ['j', -1], arrowdown: ['j', 1] }[k];
  if (arrow && !mod) {
    const o = objSelected(), [f, n] = arrow, wall = typeof o.face === 'number';
    if (o.parent) { const up = f === 'j', d = wall ? 2 : 1; objPatch(up ? { v: o.v + (wall ? -n : n) * d } : { u: o.u + n * d }, 'move'); } else objPatch(q => ({ [f]: q[f] + n }), 'move');
    return true;
  }
  if (k === 'delete' || k === 'backspace') { objDelete(); return true; }
  if (k === 'escape') { objSelect(null); return true; }
  if (mod && k === 'j') { objDuplicate(); return true; }
  if (!mod && (k === 'pageup' || k === ']')) { objRaise(1); return true; }
  if (!mod && (k === 'pagedown' || k === '[')) { objRaise(-1); return true; }
  if (!mod && k === 'end') { objLand(); return true; }
  return false;
}

/* ---------- panel ---------- */
/* A ramp list and the ramp's colors. Both pickers share it: Place sets the current color, the inspector sets the object's look. */
function rampPicker(sel, row, name, base, onPick) {
  const ramps = paletteRamps().filter(r => !isLoose(r)), ramp = ramps.find(r => r.name === name);
  sel.hidden = row.hidden = !ramps.length; sel.textContent = ''; row.textContent = '';
  for (const r of ramps) { const o = document.createElement('option'); o.textContent = r.name; sel.appendChild(o); }
  sel.onchange = () => { const r = ramps.find(q => q.name === sel.value); onPick(r, Math.min(base, r.colors.length - 1)); };
  if (!ramp) { sel.selectedIndex = -1; return; }
  sel.value = name;
  ramp.colors.forEach((hex, k) => {
    const b = document.createElement('button'); b.className = 'sw'; b.style.background = hex; b.setAttribute('aria-label', 'Color ' + hex); press(b, k === base);
    b.onclick = () => onPick(ramp, k); row.appendChild(b);
  });
}
const SIZE_HINTS = { 'Crown width': 'Across the crown, in half tiles.', w: 'Along the down-right axis, in half tiles.', d: 'Along the down-left axis, in half tiles.', h: 'Height in pixels.', Thickness: 'Thickness in half tiles, 1 to 4.', Length: 'Length in half tiles.', Side: 'Each side, in half tiles. The footprint stays square.' };
/* The tooltip does nothing on touch, so the long press in help.js shows the same words. */
function hintOn(el, text) { el.title = text; el.dataset.hint = text; }
/* A shape's own parameters. The controls are built once per shape, then only their values change, so a stepper keeps its focus between taps. */
function renderParams(host, o, set, reroll) {
  const g = shapeOf(o), key = o.type + (reroll ? '+' : '');
  if (host.dataset.key !== key) {
    host.dataset.key = key; host.textContent = '';
    for (const k in g.params) {
      const p = g.params[k], c = document.createElement('div'); c.className = 'field gap-top'; c.textContent = p.label; hintOn(c, p.hint);
      if (p.text) {
        const n = document.createElement('input'); n.type = 'text'; n.maxLength = SIGN_MAX; n.autocapitalize = 'characters'; n.setAttribute('aria-label', p.label); n.dataset.param = k;
        n.onchange = () => set(k, signText(n.value)); c.appendChild(n);
      } else if (p.options) {
        const seg = document.createElement('div'); seg.className = 'seg wide'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', p.label);
        for (const [v, label] of p.options) { const b = document.createElement('button'); b.textContent = label; b.dataset.value = v; b.onclick = () => set(k, v); seg.appendChild(b); }
        c.appendChild(seg);
      } else {
        const st = document.createElement('span'), dn = document.createElement('button'), up = document.createElement('button'), n = document.createElement('input'), clamp = v => Math.max(p.min, Math.min(p.max, v));
        st.className = 'stepper wide'; dn.className = up.className = 'btn sm'; dn.innerHTML = '&minus;'; up.textContent = '+'; dn.setAttribute('aria-label', p.label + ' down'); up.setAttribute('aria-label', p.label + ' up');
        n.type = 'number'; n.setAttribute('aria-label', p.label); n.dataset.param = k;
        dn.onclick = () => set(k, clamp(+n.value - 1), k); up.onclick = () => set(k, clamp(+n.value + 1), k);
        n.onchange = () => { const v = parseInt(n.value, 10); if (Number.isFinite(v)) set(k, clamp(v)); else objSync(); };
        st.append(dn, n, up); c.appendChild(st);
      }
      c.dataset.key = k; host.appendChild(c);
    }
    if (reroll && g.reroll) { const b = document.createElement('button'); b.className = 'btn gap-top'; b.id = 'objReroll'; b.textContent = 'Reroll'; hintOn(b, 'Draws another random shape from a new seed.'); b.onclick = reroll; host.appendChild(b); }
  }
  for (const c of host.children) {
    const k = c.dataset.key; if (!k) continue;
    const v = pn(o, k), n = c.querySelector('input');
    if (n) { if (document.activeElement !== n) n.value = v; } else c.querySelectorAll('button').forEach(b => press(b, b.dataset.value === v));
  }
}
/* Shows the size fields a shape has, under its names for them. */
function syncSizes(o, inputs) {
  const labels = shapeOf(o).sizes(o);
  for (const f in inputs) {
    const e = inputs[f], c = e.closest('.field'), name = labels[f]; c.hidden = !name; if (!name) continue;
    c.firstChild.textContent = name; e.setAttribute('aria-label', name); hintOn(c, SIZE_HINTS[name] || SIZE_HINTS[f]);
  }
}
function syncPlace() {
  const o = placeBase(), g = shapeOf(o), k = lookFrom(S.color);
  $('objW').value = o.w; $('objD').value = o.d; $('objH').value = o.h; press($('objShadowOpt'), S.objShadow);
  syncSizes(o, { w: $('objW'), d: $('objD'), h: $('objH') });
  $('placeFacingRow').hidden = !g.faced; $('placeFacing').textContent = FACINGS[o.facing]; $('placeArrow').style.transform = 'rotate(' + o.facing * 90 + 'deg)';
  $('placeRamp').closest('label').hidden = !!g.color; $('shades').hidden = !!g.color;
  renderMat($('placeMat'), o.type, o.look, patch => { S.objMat = Object.assign({}, S.objMat, { [o.type]: Object.assign({}, S.objMat[o.type], patch) }); pvClear(); syncPlace(); });
  renderParams($('placeParams'), o, (p, v) => { S.objP = Object.assign({}, S.objP, { [p]: v }); const n = shapeFit(placeBase(), { params: 1 }); S.objH = n.h; S.objW = n.w; S.objD = n.d; pvClear(); syncPlace(); });
  rampPicker($('placeRamp'), $('placeSwatches'), k.ramp, k.base, (r, n) => setColor(r.colors[n])); if (g.color) $('placeSwatches').hidden = true;
  document.querySelectorAll('#shapeCards [data-shape]').forEach(b => { press(b, b.dataset.shape === S.objType); drawShapeCard(b.firstChild, b.dataset.shape); });
}
function placeTurn(by) {
  const o = placeBase(), t = turned(o, by); S.objFacing = t.facing; if ('w' in t) { S.objW = t.w; S.objD = t.d; }
  pvClear(); syncPlace();
}
function pickShape(t) { const g = defOf(t); S.objType = t; S.objP = {}; S.objW = g.w; S.objD = g.d; S.objH = 0; S.objFacing = 0; pvClear(); syncPlace(); }
/* Each card runs the real rasterizer on a tiny grid, in the current color, light and outline, so it shows what placing will give. */
const CARD_PX = 24;
function drawShapeCard(cv, type) {
  const g = defOf(type), keep = [S.tile, S.gox, S.goy, S.edgeRun, S.level], ctx = cv.getContext('2d'), img = ctx.createImageData(CARD_PX, CARD_PX), px = new Uint32Array(img.data.buffer);
  Object.assign(S, { tile: 12, gox: 0, goy: 0, edgeRun: 2, level: 0 });
  try {
    const o = objNew({ type, w: g.w, d: g.d, h: g.h(), look: Object.assign(lookNew(type), { seed: 3 }), outline: g.outline || S.objOutline });
    Object.assign(o, g.preview); shapeFit(o, {});
    const wall = g.attach === 'wall' ? objNew({ id: -1, w: 6, d: 2, h: 16, outline: 'none' }) : null, list = wall ? [wall, detailPin(Object.assign(o, { parent: -1, face: 1, u: 2, v: 2 }), wall)] : [o], b = objBox(list[0]);
    S.gox = Math.round((CARD_PX - b.x1 - b.x0) / 2); S.goy = Math.round((CARD_PX - b.y1 - b.y0) / 2);
    const c = wall ? list.map(q => q.parent ? detailFit(q, wall) : q) : list;   // the origin moved, and the fit holds columns
    for (const q of c) objStamp(q, { x0: 0, y0: 0, x1: CARD_PX - 1, y1: CARD_PX - 1 }, (x, y, v) => { px[y * CARD_PX + x] = v; });
  } finally { [S.tile, S.gox, S.goy, S.edgeRun, S.level] = keep; }
  ctx.putImageData(img, 0, 0);
}
function initShapeCards() {
  const host = $('shapeCards');
  for (const group of SHAPE_GROUPS) {
    const h = document.createElement('div'); h.className = 'shapehead'; h.textContent = group; host.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'shapes'; host.appendChild(grid);
    for (const t of Object.keys(SHAPE_DEFS).concat(Object.keys(DETAIL_DEFS))) if (defOf(t).group === group) {
      const b = document.createElement('button'), c = document.createElement('canvas'); b.className = 'shapecard'; b.dataset.shape = t; c.width = c.height = CARD_PX;
      b.append(c, defOf(t).name); b.onclick = () => pickShape(t); if (defOf(t).hint) hintOn(b, defOf(t).hint); grid.appendChild(b);
    }
  }
}
function objFill(o) {
  const g = shapeOf(o), sizes = { w: $('obj_w'), d: $('obj_d'), h: $('obj_h') };
  const set = objSet(), many = set.length > 1, lv = n => Math.round(n / levelPx() * 100) / 100, same = f => set.every(q => q[f] === o[f]);
  for (const f in OBJ_FIELDS) { const e = $('obj_' + f), v = !inLevels(f) ? (OBJ_LEVEL[f] && !same(f) ? '' : o[f]) : same(f) ? lv(o[f]) : ''; if (document.activeElement !== e) e.value = v; }
  syncSizes(o, sizes);
  for (const f in OBJ_LEVEL) { const c = $('obj_' + f).closest('.field'), name = inLevels(f) ? OBJ_FIELDS[f][0] : OBJ_FIELDS[f][0].replace('levels', 'px'); c.firstChild.textContent = name; $('obj_' + f).setAttribute('aria-label', name); hintOn(c, (inLevels(f) ? 'In levels' : 'In pixels') + '. One level is ' + levelPx() + ' px, set in Preferences.'); $('objRead_' + f).textContent = prefGet('heights') !== 'both' ? '' : same(f) ? o[f] + ' px' : 'mixed'; }
  for (const f of ['i', 'j']) $('obj_' + f).closest('.field').hidden = many || !!o.parent;
  for (const f of ['w', 'd']) if (many) $('obj_' + f).closest('.field').hidden = true;
  $('obj_h').closest('.field').hidden = !many && !g.sizes(o).h;
  $('obj_z').closest('.field').hidden = !!o.parent;
  for (const f of ['u', 'v']) $('obj_' + f).closest('.field').hidden = !o.parent;
  $('objTitle').textContent = many ? set.length + ' objects' : g.name;
  $('objLevels').textContent = many ? 'Changes here apply to every selected object.' : typeof o.face === 'number' ? 'Along and up are pixels from the left end and foot of the wall.' : o.parent ? 'Along and up are half tiles from the back corner of the parent.' : g.sizes(o).w === SIZES.w ? 'Width and depth are in half tiles.' : '';
  $('objMulti').hidden = !many; $('objParams').hidden = $('objOrderRow').hidden = many; press($('objHalf'), S.objHalf);
  $('objFacingRow').hidden = many || !g.faced;
  $('objFacing').textContent = FACINGS[o.facing]; $('objArrow').style.transform = 'rotate(' + o.facing * 90 + 'deg)'; $('objOrderRead').textContent = o.order;
  renderParams($('objParams'), o, objSetParam, () => { const q = objSelected(); if (q) objSetLook({ seed: q.look.seed + 1 }); });
  document.querySelectorAll('[data-obj-outline]').forEach(b => press(b, b.dataset.objOutline === o.outline));
  press($('objShadow'), o.shadow);
  rampPicker($('objRamp'), $('objSwatches'), o.look.ramp, o.look.base, (r, n) => objSetLook({ ramp: r.name, base: n, color: r.colors[n] }));
  renderMat($('objMat'), o.type, o.look, objSetLook);
  syncDetails(o, activeLayer()); asmFill(o, set);
}
/* The ground arrow for anything with a facing: on the ghost while placing, on the selected object otherwise. */
function objArrows(c, x, y, z) {
  const sel = objTool(heldTool()) ? objSelected() : null, list = S.tool === 'place' && pvShown() ? (libPicked() ? [] : PL.drafts) : sel && !OB.ids.length ? [sel] : [], D = S.tile / 4;
  for (const o of list) {
    if (!shapeOf(o).faced) continue;
    const f = FRONTS[o.facing], a = 2 * o.i + o.w / 2, b = 2 * o.j + o.d / 2, reach = (f[0] ? o.w : o.d) / 2 + 1;
    const P = (da, db) => [x + (S.gox + (a + da - b - db) * D) * z, y + (S.goy + (a + da + b + db) * D / 2 - o.z) * z];
    const from = P(0, 0), to = P(f[0] * reach, f[1] * reach), p = P(f[0] * (reach - 0.5) + f[1] * 0.35, f[1] * (reach - 0.5) + f[0] * 0.35), q = P(f[0] * (reach - 0.5) - f[1] * 0.35, f[1] * (reach - 0.5) - f[0] * 0.35);
    c.strokeStyle = TH.accent; c.lineWidth = 2; c.beginPath(); c.moveTo(from[0], from[1]); c.lineTo(to[0], to[1]); c.moveTo(p[0], p[1]); c.lineTo(to[0], to[1]); c.lineTo(q[0], q[1]); c.stroke();
  }
}

/* Marks the visible pixels of the selection from the id buffer, so the ants follow what is actually on screen. */
function objSync() {
  if (!S.layers.length) return;
  if (!objSelected()) OB.sel = null;
  asmSync();
  if (!OB.ids.includes(OB.sel)) OB.ids = [];
  const set = objSet(), o = set[0]; if (OB.ids.length) OB.ids = set.length > 1 ? set.map(q => q.id) : [];
  $('objSec').hidden = !o; $('objBar').hidden = !o; OB.edges = null; OB.box = null; panelObject(set);
  if (o) {
    let r = null; for (const q of set) r = joinBox(r, objPixelBox(q));
    const x0 = Math.max(0, r.x0), y0 = Math.max(0, r.y0), x1 = Math.min(S.w - 1, r.x1), y1 = Math.min(S.h - 1, r.y1), L = activeLayer(), ids = new Set(set.map(q => q.id));
    objFill(o);
    if (x0 <= x1 && y0 <= y1) {
      const w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0, i = (y + y0) * S.w + x0; x < w; x++, i++) if (L.ids[i] && ids.has(L.ids[i])) m[y * w + x] = 1;
      OB.edges = maskEdges(m, w, h); OB.box = { x0, y0, x1, y1 }; OB.x = x0; OB.y = y0;
    }
  }
  requestRender();
}
function initObjects() {
  const grid = $('objFields');
  for (const f in OBJ_FIELDS) {
    const [label, , , step] = OBJ_FIELDS[f], c = document.createElement('div'); c.className = 'field';
    c.innerHTML = label + (OBJ_LEVEL[f] ? '<span class="mono pxread" id="objRead_' + f + '"></span>' : '') + '<span class="stepper wide"><button class="btn sm" data-obj="' + f + ':-' + step + '" aria-label="' + label + ' down">&minus;</button><input id="obj_' + f + '" type="number" aria-label="' + label + '"><button class="btn sm" data-obj="' + f + ':' + step + '" aria-label="' + label + ' up">+</button></span>';
    grid.appendChild(c);
  }
  grid.onclick = e => { const b = e.target.closest('[data-obj]'), o = objSelected(); if (!b || !o) return; const [f, n] = b.dataset.obj.split(':'); if (OBJ_LEVEL[f]) objStepField(f, Math.sign(n)); else objSetField(f, o[f] + (o.face === 'top' && (f === 'u' || f === 'v') ? Math.sign(n) : +n), f); };
  grid.onchange = e => { if (!e.target.id.startsWith('obj_')) return; const f = e.target.id.slice(4), v = parseFloat(e.target.value); objSetField(f, inLevels(f) ? v * levelPx() : v); };
  $('objTurnL').onclick = () => objTurn(-1);
  $('objTurnR').onclick = () => objTurn(1);
  $('placeTurnL').onclick = () => placeTurn(-1);
  $('placeTurnR').onclick = () => placeTurn(1);
  initShapeCards(); initLevels();
  document.querySelectorAll('[data-obj-outline]').forEach(b => b.onclick = () => objPatch({ outline: b.dataset.objOutline }));
  $('objShadow').onclick = () => { const o = objSelected(); if (o) objPatch({ shadow: !o.shadow }); };
  $('objBack').onclick = () => { const o = objSelected(); if (o) objPatch({ order: o.order - 1 }, 'order'); };
  $('objForward').onclick = () => { const o = objSelected(); if (o) objPatch({ order: o.order + 1 }, 'order'); };
  $('objDup').onclick = objDuplicate;
  for (const id of ['objDel', 'objBarDel']) $(id).onclick = objDelete;
  $('objBake').onclick = bakeObjects; $('lBake').onclick = bakeObjects; $('lObj').onclick = addObjectLayer;
  $('objBarEdit').onclick = () => { sidePanel(true); panelGo('object'); };
  $('objShadowOpt').onclick = () => { S.objShadow = !S.objShadow; syncPlace(); };
  ['objW', 'objD', 'objH'].forEach(id => { $(id).onchange = e => setPlaceSize(id, parseInt(e.target.value, 10) || 1); });
  document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const [id, d] = b.dataset.step.split(':'), f = id.slice(3).toLowerCase(); setPlaceSize(id, placeBase()[f] + (+d)); });
}
/* A size in the options goes through the shape's own rules, as an edit of a placed object does. */
function setPlaceSize(id, n) {
  const f = id.slice(3).toLowerCase(), v = Math.max(1, Math.min(id === 'objH' ? 1024 : 256, n)), o = shapeFit(Object.assign(placeBase(), { [f]: v }), { [f]: v });
  S.objW = o.w; S.objD = o.d; S.objH = o.h; pvClear(); syncPlace();
}

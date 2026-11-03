'use strict';
/* qtiles details: small attachments, kept apart from SHAPE_DEFS because most of them have no footprint of their own.
   A detail on a parent records `parent`, `face` and (u, v). Its i, j, z, w, d, h are worked out from the parent by detailFit, so bounds, picking and depth order treat it like any object.
   face 0 to 3 is a wall, counted from the parent's front, so it turns with the parent: (u, v) are columns from the wall's left end and pixels up from its foot. face 'top' sits on the parent: (u, v) are half tiles from its back corner.
   `fit` holds what the clamp decided, so u and v keep what the artist asked for and a parent that grows back gives the old spot back. */

const WALL_NOT_FOUND = 'Tap the side of a box or a wall to attach this.';
const snap2 = n => Math.round(n / 2) * 2;
const FONT3X5 = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110', ' ': '000000000000000', '.': '000000000000010', '-': '000000111000000', '!': '010010010000010', '&': '010101010101011', '/': '001001010100100' };
const SIGN_MAX = 6, signText = t => [...String(t).toUpperCase()].filter(c => FONT3X5[c]).slice(0, SIGN_MAX).join('');

/* ---------- wall geometry ---------- */
/* A wall of an object, by world side (0 to 3, as FRONTS). x0 is the column of its left end on screen, K its plane in rows. */
function wallOf(p, side) {
  const D = S.tile / 4, a0 = 2 * p.i * D, b0 = 2 * p.j * D, a1 = a0 + p.w * D, b1 = b0 + p.d * D;
  return side & 1 ? { axis: 1, x0: a0 - (side === 1 ? b1 : b0), len: a1 - a0, K: side === 1 ? b1 : b0 } : { axis: 0, x0: (side === 0 ? a1 : a0) - b1, len: b1 - b0, K: side === 0 ? a1 : a0 };
}
const stairAt = (axis, X) => axis ? edgeY(X) : edgeY(-1 - X);
/* Pixels of height at a pixel on a wall's plane, above the plane's foot on the ground. */
const wallHeight = (axis, K, x, y) => { const X = x - S.gox; return stairAt(axis, X) + K - 1 - (y - S.goy); };

function detailFit(q, p) {
  const g = shapeOf(q), n = Object.assign({}, q); if (!g.attach) return q;
  if (q.face === 'top') {
    const mw = Math.max(0, p.w - q.w), md = Math.max(0, p.d - q.d), u = Math.max(0, Math.min(mw, q.u)), v = Math.max(0, Math.min(md, q.v));
    n.i = p.i + u / 2; n.j = p.j + v / 2; n.z = p.z + restHeight(p, n);
    n.fit = { tile: S.tile, over: u !== q.u || v !== q.v || q.w > p.w || q.d > p.d, u, v };
    return n;
  }
  const world = (q.face + p.facing) % 4, W = wallOf(p, world), s = g.span(q), hidden = world > 1, D = S.tile / 4;
  const u = Math.max(0, Math.min(Math.max(0, W.len - s.len), q.u)), v = Math.max(0, Math.min(Math.max(0, p.h - s.tall), q.v)), len = Math.min(s.len, W.len), tall = Math.min(s.tall, p.h), x0 = W.x0 + u;
  n.z = p.z + v; n.h = tall;
  if (W.axis) { n.i = (x0 + W.K) / (2 * D); n.j = W.K / (2 * D); n.w = len / D; n.d = s.out / D; }
  else { n.i = W.K / (2 * D); n.j = (W.K - x0 - len) / (2 * D); n.w = s.out / D; n.d = len / D; }
  n.fit = { tile: S.tile, axis: W.axis, x0, len, tall, K: W.K, z: n.z, u, v, hidden, over: hidden || u !== q.u || v !== q.v || s.len > W.len || s.tall > p.h };
  return n;
}
/* A detail refits whenever the tile size has moved under it. That is outside history, so an undone array can hold records from another tile size; objApply catches those too. */
const fitStale = q => q.parent ? !q.fit || q.fit.tile !== S.tile : !!(SHAPE_DEFS[q.type] && SHAPE_DEFS[q.type].stale && SHAPE_DEFS[q.type].stale(q));
function objFits(list) {
  if (!list.some(fitStale)) return list;
  const by = new Map(list.map(q => [q.id, q]));
  return list.map(q => !fitStale(q) ? q : q.parent === undefined ? shapeFit(Object.assign({}, q), {}) : by.has(q.parent) ? detailFit(q, by.get(q.parent)) : q);
}
/* The list with one record replaced and everything attached to it moved along. */
function objSwap(list, o, n, kid) { return objFits(list.map(q => q === o ? n : q.parent === o.id ? detailFit(kid ? kid(q) : q, n) : q)); }
/* Fits a detail and keeps the clamped spot as its own, for an edit made on purpose rather than a parent that changed under it. */
function detailPin(q, p) { const n = detailFit(q, p); n.u = n.fit.u; n.v = n.fit.v; return detailFit(n, p); }
/* A quarter turn of a parent carries what stands on it around with it. */
function detailSpin(q, o, by) {
  if (q.face !== 'top') return q;
  return Object.assign({}, q, by > 0 ? { u: o.d - q.v - q.d, v: q.u } : { u: q.v, v: o.w - q.u - q.w }, { w: q.d, d: q.w, facing: (q.facing + by + 4) % 4 });
}
const detailsOf = (L, o) => L.objects.filter(q => q.parent === o.id);

/* ---------- roofs ---------- */
/* The height of a parent's surface at a point, in pixels above its z. */
function surfAt(p, a, b) { const g = shapeOf(p); return g.surf ? g.surf(p, a, b) : p.h; }
/* The lowest point under a footprint, so the part on a slope has no gap under its low side. The high side sinks into the roof, which draws first. */
function restHeight(p, q) {
  const a0 = 2 * q.i, b0 = 2 * q.j, a1 = a0 + q.w, b1 = b0 + q.d;
  return Math.min(surfAt(p, a0, b0), surfAt(p, a1, b0), surfAt(p, a0, b1), surfAt(p, a1, b1));
}
/* The point on a parent's surface seen at a pixel: walks the line of sight down from the top, in half tiles from the grid origin. */
function roofPoint(p, x, y) {
  const D = S.tile / 4, X = x + 0.5 - S.gox, Y = y + 0.5 - S.goy + p.z, g = shapeOf(p), m = ((g.pad ? g.pad(p) : 0) + 2) / D, a0 = 2 * p.i - m, b0 = 2 * p.j - m, a1 = 2 * p.i + p.w + m, b1 = 2 * p.j + p.d + m;
  for (let z = p.h; z >= 0; z--) { const a = (Y + z + X / 2) / D, b = (Y + z - X / 2) / D; if (a >= a0 && b >= b0 && a <= a1 && b <= b1 && surfAt(p, a, b) >= z) return { a, b }; }
  return null;
}

/* ---------- drawing ---------- */
/* Runs cell(c, r, n) over the patch of a wall: c is the column in one of the repeats, r the pixel up from the patch's foot, n which repeat. */
function patchMark(o, W, width, gap, cell) {
  const q = o.fit; if (!q || q.hidden) return;
  const pitch = width + gap, gy = S.goy;
  for (let x = 0; x < W.w; x++) {
    const X = x + W.wx - S.gox, c = X - q.x0; if (c < 0 || c >= q.len) continue;
    const n = Math.floor(c / pitch), lc = c - n * pitch; if (lc >= width) continue;
    const base = stairAt(q.axis, X) + q.K - 1 + gy - q.z;
    for (let r = 0; r < q.tall; r++) { const f = cell(lc, r, n); if (f) markAt(W, x + W.wx, base - r, f); }
  }
}
/* Faces shade by the wall's own normal, so a window on the shaded side is darker, and marks keep to the wall's light. `up` steps lighter. */
const wallN = o => o.fit && !o.fit.axis ? RIGHT_N : LEFT_N;
function patchFaces(o, ...list) { const n = wallN(o); return withFaces(...list.map(f => Object.assign({ n, p: 1, mat: 'plain' }, f))); }

function windowMark(o, W) {
  const w = pn(o, 'width'), h = pn(o, 'height'), mid = w >> 1;
  patchMark(o, W, w, pn(o, 'spacing'), (c, r) => r === 0 ? 6 : c === 0 || c === w - 1 || r === 1 || r === h - 1 ? 4 : w > 6 && c === mid ? 4 : 5);
}
function doorMark(o, W) {
  const w = pn(o, 'width'), h = pn(o, 'height'), hy = Math.round(h * 0.45);
  patchMark(o, W, w, pn(o, 'spacing'), (c, r) => {
    if (c === 0 || c === w - 1 || r === h - 1) return 4;
    if (c === w - 2 && r === hy) return 6;
    return c > 1 && c < w - 2 && ((r > 1 && r < hy - 1) || (r > hy + 1 && r < h - 2)) ? 7 : 5;
  });
}
/* The panel follows the wall. A letter sheared along the stair turns to noise at this size, so each stays upright and letters step along the wall as a whole. */
function signMark(o, W) {
  const q = o.fit, text = signText(pn(o, 'text')), s = signSpan(o);
  patchMark(o, W, s.len, 0, (c, r) => c === 0 || r === 0 || c === s.len - 1 || r === s.tall - 1 ? 4 : 5);
  if (!q || q.hidden) return;
  [...text].forEach((ch, n) => {
    const X = q.x0 + 2 + 4 * n, top = stairAt(q.axis, X + 1) + q.K - 1 + S.goy - q.z - (s.tall - 3);
    for (let gr = 0; gr < 5; gr++) for (let gc = 0; gc < 3; gc++) if (X + gc - q.x0 < q.len && gr + 2 < q.tall && FONT3X5[ch][gr * 3 + gc] === '1') markAt(W, X + gc + S.gox, top + gr, 6);
  });
}
const signSpan = o => ({ len: Math.max(1, signText(pn(o, 'text')).length) * 4 + 3, tall: 9, out: 0 });
const rowSpan = o => { const n = pn(o, 'repeat'), w = pn(o, 'width'); return { len: n * w + (n - 1) * pn(o, 'spacing'), tall: pn(o, 'height'), out: 0 }; };
const AWN_VALANCE = 2;
/* The slab leans out from the wall and down. A plane's contours project to the stair, so each row is the stair moved down, and rows further out shift along the wall by how far out they are. */
function awningMark(o, W) {
  const q = o.fit; if (!q || q.hidden) return;
  const out = pn(o, 'out'), drop = pn(o, 'drop'), fall = out + drop, top = q.tall - 1, dir = q.axis ? 1 : -1, stripe = pn(o, 'stripe');
  for (let x = 0; x < W.w; x++) {
    const X = x + W.wx - S.gox, y0 = stairAt(q.axis, X) + q.K - 1 + S.goy - q.z - top;
    for (let dy = 0; dy < fall + AWN_VALANCE; dy++) {
      const t = Math.min(out, Math.floor((dy + 1) * out / fall)), c = X + dir * t - q.x0; if (c < 0 || c >= q.len) continue;
      markAt(W, x + W.wx, y0 + dy, (Math.floor(c / stripe) & 1 ? 5 : 4) + (dy >= fall ? 2 : 0));
    }
  }
}
function awningFaces(o) {
  const tan = pn(o, 'drop') / pn(o, 'out'), n = o.fit && !o.fit.axis ? slopeN(-1, 0, tan) : slopeN(0, -1, tan), wall = wallN(o);
  return withFaces({ n, p: 1, mat: 'plain' }, { n, p: 1, mat: 'plain', accent: true }, { n: wall, p: 1, mat: 'plain' }, { n: wall, p: 1, mat: 'plain', accent: true });
}
/* The cap overhangs the stack by a row all round. */
function chimneyMark(o, W) {
  const a = 2 * o.i, b = 2 * o.j, c = 1 / (S.tile / 4), cap = Math.min(2, Math.max(1, o.h >> 2));
  markBox(W, [a, a + o.w, b, b + o.d], 0, o.h - cap);
  const k = W.m.length, was = Math.min(k, W.w * W.h), keep = W.m.slice(0, was);   // the cap's three faces take their own marks
  W.m.fill(0, 0, was); markBox(W, [a - c, a + o.w + c, b - c, b + o.d + c], o.h - cap, o.h);
  for (let n = 0; n < was; n++) W.m[n] = W.m[n] ? W.m[n] + 3 : keep[n];
}
const CHIMNEY_FACES = withFaces({ n: UP, p: 3, up: 1, mat: 'plain' }, { n: LEFT_N, p: 3, up: 1, mat: 'plain' }, { n: RIGHT_N, p: 3, up: 1, mat: 'plain' });
const lampTop = o => ({ x: S.gox + (2 * o.i + o.w / 2 - 2 * o.j - o.d / 2) * (S.tile / 4), y: Math.round(S.goy + (2 * o.i + o.w / 2 + 2 * o.j + o.d / 2) * (S.tile / 4) / 2 - o.z - o.h) });
/* A post and a 3 x 3 bulb, ringed by a checker of the bulb's color: the only pixels here that read as glow. They never take an outline, which would swallow them. */
function lampMark(o, W) {
  const a = 2 * o.i + o.w / 2, b = 2 * o.j + o.d / 2, c = 1 / (S.tile / 4), t = lampTop(o);
  markBox(W, [a - c, a + c, b - c, b + c], 0, o.h);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 2; dx++) {
    const ring = dx < -2 || dx > 1 || dy < -2 || dy > 2;
    if (!ring && (Math.abs(dx + 0.5) < 2 && Math.abs(dy) < 2)) markAt(W, t.x + dx, t.y + dy - 2, 4);
    else if ((t.x + dx + t.y + dy) & 1 && Math.abs(dx + 0.5) + Math.abs(dy) < 4) markAt(W, t.x + dx, t.y + dy - 2, 5);
  }
}
const LAMP_FACES = withFaces({ n: UP, p: 0, accent: true, up: 1, mat: 'plain', bare: true }, { n: UP, p: 0, accent: true, mat: 'plain', bare: true });
/* Posts along t, with rails over them, one row thick so the gaps between them stay open. On the two facings where t runs toward the eye the far end goes first, so nearer posts cover it. */
function runMark(o, W, rails) {
  const f = frame(o), e = 1 / (S.tile / 4), s0 = f.L / 2 - e, s1 = f.L / 2 + e, step = pn(o, 'spacing'), ts = [];
  for (let t = 0; t < f.W; t += step) ts.push(t);
  if (!o.params.open) ts.push(f.W - 2 * e);   // open: the next piece of a line brings this post
  if (o.facing === 1 || o.facing === 2) ts.reverse();
  for (const t of ts) markBox(W, f.box(s0, s1, t, t + 2 * e), 0, o.h);
  for (const r of rails) { const z = Math.round(r * o.h); markBox(W, f.box(f.L / 2, s1, 0, f.W), Math.max(0, z - 2), z); }
}

/* Thin or attached, these read better with no line of their own unless the artist adds one. `color` is the look a new one starts from, so a window reads as glass and a door as wood on any wall; accent is the second color. */
const RUN = { run: true, faced: true, rotateSwapsFootprint: true, w: 1, d: 8, outline: 'none', sizes: o => o.facing % 2 ? { w: 'Length', d: 'Thickness', h: SIZES.h } : { w: 'Thickness', d: 'Length', h: SIZES.h },
  fit: o => { const k = o.facing % 2 ? 'd' : 'w'; o[k] = Math.min(4, o[k]); return o; }, drag: (o, di, dj) => di > dj ? { facing: 1, w: 2 * (di + 1), d: 1 } : { facing: 0, w: 1, d: 2 * (dj + 1) } };
const WALL_DRAW = { w: 0, d: 0, h: () => 1, sizes: () => ({}), outline: 'sel', plainOnly: true };
const REPEAT = { label: 'Count', min: 1, max: 8, def: 1, hint: 'How many in a row along the wall, from one tap.' }, SPACING = { label: 'Spacing px', min: 0, max: 64, def: 6, hint: 'Columns between one and the next in a row.' };
const DETAIL_DEFS = {
  window: Object.assign({ name: 'Window', group: 'Details', attach: 'wall', color: '#e8e4d8', accent: '#7fc4ea', mark: windowMark, span: rowSpan, faces: o => patchFaces(o, { up: 1 }, { accent: true, mat: 'glass' }, { up: 1 }), repeats: true,
    params: { repeat: REPEAT, spacing: SPACING, width: { label: 'Width px', min: 4, max: 64, def: 8, hint: 'Width of one window, in columns.' }, height: { label: 'Height px', min: 5, max: 64, def: 10, hint: 'Height of one window, sill included.' } } }, WALL_DRAW),
  door: Object.assign({ name: 'Door', group: 'Details', attach: 'wall', floor: true, color: '#8a5a33', accent: '#f2b632', mark: doorMark, span: rowSpan, faces: o => patchFaces(o, { up: -1 }, {}, { accent: true }, { up: 1 }), repeats: true,
    params: { repeat: REPEAT, spacing: SPACING, width: { label: 'Width px', min: 5, max: 64, def: 8, hint: 'Width of the door, in columns.' }, height: { label: 'Height px', min: 7, max: 64, def: 14, hint: 'Height of the door.' } } }, WALL_DRAW),
  sign: Object.assign({ name: 'Sign', group: 'Details', attach: 'wall', color: '#e8e4d8', accent: '#3a3a4a', mark: signMark, span: signSpan, faces: o => patchFaces(o, { up: -1 }, {}, { accent: true }),
    params: { text: { label: 'Text', text: true, def: 'SHOP', hint: 'Up to 6 letters, digits or simple marks.' } } }, WALL_DRAW),
  awning: Object.assign({ name: 'Awning', group: 'Details', attach: 'wall', color: '#c0503c', accent: '#e8e4d8', mark: awningMark, faces: awningFaces, span: o => ({ len: pn(o, 'width'), tall: pn(o, 'drop') + AWN_VALANCE, out: pn(o, 'out') }),
    params: { width: { label: 'Width px', min: 6, max: 128, def: 16, hint: 'Length along the wall, in columns.' }, out: { label: 'Reach px', min: 2, max: 32, def: 6, hint: 'How far it stands out from the wall.' }, drop: { label: 'Drop px', min: 1, max: 32, def: 4, hint: 'How far the front edge hangs below the back edge.' }, stripe: { label: 'Stripe px', min: 2, max: 16, def: 3, hint: 'Width of each stripe.' } } }, WALL_DRAW),
  chimney: { name: 'Chimney', group: 'Details', attach: 'top', color: '#b5593f', material: 'brick', w: 1, d: 1, h: levels(0.75), mark: chimneyMark, faces: () => CHIMNEY_FACES, pad: () => 1, sizes: () => SIZES, params: {} },
  lamp: { name: 'Lamp', group: 'Details', attach: 'free', color: '#4a4a55', accent: '#ffd866', plainOnly: true, w: 2, d: 2, h: levels(1), outline: 'none', mark: lampMark, faces: () => LAMP_FACES, sizes: () => ({ h: 'Height px' }), above: () => 6, pad: () => 3, params: {} },
  railing: Object.assign({ name: 'Railing', group: 'Details', attach: 'free', color: '#8a8f9c', h: () => Math.max(4, S.tile / 4), mark: (o, W) => runMark(o, W, [1]), params: { spacing: { label: 'Post spacing', min: 1, max: 16, def: 2, hint: 'Half tiles between posts.' } } }, RUN),
  fence: Object.assign({ name: 'Fence', group: 'Details', attach: 'free', color: '#8a5a33', h: levels(0.75), mark: (o, W) => runMark(o, W, [0.55, 1]), params: { spacing: { label: 'Post spacing', min: 1, max: 16, def: 4, hint: 'Half tiles between posts.' } } }, RUN)
};
for (const t in DETAIL_DEFS) if (!DETAIL_DEFS[t].faces) DETAIL_DEFS[t].faces = () => BOX_FACES;

/* ---------- placing ---------- */
/* A wall under a pixel, found from the id and face buffers. The face buffer says lit or shaded, and the light says which wall that is. */
function wallSpot(L, x, y, base) {
  if (x < 0 || y < 0 || x >= S.w || y >= S.h) return null;
  const f = L.faces[y * S.w + x]; if (f !== FACE_LIT && f !== FACE_SHADED) return null;
  let p = objAt(L, x, y); if (!p) return null;
  if (p.parent) { if (typeof p.face !== 'number') return null; p = L.index.byId.get(p.parent); if (!p) return null; }
  else if (DETAIL_DEFS[p.type]) return null;
  const side = (f === FACE_LIT) === (S.light !== 'right') ? 1 : 0, W = wallOf(p, side), s = defOf(base.type).span(base), H = wallHeight(W.axis, W.K, x, y) - p.z, g = defOf(base.type);
  return { p, face: (side - p.facing + 4) % 4, u: snap2(x - S.gox - W.x0 - s.len / 2), v: g.floor ? 0 : snap2(H - s.tall / 2) };
}
const asDetail = (o, s) => detailPin(Object.assign({}, o, { parent: s.p.id, face: s.face, u: s.u, v: s.v }), s.p);
/* On a flat top or, for a chimney, a slope. A chimney goes by the half tile under the pixel; what stands on the ground goes by the tile there too. */
function topSpot(L, x, y, base) {
  if (x < 0 || y < 0 || x >= S.w || y >= S.h) return null;
  const f = L.faces[y * S.w + x], g = defOf(base.type); let p = objAt(L, x, y);
  if (!p || (f !== FACE_TOP && f !== FACE_SLOPE) || DETAIL_DEFS[p.type]) return null;
  const P = shapeOf(p); if (!P.flat && !(P.deck && f === FACE_TOP) && !(g.attach === 'top' && P.surf)) return null;
  const q = roofPoint(p, x, y); if (!q) return null;
  const step = g.attach === 'top' ? 1 : 2, at = (v, n, from) => Math.floor((v - n / 2 + step / 2) / step) * step - from;
  return { p, face: 'top', u: at(q.a, base.w, 2 * p.i), v: at(q.b, base.d, 2 * p.j) };
}
const detailSpot = (L, x, y, base) => !L.objectLayer ? null : defOf(base.type).attach === 'wall' ? wallSpot(L, x, y, base) : topSpot(L, x, y, base);
/* Symmetry repeats the tap at the mirrored pixels. A detail lands there only if a wall is there, which is what a mirrored house has. */
function detailDrafts(d) {
  const base = placeBase(), L = activeLayer(), out = [asDetail(base, d.spot)], seen = new Set([[d.spot.p.id, d.spot.face, d.spot.u, d.spot.v].join()]);
  for (const [x, y] of mirrorPoints(d.x, d.y).slice(1)) {
    const s = detailSpot(L, x, y, base), k = s && [s.p.id, s.face, s.u, s.v].join();
    if (s && !seen.has(k)) { seen.add(k); out.push(asDetail(base, s)); }
  }
  return out;
}
/* Why a detail is not where it was put, for the inspector. */
function detailNote(o) {
  if (!o.parent || !o.fit) return '';
  if (o.fit.hidden) return 'This side of the parent faces away, so the detail does not show. Turn the parent to see it.';
  return o.fit.over ? 'This no longer fits on its parent, so it has been moved to fit. It goes back if the parent grows.' : '';
}
/* The details of a parent as a list under it, and from a detail a link back. */
function syncDetails(o, L) {
  const host = $('objDetails'), kids = detailsOf(L, o), p = o.parent ? L.index.byId.get(o.parent) : null, w = detailNote(o), rows = p ? [p] : kids;
  $('objWarn').hidden = !w; $('objWarn').textContent = w;
  const key = (p ? 'p' : 'k') + rows.map(q => q.id + q.type).join();
  if (host.dataset.key === key) return;
  host.dataset.key = key; host.textContent = ''; host.hidden = !rows.length;
  if (!rows.length) return;
  const h = document.createElement('div'); h.className = 'shapehead'; h.textContent = p ? 'Attached to' : 'Details'; host.appendChild(h);
  for (const q of rows) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = defOf(q.type).name; b.setAttribute('aria-label', (p ? 'Select the parent, ' : 'Select detail, ') + defOf(q.type).name); b.onclick = () => objSelect(q.id); host.appendChild(b); }
}

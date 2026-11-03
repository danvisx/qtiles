'use strict';
/* qtiles solids for vehicles and street furniture: disc, capsule and taper, records like any other, in SHAPE_DEFS.
   None of them is a stack of box parts, so each reads a pixel through the tile stair itself: a straight edge along an axis comes out as a tile edge at every run. */

/* A shape's sizes in pixels follow the tile when a library item drawn at one tile lands on another, as `w` and `d` do by being in half tiles. */
function rescaled(o, keys, k) {
  const spec = shapeOf(o).params, out = Object.assign({}, o.params);
  for (const p of keys) { const v = pn(o, p), n = Math.round(v * k); out[p] = v ? Math.max(Math.max(spec[p].min, 1), Math.min(spec[p].max, n)) : 0; }
  return out;
}

/* ---------- disc ---------- */
/* An upright round solid. Its axis lies along the grid axis `facing` names, and the end you see always looks at the viewer's side of that axis: the lit or the shaded wall.
   `facing` also says which end of the footprint it stands at, as a footprint is whole half tiles and a thin disc is not: a wheel faces its axle and so sits against the body. `place` middle centers it instead, for wheels in line. */
const DISC_RIM = 4, DISC_BANDS = 12, DISC_CAP = DISC_RIM + DISC_BANDS, DISC_TIRE = DISC_CAP + 1, DISC_HUB = DISC_CAP + 2;
/* Rim bands run across the half of the rim that shows, as on a cylinder. Equal p throughout: a wheel 8 px across has no room for lines inside it.
   The end has a normal of its own, not LEFT_N or RIGHT_N, because the face buffer would call it a wall, and a window has no business on a round end. */
const discFaces = (along, cap, tire) => withFaces(
  ...Array.from({ length: DISC_BANDS }, (_, k) => { const f = (k + 0.5) / DISC_BANDS * Math.PI - Math.PI / 4, c = Math.cos(f); return { n: [along[0] * c, along[1] * c, Math.sin(f)], round: true, accent: tire, p: 2 }; }),
  { n: cap, p: 2 }, { n: cap, accent: true, p: 2 }, { n: cap, up: 1, p: 2 });
const DISC_FACES = [[discFaces([0, 1], [1, 0, 0], false), discFaces([0, 1], [1, 0, 0], true)], [discFaces([1, 0], [0, 1, 0], false), discFaces([1, 0], [0, 1, 0], true)]];
/* Where it stands, in rows from the grid origin. c is the middle across the axis, and near the plane of the end you see. */
function discPlace(o) {
  const D = S.tile / 4, byB = o.facing % 2, a0 = 2 * o.i * D, b0 = 2 * o.j * D, a1 = a0 + o.w * D, b1 = b0 + o.d * D, T = pn(o, 'thickness');
  return { byB, R: pn(o, 'radius'), T, c: byB ? (a0 + a1) / 2 : (b0 + b1) / 2, near: pn(o, 'place') === 'middle' ? (byB ? b0 : a0) + Math.floor(((byB ? o.d : o.w) * D + T) / 2) : o.facing < 2 ? (byB ? b1 : a1) : (byB ? b0 : a0) + T };
}
/* Slices from the far end to the near one, each a circle standing on the stair. Each writes over the last, so only the crescent of each slice stays, which is the rim. */
function discMark(o, W) {
  const q = discPlace(o), { byB, R, T, c, near } = q, tire = pn(o, 'tire'), hub = pn(o, 'hub');
  for (let s = T - 1; s >= 0; s--) {
    const P = near - s - 1;
    for (let x = 0; x < W.w; x++) {
      const u = x + W.wx - S.gox, e1 = edgeY(-1 - u), e2 = edgeY(u), on = byB ? e2 : e1, t = on - (byB ? e1 : e2) + P + 0.5 - c;
      if (Math.abs(t) >= R) continue;
      const half = Math.sqrt(R * R - t * t), z0 = Math.round(R - half), z1 = Math.round(R + half) - 1, foot = on + P + W.lift;
      for (let k = z0; k <= z1; k++) {
        const y = k + 0.5 - R, r = Math.hypot(t, y);
        markAt(W, x + W.wx, foot - k, s ? DISC_RIM + Math.max(0, Math.min(DISC_BANDS - 1, Math.floor((Math.atan2(y, t) + Math.PI / 4) / Math.PI * DISC_BANDS))) : r <= hub ? DISC_HUB : r > R - tire ? DISC_TIRE : DISC_CAP);
      }
    }
  }
}
function discField(o) {
  const D = S.tile / 4, { byB, R, T, c, near } = discPlace(o);
  return (a, b) => { const along = (byB ? a : b) * D - c, on = (byB ? b : a) * D; return on < near - T || on >= near || Math.abs(along) >= R ? -1 : R + Math.sqrt(R * R - along * along); };
}
function discFit(o) {
  const D = S.tile / 4, across = Math.max(1, Math.ceil(2 * pn(o, 'radius') / D)), through = Math.max(1, Math.ceil(pn(o, 'thickness') / D));
  o.w = o.facing % 2 ? across : through; o.d = o.facing % 2 ? through : across; o.h = 2 * pn(o, 'radius'); return o;
}

/* ---------- capsule ---------- */
/* A long solid lying along s. Its cross section is an ellipse, scaled along the length by a profile that closes at the ends, so a hull's keel rises to its bow.
   This cannot be a height over the ground, as the belly curves back under itself. Each pixel walks its line of sight from the top instead, and that line runs (1, 1, 1) in rows, rows and pixels. */
const CAP_DECK = 1, CAP_ROUND = 4, CAP_FLOOR = 8, CAP_WELL = 9;
const CAP_FACES = withFaces(...[0, 1, 2, 3].map(step => ({ step, p: 1 })), { step: 2, p: 1 }, { step: 3, p: 1 });
const capEnd = (q, pointed) => q >= 1 ? 1 : pointed ? 1 - (1 - q) ** 2 : Math.sqrt(1 - (1 - q) ** 2);
/* The solver for one record. The local axes are linear in (a, b), so the walk adds to them rather than going through frame() per step. */
function capsuleOf(o) {
  const D = S.tile / 4, f = frame(o), L = f.L * D, W = f.W * D, h = o.h, end = pn(o, 'end'), hull = pn(o, 'section') === 'hull', taper = pn(o, 'taper') / 100, rim = pn(o, 'rim');
  const nose = Math.min(L / 2, end === 'round' ? W / 2 : W * 1.25), tail = end === 'bow' ? Math.min(L / 2, 3) : nose, zc = hull ? h : h / 2, Hz = hull ? h : h / 2, mid = W / 2, well = hull && rim ? Math.max(1, Math.round(h / 2)) : 0;
  const exact = s => s <= 0 || s >= L ? 0 : capEnd(s / tail, end === 'point') * capEnd((L - s) / nose, end !== 'round') * (1 - taper * (1 - s / L));
  /* The walk only ever asks at pixel centers, and asks a lot, so the profile is a table by row. */
  const rows = new Float32Array(Math.ceil(L) + 1); for (let k = 0; k < L; k++) rows[k] = exact(k + 0.5);
  const prof = s => s <= 0 || s >= L ? 0 : rows[s | 0];
  const inside = (s, t, z) => { const p = prof(s); if (p < 0.02) return 9; const x = (t - mid) / (mid * p), y = (z - zc) / (Hz * p); return x * x + y * y; };
  /* The well keeps a shell of `rim` all round, below as well as beside it: near the bow the keel rises past the floor. */
  const carved = (s, t, z) => { if (!well || z < h - well || s <= rim || s >= L - rim) return false; const p = Math.min(prof(s - rim), prof(s + rim)), deep = Hz * p - rim; if (deep <= 0) return false; const y = (z - zc) / deep; return y * y < 1 && Math.abs(t - mid) < mid * p * Math.sqrt(1 - y * y) - rim; };
  const a0 = 2 * o.i * D, b0 = 2 * o.j * D, a1 = a0 + o.w * D, b1 = b0 + o.d * D, face = o.facing;
  const toS = face === 0 ? (a => a - a0) : face === 1 ? ((a, b) => b - b0) : face === 2 ? (a => a1 - a) : ((a, b) => b1 - b);
  const toT = face === 0 ? ((a, b) => b - b0) : face === 1 ? (a => a1 - a) : face === 2 ? ((a, b) => b1 - b) : (a => a - a0);
  return { D, L, W, h, zc, Hz, mid, hull, prof, exact, inside, carved, toS, toT, a0, b0, a1, b1, front: FRONTS[face], left: FRONTS[(face + 1) % 4], ds: face < 2 ? 1 : -1, dt: face === 0 || face === 3 ? 1 : -1, well };
}
/* What the eye meets at a ground point (a, b) on the row of this pixel, or null. A pixel at height H stands H rows behind that point. Height runs from h, where a flat deck is. */
function capHit(c, a, b) {
  const low = Math.ceil(Math.max(0, c.a0 - a, c.b0 - b)), top = Math.floor(Math.min(c.h, c.a1 - a - 1e-6, c.b1 - b - 1e-6)); if (low > top) return null;
  const s0 = c.toS(a, b), t0 = c.toT(a, b), ds = c.ds, dt = c.dt, end = c.h - 0.5, inside = c.inside, hollow = c.well > 0; let through = false;
  for (let H = top; H >= low; H--) {
    const s = s0 + ds * H, t = t0 + dt * H, z = H + 0.5 < end ? H + 0.5 : end;
    if (inside(s, t, z) > 1) continue;
    if (hollow && c.carved(s, t, z)) { through = true; continue; }
    return { s, t, z, H, through };
  }
  return null;
}
function capsuleMark(o, W) {
  const c = capsuleOf(o);
  for (let x = W.wx; x < W.wx + W.w; x++) for (let y = W.wy, u = x - S.gox, e1 = edgeY(-1 - u), e2 = edgeY(u); y < W.wy + W.h; y++) {
    const g = y - W.lift, hit = capHit(c, g + 0.5 - e1, g + 0.5 - e2); if (!hit) continue;
    const { s, t, z } = hit;
    if (hit.through) { markAt(W, x, y, c.carved(s, t, z + 1) ? CAP_FLOOR : CAP_WELL); continue; }
    if (c.hull && hit.H === c.h) { markAt(W, x, y, CAP_DECK); continue; }
    const ns = c.inside(s + 1, t, z) - c.inside(s - 1, t, z), nt = c.inside(s, t + 1, z) - c.inside(s, t - 1, z), nz = c.inside(s, t, z + 1) - c.inside(s, t, z - 1), q = Math.hypot(ns, nt, nz) || 1;
    markAt(W, x, y, CAP_ROUND + shadeStep([(ns * c.front[0] + nt * c.left[0]) / q, (ns * c.front[1] + nt * c.left[1]) / q, nz / q], true));
  }
}
/* Along the length, and around the section, so rows of planks run with the hull. */
function capsuleUv(o) {
  const c = capsuleOf(o), lift = S.goy - o.z, stair = new Map();   // this runs per pixel, row by row
  return (x, y) => {
    let e = stair.get(x); if (!e) { const u = x - S.gox; stair.set(x, e = [edgeY(-1 - u), edgeY(u)]); }
    const g = y - lift, hit = capHit(c, g + 0.5 - e[0], g + 0.5 - e[1]);
    UV[0] = hit ? Math.round(hit.s) : 0; UV[1] = hit ? Math.round(Math.atan2(hit.z - c.zc, hit.t - c.mid) * c.mid) + o.z : 0;
  };
}
/* The top of the solid over a point on the ground, in half tiles, or -1 outside it. */
function capTop(c, a, b) {
  const A = a * c.D, B = b * c.D; if (A < c.a0 || A >= c.a1 || B < c.b0 || B >= c.b1) return -1;
  const s = c.toS(A, B), t = c.toT(A, B), p = c.exact(s); if (p < 0.02) return -1;
  const x = (t - c.mid) / (c.mid * p); return x * x >= 1 ? -1 : c.hull ? c.h : Math.round(c.zc + c.Hz * p * Math.sqrt(1 - x * x));
}

/* ---------- taper ---------- */
/* A box whose top is smaller than its base, or tilts. Sides are named from `facing`, so they turn with it: 0 front, 1 left, 2 back, 3 right.
   A height over the ground, read through the stair by heightMark, as a roof is. A side with no inset stays a true wall, and a door can go on it. */
const TAPER_SIDES = ['front', 'left', 'back', 'right'], TAPER_SLOPE = 4, TAPER_TILT = 8;
const taperIn = o => TAPER_SIDES.map(k => pn(o, k));
/* A function of (a, b) giving the height there, which also leaves on W the face it belongs to. */
function taperAt(o, ins, W) {
  const D = S.tile / 4, f = frame(o), drop = pn(o, 'drop'), flat = drop ? TAPER_TILT : CAP_DECK, L = f.L, wide = f.W, h = o.h;
  return (a, b) => {
    const s = f.s(a, b), t = f.t(a, b), top = h - drop * s / L; let H = top, face = flat, v;
    if (ins[0] && (v = top * (L - s) * D / ins[0]) < H) { H = v; face = TAPER_SLOPE; }
    if (ins[1] && (v = top * (wide - t) * D / ins[1]) < H) { H = v; face = TAPER_SLOPE + 1; }
    if (ins[2] && (v = top * s * D / ins[2]) < H) { H = v; face = TAPER_SLOPE + 2; }
    if (ins[3] && (v = top * t * D / ins[3]) < H) { H = v; face = TAPER_SLOPE + 3; }
    if (W) W.f = face;
    return Math.round(H);
  };
}
function taperMark(o, W) {
  const ins = taperIn(o), D = S.tile / 4, side = world => ins[(world - o.facing + 4) % 4], steep = Math.max(...ins.map(v => v ? o.h * D / v : 0));
  heightMark(o, W, 0, [!side(1), !side(0)], steep, taperAt(o, ins, W));
}
function taperFaces(o) {
  const ins = taperIn(o), drop = pn(o, 'drop'), L = frame(o).L * S.tile / 4, side = k => { const d = FRONTS[(o.facing + k) % 4]; return { n: slopeN(-d[0], -d[1], o.h / (ins[k] || 1)), p: 4 + k }; }, f = FRONTS[o.facing];
  return withFaces(side(0), side(1), side(2), side(3), { n: slopeN(-f[0], -f[1], drop / L), p: 3 });
}

const inset = (label, where) => ({ label, min: 0, max: 64, def: 0, hint: 'How far in from ' + where + ' the top starts, in pixels. 0 leaves that side a straight wall.' });
const longDrag = (o, di, dj) => ({ facing: di >= dj ? o.facing & 2 : o.facing | 1, w: 2 * (di + 1), d: 2 * (dj + 1) });
Object.assign(SHAPE_DEFS, {
  taper: { name: 'Taper', group: 'Structure', w: 6, d: 4, h: levels(1), mark: taperMark, faces: taperFaces, surf: (o, a, b) => taperAt(o, taperIn(o))(a, b), deck: true, faced: true, rotateSwapsFootprint: true, sizes: () => SIZES, preview: { w: 4, params: { front: 3, back: 3, left: 3, right: 3 } },
    hint: 'A box whose top is smaller than its base on any side, or whose front end is lower. For a hood, windshield, bucket or stage.', rescale: (o, tile, level) => Object.assign(rescaled(o, TAPER_SIDES, tile), { drop: rescaled(o, ['drop'], level).drop }),
    mirror: n => Object.assign(n, { params: Object.assign({}, n.params, { left: pn(n, 'right'), right: pn(n, 'left') }) }),
    params: { front: Object.assign(inset('Front px', 'the front'), { def: 6 }), back: inset('Back px', 'the back'), left: inset('Left px', 'the left side'), right: inset('Right px', 'the right side'),
      drop: { label: 'Drop px', min: 0, max: 64, def: 0, hint: 'How much lower the top is at the front than at the back, in pixels.' } } },
  disc: { name: 'Disc', group: 'Round', w: 1, d: 2, h: () => 16, mark: discMark, faces: o => DISC_FACES[o.facing % 2][pn(o, 'tire') ? 1 : 0], field: discField, stale: o => { const q = discFit(Object.assign({}, o)); return q.w !== o.w || q.d !== o.d || q.h !== o.h; }, noTop: true, faced: true, sizes: () => ({}), fit: discFit, accent: '#4a4e69', preview: { params: { radius: 7, thickness: 3, hub: 2, tire: 2 } },
    drag: (o, di, dj) => ({ params: Object.assign({}, o.params, { radius: Math.min(24, (Math.max(di, dj) + 1) * S.tile / 4) }) }), hint: 'An upright round solid, for a wheel, clock, drum, round sign or barrel on its side. The end you see is the lit or the shaded side.', rescale: (o, tile) => rescaled(o, ['radius', 'thickness', 'hub', 'tire'], tile),
    params: { radius: { label: 'Radius px', min: 2, max: 24, def: 8, hint: 'From the middle to the edge, in pixels.' }, thickness: { label: 'Thickness px', min: 1, max: 16, def: 4, hint: 'Through the disc along its axis, in pixels.' },
      hub: { label: 'Hub px', min: 0, max: 12, def: 0, hint: 'Radius of a lighter disc in the middle, in pixels. 0 for none.' }, tire: { label: 'Tire px', min: 0, max: 8, def: 0, hint: 'Width of an outer ring on the accent ramp, in pixels. 0 for none.' },
      place: { label: 'Stands at', options: [['front', 'Front'], ['middle', 'Middle']], def: 'front', hint: 'A disc is thinner than its footprint. Front puts it at the end its facing points to, Middle in the center.' } } },
  capsule: { name: 'Capsule', group: 'Round', w: 8, d: 3, h: levels(1), mark: capsuleMark, faces: () => CAP_FACES, uv: capsuleUv, surf: (o, a, b) => capTop(capsuleOf(o), a, b), field: o => { const c = capsuleOf(o); return (a, b) => capTop(c, a, b); }, deck: true, faced: true, rotateSwapsFootprint: true, drag: longDrag,
    sizes: o => o.facing % 2 ? { w: 'Width', d: 'Length', h: SIZES.h } : { w: 'Length', d: 'Width', h: SIZES.h }, preview: { w: 6, d: 3 }, hint: 'A long solid with rounded or pointed ends, for a fuselage, hull, pipe or log. It lies along its facing.', rescale: (o, tile) => rescaled(o, ['rim'], tile),
    params: { end: { label: 'Ends', options: [['round', 'Round'], ['point', 'Point'], ['bow', 'Bow']], def: 'round', hint: 'Round or pointed at both ends, or Bow for a point at the front and a flat back.' },
      taper: { label: 'Taper %', min: 0, max: 90, def: 0, hint: 'How much narrower the back end is than the front.' },
      section: { label: 'Section', options: [['round', 'Round'], ['hull', 'Hull']], def: 'round', hint: 'Round all the way around, or a flat deck over a curved belly.' },
      rim: { label: 'Rim px', min: 0, max: 8, def: 0, hint: 'On a hull, the width of the edge around a sunken deck, in pixels. 0 leaves the deck flat.' } } }
});

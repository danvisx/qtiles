'use strict';
/* qtiles trees: a seeded shape, kept as a record like any other. A tapered trunk on the accent ramp, foliage on the object's own ramp.
   Everything here is worked out per pixel from the record, so a region of a tree draws the same as the whole. */

const TREE_LEAF = 4, TREE_BARK = 8, TREE_FRUIT = 11, TREE_FLOWER = 12;
/* Steps, not normals: each leaf cluster is shaded as its own ball. Equal p everywhere, so an outline stays on the silhouette and clusters part by shade alone. Fruit and flowers have a normal only so that they take look.side: a top must stay the lightest step of its own ramp. */
const treeFaces = up => withFaces(...[0, 1, 2, 3].map(step => ({ step, p: 1 })), ...[0, 1, 2].map(step => ({ step, accent: true, p: 1 })), { n: [SIN45, SIN45, 0], step: 0, p: 1 }, { n: [SIN45, SIN45, 0], step: 0, up, p: 1 });
const TREE_FACES = treeFaces(3), TREE_FACES_ONE = treeFaces(0);   // with one ramp there is nothing lighter than the top to step to

function treeBase(o) {
  const D = S.tile / 4, a = 2 * o.i + o.w / 2, b = 2 * o.j + o.d / 2;
  return { cx: S.gox + (a - b) * D, gy: Math.round(S.goy + (a + b) * D / 2 - o.z), Rx: Math.max(3, (o.w + o.d) / 4 * D * Math.SQRT2), lean: pn(o, 'lean') };
}
/* A ball's shading as a table per light: every leaf pixel asks, and building a normal for each would show in a large scene. */
const BALL_N = 32, ballTabs = {};
function ballTable() {
  const t = new Uint8Array((BALL_N + 1) ** 2);
  for (let v = 0; v <= BALL_N; v++) for (let u = 0; u <= BALL_N; u++) {
    const px = 2 * u / BALL_N - 1, py = 2 * v / BALL_N - 1, pz = Math.sqrt(Math.max(0, 1 - px * px - py * py));   // as blobMark: a ball's normal, turned from the screen into the world
    t[v * (BALL_N + 1) + u] = shadeStep([px * SIN45 + py * UPS + pz * EYE, -px * SIN45 + py * UPS + pz * EYE, -py * UPZ + pz * EYE], true);
  }
  return t;
}
const ballStep = (px, py) => { const t = ballTabs[S.light] || (ballTabs[S.light] = ballTable()); return t[Math.round((py + 1) * BALL_N / 2) * (BALL_N + 1) + Math.round((px + 1) * BALL_N / 2)]; };
/* A 3 or 4 px base, narrowing to the top, in three columns of light. Lean bends it rather than tilting it, so the foot stays on its cell. */
function treeTrunk(W, t, yTop, base, bow) {
  const litLeft = S.light !== 'right', span = Math.max(1, t.gy - yTop);
  for (let y = Math.max(yTop, W.wy); y <= Math.min(t.gy, W.wy + W.h - 1); y++) {
    const s = (t.gy - y) / span, w = Math.max(1, Math.round(base * (1 - 0.55 * s))), x0 = Math.round(t.cx + bow * s * s - w / 2);
    for (let k = 0; k < w; k++) markAt(W, x0 + k, y, TREE_BARK + (w === 1 || (k > 0 && k < w - 1) ? 1 : (k === 0) === litLeft ? 0 : 2));
  }
}
/* Scalloped edges bulge and notch by angle, so leaves are not plain ovals. A dithered edge drops every other pixel of the rim, which lets the darker clusters behind show through. */
function leafMark(W, c, edge) {
  const y0 = Math.max(W.wy, Math.floor(c.y - c.ry * 1.1)), y1 = Math.min(W.wy + W.h - 1, Math.ceil(c.y + c.ry * 1.1)), x0 = Math.max(W.wx, Math.floor(c.x - c.rx * 1.1)), x1 = Math.min(W.wx + W.w - 1, Math.ceil(c.x + c.rx * 1.1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = (x + 0.5 - c.x) / c.rx, py = (y + 0.5 - c.y) / c.ry, q = px * px + py * py;
    if (edge === 'scallop') { if (q > 0.72 && q > 0.9 + 0.3 * Math.abs(Math.sin(c.bumps * Math.atan2(py, px) + c.phase))) continue; }
    else if (q > 1 || (edge === 'dither' && q > 0.68 && (x + y) & 1)) continue;
    markAt(W, x, y, TREE_LEAF + Math.min(3, ballStep(Math.max(-1, Math.min(1, px)), Math.max(-1, Math.min(1, py))) + c.dark));
  }
}
const leafCluster = (x, y, rx, r, dark) => ({ x: Math.round(x), y: Math.round(y), rx, ry: rx * 2 / 3, dark, bumps: Math.max(5, Math.round(rx / 2)), phase: r() * Math.PI });

/* Clusters of 3:2 around a crown, drawn from the bottom up so the lit tops sit over the darker undersides. The seed also sets the crown's height and width, which is most of what makes two trees look unrelated. */
function roundParts(o, t, r) {
  const n = pn(o, 'crowns'), tall = 0.5 + 0.28 * r(), wide = 0.72 + 0.28 * r(), H = o.h * tall, cy = t.gy - o.h + H / 2, cx = t.cx + t.lean, Cx = t.Rx * wide, base = Math.max(3, Math.min(Cx, H * 0.75)), start = r() * 2 * Math.PI, out = [];
  for (let k = 0; k < n; k++) {
    const rx = base * (0.5 + 0.26 * r()), ry = rx * 2 / 3, f = k * 2.4 + start + (r() - 0.5) * 0.9, reach = 0.55 + 0.45 * r();
    const x = cx + Math.cos(f) * Math.max(0, Cx - rx) * reach, y = cy + Math.sin(f) * Math.max(0, H / 2 - ry) * reach;
    out.push(leafCluster(x, y, rx, r, y > cy + H * 0.2 ? 2 : y > cy ? 1 : 0));
  }
  return { spots: out.sort((p, q) => q.y - p.y), trunkTop: Math.round(cy + H * 0.1), base: o.h >= 60 ? 4 : 3 };
}
function roundMark(o, W, t, r, edge) {
  const p = roundParts(o, t, r);
  treeTrunk(W, t, p.trunkTop, p.base, t.lean);
  for (const c of p.spots) leafMark(W, c, edge);
  return p.spots;
}
/* Stacked cones, each with a flattened round foot. Each column reads from the cone's slope down to its rim. */
function coneTier(W, c, edge) {
  const x0 = Math.max(W.wx, Math.floor(c.x - c.rx)), x1 = Math.min(W.wx + W.w - 1, Math.ceil(c.x + c.rx)), last = W.wy + W.h - 1;
  for (let x = x0; x <= x1; x++) {
    const px = (x + 0.5 - c.x) / c.rx; if (px <= -1 || px >= 1) continue;
    const foot = Math.sqrt(1 - px * px) * c.ry * (edge === 'scallop' ? 0.65 + 0.5 * Math.abs(Math.sin(x * 1.1 + c.phase)) : 1), top = Math.ceil(c.apex + Math.abs(px) * (c.y - c.apex)), end = Math.floor(c.y + foot);
    for (let y = Math.max(top, W.wy); y <= Math.min(end, last); y++) {
      if (edge === 'dither' && y > end - 2 && (x + y) & 1) continue;
      markAt(W, x, y, TREE_LEAF + Math.min(3, ballStep(px * 0.9, -0.15) + c.dark + (y > end - 2 ? 1 : 0)));
    }
  }
}
function coniferMark(o, W, t, r, edge) {
  const n = pn(o, 'crowns'), top = t.gy - o.h, bottom = t.gy - o.h * (0.1 + 0.08 * r()), span = bottom - top, step = span / (n + 0.5), slim = 0.7 + 0.3 * r(), out = [];
  treeTrunk(W, t, Math.round(bottom - span / 2), o.h >= 60 ? 4 : 3, t.lean * 0.5);
  for (let k = 0; k < n; k++) {
    const s = k / n, y = bottom - k * step, rx = Math.max(2, t.Rx * slim * (1 - 0.72 * s) * (0.92 + 0.16 * r())), apex = k === n - 1 ? top : y - step * 1.7;
    out.push(Object.assign(leafCluster(t.cx + t.lean * s * s, y, rx, r, k ? 0 : 1), { apex, ry: rx * 0.34 }));
  }
  for (const c of out) coneTier(W, c, edge);
  return out.map(c => ({ x: c.x, y: Math.round(c.y - (c.y - c.apex) * 0.3), rx: c.rx * 0.5, ry: (c.y - c.apex) * 0.25 }));
}
/* Fronds arch up from the crown and droop, back ones first. They are too thin for an ellipse test, so each is walked as a curve. */
function frondMark(W, f, edge) {
  const steps = Math.ceil(f.len * 1.6), last = W.wy + W.h - 1, right = W.wx + W.w - 1;
  for (let k = 0; k <= steps; k++) {
    const s = k / steps, x = Math.round(f.x + Math.cos(f.ang) * f.len * s), y = Math.round(f.y + Math.sin(f.ang) * f.len * s / 2 - f.rise * Math.sin(Math.PI * s) + f.droop * s * s), hw = Math.round(1.1 + 1.3 * Math.sin(Math.PI * Math.min(1, s * 1.1)));
    if (x < W.wx || x > right) continue;
    for (let dy = -hw; dy <= hw; dy++) {
      const py = y + dy; if (py < W.wy || py > last) continue;
      if ((edge === 'scallop' && dy === hw && k % 5 < 2) || (edge === 'dither' && s > 0.65 && (x + py) & 1)) continue;
      markAt(W, x, py, TREE_LEAF + Math.min(3, f.dark + (dy < 0 ? 0 : dy > 0 ? 2 : 1)));
    }
  }
}
function palmMark(o, W, t, r, edge) {
  const n = pn(o, 'crowns') + 3, top = Math.round(t.gy - o.h * (0.74 + 0.1 * r())), bow = t.lean + (r() - 0.5) * t.Rx * 0.5, start = r() * 2 * Math.PI, X = t.cx + bow, out = [];
  treeTrunk(W, t, top, o.h >= 60 ? 4 : 3, bow);
  for (let k = 0; k < n; k++) { const ang = start + (k + (r() - 0.5) * 0.5) * 2 * Math.PI / n, len = t.Rx * (0.85 + 0.3 * r()); out.push({ x: X, y: top, ang, len, rise: len * (0.18 + 0.14 * r()), droop: len * (0.45 + 0.25 * r()), dark: Math.sin(ang) < -0.2 ? 1 : 0 }); }
  for (const f of out.sort((p, q) => Math.sin(p.ang) - Math.sin(q.ang))) frondMark(W, f, edge);
  return [{ x: Math.round(X), y: top + 3, rx: 3, ry: 2 }];
}
/* One pixel each, inside the clusters, from a stream of its own, so turning accents on leaves the tree's shape alone. */
function treeAccents(o, W, spots) {
  const kind = pn(o, 'accents'); if (kind === 'none' || !spots.length) return;
  const r = rng(Math.imul(o.look.seed, 31) + 7), n = 3 + 2 * spots.length;
  for (let k = 0; k < n; k++) {
    const c = spots[Math.floor(r() * spots.length)], f = r() * 2 * Math.PI, d = 0.6 * Math.sqrt(r());
    markAt(W, Math.round(c.x + Math.cos(f) * c.rx * d), Math.round(c.y + Math.sin(f) * c.ry * d), kind === 'fruit' ? TREE_FRUIT : TREE_FLOWER);
  }
}
function treeMark(o, W) {
  const t = treeBase(o), r = rng(o.look.seed), style = pn(o, 'style'), edge = pn(o, 'edge');
  treeAccents(o, W, (style === 'conifer' ? coniferMark : style === 'palm' ? palmMark : roundMark)(o, W, t, r, edge));
}

SHAPE_DEFS.tree = { name: 'Tree', group: 'Organic', w: 4, d: 4, h: levels(3.5), mark: treeMark, faces: o => o.look.side ? TREE_FACES : TREE_FACES_ONE, noTop: true, round: true, reroll: true, cast: { r: 0.6, h: 0.2 }, accent: '#8f5a3a', side: '#b04a3a',
  pad: o => Math.abs(pn(o, 'lean')), sizes: () => ({ w: 'Crown width', h: 'Height px' }), fit: o => { o.d = o.w; return o; }, drag: (o, di, dj) => ({ w: 2 * (Math.max(di, dj) + 1) }),
  mirror: n => Object.assign(n, { params: Object.assign({}, n.params, { lean: -pn(n, 'lean') }) }),
  params: { style: { label: 'Foliage', options: [['round', 'Round'], ['conifer', 'Conifer'], ['palm', 'Palm']], def: 'round', hint: 'Clusters of leaves, stacked cones or fronds.' },
    crowns: { label: 'Crowns', min: 2, max: 7, def: 5, hint: 'How many leaf clusters or cone layers. A palm has three more fronds than this.' },
    lean: { label: 'Lean px', min: -16, max: 16, def: 0, hint: 'How far the top of the tree bends to the side.' },
    edge: { label: 'Leaf edge', options: [['plain', 'Plain'], ['scallop', 'Scallop'], ['dither', 'Dither']], def: 'scallop', hint: 'How the foliage ends, so leaves are not plain ovals.' },
    accents: { label: 'Accents', options: [['none', 'None'], ['fruit', 'Fruit'], ['flowers', 'Flowers']], def: 'none', hint: 'Single pixels of fruit or blossom in the leaves.' } } };

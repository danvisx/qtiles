'use strict';
/* qtiles compositor. A layer is only its pixel array: a canvas per layer holds every pixel twice and runs out of memory on an iPad long before 4096 x 4096.
   What reaches the screen is a cache of tiles of CP_T x CP_T pixels, at four zoom levels, built only where the view is. Level k holds every 2^k-th pixel, so a pixel is never blended.
   A tile keeps the layers below and above the active one as two composites (bands). A stroke then costs three reads per pixel of its dirty rectangle, however many layers there are. */

const CP_T = 256, CP_LEVELS = 3, CP_TILES = 180, CP_MIP_BYTES = 128e6, CP_BUDGET_MS = 8;
/* gImg counts changes to what the stack looks like, gBand changes to which layers are in the bands. Choosing another layer changes gBand only, so it redraws nothing. */
const CP = { tiles: new Map(), w: 0, h: 0, seq: [], below: [], above: [], mid: null, act: -1, where: new Map(), gImg: 1, gBand: 1, stamp: 0, mipped: new Set(), mipBytes: 0 };
const cpKey = (k, tx, ty) => k * 65536 + ty * 256 + tx;
const anyBox = (p, q) => q ? joinBox(p, q) : p;
/* The level to read at a zoom: the finest whose pixels are no bigger than a device pixel. A device pixel ratio of 2 keeps a level of detail that a 1x screen could not show. */
const mipLevel = (z, ratio = 1) => Math.max(0, Math.min(CP_LEVELS, Math.floor(Math.log2(1 / (z * ratio)) + 1e-9)));

/* ---------- pixels ---------- */
/* Lays one source over a buffer inside box b. The source is read every pixStep pixels and rowStep to the row, so a level of a layer reads through this with no copy. */
function laySpan(d, dw, s, so, rowStep, pixStep, b, op) {
  const solid = op >= 1;
  for (let y = b.y0; y <= b.y1; y++) {
    let i = y * dw + b.x0, j = so + y * rowStep + b.x0 * pixStep;
    for (let x = b.x0; x <= b.x1; x++, i++, j += pixStep) {
      const v = s[j]; if (!(v >>> 24)) continue;
      d[i] = solid && (v >>> 24 === 255 || !d[i]) ? v : over(d[i], v, op);
    }
  }
}
/* Rows y0 to y1 of a composite of box (x, y, w), written to d, which is w wide and starts at row y. Exports call this in pieces so a big one can yield. */
function layRows(d, list, x, y, w, y0, y1) {
  const b = { x0: 0, y0, x1: w - 1, y1 };
  for (const L of list) laySpan(d, w, L.px, y * S.w + x, S.w, 1, b, opacityOf(L));
}
function flatBox(list, x, y, w, h, bg) {
  const d = new Uint32Array(w * h); if (bg) d.fill(bg);
  layRows(d, list, x, y, w, 0, h - 1); return d;
}
/* One pixel of the shown stack. It starts from the topmost solid pixel, as everything under that cannot show. */
function pxAt(i) {
  const q = CP.seq; let k = Math.max(0, q.length - 1), v = 0;
  while (k > 0 && !(q[k].op >= 1 && q[k].L.px[i] >>> 24 === 255)) k--;
  for (; k < q.length; k++) { const s = q[k].L.px[i]; if (s >>> 24) v = over(v, s, q[k].op); }
  return v;
}
/* A canvas of part of a pixel array, for the few things that do want one. */
function boxCanvas(px, sw, x, y, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  for (let r = 0; r < h; r++) d.set(px.subarray((y + r) * sw + x, (y + r) * sw + x + w), r * w);
  ctx.putImageData(img, 0, 0); return c;
}

/* ---------- mip levels, per layer and per tile ---------- */
/* Built on first use and dropped by dirty rectangles. false means empty, which is most of a big scene's layers and costs nothing to skip. At level 0 there is nothing to copy, so the entry is only that answer. */
function mipTile(L, k, tx, ty) {
  const m = L.mips || (L.mips = new Map()), key = cpKey(k, tx, ty), had = m.get(key);
  if (had !== undefined) return had;
  const T = CP_T << k, ox = tx * T, oy = ty * T, W = S.w, H = S.h; let out = false;
  if (!k) {
    const x1 = Math.min(W, ox + T), y1 = Math.min(H, oy + T);
    scan: for (let y = oy; y < y1; y++) for (let i = y * W + ox, e = y * W + x1; i < e; i++) if (L.px[i]) { out = true; break scan; }
  } else {
    const step = 1 << k, mw = Math.min(CP_T, (W - ox + step - 1) >> k), mh = Math.min(CP_T, (H - oy + step - 1) >> k), d = new Uint32Array(CP_T * CP_T); let any = 0;
    for (let y = 0; y < mh; y++) {
      let j = (oy + (y << k)) * W + ox, i = y * CP_T;
      for (let x = 0; x < mw; x++, j += step, i++) { const v = L.px[j]; d[i] = v; any |= v; }
    }
    if (any) { out = d; CP.mipBytes += d.byteLength; if (CP.mipBytes > CP_MIP_BYTES) mipClear(); }   // the composites stay, so losing these costs a rebuild only if a layer below changes
  }
  (L.mips || (L.mips = new Map())).set(key, out); CP.mipped.add(L); return out;
}
function mipClear() { for (const L of CP.mipped) L.mips = null; CP.mipped.clear(); CP.mipBytes = 0; }
function mipDrop(L, x, y, w, h) {
  const m = L.mips; if (!m || !m.size) return;
  for (let k = 0; k <= CP_LEVELS; k++) {
    const T = CP_T << k;
    for (let ty = (y / T) | 0, b = ((y + h - 1) / T) | 0; ty <= b; ty++) for (let tx = (x / T) | 0, r = ((x + w - 1) / T) | 0; tx <= r; tx++) {
      const key = cpKey(k, tx, ty), v = m.get(key);
      if (v) CP.mipBytes -= v.byteLength || 0;
      m.delete(key);
    }
  }
}

/* ---------- tiles ---------- */
function cpTile(k, tx, ty) {
  const key = cpKey(k, tx, ty); let t = CP.tiles.get(key);
  if (t) CP.tiles.delete(key);
  else {
    const old = CP.tiles.size >= CP_TILES && CP.tiles.entries().next().value;   // a touched tile goes to the end, so the first one is the longest unused
    if (old && old[1].stamp !== CP.stamp) { CP.tiles.delete(old[0]); t = old[1]; }
    else {
      const cv = document.createElement('canvas'); cv.width = cv.height = CP_T;
      const ctx = cv.getContext('2d'), img = ctx.createImageData(CP_T, CP_T);
      t = { cv, ctx, img, px: new Uint32Array(img.data.buffer), below: null, above: null };
    }
    const step = 1 << k, ox = tx * (CP_T << k), oy = ty * (CP_T << k);
    Object.assign(t, { k, tx, ty, mw: Math.min(CP_T, (S.w - ox + step - 1) >> k), mh: Math.min(CP_T, (S.h - oy + step - 1) >> k), ready: false, gImg: 0, gBand: 0, dB: null, dA: null, dC: null });
  }
  t.stamp = CP.stamp; CP.tiles.set(key, t); return t;
}
const cpWhole = t => ({ x0: 0, y0: 0, x1: t.mw - 1, y1: t.mh - 1 });
function cpLay(d, L, op, t, b) {
  const k = t.k, T = CP_T << k, step = 1 << k, so = t.ty * T * S.w + t.tx * T;
  const m = L === PV.L || L === PV.S ? undefined : b.x0 || b.y0 || b.x1 < t.mw - 1 || b.y1 < t.mh - 1 ? L.mips ? L.mips.get(cpKey(k, t.tx, t.ty)) : undefined : mipTile(L, k, t.tx, t.ty);   // only a whole tile is worth building a level for
  if (m === false) return;
  if (m && m !== true) laySpan(d, CP_T, m, 0, CP_T, 1, b, op); else laySpan(d, CP_T, L.px, so, step * S.w, step, b, op);
}
function cpBand(t, name, list, b) {
  if (!list.length) return;
  const d = t[name] || (t[name] = new Uint32Array(CP_T * CP_T));
  for (let y = b.y0; y <= b.y1; y++) d.fill(0, y * CP_T + b.x0, y * CP_T + b.x1 + 1);
  for (const e of list) cpLay(d, e.L, e.op, t, b);
}
function cpCompose(t, b) {
  const d = t.px, B = CP.below.length ? t.below : null, A = activeLayer();
  for (let y = b.y0; y <= b.y1; y++) { const i = y * CP_T + b.x0, e = y * CP_T + b.x1 + 1; if (B) d.set(B.subarray(i, e), i); else d.fill(0, i, e); }
  const shade = PV.sBox && PV.S && PV.S.w === S.w && PV.S.h === S.h;
  if (shade && !PV.sTop) cpLay(d, PV.S, PV.sOp, t, b);   // the live shadow is the top of the band below an object layer, and a new object layer goes above a plain one
  if (CP.mid) cpLay(d, CP.mid.L, CP.mid.op, t, b);
  if (shade && PV.sTop) cpLay(d, PV.S, PV.sOp, t, b);
  if (PV.L && PV.box && PV.L.w === S.w && PV.L.h === S.h) cpLay(d, PV.L, S.tool === 'shadow' ? shadowOpacity() : opacityOf(A), t, b);
  if (CP.above.length) laySpan(d, CP_T, t.above, 0, CP_T, 1, b, 1);
  t.ctx.putImageData(t.img, 0, 0, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
}
/* Brings a tile up to date. A dirty rectangle is always done, as that is the pen. Rebuilding a whole tile can wait for a later frame when `may` is false; the tile keeps its old picture until then. */
function cpFresh(t, may) {
  const stale = t.gImg !== CP.gImg, bands = t.gBand !== CP.gBand;
  if (!stale && !t.dB && !t.dA && !t.dC) return true;
  if (stale && !may) return false;
  if (bands && !may) return false;
  const whole = cpWhole(t); let c = t.dC;
  if (bands) { cpBand(t, 'below', CP.below, whole); cpBand(t, 'above', CP.above, whole); t.gBand = CP.gBand; c = anyBox(anyBox(c, t.dB), t.dA); }
  else {
    if (t.dB) { cpBand(t, 'below', CP.below, t.dB); c = anyBox(c, t.dB); }
    if (t.dA) { cpBand(t, 'above', CP.above, t.dA); c = anyBox(c, t.dA); }
  }
  cpCompose(t, stale ? whole : c);
  t.dB = t.dA = t.dC = null; t.gImg = CP.gImg; t.ready = true; return true;
}

/* ---------- changes ---------- */
function cpClear() { CP.tiles.clear(); CP.w = S.w; CP.h = S.h; }
/* Reads the stack from the layers rather than being told, because the eye, opacity, solo and order are all set in many places. */
function cpSync() {
  if (CP.w !== S.w || CP.h !== S.h) { cpClear(); miniAll(); }
  const sh = shownSet(), below = [], above = []; let mid = null;
  S.layers.forEach((L, n) => { if (!sh(L)) return; const e = { L, op: opacityOf(L) }; if (n < S.active) below.push(e); else if (n > S.active) above.push(e); else mid = e; });
  const same = (a, b) => a.length === b.length && a.every((e, k) => e.L === b[k].L && e.op === b[k].op), seq = below.concat(mid ? [mid] : [], above);
  const bandsSame = same(below, CP.below) && same(above, CP.above), shown = same(seq, CP.seq);
  if (bandsSame && shown && CP.act === S.active) return;
  if (!shown || (PV.box && CP.act !== S.active)) { CP.gImg++; miniAll(); }
  if (!bandsSame || CP.act !== S.active) {
    CP.gBand++; CP.where.clear();
    for (const e of below) CP.where.set(e.L, 'dB');
    for (const e of above) CP.where.set(e.L, 'dA');
  }
  if (mid) CP.where.set(mid.L, 'dC');
  CP.seq = seq; CP.below = below; CP.above = above; CP.mid = mid; CP.act = S.active;
  shadowFresh();
}
/* flush calls this. Tiles and mips drop what the rectangle touched, and nothing is drawn until a tile comes into view. */
function cpTouch(L, x, y, w, h) {
  mipDrop(L, x, y, w, h);
  const pv = L === PV.L || L === PV.S, part = pv ? 'dC' : CP.where.get(L); if (!part) return;
  if (!pv) miniTouch(x, y, w, h);
  for (const t of CP.tiles.values()) {
    const k = t.k, T = CP_T << k, ox = t.tx * T, oy = t.ty * T; if (x >= ox + T || y >= oy + T || x + w <= ox || y + h <= oy) continue;
    const up = v => Math.max(0, (v + (1 << k) - 1) >> k), b = { x0: up(x - ox), y0: up(y - oy), x1: Math.min(t.mw - 1, (x + w - 1 - ox) >> k), y1: Math.min(t.mh - 1, (y + h - 1 - oy) >> k) };   // a level's pixel is the art pixel at its corner, so a rectangle between two of them changes nothing
    if (b.x1 >= b.x0 && b.y1 >= b.y0) t[part] = joinBox(t[part], b);
  }
}
/* The tile as it stands, built now. For tests and anything off the render path. */
function cpPixels(k, tx, ty) { cpSync(); CP.stamp++; const t = cpTile(k, tx, ty); cpFresh(t, true); return t; }

/* ---------- drawing ---------- */
/* While a tile waits for its turn, the same place in a coarser one stands in, which beats a hole in the picture. */
function cpStandIn(c, t, dx, dy, dw, dh) {
  for (let j = t.k + 1; j <= CP_LEVELS; j++) {
    const n = j - t.k, up = CP.tiles.get(cpKey(j, t.tx >> n, t.ty >> n)); if (!up || !up.ready) continue;
    const s = CP_T >> n, mask = (1 << n) - 1;
    c.drawImage(up.cv, (t.tx & mask) * s, (t.ty & mask) * s, s, s, dx, dy, dw, dh); return;
  }
}
function cpDraw(c, x, y, z) {
  cpSync(); CP.stamp++;
  const k = mipLevel(z, dpr), T = CP_T << k, s = T * z, x0 = Math.max(0, Math.floor(-x / s)), y0 = Math.max(0, Math.floor(-y / s));
  const x1 = Math.min(Math.ceil(S.w / T) - 1, Math.floor((vw - x) / s)), y1 = Math.min(Math.ceil(S.h / T) - 1, Math.floor((vh - y) / s));
  const end = performance.now() + CP_BUDGET_MS; let late = false;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = cpTile(k, tx, ty); if (!cpFresh(t, performance.now() < end)) late = true;
    const dx = pxSnap(x + tx * s), dy = pxSnap(y + ty * s), dw = pxSnap(x + (tx + 1) * s) - dx, dh = pxSnap(y + (ty + 1) * s) - dy;   // edges on device pixels, so neighboring tiles leave no seam at any zoom
    if (t.ready) c.drawImage(t.cv, dx, dy, dw, dh); else cpStandIn(c, t, dx, dy, dw, dh);
  }
  if (late) requestRender();
}

/* The painted area of one layer, or null. Tiles known to be empty are skipped, so this is quick on a sparse layer. */
function layerBox(L) {
  let b = null;
  for (let ty = 0, h = Math.ceil(S.h / CP_T); ty < h; ty++) for (let tx = 0, w = Math.ceil(S.w / CP_T); tx < w; tx++) {
    if (!mipTile(L, 0, tx, ty)) continue;
    const ox = tx * CP_T, oy = ty * CP_T, x1 = Math.min(S.w, ox + CP_T), y1 = Math.min(S.h, oy + CP_T);
    for (let y = oy; y < y1; y++) for (let x = ox, i = y * S.w + ox; x < x1; x++, i++) if (L.px[i] >>> 24) b = !b ? { x0: x, y0: y, x1: x, y1: y } : { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) };
  }
  return b;
}

'use strict';
/* qtiles height guides: where the ghost or the selection stands and how tall it is, on the canvas and in the status bar.
   Guides are in screen pixels and reach past the canvas, so they go straight on the view, not on a canvas of art size. Everything they show comes from the records the ghost or selection already holds. */

const HG_KEY = 'qtiles.guides', HG_LEVELS = ['off', 'lines', 'planes'], HG_NAMES = { off: 'Off', lines: 'Lines', planes: 'Planes' };
const HG_LINE = 0.9, HG_HALO = 0.5, HG_TINT = 0.12, HG_SHEET = 0.1;   // a 1 px dot over mid-tone art needs nearly full strength to show
const HG_UNITS = 12;   // past this many, one volume around the lot says more than a thicket of lines
const HG_TICK_ROOM = 6, HG_TICK = 5, HG_ROOFS = new Set(['gable', 'hip', 'pyramid', 'cone']);
const HG = { list: null, world: null, units: [], line: '', over: '', was: 'lines' };

/* ---------- what the guides are about ---------- */
/* A ghost if there is one, otherwise the selection. A ghost's records are not in the project, so nothing is looked through for them. */
function hgSource() {
  if (S.mode !== 'iso') return null;
  if (S.tool === 'terrain') return pvShown() && TR.spot ? { list: [TR.spot], terrain: true } : null;
  if (S.tool === 'scatter') return SC.drag && SC.drag.head ? { list: SC.drag.head, ghost: true } : null;
  if (S.tool === 'place' && pvShown() && PL.drafts.length) return { list: PL.drafts, ghost: true };
  if (!objTool(heldTool())) return null;
  const list = objSet(); return list.length ? { list } : null;
}
/* A box in the terms of a record, as restUnder and the pixel box read one. */
function hgBox(list) {
  const U = asmSpan(list), z = Math.min(...list.map(o => o.z)), top = Math.max(...list.map(o => o.z + o.h));
  return { type: 'box', params: {}, i: U.a0 / 2, j: U.b0 / 2, w: U.a1 - U.a0, d: U.b1 - U.b0, z, h: top - z };
}
/* Touching is not overlapping, so everything compares strictly. */
const hgOverlap = (p, q) => 2 * p.i < 2 * q.i + q.w && 2 * q.i < 2 * p.i + p.w && 2 * p.j < 2 * q.j + q.d && 2 * q.j < 2 * p.j + p.d && p.z < q.z + q.h && q.z < p.z + p.h;
/* The height of a slope over the part of a footprint they share. */
function hgSlope(q, u) {
  const A0 = Math.max(2 * u.i, 2 * q.i), A1 = Math.min(2 * u.i + u.w, 2 * q.i + q.w), B0 = Math.max(2 * u.j, 2 * q.j), B1 = Math.min(2 * u.j + u.d, 2 * q.j + q.d); let lo = Infinity, hi = 0;
  for (let s = 0; s <= 4; s++) for (let t = 0; t <= 4; t++) { const v = Math.max(0, surfAt(q, A0 + (A1 - A0) * s / 4, B0 + (B1 - B0) * t / 4)); if (v < lo) lo = v; if (v > hi) hi = v; }
  return { lo: q.z + lo, hi: q.z + hi };
}
/* What shares a volume with a unit, and any slope it stands on, which shares its box without being in the way. */
function hgScan(u, skip) {
  const column = objPixelBox(Object.assign({}, u, { z: 0, h: Math.max(1, u.z + u.h) })), sh = shownSet(); let over = null, on = null;
  for (const L of S.layers) if (L.objectLayer && sh(L)) for (const q of objQuery(L, column)) {
    if (skip.has(q.id) || shapeOf(q).attach || !hgOverlap(u, q)) continue;
    if (shapeOf(q).surf) { const r = hgSlope(q, u); if (u.z >= r.hi) continue; if (u.z >= r.lo) { on = q; continue; } }
    over = over || q;
  }
  return { over, on };
}
const hgName = o => { if (o.terrain) return 'terrain'; const x = o.lib && libFind(o.lib.id); return x ? x.name : defOf(o.type).name; };
const hgLevels = h => Math.round(h / levelPx() * 100) / 100;
const hgHeight = h => { const n = hgLevels(h); return n + (n === 1 ? ' level' : ' levels'); };
/* A height in the words Show heights as asks for. `join` goes between levels and pixels when both show. */
const hgWords = (h, join, end = '') => { const u = prefGet('heights'); return u === 'levels' ? hgHeight(h) : u === 'pixels' ? h + ' px' : hgHeight(h) + join + h + ' px' + end; };
/* `rest` is what restUnder gives: the height of the surface under the base, and what that is. */
function hgReadout(u, rest, count) {
  const name = rest.on ? hgName(rest.on) + (rest.on.lib && HG_ROOFS.has(rest.on.type) ? ' roof' : '') : 'ground';
  return (count > 1 ? count + ' objects · ' : '') + 'Tile ' + u.i + ', ' + u.j + ' · ' + (rest.z < u.z ? 'above ' : 'on ') + name + ' · raised ' + (prefGet('heights') === 'pixels' ? u.z + ' px' : hgLevels(u.z)) + ' · height ' + hgWords(u.h, ' (', ')');
}
function hgUnit(list, skip) {
  const u = hgBox(list), o = list[0], L = activeLayer();
  if (o.parent && L.objectLayer) { u.attached = true; u.rest = { z: u.z, on: L.index.byId.get(o.parent) }; u.over = null; return u; }   // on its wall or top, so it cannot float or collide
  const s = hgScan(u, skip); u.over = s.over; u.rest = s.on ? { z: u.z, on: s.on } : restUnder(u, skip); return u;
}
function hgTerrain(t) {
  const b = brushBox(t.cell.i, t.cell.j, S.terBrush), u = hgBox([{ i: b.x0, j: b.y0, w: 2 * (b.x1 - b.x0 + 1), d: 2 * (b.y1 - b.y0 + 1), z: 0, h: t.h }]);
  u.terrain = true; u.rest = { z: 0, on: null }; u.over = null; return u;
}
const hgSame = (p, q) => !!p && p.length === q.length && p.every((o, k) => o === q[k]);
/* An edit makes a new records array, so these change exactly when an answer could: an edit, an undo, or a layer shown or hidden. */
function hgWorld() { const sh = shownSet(), out = [levelPx()]; for (const L of S.layers) if (L.objectLayer && sh(L)) out.push(L.objects); return out; }
/* Worked out only when the records change: the marching ants redraw a selection every frame. */
function hgUnits(src) {
  const world = hgWorld(); if (hgSame(HG.list, src.list) && hgSame(HG.world, world)) return HG.units;
  HG.list = src.list; HG.world = world;
  if (src.terrain) {
    HG.units = [hgTerrain(src.list[0])];
    const t = src.list[0], u = HG.units[0]; hgStatus('Tile ' + t.cell.i + ', ' + t.cell.j + ' · ' + S.terMode + ' to ' + hgWords(u.h, ' (', ')'), ''); return HG.units;
  }
  const tops = src.list.filter(o => !o.parent), use = tops.length ? tops : src.list, by = new Map(), skip = new Set(src.ghost ? [] : src.list.map(o => o.id));
  for (const o of use) { const k = unitKey(o), key = k === null ? o : k; if (by.has(key)) by.get(key).push(o); else by.set(key, [o]); }
  const sets = by.size > HG_UNITS ? [use] : [...by.values()], hit = (HG.units = sets.map(s => hgUnit(s, skip))).find(u => u.over);
  hgStatus(hgReadout(HG.units[0], HG.units[0].rest, by.size), hit ? 'Overlaps ' + hgName(hit.over) : '');
  return HG.units;
}
function hgStatus(line, over) {
  if (line === HG.line && over === HG.over) return;
  HG.line = line; HG.over = over; $('sbPlace').hidden = !line; $('sbPlace').textContent = line; $('sbOver').hidden = !over; $('sbOver').textContent = over; $('sbHint').hidden = !!line; document.querySelector('.statusbar').classList.toggle('placing', !!line);
}

/* ---------- geometry ---------- */
/* Back, right, front and left corners of a footprint at a height, in art pixels, from the same corners the renderer starts from. */
function hgCorners(u, up = 0) {
  const i = u.i + u.w / 2, j = u.j + u.d / 2;
  return [[u.i, u.j], [i, u.j], [i, j], [u.i, j]].map(([p, q]) => { const c = cellCorner(p, q); return { x: c.x, y: c.y - up }; });
}
/* A tick each level up from the base, or every 2nd or 4th where they would run together. Every second one carries its number. */
function hgTicks(h, lv, zoom) {
  const n = rulerStep(lv * zoom, HG_TICK_ROOM), out = [];
  for (let k = 0; k * lv <= h; k += n) out.push({ k, at: k * lv, label: k > 0 && k % (2 * n) === 0 });
  return out;
}
/* The part of a segment on the stage, so a line across a huge zoomed canvas stays a few hundred dots. Liang-Barsky. */
function hgCut(x0, y0, x1, y1) {
  let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 + 2], [dx, vw + 2 - x0], [-dy, y0 + 2], [dy, vh + 2 - y0]]) {
    if (!p) { if (q < 0) return null; continue; }
    const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

/* ---------- on the canvas ---------- */
/* The halo goes first and one pixel off, as the grid's does, so a line reads over dark and light art alike. */
function hgStroke(c, segs, color, dotted) {
  c.lineWidth = 1; c.setLineDash(dotted ? [1, 2] : []); c.lineCap = 'butt';
  for (const [off, style, a] of [[1, TH.guideHalo, HG_HALO], [0, color, HG_LINE]]) {
    c.strokeStyle = style; c.globalAlpha = a; c.beginPath();
    for (const s of segs) { const q = hgCut(s[0], s[1], s[2], s[3]); if (q) { c.moveTo(q[0] + off, q[1] + off); c.lineTo(q[2] + off, q[3] + off); } }
    c.stroke();
  }
  c.setLineDash([]); c.globalAlpha = 1;
}
function hgPoly(c, pts) { c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]); c.closePath(); }
function hgLabel(c, text, x, y) {
  c.font = '10px ' + TH.mono; c.textBaseline = 'middle'; c.textAlign = 'left'; c.lineJoin = 'round';
  c.strokeStyle = TH.panel; c.lineWidth = 3; c.strokeText(text, x, y); c.fillStyle = TH.fg; c.fillText(text, x, y);
}
/* Above the top front corner, on whichever side leaves it clear of the pointer. A finger hides far more than a Pencil does. */
function hgTag(c, text, fx, fy, color, x, y, z) {
  const w = text.length * 6 + 12, h = 18, a = drawId !== null && drawFinger ? lastArt : hover, reach = drawFinger ? 56 : 14, px = a ? x + (a.x + 0.5) * z : -1e6, py = a ? y + (a.y + 0.5) * z : -1e6;
  const clear = (l, t) => px < l - reach || px > l + w + reach || py < t - reach || py > t + h + reach;
  let l = fx + 12, t = fy - 30;
  if (!clear(l, t)) l = fx - 12 - w;
  if (!clear(l, t)) { l = fx - w / 2; t = Math.min(fy, py) - reach - h; }
  l = Math.round(Math.max(4, Math.min(vw - w - 4, l))); t = Math.round(Math.max(4, Math.min(vh - h - 4, t)));
  c.fillStyle = TH.panel; c.fillRect(l, t, w, h); c.strokeStyle = color; c.lineWidth = 1; c.strokeRect(l + 0.5, t + 0.5, w - 1, h - 1);
  c.font = '10px ' + TH.mono; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = TH.fg; c.fillText(text, l + 6, t + h / 2);
}
/* Two walls behind the volume. The volume's own front is cut out, so a sheet never lies over the near faces. */
function hgSheets(c, base, top, color) {
  const [b0, r0, f0, l0] = base, [b1, r1, f1, l1] = top;
  c.save(); c.beginPath(); c.rect(0, 0, vw, vh); hgPoly(c, [l0, f0, r0, r1, f1, l1]); c.clip('evenodd');
  c.fillStyle = color; c.globalAlpha = HG_SHEET; c.beginPath(); hgPoly(c, [l0, b0, b1, l1]); hgPoly(c, [r0, b0, b1, r1]); c.fill(); c.restore();
  hgStroke(c, [[l1[0], l1[1], b1[0], b1[1]], [b1[0], b1[1], r1[0], r1[1]]], color, true);
}
function hgDrawUnit(c, u, x, y, z, first) {
  const lv = levelPx(), color = u.over ? TH.danger : TH.guide, at = up => hgCorners(u, up).map(p => [Math.round(x + p.x * z) + 0.5, Math.round(y + p.y * z) + 0.5]);
  const base = at(u.z), top = at(u.z + u.h), ground = at(0), xs = top.map(p => p[0]), low = Math.max(...ground.map(p => p[1]));
  if (Math.max(...xs) < 0 || Math.min(...xs) > vw || low < 0 || Math.min(...top.map(p => p[1])) > vh) return;
  const edges = p => p.map((q, k) => { const n = p[(k + 1) & 3]; return [q[0], q[1], n[0], n[1]]; }), up = (p, q) => p.map((v, k) => [v[0], v[1], q[k][0], q[k][1]]);
  if (S.guides === 'planes' && !u.terrain && u.h > 0) hgSheets(c, base, top, color);
  const segs = u.h > 0 ? up(base, top) : [];
  if (!u.terrain) {
    /* The base, what it floats over, and the ground, each once. */
    const seen = u.attached ? [u.z] : [...new Set([u.z, u.rest.z, 0])];
    c.fillStyle = color; c.globalAlpha = HG_TINT; c.beginPath(); for (const h of seen) hgPoly(c, at(h)); c.fill(); c.globalAlpha = 1;
    for (const h of seen) segs.push(...edges(at(h)));
    if (u.z > 0 && !u.attached) segs.push(...up(ground, base));
  }
  hgStroke(c, segs, color, true);
  const f = top[2], fb = base[2], ticks = hgTicks(u.h, lv, z), rowOf = t => Math.round(fb[1] - t.at * z);
  hgStroke(c, ticks.map(t => [f[0], rowOf(t) + 0.5, f[0] + HG_TICK, rowOf(t) + 0.5]), color, false);
  for (const t of ticks) if (t.label) hgLabel(c, String(t.k), f[0] + HG_TICK + 3, rowOf(t));
  if (first) hgTag(c, hgWords(u.h, ' · '), f[0], f[1], color, x, y, z);
}
/* Off stops here: nothing is read, measured or drawn. */
function hgDraw(c, x, y, z) {
  if (S.guides === 'off') { if (HG.line) hgForget(); return; }
  const src = hgSource(); if (!src) { if (HG.line) hgForget(); return; }
  hgUnits(src).forEach((u, k) => hgDrawUnit(c, u, x, y, z, k === 0));
}
function hgForget() { HG.list = null; hgStatus('', ''); }

/* ---------- the setting ---------- */
function hgSet(v) {
  S.guides = HG_LEVELS.includes(v) ? v : 'lines'; if (S.guides !== 'off') HG.was = S.guides;
  prefSet('guides', S.guides);
  hgSync(); requestRender();
}
function hgSync() {
  document.querySelectorAll('[data-hg]').forEach(b => press(b, b.dataset.hg === S.guides));
  $('heightRead').textContent = HG_NAMES[S.guides];
}
function initHeightGuides() {
  const v = prefGet('guides'); S.guides = v; if (v !== 'off') HG.was = v;
  document.querySelectorAll('[data-hg]').forEach(b => { b.onclick = () => { hgSet(b.dataset.hg); syncGuides(); }; });
  $('heightBtn').onclick = () => togglePop('heightPop', $('heightPop').hidden);
  hgSync();
}

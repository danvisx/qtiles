'use strict';
/* qtiles export: one PNG, one PNG per layer, or a slice of tiles, in pieces that yield to the page so a big export shows progress and can stop.
   Pixels come from the layers' arrays and PNGs from one short-lived canvas. Many files go in one zip, because a browser stops a long run of downloads and an iPad has nowhere to put them. */

const XP_STOP = new Error('stopped'), XP_ROWS = 64, XP_YIELD_MS = 32, XP_SHOW_MS = 1000, XP_SIDE = MAX_DIM, XP_AREA = 268e6, XP_SCALES = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 64], XP_TILES = [64, 128, 256, 512, 1024];
const XP = { job: null, scale: 1, cv: null };

/* ---------- running ---------- */
function xpShow(job) { if (XP.job !== job) return; $('busyBox').hidden = false; $('busy').classList.add('show'); xpBar(job); }
function xpBar(job) { $('busyLabel').textContent = job.label; $('busyBar').style.width = Math.round(job.frac * 100) + '%'; $('busyCount').textContent = Math.round(job.frac * 100) + ' percent'; }
/* Called between pieces. It stops the job if Cancel was pressed and otherwise only hands the page a turn now and then. */
async function xpTick(job, done, total) {
  if (job.stop) throw XP_STOP;
  job.frac = done / total;
  if (performance.now() - job.last < XP_YIELD_MS) return;
  if (!$('busyBox').hidden) xpBar(job);
  await new Promise(r => setTimeout(r)); job.last = performance.now();
  if (job.stop) throw XP_STOP;
}
/* The blocker goes up at once, so nothing can change the art under an export. It only shows after a second, so a quick export does not flash. Returns undefined if it stopped. */
async function xpJob(label, run, what = 'Export') {
  if (XP.job) { toast('Something is already running.'); return undefined; }
  const job = XP.job = { label, stop: false, frac: 0, last: performance.now() }, timer = setTimeout(() => xpShow(job), XP_SHOW_MS);
  $('busy').hidden = false; $('busyStop').onclick = () => { job.stop = true; };
  try { return await run(job); }
  catch (e) { if (e === XP_STOP) toast(what + ' canceled.'); else toast(what + ' failed: ' + (e.message || e)); return undefined; }
  finally { clearTimeout(timer); XP.job = null; $('busy').hidden = true; $('busyBox').hidden = true; $('busy').classList.remove('show'); }
}
/* Esc on a running export cancels it. */
function xpEscape() { if (!XP.job) return false; XP.job.stop = true; return true; }

/* ---------- what to export ---------- */
const xywh = b => ({ x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 });
const xpList = opts => opts.layerOnly ? [activeLayer()] : S.layers.filter(L => shownOf(L) && !ghostly(L));
function xpBox(list, opts) {
  if (opts.sel && SEL.box) return xywh(SEL.box);
  if (!opts.crop) return { x: 0, y: 0, w: S.w, h: S.h };
  let b = null;   // trim to the painted pixels so a character exports as a tight sprite
  for (const L of list) { const q = layerBox(L); if (q) b = joinBox(b, q); }
  return b && xywh(b);
}
const xpFits = (w, h) => w <= XP_SIDE && h <= XP_SIDE && w * h <= XP_AREA;
const xpScaleOk = (s, w, h) => xpFits(w * s, h * s);
/* Scale chips for every export sheet. A grayed chip stays in the row, and the note says why, as a disabled chip has no tap to answer. With no size yet (cropping has not scanned the pixels) nothing is grayed. Returns the scale in use, which falls back when the current one no longer fits. */
function scaleChips(box, cur, w, h, pick) {
  const ok = n => !w || xpScaleOk(n, w, h), use = ok(cur) ? cur : XP_SCALES.filter(ok).pop() || 1; box.textContent = '';
  for (const n of XP_SCALES) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = n + '×'; b.setAttribute('aria-label', 'Scale ' + n); b.disabled = !ok(n); press(b, n === use); b.onclick = () => pick(n); box.appendChild(b); }
  return use;
}
const scaleWhy = (w, h) => w && !XP_SCALES.every(n => xpScaleOk(n, w, h)) ? ' Grayed scales would be over ' + XP_SIDE + ' px a side.' : '';
/* Pixels outside a selection's shape are not exported, though its box may hold them. */
function xpMask(d, b, w, h, opts, bg) {
  if (!opts.sel || !SEL.mask) return;
  for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) if (!SEL.mask[(b.y + y) * S.w + b.x + x]) d[i] = bg;
}
async function xpFlat(list, b, opts, job) {
  const bg = opts.solid ? packHex(S.color2) : 0, d = new Uint32Array(b.w * b.h); if (bg) d.fill(bg);
  for (let y = 0; y < b.h; y += XP_ROWS) { layRows(d, list, b.x, b.y, b.w, y, Math.min(b.h - 1, y + XP_ROWS - 1)); await xpTick(job, y, b.h); }
  xpMask(d, b, b.w, b.h, opts, bg); return d;
}
/* Nearest neighbor by whole numbers: every pixel becomes a square. */
function xpScale(px, w, h, s, d) {
  const W = w * s;
  for (let y = 0, o = 0; y < h; y++) {
    const row = o;
    for (let x = 0, i = y * w; x < w; x++, i++) for (let n = 0; n < s; n++) d[o++] = px[i];
    for (let n = 1; n < s; n++, o += W) d.copyWithin(o, row, row + W);
  }
  return d;
}
async function pngBlob(px, w, h, s = 1) {
  const c = XP.cv || (XP.cv = document.createElement('canvas')); c.width = w * s; c.height = h * s;
  const x = c.getContext('2d'), img = x.createImageData(w * s, h * s), d = new Uint32Array(img.data.buffer);
  if (s > 1) xpScale(px, w, h, s, d); else d.set(px);
  x.putImageData(img, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); c.width = c.height = 1; return blob;   // shrinking it hands the memory back now, not at the next export
}

/* ---------- zip: stored, as a PNG is already compressed ---------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function zipEntry(name, blob) { return { name, blob, crc: crc32(new Uint8Array(await blob.arrayBuffer())) }; }
/* Only the headers are built here. The files stay Blobs, which a browser can hold outside the page's memory. */
function zipBlob(files) {
  const enc = new TextEncoder(), now = new Date(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], dir = []; let at = 0;
  for (const f of files) {
    const name = enc.encode(f.name), n = name.length, size = f.blob.size, local = new DataView(new ArrayBuffer(30)), cen = new DataView(new ArrayBuffer(46));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(10, time, true); local.setUint16(12, date, true);
    local.setUint32(14, f.crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true); local.setUint16(26, n, true);
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(12, time, true); cen.setUint16(14, date, true);
    cen.setUint32(16, f.crc, true); cen.setUint32(20, size, true); cen.setUint32(24, size, true); cen.setUint16(28, n, true); cen.setUint32(42, at, true);
    parts.push(local.buffer, name, f.blob); dir.push(cen.buffer, name); at += 30 + n + size;
  }
  const size = dir.reduce((t, p) => t + p.byteLength, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, at, true);
  return new Blob([...parts, ...dir, end.buffer], { type: 'application/zip' });
}
const jsonEntry = (name, o) => zipEntry(name, new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' }));

/* ---------- the three kinds ---------- */
async function exportPng(scale, opts = exportOpts) {
  const list = xpList(opts), box = xpBox(list, opts);
  if (!box) { toast('Nothing to export: those layers are empty.'); return; }
  if (!xpFits(box.w * scale, box.h * scale)) { toast('That is too big for one image. Try a smaller scale, or Tiles.'); return; }
  const blob = await xpJob('Exporting PNG', async job => pngBlob(await xpFlat(list, box, opts, job), box.w, box.h, scale));
  if (blob === undefined) return;
  if (!blob) { toast('Export failed. Try a smaller scale.'); return; }
  const part = opts.layerOnly ? '-' + activeLayer().name.replace(/[^\w-]+/g, '-').slice(0, 30) : '';
  const ok = await deliver(safeName() + part + (scale > 1 ? '@' + scale + 'x' : '') + '.png', blob);
  if (ok) toast('PNG exported (' + box.w * scale + '×' + box.h * scale + ').');
}
/* Rectangles of a grid of tiles, named by column and row. Edge tiles are as big as what is left. With overlap, a tile also repeats the 1 px row of each neighbor it has, so an engine's filtering finds the right color at a seam; the outer edges have no neighbor, so they do not grow. */
function tileSlices(w, h, size, overlap) {
  const out = [], o = overlap ? 1 : 0;
  for (let row = 0, y = 0; y < h; row++, y += size) for (let col = 0, x = 0; x < w; col++, x += size) {
    const x0 = Math.max(0, x - o), y0 = Math.max(0, y - o), x1 = Math.min(w, x + size + o), y1 = Math.min(h, y + size + o);
    out.push({ name: col + '_' + row + '.png', col, row, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out;
}
async function exportTiles(opts = exportOpts) {
  const list = xpList(opts), box = xpBox(list, opts);
  if (!box) { toast('Nothing to export: those layers are empty.'); return; }
  const size = opts.tile, slices = tileSlices(box.w, box.h, size, opts.overlap), bg = opts.solid ? packHex(S.color2) : 0;
  const zip = await xpJob('Exporting tiles', async job => {
    const files = [], tiles = []; let k = 0;
    for (const s of slices) {
      await xpTick(job, k++, slices.length);
      const at = { x: box.x + s.x, y: box.y + s.y }, px = flatBox(list, at.x, at.y, s.w, s.h, bg); xpMask(px, at, s.w, s.h, opts, bg);
      if (opts.skip && !px.some(v => v !== bg)) continue;
      const blob = await pngBlob(px, s.w, s.h); if (!blob) throw new Error('A tile could not be encoded.');
      files.push(await zipEntry(s.name, blob)); tiles.push({ file: s.name, column: s.col, row: s.row, x: s.x, y: s.y, w: s.w, h: s.h });
    }
    files.push(await jsonEntry('tiles.json', { app: FORMAT, name: S.name, w: box.w, h: box.h, tile: size, overlap: opts.overlap ? 1 : 0, columns: Math.ceil(box.w / size), rows: Math.ceil(box.h / size), tiles }));
    return { blob: zipBlob(files), n: tiles.length };
  });
  if (!zip) return;
  if (await deliver(safeName() + '-tiles-' + size + '.zip', zip.blob)) toast(zip.n + (zip.n === 1 ? ' tile' : ' tiles') + ' exported.');
}
/* Layer PNGs hold a layer's own pixels, as if at full opacity. layers.json gives each one's offset and opacity, so the stack can be put back together. */
async function exportLayers(scale, opts = exportOpts) {
  const list = S.layers.filter(L => shownOf(L) && !ghostly(L));
  const zip = await xpJob('Exporting layers', async job => {
    const files = [], layers = [];
    for (let k = 0; k < list.length; k++) {
      await xpTick(job, k, list.length);
      const L = list[k], b = xpBox([L], opts); if (!b) continue;
      if (!xpFits(b.w * scale, b.h * scale)) throw new Error(L.name + ' is too big at that scale.');
      const px = new Uint32Array(b.w * b.h);
      for (let y = 0; y < b.h; y++) px.set(L.px.subarray((b.y + y) * S.w + b.x, (b.y + y) * S.w + b.x + b.w), y * b.w);
      xpMask(px, b, b.w, b.h, opts, 0);
      const file = String(k + 1).padStart(2, '0') + '-' + (L.name.replace(/[^\w-]+/g, '-').slice(0, 30) || 'layer') + '.png', blob = await pngBlob(px, b.w, b.h, scale); if (!blob) throw new Error('A layer could not be encoded.');
      files.push(await zipEntry(file, blob)); layers.push({ file, name: L.name, kind: L.kind, x: b.x * scale, y: b.y * scale, w: b.w * scale, h: b.h * scale, opacity: opacityOf(L) });
    }
    files.push(await jsonEntry('layers.json', { app: FORMAT, name: S.name, w: S.w * scale, h: S.h * scale, scale, layers }));
    return { blob: zipBlob(files), n: layers.length };
  });
  if (!zip) return;
  if (await deliver(safeName() + '-layers.zip', zip.blob)) toast(zip.n + (zip.n === 1 ? ' layer' : ' layers') + ' exported.');
}

/* ---------- the sheet ---------- */
function xpSync() {
  const o = exportOpts, tiles = o.mode === 'tiles', layers = o.mode === 'layers', hasSel = !!SEL.box; if (!hasSel) o.sel = false;
  document.querySelectorAll('[data-xp-mode]').forEach(b => press(b, b.dataset.xpMode === o.mode));
  press($('expLayerOnly'), o.layerOnly); press($('expCrop'), o.crop); press($('expSel'), o.sel); $('expSel').disabled = !hasSel; $('expLayerOnly').hidden = layers;
  press($('expClear'), !o.solid); press($('expSolid'), o.solid); $('expBgField').hidden = layers;
  $('expScaleField').hidden = tiles; $('expTileOpts').hidden = !tiles; press($('expOverlap'), o.overlap); press($('expSkip'), o.skip); $('expTile').value = o.tile;
  /* Cropping scans the pixels, so the note gives the canvas size for it and the real size comes in the toast. */
  const b = o.sel ? xpBox([], o) : { w: S.w, h: S.h }, w = b.w, h = b.h, cropped = o.crop && !o.sel, cut = cropped ? ', before cropping' : '';
  const s = XP.scale = scaleChips($('expScales'), XP.scale, cropped ? 0 : w, cropped ? 0 : h, n => { XP.scale = n; xpSync(); }), why = tiles || cropped ? '' : scaleWhy(w, h);
  if (tiles) { const n = tileSlices(w, h, o.tile, false).length; $('expNote').textContent = n + (n === 1 ? ' tile' : ' tiles') + ' of up to ' + o.tile + ' × ' + o.tile + ' px in one .zip, with tiles.json listing where each goes' + cut + '.'; }
  else if (layers) $('expNote').textContent = 'One PNG per visible layer in one .zip, with layers.json listing offsets. Crop to content keeps the files small.' + why;
  else $('expNote').textContent = w * s + ' × ' + h * s + ' px' + cut + '.' + (xpFits(w * s, h * s) ? '' : ' That is too big for one image: use a smaller scale, or Tiles.') + why;
  $('expOk').disabled = !tiles && !layers && !o.crop && !xpFits(w * s, h * s);
}
function xpOpen() { xpSync(); openSheet('sheetExport'); }
function xpRun() {
  closeSheets();
  if (exportOpts.mode === 'tiles') exportTiles(); else if (exportOpts.mode === 'layers') exportLayers(XP.scale); else exportPng(XP.scale);
}
function initExport() {
  const o = exportOpts, flip = (id, k, off) => { $(id).onclick = () => { o[k] = !o[k]; if (o[k] && off) o[off] = false; xpSync(); }; };
  flip('expLayerOnly', 'layerOnly'); flip('expCrop', 'crop', 'sel'); flip('expSel', 'sel', 'crop'); flip('expOverlap', 'overlap'); flip('expSkip', 'skip');
  document.querySelectorAll('[data-xp-mode]').forEach(b => b.onclick = () => { o.mode = b.dataset.xpMode; xpSync(); });
  $('expClear').onclick = () => { o.solid = false; xpSync(); }; $('expSolid').onclick = () => { o.solid = true; xpSync(); };
  for (const n of XP_TILES) { const q = document.createElement('option'); q.value = n; q.textContent = n + ' × ' + n + ' px'; $('expTile').appendChild(q); }
  $('expTile').onchange = e => { o.tile = +e.target.value; xpSync(); };
  $('expOk').onclick = xpRun;
}

// Writes every size of the owner's mark from app/assets/layers.png, its 512 px master. Run: node scripts/make_icons.js
// The mark is smooth art, so it is resampled with Lanczos, unlike the pixel art in the app. It reads and writes 8-bit RGBA PNGs and nothing else, with zlib and no dependency.
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const SIZES = ['layers-16', 'layers-24', 'layers-32', 'layers-48', 'layers-72', 'icon-192'], folder = path.join(__dirname, '..', 'app', 'assets');
const TOUCH = 180, TOUCH_ART = 148, TOUCH_BACK = [0xf7, 0xf8, 0xfa];   // iOS fills transparency with black and rounds the corners, so this one is opaque, on the manifest's background, with a margin

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function chunksOf(buf) {
  const out = []; let at = 8;
  while (at < buf.length) { const n = buf.readUInt32BE(at); out.push({ type: buf.toString('latin1', at + 4, at + 8), data: buf.subarray(at + 8, at + 8 + n) }); at += n + 12; }
  return out;
}
function decode(buf) {
  const chunks = chunksOf(buf), ihdr = chunks.find(c => c.type === 'IHDR').data, w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  if (ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0) throw new Error('Expected a plain 8-bit RGBA PNG.');
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data))), px = Buffer.alloc(w * h * 4), row = w * 4;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], from = y * (row + 1) + 1, to = y * row;
    for (let k = 0; k < row; k++) {
      const a = k >= 4 ? px[to + k - 4] : 0, b = y ? px[to + k - row] : 0, c = k >= 4 && y ? px[to + k - row - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[to + k] = raw[from + k] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
    }
  }
  return { w, h, px };
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]), n = Buffer.alloc(4), c = Buffer.alloc(4);
  n.writeUInt32BE(data.length); c.writeUInt32BE(crc(body)); return Buffer.concat([n, body, c]);
}
function encode({ w, h, px }) {
  const ihdr = Buffer.alloc(13), row = w * 4, raw = Buffer.alloc((row + 1) * h);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  for (let y = 0; y < h; y++) {
    raw[y * (row + 1)] = 4;   // Paeth, as the mark's gradients barely compress unfiltered
    for (let k = 0, to = y * row; k < row; k++) {
      const a = k >= 4 ? px[to + k - 4] : 0, b = y ? px[to + k - row] : 0, c = k >= 4 && y ? px[to + k - row - 4] : 0, p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      raw[y * (row + 1) + 1 + k] = px[to + k] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const LOBES = 3, sinc = x => x ? Math.sin(Math.PI * x) / (Math.PI * x) : 1;
/* One pass along one axis. `get` and `put` take a line and a position, so both axes share it. */
function pass(from, to, lines, get, put) {
  const k = from / to, reach = LOBES * Math.max(k, 1), v = [0, 0, 0, 0];
  for (let n = 0; n < to; n++) {
    const c = (n + 0.5) * k - 0.5, a = Math.max(0, Math.ceil(c - reach)), b = Math.min(from - 1, Math.floor(c + reach)), w = [];
    let sum = 0; for (let i = a; i <= b; i++) { const d = (i - c) / Math.max(k, 1), f = Math.abs(d) < LOBES ? sinc(d) * sinc(d / LOBES) : 0; w.push(f); sum += f; }
    for (let l = 0; l < lines; l++) { v.fill(0); for (let i = a; i <= b; i++) { const q = get(l, i), f = w[i - a] / sum; for (let m = 0; m < 4; m++) v[m] += q[m] * f; } put(l, n, v); }
  }
}
/* Through premultiplied alpha, or the transparent pixels' color would bleed into the edge. */
function resized({ w, h, px }, W, H) {
  const src = new Float64Array(w * h * 4), mid = new Float64Array(W * h * 4), out = new Float64Array(W * H * 4), res = Buffer.alloc(W * H * 4);
  for (let i = 0; i < w * h; i++) { const a = px[i * 4 + 3] / 255; for (let m = 0; m < 3; m++) src[i * 4 + m] = px[i * 4 + m] * a; src[i * 4 + 3] = a; }
  pass(w, W, h, (l, i) => src.subarray((l * w + i) * 4, (l * w + i) * 4 + 4), (l, n, v) => mid.set(v, (l * W + n) * 4));
  pass(h, H, W, (l, i) => mid.subarray((i * W + l) * 4, (i * W + l) * 4 + 4), (l, n, v) => out.set(v, (n * W + l) * 4));
  for (let i = 0; i < W * H; i++) { const a = Math.max(0, Math.min(1, out[i * 4 + 3])); for (let m = 0; m < 3; m++) res[i * 4 + m] = a ? Math.max(0, Math.min(255, Math.round(out[i * 4 + m] / a))) : 0; res[i * 4 + 3] = Math.round(a * 255); }
  return { w: W, h: H, px: res };
}
function onBack(art, size, back) {
  const px = Buffer.alloc(size * size * 4), at = (size - art.w) >> 1;
  for (let i = 0; i < size * size; i++) { for (let m = 0; m < 3; m++) px[i * 4 + m] = back[m]; px[i * 4 + 3] = 255; }
  for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) { const s = (y * art.w + x) * 4, d = ((y + at) * size + x + at) * 4, a = art.px[s + 3] / 255; for (let m = 0; m < 3; m++) px[d + m] = Math.round(art.px[s + m] * a + back[m] * (1 - a)); }
  return { w: size, h: size, px };
}

const mark = decode(fs.readFileSync(path.join(folder, 'layers.png')));
const write = (name, img) => { fs.writeFileSync(path.join(folder, name + '.png'), encode(img)); console.log('wrote app/assets/' + name + '.png'); };
for (const name of SIZES) { const n = +name.split('-')[1]; write(name, resized(mark, n, n)); }
write('icon-' + TOUCH, onBack(resized(mark, TOUCH_ART, TOUCH_ART), TOUCH, TOUCH_BACK));

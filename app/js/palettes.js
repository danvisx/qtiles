'use strict';
/* qtiles palettes. A palette is { id, name, credit?, ramps: [{ name, colors }] }; a ramp runs dark to light, and colors in no family
   sit in a ramp called Loose, kept last. S.pal is the live palette; S.palette is its flattened copy, still saved so older builds can open new files. */

const LIGHTS = ['left', 'right', 'overhead'], LOOSE = 'Loose';
const isLoose = r => r.name === LOOSE;
function luma(hex) { const c = hexToRgb(hex); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }

/* A ramp from one color: steps run dark to light, shifting hue toward blue-violet in the darks and yellow in the lights, with saturation peaking mid-ramp.
   The base color is always a step: the middle one, or nearer an end when it is too dark or light to have every step around it. */
function makeRamp(base, n) {
  const c = hexToRgb(base), [h, s, l] = rgbToHsl(c[0], c[1], c[2]), half = (n - 1) / 2, d = Math.min(0.11, 0.9 / (n - 1));
  const hi = Math.floor((l - 0.03) / d), lo = Math.ceil(n - 1 - (0.98 - l) / d), at = Math.max(0, Math.min(n - 1, Math.max(lo, Math.min(hi, Math.floor(half)))));
  const toward = (a, target, deg) => { const diff = ((target - a + 540) % 360) - 180; return (a + Math.sign(diff) * Math.min(Math.abs(diff), deg) + 360) % 360; };
  const colors = [];
  for (let i = 0; i < n; i++) {
    const k = i - at, t = k / Math.max(at, n - 1 - at);
    if (!k) { colors.push(rgbToHex(c[0], c[1], c[2])); continue; }
    colors.push(rgbToHex(...hslToRgb(k < 0 ? toward(h, 250, -k * 6) : toward(h, 60, k * 5), s * (1 - 0.25 * t * t), Math.max(0, Math.min(1, l + k * d)))));
  }
  return colors.sort((a, b) => luma(a) - luma(b));
}
const HUE_FAMILIES = [[15, 'Reds'], [45, 'Oranges'], [70, 'Yellows'], [170, 'Greens'], [200, 'Cyans'], [260, 'Blues'], [300, 'Purples'], [345, 'Pinks'], [361, 'Reds']];
/* Groups colors by hue family, each sorted dark to light. A family of one stays apart, since a ramp needs a neighbor. */
function groupByHue(list) {
  const groups = new Map(), rest = [], ramps = [];
  for (const c of list) {
    const [h, s] = rgbToHsl(...hexToRgb(c)), name = s < 0.12 ? 'Grays' : HUE_FAMILIES.find(f => h < f[0])[1];
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(c);
  }
  for (const [name, colors] of groups) {
    if (colors.length < 2) rest.push(...colors);
    else ramps.push({ name, colors: colors.sort((a, b) => luma(a) - luma(b)) });
  }
  return { ramps, rest };
}
/* Community palettes come as flat lists, so they are grouped into ramps here; otherwise shading would skip all of their colors. */
function community(id, name, author, list) {
  const { ramps, rest } = groupByHue(list.split(' ').map(h => '#' + h));
  return { id, name, credit: name + ' by ' + author + ', from lospec.com', ramps: rest.length ? ramps.concat({ name: LOOSE, colors: rest }) : ramps };
}
const generated = (id, name, bases) => ({ id, name, ramps: bases.map(([rn, hex, n]) => ({ name: rn, colors: makeRamp(hex, n || 5) })) });
const PALETTES = [
  { id: 'qtiles', name: 'qtiles', ramps: DEFAULT_RAMPS.concat({ name: LOOSE, colors: ['#000000'] }) },
  generated('earth', 'Earth and stone', [['Clay', '#a5694a'], ['Sand', '#c9a66b'], ['Moss stone', '#7c8466'], ['Granite', '#7d7f86'], ['Slate', '#4f5d6e']]),
  generated('foliage', 'Foliage and water', [['Leaf', '#4e9a3f'], ['Pine', '#2f6b4b'], ['Lime', '#9cc53d'], ['Water', '#2f8fc4'], ['Shallows', '#4cc2c0']]),
  generated('dusk', 'Dusk (cool)', [['Night', '#2f2f66'], ['Violet', '#6a4c9c'], ['Rose', '#b45c8e'], ['Haze', '#7388b0'], ['Lamp', '#e0a050']]),
  generated('morning', 'Warm morning', [['Sunlight', '#f0c24f'], ['Peach', '#ee9a6a'], ['Blush', '#d9707a'], ['Olive', '#8f9a4a'], ['Sky', '#7cc0dc']]),
  { id: 'mono8', name: 'Monochrome 8', ramps: [{ name: 'Gray', colors: ['#000000', '#242424', '#494949', '#6d6d6d', '#929292', '#b6b6b6', '#dbdbdb', '#ffffff'] }] },
  generated('skin', 'Skin and hair', [['Pale skin', '#f2c9a8', 6], ['Tan skin', '#c98f62', 6], ['Deep skin', '#7d4a2e', 6], ['Black hair', '#3a3136'], ['Blond hair', '#d9b252'], ['Red hair', '#a8482c']]),
  community('db16', 'DB16', 'DawnBringer', '140c1c 442434 30346d 4e4a4e 854c30 346524 d04648 757161 597dce d27d2c 8595a1 6daa2c d2aa99 6dc2ca dad45e deeed6'),
  community('db32', 'DB32', 'DawnBringer', '000000 222034 45283c 663931 8f563b df7126 d9a066 eec39a fbf236 99e550 6abe30 37946e 4b692f 524b24 323c39 3f3f74 306082 5b6ee1 639bff 5fcde4 cbdbfc ffffff 9badb7 847e87 696a6a 595652 76428a ac3232 d95763 d77bba 8f974a 8a6f30'),
  community('sweetie16', 'Sweetie 16', 'GrafxKid', '1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57'),
  community('endesga32', 'Endesga 32', 'ENDESGA', 'be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569'),
  community('resurrect64', 'Resurrect 64', 'Kerrie Lake', '2e222f 3e3546 625565 966c6c ab947a 694f62 7f708a 9babb2 c7dcd0 ffffff 6e2727 b33831 ea4f36 f57d4a ae2334 e83b3b fb6b1d f79617 f9c22b 7a3045 9e4539 cd683d e6904e fbb954 4c3e24 676633 a2a947 d5e04b fbff86 165a4c 239063 1ebc73 91db69 cddf6c 313638 374e4a 547e64 92a984 b2ba90 0b5e65 0b8a8f 0eaf9b 30e1b9 8ff8e2 323353 484a77 4d65b4 4d9be6 8fd3ff 45293f 6b3e75 905ea9 a884f3 eaaded 753c54 a24b6f cf657f ed8099 831c5d c32454 f04f78 f68181 fca790 fdcbb0'),
  community('apollo', 'Apollo', 'AdamCYounis', '172038 253a5e 3c5e8b 4f8fba 73bed3 a4dddb 19332d 25562e 468232 75a743 a8ca58 d0da91 4d2b32 7a4841 ad7757 c09473 d7b594 e7d5b3 341c27 602c2c 884b2b be772b de9e41 e8c170 241527 411d31 752438 a53030 cf573c da863e 1e1d39 402751 7a367b a23e8c c65197 df84a5 090a14 10141f 151d28 202e37 394a50 577277 819796 a8b5b2 c7cfcc ebede9')
];

function flatPalette(p) { return p.ramps.flatMap(r => r.colors); }
function copyPalette(p) { return { id: p.id, name: p.name, credit: p.credit, ramps: p.ramps.map(r => ({ name: r.name, colors: r.colors.slice() })) }; }
function syncFlat() { S.palette = flatPalette(S.pal); }
/* A project's own palettes are live objects, so S.pal is the saved entry. A built-in is copied, so it can never change. */
function usePalette(p) { S.pal = S.myPalettes.includes(p) ? p : copyPalette(p); syncFlat(); }
function findPalette(id) { return S.myPalettes.find(p => p.id === id) || PALETTES.find(p => p.id === id); }
function nextPaletteId() { let n = S.myPalettes.length + 1; while (findPalette('my-' + n)) n++; return 'my-' + n; }
function addMyPalette(name, ramps) {
  const p = copyPalette({ id: nextPaletteId(), name, ramps });
  S.myPalettes.push(p); usePalette(p); return p;
}
/* The first edit of a built-in palette makes a project copy, so switching away and back never loses the edit. */
function editPalette() { if (!S.myPalettes.includes(S.pal)) addMyPalette(S.pal.name + ' (edited)', S.pal.ramps); }
/* Older files have only a flat list: colors of the default ramps keep their ramp, and everything else is loose. */
function rampsFromFlat(list) {
  const have = new Set(list.map(h => h.toLowerCase())), ramps = [];
  for (const r of DEFAULT_RAMPS) {
    const colors = r.colors.filter(c => have.delete(c));
    if (colors.length) ramps.push({ name: r.name, colors });
  }
  if (have.size) ramps.push({ name: LOOSE, colors: [...have] });
  return ramps;
}
function paletteRamps() { return S.pal.ramps; }

/* { ramp, index, exact }: the color itself if the palette has it, otherwise the nearest palette color by RGB distance with exact false. */
function rampOf(color) {
  const hex = String(color).toLowerCase(), ramps = paletteRamps();
  for (const ramp of ramps) { const index = ramp.colors.indexOf(hex); if (index >= 0) return { ramp, index, exact: true }; }
  const c = hexToRgb(hex); let best = null, bd = Infinity;
  for (const ramp of ramps) ramp.colors.forEach((h, index) => {
    const q = hexToRgb(h), d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2;
    if (d < bd) { bd = d; best = { ramp, index, exact: false }; }
  });
  return best;
}
/* The color n steps lighter (or darker, if negative), clamped to the ramp. Null for a color on no ramp. */
function rampStep(color, n) {
  const r = rampOf(color); if (!r.exact || isLoose(r.ramp)) return null;
  return r.ramp.colors[Math.max(0, Math.min(r.ramp.colors.length - 1, r.index + n))];
}
/* For the shade tool: packed color to packed neighbor, so a stroke does one Map lookup per pixel. Ramp ends have no entry and stay as they are. */
function rampStepMap(dir) {
  const m = new Map();
  for (const r of paletteRamps()) if (!isLoose(r)) r.colors.forEach((c, i) => { const n = r.colors[i + dir]; if (n) m.set(packHex(c), packHex(n)); });
  return m;
}
/* The packed colors of a block's faces under S.light: top = the color, lit side one ramp step down, shaded side two.
   A color on no ramp falls back to the multipliers. Overhead light leaves no shaded side, so both sides take the lit step. */
function faceShades(hex) {
  const onRamp = rampStep(hex, 0) !== null, shade = (n, f) => onRamp ? packHex(rampStep(hex, -n)) : shadeHex(hex, f);
  const lit = shade(1, FACE_LEFT), dark = shade(2, FACE_RIGHT), side = shade(1, FACE_SIDE), light = S.light;
  return { top: packHex(hex), left: light === 'overhead' ? side : light === 'left' ? lit : dark, right: light === 'overhead' ? side : light === 'left' ? dark : lit, edge: shade(3, FACE_EDGE) };
}

/* ---------- edits; each one acts on the project's copy ---------- */
const hasColor = hex => S.pal.ramps.some(r => r.colors.includes(hex));
function pruneRamps() { S.pal.ramps = S.pal.ramps.filter(r => r.colors.length); syncFlat(); }
function dropColor(hex) { for (const r of S.pal.ramps) r.colors = r.colors.filter(c => c !== hex); }
function addRamp(ramp) { const k = S.pal.ramps.findIndex(isLoose); S.pal.ramps.splice(k < 0 ? S.pal.ramps.length : k, 0, ramp); }
function addLoose(hex) {
  editPalette(); let r = S.pal.ramps.find(isLoose);
  if (!r) { r = { name: LOOSE, colors: [] }; S.pal.ramps.push(r); }
  r.colors.push(hex); syncFlat();
}
function removeColor(hex) { editPalette(); dropColor(hex); pruneRamps(); }
function newRampFrom(hex, n) {
  editPalette();
  const colors = makeRamp(hex, n), taken = c => S.pal.ramps.some(r => !isLoose(r) && r.colors.includes(c));
  for (const c of colors) if (!taken(c)) { const l = S.pal.ramps.find(isLoose); if (l) l.colors = l.colors.filter(x => x !== c); }
  let k = 1; while (S.pal.ramps.some(r => r.name === 'Ramp ' + k)) k++;
  addRamp({ name: 'Ramp ' + k, colors: colors.filter(c => !taken(c)) }); pruneRamps();
}
/* Inserted by luminance, so a ramp stays dark to light. A color moves here from any other ramp, so each one lives in one place. */
function addToRamp(hex, name) {
  editPalette(); dropColor(hex);
  const r = S.pal.ramps.find(x => x.name === name); if (!r) { pruneRamps(); return false; }
  const at = r.colors.findIndex(c => luma(c) > luma(hex));
  r.colors.splice(at < 0 ? r.colors.length : at, 0, hex); pruneRamps(); return true;
}
/* Best effort: turns the loose colors into hue-family ramps. */
function autoRamps() {
  if (!S.pal.ramps.some(isLoose)) return 0;
  editPalette(); const loose = S.pal.ramps.find(isLoose), { ramps, rest } = groupByHue(loose.colors);
  for (const r of ramps) {
    let label = r.name, k = 2; while (S.pal.ramps.some(x => x.name === label)) label = r.name + ' ' + k++;
    addRamp({ name: label, colors: r.colors });
  }
  loose.colors = rest; pruneRamps(); return ramps.length;
}

/* ---------- import and export ---------- */
function parseHexList(text) {
  const out = [];
  for (const m of String(text).matchAll(/(?:#|0x)?\b([0-9a-f]{6})\b/gi)) out.push('#' + m[1].toLowerCase());
  return out;
}
function parseGpl(text) {
  const out = []; let name = '';
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim(), nm = /^name:\s*(.+)$/i.exec(line); if (nm) { name = nm[1].trim(); continue; }
    const m = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(\s|$)/.exec(line);
    if (m && m.slice(1, 4).every(v => +v <= 255)) out.push(rgbToHex(+m[1], +m[2], +m[3]));
  }
  return { name, colors: out };
}
function parsePalette(text) {
  if (/^\s*GIMP Palette/i.test(text)) return parseGpl(text);
  return { name: '', colors: parseHexList(text) };
}
function importPalette(text, fallbackName) {
  const p = parsePalette(text); if (p.colors.length < 2) return false;
  addMyPalette(p.name || fallbackName || 'Imported', [{ name: LOOSE, colors: p.colors.slice(0, 256) }]); return true;
}
function paletteToHex() { return S.palette.map(h => h.slice(1)).join('\n') + '\n'; }
function paletteToGpl() {
  return 'GIMP Palette\nName: ' + S.pal.name + '\nColumns: 8\n#\n' + S.palette.map(h => { const c = hexToRgb(h); return c.map(v => String(v).padStart(3)).join(' ') + '\t' + h.slice(1); }).join('\n') + '\n';
}
function cleanPalette(o) {
  if (!o || !Array.isArray(o.ramps)) return null;
  const ramps = o.ramps.map(r => ({ name: String(r && r.name || LOOSE).slice(0, 40), colors: (r && Array.isArray(r.colors) ? r.colors : []).filter(hexToRgb).map(c => c.toLowerCase()) })).filter(r => r.colors.length);
  if (!ramps.length) return null;
  const p = { id: String(o.id || 'project'), name: String(o.name || 'Project palette').slice(0, 60), ramps };
  if (o.credit) p.credit = String(o.credit); return p;
}
S.myPalettes = []; usePalette(PALETTES[0]);

// Writes app/library/vehicles.js and app/library/street.js, the built-in items of prompt 029.
// The library files are one item per line, which is no way to read a car, so the source is here. Run: node scripts/make_vehicles.js
// Units: a, b, w, d in half tiles from the item's back corner, z and h in pixels, drawn at 32 x 16 tiles and 16 px a level. A vehicle's nose is +a.
const fs = require('fs'), path = require('path');
const RAMPS = { Neutrals: ['#2b2d42', '#4a4e69', '#6c7086', '#9a9fb5', '#c9ccd6', '#f2f3f7'], Brick: ['#4a1f1f', '#7a2e2a', '#b04a3a', '#e07a5f', '#f2b896', '#f6e2c8'], Greens: ['#14342b', '#24593f', '#3f8a4f', '#7bb661', '#b9d98a', '#e4efb4'], Yellows: ['#8a5a14', '#c98a1b', '#f2b632', '#ffd966', '#fff1a8', '#ffffff'], Blues: ['#0d3b66', '#1f6fb2', '#3da5d9', '#7ad3e8'], Skin: ['#2a1a12', '#5a3624', '#8f5a3a', '#c68a62', '#e8b998', '#f6dcc4'] };
const C = { black: ['Neutrals', 0], dark: ['Neutrals', 1], steel: ['Neutrals', 3], light: ['Neutrals', 4], white: ['Neutrals', 5], red: ['Brick', 3], rust: ['Brick', 2], cream: ['Brick', 5], green: ['Greens', 3], yellow: ['Yellows', 3], amber: ['Yellows', 2], blue: ['Blues', 2], sky: ['Blues', 3], navy: ['Blues', 1], wood: ['Skin', 3], plank: ['Skin', 4], bark: ['Skin', 2] };
const ramp = c => { const [r, n] = C[c]; return { ramp: r === 'Skin' ? 'Skin and hair' : r, base: n, color: RAMPS[r][n] }; };
const look = (c, more) => Object.assign(ramp(c), { material: 'plain', scale: 1, seed: 1 }, more);

/* Each builder gets a fresh list, and records take ids in the order they are made. */
function kit() {
  const items = []; let id = 1;
  const put = (type, a, b, z, w, d, h, c, more = {}) => {
    const { params = {}, outline = 'sel', shadow = true, facing = 0, order = 0, accent, ...lk } = more;
    const k = look(c, lk); if (accent) k.accent = ramp(accent);
    const o = { id: id++, type, i: a / 2, j: b / 2, z, w, d, h, facing, params, look: k, outline, shadow, order }; items.push(o); return o;
  };
  const box = (...p) => put('box', ...p), slab = (...p) => put('slab', ...p), taper = (a, b, z, w, d, h, c, params, more) => put('taper', a, b, z, w, d, h, c, Object.assign({ params }, more));
  /* The footprint is one half tile through and enough to hold the circle across. The record's size is worked out by the shape, and written here so a bad number shows at once. */
  const disc = (a, b, z, facing, radius, thickness, c, more = {}) => {
    const { hub = 0, tire = 0, place, ...rest } = more, across = Math.ceil(2 * radius / 8), through = Math.ceil(thickness / 8), odd = facing % 2;
    return put('disc', a, b, z, odd ? across : through, odd ? through : across, 2 * radius, c, Object.assign({ facing, outline: 'none', params: Object.assign({ radius, thickness, hub, tire }, place ? { place } : {}) }, rest));
  };
  /* A wheel stands on the ground and faces its axle: facing 3 on the near side of a body that runs along a, facing 1 on the far side. */
  const wheel = (a, b, facing, radius = 4, thickness = 3) => disc(a, b, 0, facing, radius, thickness, 'steel', { hub: 1, tire: 2, accent: 'black' });
  /* A post 2 px thick: the Railing record, one post and its top rail, as a box cannot be thinner than a half tile. It stands at the footprint's back t edge. */
  const post = (a, b, z, h, c, facing = 0, more = {}) => put('railing', a, b, z, 1, 1, h, c, Object.assign({ facing, outline: 'none', shadow: false, params: { spacing: 16, open: 1 } }, more));
  /* A rail 2 px high across a footprint, for a seat, a handlebar or a drawbar: the same Railing with its one post only 1 px tall. Facing 0 runs it along b, facing 1 along a. */
  const bar = (a, b, z, w, d, c, facing) => put('railing', a, b, z, w, d, 3, c, { facing, outline: 'none', shadow: false, params: { spacing: 16, open: 1 } });
  /* A wheel in line with others, in the middle of its half tile. */
  const mid = (a, b, radius, thickness, tire = 'black') => disc(a, b, 0, 1, radius, thickness, 'light', { hub: 1, tire: Math.max(2, radius >> 2), accent: tire, place: 'middle' });
  const pane = (o, face, u, v, width, height, c) => { const k = look(c, { accent: ramp('sky') }); const q = { id: id++, type: 'window', i: 0, j: 0, z: 0, w: 0, d: 0, h: 1, facing: 0, params: { width, height }, look: k, outline: 'none', shadow: false, order: 0, parent: o.id, face, u, v }; items.push(q); return q; };
  const sign = (o, face, u, v, text) => { const q = { id: id++, type: 'sign', i: 0, j: 0, z: 0, w: 0, d: 0, h: 1, facing: 0, params: { text }, look: look('white', { accent: ramp('navy') }), outline: 'none', shadow: false, order: 0, parent: o.id, face, u, v }; items.push(q); return q; };
  return { items, put, box, slab, taper, disc, wheel, post, bar, mid, pane, sign };
}
const item = (id, name, category, build) => { const k = kit(); build(k); return { id, name, category, tile: 32, level: 16, items: k.items }; };

const lights = (k, front, b1, b2, z) => { for (const b of [b1, b2]) { k.disc(front, b, z, 2, 2, 1, 'yellow'); k.disc(0, b, z, 0, 2, 1, 'red'); } };
const axles = (k, list, far, near, r, t) => { for (const a of list) { k.wheel(a, far, 1, r, t); k.wheel(a, near, 3, r, t); } };
const VEHICLES = [
  item('car', 'Car', 'Vehicles', k => {
    k.box(1, 2, 1, 6, 1, 2, 'black', { outline: 'none' });
    k.taper(1, 1, 3, 6, 3, 8, 'rust', { front: 3, back: 2 });
    k.taper(1, 1, 11, 3, 3, 7, 'sky', { front: 8 });
    k.slab(1, 1, 18, 2, 3, 2, 'rust');
    lights(k, 7, 1, 3, 6); axles(k, [2, 5], 0, 4);
  }),
  item('van', 'Van', 'Vehicles', k => {
    k.box(1, 2, 1, 7, 1, 2, 'black', { outline: 'none' });
    k.box(1, 1, 3, 7, 3, 11, 'light');
    const up = k.box(1, 1, 14, 5, 3, 11, 'light');
    k.taper(6, 1, 14, 1, 3, 11, 'sky', { front: 7 });
    k.pane(up, 1, 26, 3, 11, 7, 'light'); k.pane(up, 3, 3, 3, 11, 7, 'light');
    lights(k, 8, 1, 3, 7); axles(k, [2, 6], 0, 4);
  }),
  item('pickup', 'Pickup', 'Vehicles', k => {
    k.box(1, 2, 1, 7, 1, 2, 'black', { outline: 'none' });
    k.taper(4, 1, 3, 4, 3, 8, 'blue', { front: 3 });
    k.box(1, 1, 3, 3, 3, 8, 'blue', { faces: { top: 0 } });
    k.taper(4, 1, 11, 2, 3, 7, 'sky', { front: 8 });
    k.slab(4, 1, 18, 1, 3, 2, 'blue');
    lights(k, 8, 1, 3, 6); axles(k, [2, 6], 0, 4);
  }),
  item('trailer', 'Trailer', 'Vehicles', k => {
    k.box(0, 1, 4, 5, 3, 9, 'plank', { faces: { top: 1 }, material: 'planks', dir: 'h', accent: 'bark' });
    axles(k, [2], 0, 4);
    k.bar(5, 2, 3, 3, 1, 'black', 1); k.post(7, 2, 0, 5, 'dark', 1);
  }),
  item('motorcycle', 'Motorcycle', 'Vehicles', k => {
    k.mid(0, 2, 5, 3); k.mid(4, 2, 5, 3);
    k.taper(2, 2, 2, 2, 1, 7, 'steel', { left: 2, right: 2 });
    k.put('capsule', 1, 2, 10, 2, 1, 4, 'black', { params: { end: 'round' } });
    k.put('capsule', 3, 2, 10, 2, 1, 6, 'rust', { params: { end: 'round' } });
    k.post(4, 2, 5, 14, 'steel', 1); k.bar(4, 2, 17, 2, 1, 'black', 0);
    k.disc(5, 2, 12, 2, 2, 1, 'yellow', { place: 'middle' });
  }),
  item('bicycle', 'Bicycle', 'Vehicles', k => {
    k.mid(0, 2, 6, 1, 'black'); k.mid(3, 2, 6, 1, 'black');
    k.put('railing', 1, 2, 5, 3, 1, 8, 'rust', { facing: 1, outline: 'none', shadow: false, params: { spacing: 16 } });
    k.bar(1, 2, 14, 1, 1, 'black', 1); k.post(1, 2, 12, 3, 'rust', 1);
    k.post(3, 2, 12, 6, 'rust', 1); k.bar(3, 2, 16, 2, 1, 'black', 0);
  }),
  item('handcart', 'Handcart', 'Vehicles', k => {
    k.box(0, 1, 6, 4, 2, 7, 'plank', { faces: { top: 1 }, material: 'planks', dir: 'h', accent: 'bark' });
    axles(k, [1], 0, 3, 6, 2);
    for (const b of [1, 2]) k.bar(4, b, 8, 3, 1, 'bark', 1);
    k.post(0, 1, 0, 6, 'bark', 1); k.post(0, 2, 0, 6, 'bark', 1);
  }),
  item('rowboat', 'Rowboat', 'Vehicles', k => {
    k.put('capsule', 0, 0, 0, 8, 4, 9, 'wood', { params: { end: 'bow', section: 'hull', rim: 2 }, material: 'planks', dir: 'h', accent: 'bark' });
    for (const a of [2, 5]) k.slab(a, 1, 6, 1, 2, 1, 'plank', { order: 1, shadow: false, outline: 'none' });
  }),
  item('sailboat', 'Sailboat', 'Vehicles', k => {
    k.put('capsule', 0, 0, 0, 10, 4, 10, 'white', { params: { end: 'bow', section: 'hull', rim: 2 } });
    k.post(5, 2, 8, 60, 'bark');
    k.taper(1, 2, 18, 4, 1, 48, 'white', { back: 30 }, { order: 1 });
    k.taper(6, 2, 22, 3, 1, 40, 'red', { front: 22 }, { order: 1 });
  }),
  item('small-plane', 'Small plane', 'Vehicles', k => {
    k.put('capsule', 0, 5, 8, 11, 3, 13, 'white', { params: { end: 'round', taper: 65 } });
    k.put('capsule', 6, 6, 19, 3, 1, 5, 'sky', { order: 1, shadow: false, params: { end: 'round' } });
    for (const b of [1, 8]) k.slab(6, b, 13, 2, 4, 3, 'rust');
    k.slab(0, 4, 15, 2, 2, 2, 'rust', { order: 1 }); k.slab(0, 7, 15, 2, 2, 2, 'rust', { order: 1 });
    k.taper(0, 6, 15, 2, 1, 12, 'rust', { front: 14 }, { order: 1 });
    k.disc(11, 5, 8, 2, 6, 1, 'dark', { hub: 2 });
    k.wheel(8, 4, 3, 4, 2); k.wheel(8, 8, 1, 4, 2); k.post(8, 4, 6, 8, 'dark', 1); k.post(8, 7, 6, 8, 'dark', 1); k.post(0, 6, 0, 16, 'dark', 1);
  })
];
const STREET = [
  item('traffic-light', 'Traffic light', 'Props', k => {
    k.box(1, 1, 0, 1, 1, 3, 'dark'); k.post(1, 1, 3, 32, 'dark'); k.box(1, 1, 34, 1, 1, 21, 'black', { shadow: false });
    for (const [z, c] of [[48, 'rust'], [41, 'amber'], [34, 'green']]) { k.disc(2, 1, z + 1, 2, 3, 1, c, { shadow: false }); k.disc(0, 1, z + 1, 0, 3, 1, c, { shadow: false }); }
  }),
  item('bus-stop', 'Bus stop', 'Props', k => {
    k.put('wall', 0, 0, 0, 1, 8, 22, 'sky', { material: 'glass', accent: 'dark' }); k.put('wall', 1, 0, 0, 3, 1, 22, 'sky', { facing: 1, material: 'glass', accent: 'dark' });
    k.slab(0, 0, 22, 4, 8, 3, 'dark');
    k.box(1, 2, 4, 1, 5, 2, 'wood'); k.box(1, 2, 0, 1, 1, 4, 'dark'); k.box(1, 6, 0, 1, 1, 4, 'dark');
    k.post(3, 7, 0, 22, 'dark', 1);
    k.post(1, 9, 0, 30, 'steel', 1); k.disc(1, 9, 24, 3, 5, 1, 'blue', { hub: 2, place: 'middle', shadow: false });
  }),
  item('hydrant', 'Hydrant', 'Props', k => {
    k.taper(1, 1, 0, 1, 1, 3, 'dark', { front: 1, back: 1, left: 1, right: 1 }, { outline: 'none' });
    k.taper(1, 1, 3, 1, 1, 13, 'rust', { front: 3, back: 3, left: 3, right: 3 }, { outline: 'none' });
    k.put('capsule', 1, 1, 13, 1, 1, 6, 'red', { outline: 'none', shadow: false, params: { end: 'round' } });
    k.disc(2, 1, 6, 2, 2, 2, 'yellow', { shadow: false }); k.disc(1, 2, 6, 3, 2, 2, 'yellow', { shadow: false }); k.disc(0, 1, 6, 0, 2, 2, 'yellow', { shadow: false }); k.disc(1, 0, 6, 1, 2, 2, 'yellow', { shadow: false });
  }),
  item('bin', 'Bin', 'Props', k => {
    k.put('cylinder', 0, 0, 0, 2, 2, 13, 'green', { params: { radius: 1 } });
    k.put('cylinder', 0, 0, 13, 2, 2, 2, 'dark', { params: { radius: 1 } });
  }),
  item('parking-sign', 'Parking sign', 'Props', k => {
    k.post(1, 1, 0, 24, 'steel');
    const p = k.put('wall', 1, 0, 22, 1, 2, 16, 'blue', { shadow: false });
    k.sign(p, 0, 4, 3, 'P'); k.sign(p, 2, 4, 3, 'P');
  }),
  item('road-barrier', 'Road barrier', 'Props', k => {
    for (const a of [0, 6]) k.taper(a, 0, 0, 2, 3, 9, 'dark', { left: 7, right: 7 });
    for (let n = 0; n < 4; n++) k.box(2 * n, 1, 9, 2, 1, 4, n % 2 ? 'white' : 'rust');
  })
];

const write = (name, list, note) => fs.writeFileSync(path.join(__dirname, '..', 'app', 'library', name), `'use strict';\n/* Built-in library items, one per line. Generated by scripts/make_vehicles.js: change them there. */\nLIB_BUILT.push(\n${list.map(x => '  ' + JSON.stringify(x)).join(',\n')}\n);\n`);
write('vehicles.js', VEHICLES); write('street.js', STREET);

// The larger scenes: tiles and parts placed on cell centers. Each part is a .px example, so a change there shows here at the next build. stand is a box that casts its live shadow: w and d in half tiles, h in pixels.
const span = (a, b) => { const out = []; for (let k = a; k <= b; k++) out.push(k); return out; };
const cells = (test, lo, hi) => { const out = []; for (const i of span(lo, hi)) for (const j of span(lo, hi)) if (test(i, j)) out.push([i, j]); return out; };

/* Street corner: two roads cross, with a pavement along each and grass in the four corners. */
const road = (i, j) => (j >= 5 && j <= 7) || (i >= 6 && i <= 8), walk = (i, j) => !road(i, j) && ((j >= 3 && j <= 9) || (i >= 4 && i <= 10));
const dash = (gox, goy, tile, list) => { const out = []; for (const [i0, j0, i1, j1] of list) for (let k = 0; k < 20; k++) { const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0)) * tile / 2; if (k * 12 > n) break; for (let s = 0; s < 6; s++) { const t = (k * 12 + s) / n, a = i0 + (i1 - i0) * t, b = j0 + (j1 - j0) * t, x = Math.round(gox + (a - b) * tile / 2), y = Math.round(goy + (a + b) * tile / 4); out.push([x, y], [x + 1, y]); } } return out; };
const street = {
  id: 'street-corner', title: 'Street corner', order: 28, palette: 'qtiles', w: 384, h: 256, tile: 32, gox: 192, goy: 40, light: 'left',
  lesson: 'Small examples placed on cell centers make a street.', skills: ['composition', 'live shadows', 'feet on tile', 'tiles'],
  ground: [
    { color: '#7bb661', tex: 'grass', cells: cells((i, j) => !road(i, j) && !walk(i, j), -8, 20) },
    { color: '#c9ccd6', tex: 'flat', tile: { tileRim: 'lower' }, cells: cells(walk, -8, 20) },
    { color: '#4a4e69', tex: 'speckle', cells: cells(road, -8, 20) }
  ],
  marks: [{ color: '#c9ccd6', pixels: dash(192, 40, 32, [[-8, 6.5, 5.5, 6.5], [9.5, 6.5, 20, 6.5], [7.5, -8, 7.5, 4.5], [7.5, 8.5, 7.5, 20]]) }],
  objects: [['house', 0, -1]],
  parts: [
    { of: 'tree', name: 'Tree 1', at: [11, 1], stand: [1, 1, 34] },
    { of: 'mailbox-bench', drop: 'bcdeHI', foot: [46, 27], name: 'Mailbox', at: [10, 4], stand: [1, 1, 18] },
    { of: 'cat', name: 'Cat', kind: 'character', at: [10, 3], stand: [1, 1, 12] },
    { of: 'courier', name: 'Courier', kind: 'character', at: [5, 3], stand: [1, 1, 26] },
    { of: 'car', name: 'Car 1', at: [2, 7], stand: [4, 2, 20] },
    { of: 'van', name: 'Van', at: [11, 7], stand: [4, 2, 32] },
    { of: 'car', name: 'Car 2', at: [-2, 7], stand: [4, 2, 20] },
    { of: 'street-lamp', name: 'Lamp', at: [5, 9], stand: [1, 1, 36] },
    { of: 'mailbox-bench', drop: 'TUVWXYEFpqr', foot: [14, 23], name: 'Bench', at: [1, 9], stand: [3, 1, 12] },
    { of: 'dog', name: 'Dog', kind: 'character', at: [4, 10], stand: [1, 1, 12] },
    { of: 'walker', name: 'Walker', kind: 'character', at: [9, 9], stand: [1, 1, 26] },
    { of: 'tree', name: 'Tree 2', at: [2, 12], stand: [1, 1, 34] }
  ],
  tips: [
    { title: 'Look at the street.', text: 'Every car, tree and person here is one of the small examples, standing on the center of a cell. Nothing was drawn for this scene but the ground.', show: {} },
    { title: 'This car is the Car example.', text: 'A scene is mostly placing. Each part is one layer, so you can move it or swap it for something you drew yourself.', show: { layer: 'Car 1', solo: true, region: [80, 104, 96, 72] } },
    { title: 'Shadows are live.', text: 'Pixel art cannot cast a live shadow, so each part has a plain box on Shadow shapes, a layer at 0 opacity. Move a box with Select object and its shadow follows.', show: { tool: 'pick', layer: 'Shadow shapes' } },
    { title: 'Back to front.', text: 'Layers go from the far corner to the near one, so what stands nearer covers what is behind it. The layer list reads like walking toward the viewer.', show: { layer: 'Tree 2' } },
    { title: 'Roads are tiles.', text: 'Road, pavement and grass came from the Tile tool, each with its own texture. The pavement has a rim on its lower edges, which is the kerb.', show: { tool: 'tile', layer: 'Ground' } }
  ]
};

/* Harbour: a quay down the left with a pier, and water everywhere else. */
const land = (i, j) => i <= 4 || (j >= 3 && j <= 5 && i <= 9);
const harbour = {
  id: 'harbour', title: 'Harbour', order: 29, palette: 'qtiles', w: 448, h: 320, tile: 32, gox: 224, goy: 28, light: 'left',
  lesson: 'Water tiles, a quay and small props make a harbour.', skills: ['composition', 'live shadows', 'tiles', 'water'],
  ground: [
    { color: '#3da5d9', tex: 'water', cells: cells((i, j) => !land(i, j), -10, 24) },
    { color: '#c9ccd6', tex: 'flat', tile: { tileRim: 'lower', tileH: 8 }, cells: cells(land, -10, 24) }
  ],
  objects: [['shed', 0, 6]],
  parts: [
    { of: 'street-lamp', name: 'Lamp', at: [4, 2], stand: [1, 1, 36] },
    { of: 'crate', name: 'Crate 1', at: [3, 7], stand: [1, 1, 14] },
    { of: 'crate', name: 'Crate 2', at: [2, 9], stand: [1, 1, 14] },
    { of: 'cat', name: 'Cat', kind: 'character', at: [2, 9], z: 9, dy: 1 },
    { of: 'barrel', name: 'Barrel 1', at: [3, 11], stand: [1, 1, 18] },
    { of: 'barrel', name: 'Barrel 2', at: [2, 12], stand: [1, 1, 18] },
    { of: 'walker', name: 'Walker', kind: 'character', at: [8, 4], stand: [1, 1, 26] },
    { of: 'sailboat', drop: 'wWV', name: 'Sailboat', at: [9, 10], stand: [4, 2, 22] }
  ],
  sprites: [
    { name: 'Small boat', outline: true, inks: { a: '#7a2e2a', b: '#b04a3a', c: '#c68a62', d: '#e8b998', e: '#8f5a3a' }, rows: ['........cc..........', '.....ccddddc........', '...ccddeeeedcc......', '.ccddeeeeeeeddcc....', 'bbcddeeeeeeeeddcc...', '.bbbccddeeeeddccbb..', '...bbbbccddddccbbba.', '.....bbbbbccccbbbaa.', '.......aabbbbbbaa...', '.........aaaaaa.....'], at: [[328, 112]] },
    { name: 'Gulls', inks: { a: '#f2f3f7', b: '#4a4e69' }, rows: ['a...a', '.aba.'], at: [[250, 52], [300, 36], [392, 190], [150, 262], [352, 262], [96, 230]] }
  ],
  tips: [
    { title: 'Look at the harbour.', text: 'Crates, barrels, the lamp and the walker are all examples from the path. Water is most of the picture and it is one tile, repeated.', show: {} },
    { title: 'This boat is the Sailboat example.', text: 'Its own patch of water is left out here, as the scene has water already. The hull sits on the tile just as it did alone.', show: { layer: 'Sailboat', solo: true } },
    { title: 'A cat on a crate.', text: 'The cat stands on the same cell as the crate, drawn 9 pixels higher and on a layer above it. Height is just a shift up the screen.', show: { layer: 'Cat', region: [116, 100, 96, 80] } },
    { title: 'A quay is a tile with a rim.', text: 'The stone tile has a rim on its lower edges, 8 pixels tall, which turns a flat floor into a wall above the water.', show: { tool: 'tile', layer: 'Ground' } },
    { title: 'Gulls are five pixels.', text: 'Small sprites scattered over open water give the picture scale and life, for almost no work. Try a few more.', show: { layer: 'Gulls' } }
  ]
};
/* The welcome's cover: an isometric corner on the left, a row of 2D pieces on the right, on a quiet ground. It is not in the catalogue. */
const corner = (i, j) => i >= 0 && i <= 6 && j >= 0 && j <= 5, lane = (i, j) => corner(i, j) && j === 5;
const cover = {
  id: 'cover', title: 'qtiles cover', order: 90, palette: 'qtiles', w: 480, h: 200, tile: 32, gox: 124, goy: 46, light: 'left', cover: true,
  lesson: 'Isometric and 2D pieces from the examples, side by side.', skills: ['composition'],
  fill: [[0, 0, 479, 199, '#c9ccd6'], [0, 164, 479, 199, '#9a9fb5']],
  ground: [
    { color: '#7bb661', tex: 'grass', tile: { tileRim: 'lower', tileH: 6 }, cells: cells((i, j) => corner(i, j) && !lane(i, j), 0, 6) },
    { color: '#c9ccd6', tex: 'flat', tile: { tileRim: 'lower', tileH: 6 }, cells: cells(lane, 0, 6) }
  ],
  objects: [['house', 0, 0]],
  parts: [
    { of: 'tree', name: 'Tree', at: [5, 1], stand: [1, 1, 34] },
    { of: 'street-lamp', name: 'Lamp', at: [4, 4], stand: [1, 1, 36] },
    { of: 'cat', name: 'Cat', kind: 'character', at: [5, 3], stand: [1, 1, 12] },
    { of: 'walker', name: 'Walker', kind: 'character', at: [2, 5], stand: [1, 1, 26] },
    { of: 'potted-plant', name: 'Potted plant', xy: [262, 164] },
    { of: 'cat-face', name: 'Cat face', xy: [296, 164] },
    { of: 'apple', name: 'Apple', xy: [338, 164] },
    { of: 'mug', name: 'Mug', xy: [362, 164] },
    { of: 'umbrella', name: 'Umbrella', xy: [388, 164] },
    { of: 'heart', name: 'Heart', xy: [428, 164] },
    { of: 'leaf', name: 'Leaf', xy: [452, 164] }
  ],
  tips: [
    { title: 'Two grids, one canvas.', text: 'The corner on the left stands on the isometric grid. The pieces on the right are 2D examples, placed on a line. Open any of them from the catalogue to see how it was made.', show: {} }
  ]
};
module.exports = [street, harbour, cover];

'use strict';
/* qtiles tips: the Tips drawer's content as data, the finishing checklist and the drawer.
   An illustration is a bundled string, so there are no image files: rows joined by /, one character per pixel, . is empty, and `c` says what each character paints.
   A tip's `link` does something in the app: `tool` selects a tool, `pop` toggles a popover, `mark` outlines a control. Links are only shown when their target exists. */

const TIP_ART = {
  line: { scale: 3, alt: 'A line stepping two pixels across for each one down', c: { a: '#3da5d9' }, rows: '......................aa/....................aa../..................aa..../................aa....../..............aa......../............aa........../..........aa............/........aa............../......aa................/....aa................../..aa..................../aa......................' },
  tile: { scale: 2, alt: 'A 32 by 16 tile', c: { a: '#3f8a4f', b: '#8cc46e' }, rows: '..............aaaa............../............aabbbbaa............/..........aabbbbbbbbaa........../........aabbbbbbbbbbbbaa......../......aabbbbbbbbbbbbbbbbaa....../....aabbbbbbbbbbbbbbbbbbbbaa..../..aabbbbbbbbbbbbbbbbbbbbbbbbaa../aabbbbbbbbbbbbbbbbbbbbbbbbbbbbaa/aabbbbbbbbbbbbbbbbbbbbbbbbbbbbaa/..aabbbbbbbbbbbbbbbbbbbbbbbbaa../....aabbbbbbbbbbbbbbbbbbbbaa..../......aabbbbbbbbbbbbbbbbaa....../........aabbbbbbbbbbbbaa......../..........aabbbbbbbbaa........../............aabbbbaa............/..............aaaa..............' },
  cube: { scale: 2, alt: 'A block with a light top, a mid left side and a dark right side', c: { a: '#f2d58a', b: '#c98f3c', c: '#7a5230' }, rows: '..........aaaa........../........aaaaaaaa......../......aaaaaaaaaaaa....../....aaaaaaaaaaaaaaaa..../..aaaaaaaaaaaaaaaaaaaa../aaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaa/bbaaaaaaaaaaaaaaaaaaaacc/bbbbaaaaaaaaaaaaaaaacccc/bbbbbbaaaaaaaaaaaacccccc/bbbbbbbbaaaaaaaacccccccc/bbbbbbbbbbaaaacccccccccc/bbbbbbbbbbbbcccccccccccc/bbbbbbbbbbbbcccccccccccc/bbbbbbbbbbbbcccccccccccc/bbbbbbbbbbbbcccccccccccc/bbbbbbbbbbbbcccccccccccc/bbbbbbbbbbbbcccccccccccc/bbbbbbbbbbbbcccccccccccc/..bbbbbbbbbbcccccccccc../....bbbbbbbbcccccccc..../......bbbbbbcccccc....../........bbbbcccc......../..........bbcc..........' },
  ramp: { scale: 3, alt: 'Five greens stepping from light to dark', c: { a: '#dcebb0', b: '#a6c46e', c: '#6a9c50', d: '#3f7a4f', e: '#24593f' }, rows: 'aaaaabbbbbcccccdddddeeeee/aaaaabbbbbcccccdddddeeeee/aaaaabbbbbcccccdddddeeeee/aaaaabbbbbcccccdddddeeeee/aaaaabbbbbcccccdddddeeeee/aaaaabbbbbcccccdddddeeeee' },
  hue: { scale: 3, alt: 'A ramp from yellow through green and teal to indigo', c: { a: '#f6e27a', b: '#9fc552', c: '#3f9a6f', d: '#2a6a80', e: '#2f3a6e' }, rows: 'aaaaabbbbbcccccdddddeeeee/aaaaabbbbbcccccdddddeeeee/aaaaabbbbbcccccdddddeeeee/aaaaabbbbbcccccdddddeeeee/aaaaabbbbbcccccdddddeeeee/aaaaabbbbbcccccdddddeeeee' },
  selout: { scale: 4, alt: 'The same shape with a black outline, then with an outline one step darker than the shape', c: { k: '#0b0b10', a: '#f2a65a', b: '#c96a3a', c: '#8a4030' }, rows: '...................../...kkkk.......bbbb.../..kaaaak.....baaaab../.kaaaaabk...baaaaabc./.kaaaabbk...baaaabbc./.kaaabbbk...baaabbbc./.kaabbbbk...baabbbbc./..kbbbbk.....bbbbbc../...kkkk.......cccc.../.....................' },
  figure: { scale: 3, alt: 'A figure standing on the center of a tile', c: { h: '#5a3624', s: '#e8b998', b: '#3da5d9', d: '#1c2541', k: '#2a1a12', g: '#7bb661' }, rows: '................/................/.......hh......./......hhhh....../......ssss....../......ssss....../......bbbb....../.....bbbbbb...../......bbbb....../......dddd....../......d..d....../......dggd....../....ggkggkgg..../..gggggggggggg../gggggggggggggggg/gggggggggggggggg/..gggggggggggg../....gggggggg..../......gggg......' },
  tree: { scale: 3, alt: 'A tree with an oval crown and a tapered trunk', c: { a: '#9fd36a', b: '#5fa24e', c: '#2f6e45', t: '#8a5a3a', u: '#5e3b28' }, rows: '.......aaaaaaa......./....aaaaaaaaaaabb..../...aaaaaaaaaabbbbb.../..aaaaaaaaaabbbbbbb../.aaaaaaaaabbbbbbbbcc./aaaaaaaaabbbbbbbbcccc/aaaaaaabbbbbbbbcccccc/aaaaaabbbbbbbbccccccc/aaaaabbbbbbbbcccccccc/aaabbbbbbbbcccccccccc/.abbbbbbbbcccccccccc./..bbbbbbccccccccccc../...bbbbccccccccccc.../....bcccccccccccc..../.......ccccccc......./.........tuu........./.........tuu........./..........tu........./..........tu........./..........tu........./..........t........../..........t........../..........t..........' },
  sizes: { scale: 3, alt: 'A canvas divided into cells, with one cell tinted and a small brush inside it', c: { k: '#3c3f4a', g: '#b9bdc9', p: '#eef0f4', t: '#c6d8fb', a: '#3574f0', b: '#2f66d6' }, rows: 'kkkkkkkkkkkkkkkkkkkkkkkkk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kgggggggggggaaaaaaagggggk/kpppppgpppppatttttapppppk/kpppppgpppppatbbttapppppk/kpppppgpppppatbbttapppppk/kpppppgpppppatttttapppppk/kpppppgpppppatttttapppppk/kgggggggggggaaaaaaagggggk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kgggggggggggggggggggggggk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kpppppgpppppgpppppgpppppk/kkkkkkkkkkkkkkkkkkkkkkkkk' },
  seam: { scale: 2, alt: 'One tile repeated three by three', c: { a: '#6fb05a', b: '#7fc06a', c: '#5a9a4e' }, rows: '......................bbbb....................../....................bbbbbbbb..................../..................bbbbbbbbbbbb................../................bbbbbbbccbbbbbbb................/..............bbbbbbbbbbbbbbbbbbbb............../............bbbbbbbbbbbbbbccbbbbbbbb............/..........bbbbbbbbbbbbbbbbbbbbbbbbbbbb........../........bbbbbbbccbbbbbbbbbbbbbbccbbbbbbb......../......bbbbbbbbbbbbbbbbaaaabbbbbbbbbbbbbbbb....../....bbbbbbbbbbbbbbccaaaaaaaabbbbbbccbbbbbbbb..../..bbbbbbbbbbbbbbbbaaaaaaaaaaaabbbbbbbbbbbbbbbb../bbbbbbbccbbbbbbbaaaaaaaccaaaaaaabbbbbbbccbbbbbbb/bbbbbbbbbbbbbbbbbbaaaaaaaaaaaabbbbbbbbbbbbbbbbbb/..bbbbbbbbccbbbbbbbbaaaaaaccbbbbbbbbbbbbbbccbb../....bbbbbbbbbbbbbbbbbbaaaabbbbbbbbbbbbbbbbbb..../......bbbbbbbbbccbbbbbbbbbbbbbbccbbbbbbbbb....../........bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb......../..........bbbbbbbbccbbbbbbbbbbbbbbccbb........../............bbbbbbbbbbbbbbbbbbbbbbbb............/..............bbbbbbbbbccbbbbbbbbb............../................bbbbbbbbbbbbbbbb................/..................bbbbbbbbccbb................../....................bbbbbbbb..................../......................bbbb......................' }
};

const TIPS = [
  { id: 'light', title: 'Light and shade', tips: [
    { id: 'light-one', title: 'One light direction', body: 'Choose left, right or overhead once, for the whole piece, in Preferences or the options of a tool that reads it. Mixed light is the quickest way to make a scene look wrong.', link: { label: 'Show the light setting', mark: '[data-light="left"]' } },
    { id: 'light-faces', title: 'Three values for a solid', body: 'The top is lightest, the lit side is mid and the shaded side is darkest. Then a block reads as a block at any size.', art: 'cube' },
    { id: 'light-ramp', title: 'Shade with ramps', body: 'Go lighter or darker by stepping along a palette ramp. Mixing in black or white makes colors flat and muddy.', art: 'ramp', link: { label: 'Open the Shade tool', tool: 'shade' } },
    { id: 'light-hue', title: 'Hue shift', body: 'Let a ramp change hue as well as value: shadows toward blue or purple, highlights toward yellow. A few colors then look like many.', art: 'hue' }
  ] },
  { id: 'work', title: 'Workflow', tips: [
    { id: 'work-block', title: 'Block first', body: 'Lay in the big shapes in flat color before any detail. Detail on a weak shape only hides the problem.' },
    { id: 'work-order', title: 'Color order', body: 'Work in this order: base color, shadow, highlight, outline. Each pass is easy to judge against the last.' },
    { id: 'work-selout', title: 'Sel-out', body: 'Selective outlining uses a color one ramp step darker than the pixels beside it, not black. The right figure here is softer but still separates from the ground.', art: 'selout', link: { label: 'Show the outline button', mark: '#outBtn' } },
    { id: 'work-nearest', title: 'Nearest-neighbor only', body: 'Flip, turn by 90 degrees or shear by 2:1. Free rotation and fractional scaling blur pixels, so qtiles does not offer them.', link: { label: 'Show the transforms', mark: '[data-transform="rot90"]' } },
    { id: 'work-big', title: 'Big scenes', body: 'Turn on Sections to split a big map into squares, finish one at a time and mark it done. Seam guard shows what lies across each edge, and the Map shows where you are.', link: { label: 'Show views and sections', mark: '#sceneSec' } },
    { id: 'work-hand', title: 'Move the view without drawing', body: 'The Hand tool, at the end of the tool rail, moves the view with the Pencil, a mouse or one finger. A selection or an item on the pen waits for you. Tap Hand again to go back.', link: { label: 'Show the Hand tool', mark: '[data-tool="hand"]' } },
    { id: 'work-guides', title: 'Height guides', body: 'Dotted lines show where an object stands and how tall it is. They turn the warning color when it overlaps something, and the status bar names what. Off, Lines or Planes, in the options of Place object and Select object.', link: { label: 'Show Height guides', tool: 'place', mark: '#heightBtn' } },
    { id: 'work-sizes', title: 'Canvas, brush, cell and tile', body: 'The canvas is the whole drawing, measured in pixels. A brush is a square of pixels. A cell is one square of the 2D grid, and a tile one diamond of the isometric grid. The size chip in the status bar shows all of them, and tapping it shows how they fit.', art: 'sizes', link: { label: 'Open Sizes', pop: 'sizesPop' } },
    { id: 'work-brush', title: 'Brush size', body: 'A brush is a square of pixels, 1 to 8 wide, whatever the grid. The pixel under the pointer is the center for odd sizes, and the upper left of the center four for even sizes. The outline on the canvas shows exactly what a press will paint.', link: { label: 'Open the Pencil', tool: 'pencil' } },
    { id: 'work-cells', title: 'Cells and snapping', body: 'In 2D the grid is made of cells. The size chip or Preferences sets their size. The cell under the pointer is tinted. With Snap on Cell the brush paints whole cells and counts in cells. On Cell corners, lines and rectangles end on the grid.', link: { label: 'Show Snap', mark: '#gridSnap' } },
    { id: 'work-aa', title: 'No anti-aliasing', body: 'Every pixel is a palette color or empty. If you import art, check that soft edges have not come along with it.', link: { label: 'Show Check art', mark: '#ckRun' } },
    { id: 'work-checks', title: 'Art checks', body: 'Check art, in the Checks section, marks stray pixels, doubled corners, uneven runs, banding, soft edges, colors off the palette, near twins and art drawn at a larger scale. They are hints, not rules: uneven runs and banding also mark hand anti-aliasing and deliberate texture, so judge each mark. Fix is offered only where the answer is clear, and is one undo step.', link: { label: 'Show Check art', mark: '#ckRun' } }
  ] },
  { id: 'char', title: 'Characters', tips: [
    { id: 'char-facing', title: 'Two facings, then mirror', body: 'Draw one figure facing the viewer and one facing away. Mirroring those gives all four directions.', link: { label: 'Show Mirror to other facing', mark: '#charMirror' } },
    { id: 'char-feet', title: 'Feet on the tile', body: 'Put the feet on the center of a tile. The figure then stands in the right place wherever it goes on a map. Set a pivot there and turn on Place on tile.', art: 'figure', link: { label: 'Open Set pivot', tool: 'pivot' } },
    { id: 'char-ghost', title: 'Trace a ghost', body: 'Make the last pose a ghost, then draw the next one over it on a new layer.', link: { label: 'Show Ghost from layer', mark: '#ghostFrom' } },
    { id: 'char-shadow', title: 'Cast shadow', body: 'A small shadow on the ground fixes a figure in place. Keep it on its own layer, so it can change without touching the art.', link: { label: 'Open the Shadow tool', tool: 'shadow' } }
  ] },
  { id: 'iso', title: 'Isometric basics', tips: [
    { id: 'iso-line', title: 'Lines are 2:1', body: 'A grid edge goes two pixels across for every one down. That is about 26.6 degrees, not 30 or 45, and it is why the steps stay even.', art: 'line', link: { label: 'Open the Line tool', tool: 'line' } },
    { id: 'iso-tiles', title: 'Tile sizes', body: 'A tile is twice as wide as it is tall: 16 x 8, 32 x 16, 64 x 32 or 128 x 64. Widths are multiples of 4, so corners land on whole pixels.', art: 'tile', link: { label: 'Show tile size', mark: '#tileSel' } },
    { id: 'iso-runs', title: 'Corner runs', body: 'Pixels along a tile edge come in runs of 2, 3 or 4. Runs of 2 are the true 2:1 line. Pick one and keep it for the whole piece. Preferences sets it.', link: { label: 'Show the tile shape', pop: 'guidePop' } },
    { id: 'iso-sizes', title: 'Canvas, brush, cell and tile', body: 'The canvas is the whole drawing, measured in pixels. A brush is a square of pixels. A cell is one square of the 2D grid, and a tile one diamond of the isometric grid. The size chip in the status bar shows all of them, and tapping it shows how they fit.', art: 'sizes', link: { label: 'Open Sizes', pop: 'sizesPop' } }
  ] },
  { id: 'scene', title: 'Tiles and scenes', tips: [
    { id: 'scene-seam', title: 'The 3 x 3 seam test', body: 'Repeat a tile three by three and look for lines or a pattern that jumps out. Fix those before you lay it across a map.', art: 'seam', link: { label: 'Show seam preview', pop: 'seamPop' } },
    { id: 'scene-variants', title: 'Two or three variants', body: 'One tile repeated looks like wallpaper. Two or three versions that share a border break it up and still join.', link: { label: 'Open the Tile tool', tool: 'tile' } },
    { id: 'scene-trees', title: 'Trees', body: 'Build a crown from ovals about 3 wide to 2 tall, on a trunk that narrows as it rises. Place object has a Tree shape that starts this way.', art: 'tree', link: { label: 'Open Place object', tool: 'place' } },
    { id: 'scene-stairs', title: 'Stairs and ramps keep 2:1', body: 'A stair or ramp still follows the grid at its edges. Keep its sides on the 2:1 line, however steep it climbs.', link: { label: 'Open Place object', tool: 'place' } },
    { id: 'scene-large', title: 'Large maps in sections', body: 'Build a big map one section at a time and take care where sections meet. Check a seam at full zoom before moving on.' },
    { id: 'scene-hard', title: 'Water and trees are hardest', body: 'Both repeat badly over a large area. Vary them, leave calm stretches, and keep small shapes away from the seams.' }
  ] }
];

const CHECKLIST = [
  { id: 'lines', text: 'Isometric lines all 2:1' },
  { id: 'light', text: 'One light direction' },
  { id: 'faces', text: 'Top, lit and shaded faces read clearly' },
  { id: 'palette', text: 'Palette under 24 colors' },
  { id: 'ramps', text: 'Shading follows ramps, with no black or white mixed in' },
  { id: 'pixels', text: 'No anti-aliasing or stray pixels' },
  { id: 'seams', text: 'Tiles pass the 3 x 3 test' },
  { id: 'feet', text: 'Characters stand with feet on tiles' },
  { id: 'shadows', text: 'Cast shadows all fall the same way' },
  { id: 'outline', text: 'Outline pass done' }
];

/* Ids this build does not know stay in the list, so opening a file from a later build and saving it loses nothing. */
const cleanChecklist = v => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string'))].slice(0, 256) : [];
const tipLinkOk = l => l.tool ? !!TOOL_NAMES[l.tool] : l.pop ? !!$(l.pop) : !!document.querySelector(l.mark);
const tipHit = (q, ...parts) => !q || parts.some(s => s.toLowerCase().includes(q));
const checkDone = () => CHECKLIST.filter(c => S.checklist.includes(c.id)).length;

function tipArt(id) {
  const a = TIP_ART[id], rows = a.rows.split('/'), cv = document.createElement('canvas'), c = cv.getContext('2d');
  cv.width = rows[0].length; cv.height = rows.length; cv.className = 'tipart'; cv.style.width = cv.width * a.scale + 'px'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', a.alt);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { c.fillStyle = a.c[ch]; c.fillRect(x, y, 1, 1); } }));
  return cv;
}
function tipRun(l) {
  if (l.tool) { chooseTool(l.tool); if (S.tool === l.tool) exMark('[data-tool="' + l.tool + '"]'); }
  if (l.pop) togglePop(l.pop, $(l.pop).hidden);
  if (l.mark) exMark(l.mark);
  if (window.matchMedia('(max-width: 860px)').matches) tipsShow(false);   // here the drawer covers what the link points at
}
function tipCard(t) {
  const el = document.createElement('article'), name = document.createElement('b'), body = document.createElement('p'); el.className = 'tip';
  name.textContent = t.title; body.textContent = t.body; el.append(name, body);
  if (t.art) el.appendChild(tipArt(t.art));
  if (t.link && tipLinkOk(t.link)) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = t.link.label; b.onclick = () => tipRun(t.link); el.appendChild(b); }
  return el;
}
function checkRow(c) {
  const row = document.createElement('label'), box = document.createElement('input'); row.className = 'tipcheck'; box.type = 'checkbox'; box.dataset.check = c.id; box.checked = S.checklist.includes(c.id);
  const text = document.createElement('span'), seen = ckTick(c.id); text.textContent = c.text; box.onchange = () => checkTick(c.id, box.checked); row.append(box, text);
  if (seen) { const s = document.createElement('span'); s.className = 'refsub cktick'; s.textContent = 'Last check: ' + seen; text.appendChild(s); }   // beside the item, but the person still ticks it
  return row;
}
/* Ticks belong to the project, so one is a change to save, but not a step of the art's history. */
function checkTick(id, on) {
  S.checklist = S.checklist.filter(x => x !== id); if (on) S.checklist.push(id);
  const read = $('checkRead'); if (read) read.textContent = checkDone() + ' of ' + CHECKLIST.length;
  setDirty(true);
}
function tipsRender() {
  const q = $('tipsSearch').value.trim().toLowerCase(), host = $('tipsBody'); host.textContent = ''; let shown = 0;
  const head = (el, text) => { const h = document.createElement('h3'); h.className = 'h'; h.textContent = text; el.appendChild(h); return h; };
  for (const sec of TIPS) {
    const list = sec.tips.filter(t => tipHit(q, sec.title, t.title, t.body)); if (!list.length) continue;
    const el = document.createElement('section'); el.className = 'sec'; el.dataset.tips = sec.id; head(el, sec.title);
    for (const t of list) el.appendChild(tipCard(t));
    host.appendChild(el); shown += list.length;
  }
  const items = CHECKLIST.filter(c => tipHit(q, 'Checklist', c.text));
  if (items.length) {
    const el = document.createElement('section'), read = document.createElement('span'); el.className = 'sec'; el.dataset.tips = 'checklist';
    const h = head(el, 'Checklist'); read.id = 'checkRead'; read.className = 'mono'; read.textContent = checkDone() + ' of ' + CHECKLIST.length; h.classList.add('row', 'between'); h.appendChild(read);
    for (const c of items) el.appendChild(checkRow(c));
    const run = document.createElement('button'); run.className = 'chip'; run.id = 'tipsCheck'; run.textContent = 'Check art'; run.onclick = ckRun; el.appendChild(run);
    host.appendChild(el); shown += items.length;
  }
  $('tipsNone').hidden = shown > 0;
}
/* A new project has its own ticks. */
function tipsSync() { if (!$('tipsDrawer').hidden) tipsRender(); }
/* The drawer sits beside the canvas with no scrim, so drawing goes on. Focus moves to the panel itself, as focusing the search box would raise the iPad's keyboard. */
function tipsShow(on) {
  const d = $('tipsDrawer'), was = !d.hidden; d.hidden = !on; $('tipsBtn').setAttribute('aria-expanded', on); press($('tipsBtn'), on);
  if (on) { tipsRender(); d.focus({ preventScroll: true }); } else if (was) $('tipsBtn').focus({ preventScroll: true });
}
function initTips() {
  $('tipsBtn').onclick = () => tipsShow($('tipsDrawer').hidden);
  $('tipsClose').onclick = () => tipsShow(false);
  $('tipsSearch').oninput = tipsRender;
}

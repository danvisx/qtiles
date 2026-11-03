# Examples

The projects in the New dialog. `index.json` is the manifest, one entry per example, and each entry names an `*.qtiles.json` project here. `embedded.js` holds all of it as text, because a page opened from disk cannot fetch; `scripts/build_artifact.py` writes it, so never edit it by hand.

## Replacing a placeholder with your own drawing

`character-placeholder` and `scene-placeholder` are stand-ins until the owner draws them.

1. Draw it in qtiles with a built-in palette, and set the light on purpose.
2. Save, and put the file here under the same file name, replacing the placeholder.
3. Update `layers` and `objects` in its `index.json` entry. The smoke test says which number is wrong.
4. Check that each tip still names a layer the drawing has, and that its region still frames the right part.
5. Run `npm test`.

The card says "Starter art, redraw it" while `author` is `claude`. Set `author` to `owner` when you replace the art, or remove it if the `id` no longer ends in `-placeholder`. Dropping that ending means renaming the file and changing the checks that name it. A few checks in the 013 block of `tests/smoke.js` describe these exact placeholders, such as the layer called Villager and where its feet are, so they change along with the drawing.

`scripts/make_examples.js` rebuilds the placeholders and `element-cottage` with the app's own tools. It leaves alone any file that holds your drawing.

## Manifest entries

`id`, `title`, `tier` (Character, Element or Scene), `summary`, `file`, `layers`, `objects`, and `tips`, 3 to 6 of them.

These are optional, and an entry without them still works:

| Field | What it is | Without it |
|-------|------------|------------|
| `category` | `scenery`, `characters`, `animals`, `transport` or `objects` | `characters` for tier Character, otherwise `scenery` |
| `size` | `tiny` (up to 32 px a side), `small` (64), `medium` (160) or `scene` | From the canvas |
| `mode` | `2d`: the entry shows when the catalogue is on 2D | `iso` |
| `order` | Place on its grid's learning path. The first five are Start here, or the first four in 2D | After every entry that has one, in manifest order |
| `lesson` | One sentence on the card | `summary` |
| `path` | A line about the path, on a Start here card only: "Next: Barrel." | None |
| `skills` | Short tags. Search reads them | None |
| `stages` | Layer names in build order. They give the tip strip its dots | No dots |
| `author` | `claude` labels the card "Starter art, redraw it", `owner` does not | `claude` if the `id` ends in `-placeholder`, otherwise `owner` |
| `box` | `[x, y, w, h]`: what the card's thumbnail crops to | The whole canvas |

A tip has a `title`, a `text` and usually a `show`, which Show me plays in this order. Every field is optional.

| Field | What it does |
|-------|--------------|
| `stage` | 1 to 5: shows that stage and labels the button "Show me: step 2". 0: shows the finished piece |
| `tool` | Selects a tool, by its id in `TOOL_NAMES`, and points at its button unless `mark` is set |
| `layer` | Selects the layer with this name |
| `solo` | With `layer`: shows that layer alone until the next tip |
| `item` | Selects the first copy of this library item on the active layer |
| `seam` | `[i, j]`: opens the tile preview on that cell |
| `region` | `[x, y, w, h]`: zooms to that part of the art |
| `mark` | A CSS selector: outlines that control for a moment, opening the side panel if needed |

## Covers

`covers.json` lists what the welcome shows at the top, in order, and the start screen's band shows one of them. Each entry names an `example` by its `id`, an optional `title` for the caption (the example's own title without it), and a `crop` of `[x, y, w, h]` in art pixels. A crop wider than it is tall pans best. `"band": false` keeps a short crop out of the start screen's band, which shows only a strip of it. Add, remove or reorder entries freely and run the build; an entry whose example is gone is skipped.

`cover` is starter art made for this: an isometric corner and a row of 2D pieces, built from `scripts/example_art/scenes.js` like the other scenes. It has `cover: true` in its entry, which keeps it out of the catalogue. To redraw it, save your own project here as `cover.qtiles.json` and remove `cover` from `scenes.js`, or the next build of the scenes replaces it.

## Adding a small example

Add `scripts/example_art/<id>.px` and run `python3 scripts/build_artifact.py`. The build sees the new or changed source, runs `scripts/make_examples.js --px`, writes `<id>.qtiles.json` here and the entry in `index.json`, and embeds them. It needs Node and jsdom, only when a source has changed. It stops with the file and line if something is wrong, and prints the pixel and color count of each example.

The manifest entry belongs to the source, so a change to it goes in the `.px` file. To remove an example, delete the source, its project and its entry.

This is a complete source, an 8-row crate. The smoke test builds it, so it stays correct. The Crate example itself is the same idea at 16 x 17.

```
# A crate one tile wide, lit from the left.
id: crate
title: Crate
category: scenery
order: 2
lesson: Three faces, one light: top, lit side, shaded side.
skills: 2:1 lines, ramp shading, outline
tile: 8
light: left
palette: Earth and stone
legend:
a = Clay 4
b = Clay 3
c = Clay 2
A = Clay 5
B = Clay 2
C = Clay 1
art:
...aa...
.aaAaaa.
bbaaaacc
bbbbaccc
BBBBCCCC
bbbbcccc
.bbbccc.
...bc...
tip: | Look at the whole crate. | Three faces and one light from the left. The stages below take it apart, so tap 1 to 5 and then Finished.
tip: 1 | Block in the shape. | One flat color for the silhouette. If this does not read as a box, no shading will save it.
tip: 3 | Step along the ramp. | The top is the lightest, the lit side a step down and the shaded side darkest. Every color is a step on one ramp, with no black or white mixed in. | shade
tip: 4 | Add the details last. | The band around the middle is one row per face, a step darker than the side it sits on.
tip: 5 | Outline with the art's own ramp. | Sel-out: each outline pixel is a step darker than the pixel beside it, so the crate sits on any background. Try it yourself with the Outline button.
```

**Header.** All of `id` (the file name), `title`, `category`, `order`, `lesson`, `skills` (comma separated), `tile` (a multiple of 4), `light` (`left`, `right` or `overhead`) and `palette` (a built-in palette's name) are needed. Optional: `mode` (`iso` by default, `2d` is below), `lock` (`true` opens with the canvas locked at its size), `outline` (`sel` by default, each outline pixel a step darker than the art beside it, or `darkest`, the end of that ramp), `facings` (1 or 2), `shadow` (`true` or `false`), `cast` (the shadow's length, 25 to 200 percent, 100 by default), `after` (letters painted after the outline, see below), `path`, `author` (`claude` unless it says `owner`), and `anchor`, the art pixel on a tile corner as `x, y`. By default that is the middle of the top row. With `facings: 2` it is worked out from the art, so the feet land on a cell center. A piece that stands in a scene and has `facings: 1` should set `anchor` so that its base is on a cell center: a scene puts the point `tile / 4` below the anchor on the center of a cell.

**Legend.** A letter, then a ramp name and step. Step 1 is the darkest. Lowercase letters are the body, and an uppercase letter is a detail.

**Art.** Rows of letters and `.` for empty, all the same width.

**Tips.** `tip: stage | title | text`, with an optional tool id after another `|`, and after that `seam i j` to open the tile preview on that cell. Leave the stage empty for the finished piece. Each example needs 3 to 5, one idea each. A tiny one can stop at 3: look, a stage, something to try. A small one needs 4 or 5.

**2D.** `mode: 2d` makes a piece for the 2D side, at cell size 1. Leave out `tile`, `facings`, `shadow` and `anchor`. The rows are the canvas, with no margin added, so a 16 x 16 piece has 16 rows of 16 and its outermost pixels stay empty for the outline; only `after` letters may touch the edge. Its entry gets `mode: 2d`, and its layers stay plain layers.

**After.** An outline fills the gaps in a dither glow and in a one pixel frame. Letters listed in `after: G H` go into stage 4 after the outline is made, so they keep their pattern and get no outline. The lamp's glow, the campfire's light and the bicycle's frame use it.

### What the build makes

A group named after the example, with these layers. Only stages 4 and 5 are on, which is the finished piece.

| Layer | What is in it |
|-------|---------------|
| `1 Block-in` | Every pixel, in the mid step of the ramp with the most pixels |
| `2 Base colors` | Every pixel, in the mid step of its own ramp |
| `3 Shading` | The lowercase pixels as drawn. Its dot shows it over stage 2, so the details are flat color and not holes |
| `4 Details` | Every pixel as drawn |
| `5 Outline` | A sel-out outline of stage 4 from the Outline button, linked to it |
| `Shadow` | With `shadow: true`: the app's cast shadow, in the project light |
| `Mirrored`, `Mirrored outline` | With `facings: 2`: a linked mirror, a whole number of tiles along |

A mirror with `shadow: true` also gets a `Mirrored shadow`. The canvas is the art plus 2 px all round, or the art alone in 2D. A shadow or mirror grows it. The entry's `box` is what shows, so a card crops to it.

## Scenes

`scripts/example_art/scenes.js` holds Street corner and Harbour as data: ground cells, library objects and a list of parts. A part names a `.px` example, its cell in `at`, and a layer `name`, so a redrawn car shows up in the street at the next build. The build also rebuilds them when this file changes.

| Part field | What it does |
|------------|--------------|
| `of` | The `.px` example to take the art from |
| `at` | `[i, j]`: the cell whose center the feet stand on |
| `name`, `kind` | The layer's name and type. One layer per part, drawn back to front |
| `stand` | `[w, d, h]`: the box that casts this part's live shadow, width and depth in half tiles, height in pixels. Without it the part casts nothing |
| `z`, `dy` | Pixels up, and pixels down, for something standing on something else |
| `drop` | Letters to leave out, such as the sailboat's own water |
| `foot` | `[x, y]`: the art pixel to put on the cell center, where the default does not suit, as on a sheet with two props |

Pixel art cannot cast a live shadow, so the boxes stand on a layer called Shadow shapes at 0 opacity: nothing shows but their shadows. Colors from another palette move to the scene's nearest color.

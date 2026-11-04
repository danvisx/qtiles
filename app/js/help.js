'use strict';
/* qtiles help: what each control is called and does, the long-press popover, rail labels, the status bar hint and the coach marks.
   There is no hover on a tablet, so nothing here depends on one. `title` stays for the mouse, and the popover reads the same words. */

const LONG_PRESS_MS = 500, LP_SLOP = 10, LABELS_KEY = 'qtiles.labels', COACH_KEY = 'qtiles.onboarded';
const COARSE = () => window.matchMedia('(pointer: coarse)').matches;
const PHONE = () => COARSE() && Math.min(screen.width, screen.height) <= 600;   // the screen, not the window, so turning the phone or splitting an iPad changes nothing

/* tool: label under the icon, what it does, what to do with it now */
const TOOL_HELP = {
  pencil: ['Pencil', 'Draws in the first color at the brush size.', 'drag to draw. Past an edge the canvas grows, unless its size is locked.'],
  eraser: ['Eraser', 'Clears pixels on the active layer at the brush size.', 'drag to erase.'],
  line: ['Line', 'Draws one straight line at the brush size, on the 2:1 stair in Iso mode.', 'drag to draw. Snap to iso angles keeps it 2:1.'],
  rect: ['Rectangle', 'Draws a rectangle outline, or a solid one with Filled on.', 'drag from corner to corner.'],
  ellipse: ['Ellipse', 'Draws an ellipse or circle with even steps, as an outline at the brush size or filled.', 'drag from corner to corner. Shift keeps a circle, Alt draws from the center.'],
  fill: ['Fill', 'Fills the connected area of one color.', 'tap an area to fill it.'],
  picker: ['Picker', 'Takes a color from the canvas.', 'tap the canvas to take that color.'],
  place: ['Place', 'Places shapes and library items as objects that stay editable, or stamps of pixel art from the Library. Dotted guides show where an object will stand and how tall it is.', 'tap to place at the size in the options, or drag a footprint.'],
  pick: ['Select', 'Selects objects to move, change or delete. Dotted guides show where they stand and how tall they are.', 'tap an object, or drag across empty canvas to select several.'],
  shade: ['Shade', 'Steps pixels lighter or darker along their palette ramp, at the brush size.', 'drag over pixels. Each moves one ramp step per stroke.'],
  dither: ['Dither', 'Paints a pattern of two colors, as a brush or a gradient.', 'drag to paint the pattern.'],
  shadow: ['Shadow', 'Draws a 2:1 ellipse on the layer\'s shadow layer.', 'drag out from the center of the footprint.'],
  tile: ['Tile', 'Stamps ground tiles, plain or textured, on the grid.', 'tap to stamp a tile, or drag to fill a rectangle of tiles.'],
  terrain: ['Terrain', 'Raises, lowers or levels the ground by tile.', 'drag over tiles. Each changes once per stroke.'],
  scatter: ['Scatter', 'Paints many objects along a stroke, or sets them along a line.', 'drag to paint. Reroll redoes the last stroke.'],
  marquee: ['Marquee', 'Selects a rectangle of pixels.', 'drag to select, drag inside to move, tap outside to deselect.'],
  wand: ['Wand', 'Selects joined pixels of exactly one color.', 'tap a color to select the area.'],
  pivot: ['Pivot', 'Marks the feet of a character layer, or moves the whole layer.', 'tap the feet. Move layer in the options drags the layer instead.'],
  hand: ['Hand', 'Moves the view with the Pencil, a mouse or a finger. Nothing is drawn. Tap again or press Esc to go back to the last tool.', 'drag to move the view. Pinch or scroll to zoom.']
};

/* selector, what it does, shortcut. The first match wins. Anything with a data-hint or a `title` that says more than its name needs no row. */
const HELP = [
  ['#projName', 'The name used for saved files.'],
  ['#saveInfo', 'Where saves go and when the last one was. Opens File.'],
  ['#fNew', 'Starts a blank canvas or an example.'], ['#fOpen', 'Opens a project file, or adds a PNG as a new layer. A JPEG, WebP or GIF becomes a reference.'], ['#fRef, #refAdd', 'Adds a photo or picture to trace or look at. It is never part of the art. Up to 3 a project.'], ['#fReopen', 'Opens the file you last worked on.'],
  ['#fSaveCopy', 'Saves to a new file and carries on there as a new project. The old file stays as it was.'], ['#fResize', 'Sets an exact canvas size.'],
  ['#fExport', 'Saves a PNG of what is shown.'], ['#fExportLayers', 'Saves one PNG per visible layer in a .zip.'], ['#fExportTiles', 'Cuts the picture into square tiles in a .zip.'],
  ['#fSprite', 'Saves an animation\'s frames in one PNG, with a .json file of where each one is.'], ['#fFrame', 'Saves this layer alone, cropped to its pixels, at a whole-number scale.'],
  ['#fAbout, #aboutBtn', 'What qtiles is, where your files live, and the credits and licenses.'], ['#aboutClose', 'Closes About.'], ['#aboutTips', 'Closes About and opens tips on pixel art.'], ['#aboutGestures', 'Lists what fingers, the Pencil and a mouse do.'],
  ['#fTipsOpen', 'opens tips on pixel art and the finishing checklist.'], ['#fPrefs, #prefsBtn', 'Labels, theme, grid and tile sizes and other settings that are rarely changed.', 'Ctrl+,'],
  ['#prefsFind', 'Filters the settings as you type.'], ['#prefsClose', 'Closes Preferences.', 'Esc'], ['[data-prefs]', 'Opens Preferences at these settings.'], ['.plink', 'Closes Preferences and outlines what reads this setting.'],
  ['#fBackup', 'Saves a dated copy of the project. It leaves the file you are working on alone.'],
  ['#fRecover', 'Lists the copies this browser keeps, to restore or discard.'],
  ['#fHistory', 'Shows how much memory undo uses, and clears it.'],
  ['#histBtn', 'Shows how much memory undo uses, and clears it.'],
  ['#histClear', 'Removes every undo step, to free memory. The art stays as it is.'],
  ['#modeIso, #modeIso2', 'The 2:1 tile grid, with object, tile, terrain and scatter tools.', 'M'],
  ['#modeFlat, #modeFlat2', 'A square grid for flat drawing. The pixels stay the same.', 'M'],
  ['#undoBtn', 'Takes back the last step. A two-finger tap does the same.', 'Ctrl+Z'],
  ['#redoBtn', 'Puts back the step you undid. A three-finger tap does the same.', 'Ctrl+Shift+Z'],
  ['#zoomOut', 'Zooms out one step. Pinching works too.', '-'],
  ['#zoomIn', 'Zooms in one step. Pinching works too.', '+'],
  ['#fitBtn', 'Fits the whole canvas in view.', '0'],
  ['#tipsBtn', 'opens tips on pixel art and the finishing checklist.'],
  ['#fileBtn', 'New, open, save, export, recovery, help and Preferences.'],
  ['#panelBtn', 'Opens the panel, on the options of the active tool. Color, layers and more are further down.'],
  ['#sbFinger', 'One finger draws instead of moving the view. Tap to change this in Preferences.'],
  ['.edge[data-shrink]:disabled', 'The canvas is no bigger than one Extend by step on this side, so nothing would be left. Lower the step in Preferences, or use Resize.'],
  ['.edge[data-shrink]', 'Takes the canvas in on this side by the Extend by step. If that cuts off art, it asks first.'],
  ['.edge', 'Grows the canvas on this side by the Extend by step.'],
  ['#shrinkGo', 'Shrinks the canvas and cuts off what this says. Undo brings it back.'], ['#shrinkNo', 'Leaves the canvas as it is.'],
  ['#fitGo', 'Grows the canvas by what is needed plus 8 px. It places nothing.'],
  ['#fitIn', 'Moves it inside the largest canvas there can be.'],
  ['[data-edge-grow="auto"]', 'Art added past the edge extends the canvas. On this device.'],
  ['[data-edge-grow="ask"]', 'Art added past the edge asks before extending the canvas. On this device.'],
  ['[data-sel="cut"]', 'Removes the selection and keeps a copy to paste.', 'Ctrl+X'],
  ['[data-sel="copy"]', 'Keeps a copy of the selection to paste.', 'Ctrl+C'],
  ['[data-sel="paste"]', 'Pastes the last copy as a selection you can move.', 'Ctrl+V'],
  ['[data-sel="delete"]', 'Clears the selected pixels.', 'Delete'],
  ['[data-sel="done"]', 'Places the moved selection.', 'Enter'],
  ['[data-sel="cancel"]', 'Puts the selection back where it was.', 'Esc'],
  ['[data-more="moreFlip"]', 'Shows the flips.'], ['[data-more="moreRotate"]', 'Shows the quarter turns.'], ['[data-more="moreProject"]', 'Shows ways to project a flat drawing onto the grid.'],
  ['[data-transform="flipH"]', 'Flips left to right.'], ['[data-transform="flipV"]', 'Flips top to bottom.'],
  ['[data-transform="rot90"]', 'Turns a quarter clockwise.'], ['[data-transform="rot180"]', 'Turns halfway round.'], ['[data-transform="rot270"]', 'Turns a quarter counterclockwise.'],
  ['[data-transform="wallL"]', 'Shears a flat drawing onto a left wall.'], ['[data-transform="wallR"]', 'Shears a flat drawing onto a right wall.'], ['[data-transform="top"]', 'Lays a flat drawing on the ground as a diamond.'],
  ['[data-transform="unwallL"]', 'Turns a left wall back into a flat drawing.'], ['[data-transform="unwallR"]', 'Turns a right wall back into a flat drawing.'],
  ['#asmDone', 'Leaves the assembly.', 'Esc'],
  ['#newClose', 'Closes this and leaves a blank canvas.', 'Esc'], ['.stcard', 'Carries on from this copy.'], ['#stReopen', 'Opens the file you last worked on. The browser may ask first.'], ['#stOpen', 'Opens a project file, or adds a PNG as a new layer.'], ['#stAll', 'Lists every copy this browser keeps.'],
  ['#wcNew', 'Goes on to New, with a 64 x 64 sprite in 2D chosen.'], ['#wcEx', 'Goes on to the examples, at Start here.'], ['#wcCont', 'Goes on to your recovery copies and last file.'],
  ['#wcTour', 'A short tour of the tools, gestures and layers.'], ['#wcOpen', 'Opens a project file, or adds a PNG as a new layer.'], ['#wcAbout', 'What qtiles is, where your files live, and the credits.'],
  ['#stBack', 'Goes back to the welcome.'], ['#cvOpen', 'Opens a copy of the example this picture comes from.'], ['.cvdot', 'Shows this picture.'],
  ['#stTabs button', 'Shows this part of the screen.'], ['#stTour', 'A short tour of the tools, gestures and layers.'], ['#stTips', 'Leaves a blank canvas and opens tips on pixel art.'], ['#stAbout', 'What qtiles is, where your files live, and the credits.'], ['#stPrefs', 'Labels, theme and other settings that are rarely changed.'], ['#stFingerPrefs', 'Opens Preferences at Input, where Finger draws is.'],
  ['#exSearch', 'Filters the examples by title, lesson and skill.'], ['#exChips .chip', 'Shows one category of examples.'], ['.excard', 'Opens a copy of this example, with its tips.'],
  ['.stagedot', 'Shows one step of how this was built. Finished shows the whole piece again. This changes nothing in the project.'],
  ['#tipShow', 'Selects what this tip is about, or points at it.'], ['#tipBack', 'The tip before this one.'], ['#tipNext', 'The next tip.'], ['#tipOff', 'Hides example tips. Preferences turns them back on.'],
  ['#objBarEdit', 'Goes inside the assembly to change one part.'], ['#objBarRaise, #objRaise', 'Moves up one level.', 'Page Up or ]'], ['#objBarLower, #objLower', 'Moves down one level.', 'Page Down or ['], ['#objBarLand, #objLand', 'Drops onto whatever is below.', 'End'], ['#objBarDel, #objDel', 'Deletes what is selected.', 'Delete'],
  ['[data-align]', 'Lines up the selected objects along this edge, on the tile grid.'],
  ['[data-spread]', 'Spaces the selected objects along this grid axis.'],
  ['#asmTurnL', 'Turns the group a quarter turn about its back corner.'], ['#asmTurnR', 'Turns the group a quarter turn about its back corner.'], ['#asmFlip', 'Mirrors the group.'],
  ['#libSave', 'Keeps a copy of the selection in this project\'s library.'],
  ['#objRamp, #placeRamp', 'The palette ramp this object is shaded from.'],
  ['[data-obj-outline], [data-opt^="objOutline"]', 'The outline around the object: none, the ramp\'s darkest color, or one step darker than the pixels beside it.'],
  ['[data-obj^="i:"], #obj_i', 'Position along the down-right axis, in half tiles.'], ['[data-obj^="j:"], #obj_j', 'Position along the down-left axis, in half tiles.'],
  ['[data-obj^="u:"], #obj_u', 'How far along its parent.'], ['[data-obj^="v:"], #obj_v', 'How far up its parent.'], ['[data-obj^="w:"], #obj_w', 'Width in half tiles.'], ['[data-obj^="d:"], #obj_d', 'Depth in half tiles.'],
  ['#objGap', 'Half tiles between objects. Left empty, the space is shared out evenly.'],
  ['[data-part]', 'Which faces the material goes on.'], ['[data-mat]', 'The pattern on those faces.'], ['.mats ~ .chip', 'Goes back to one ramp.'],
  ['#objTurnL, #objTurnR, #placeTurnL, #placeTurnR', 'Turns the front a quarter turn.'],
  ['#objBack', 'Draws this behind a solid it shares space with.'], ['#objForward', 'Draws this in front of a solid it shares space with.'],
  ['#objShadow, #objShadowOpt', 'Whether this object casts a live shadow.'],
  ['#objDup', 'Makes a copy beside it.', 'Ctrl+J'], ['#objBake, #lBake', 'Turns this layer\'s objects into plain pixels. They stay as they look, but stop being editable as objects.'],
  ['.curswatch.second', 'Second color, used by dither. Tap to swap it with the first.', 'X'],
  ['#curSwatch', 'The first color, used by every drawing tool.'],
  ['#colorInput', 'Opens the system color picker.'], ['#hexInput', 'Type a color as hex.'],
  ['#palSel', 'The palette for this project. Switching keeps your art as it is.'],
  ['#pal .sw', 'Makes this the first color. With Remove colors on, it removes it.'],
  ['.ramprow .sw', 'Takes this step of the ramp.'],
  ['#svBox', 'Drag to set saturation and brightness.'], ['#hueInput', 'Drag to set the hue.'],
  ['#palAdd', 'Adds the current color to the palette.'], ['#palEdit', 'Tapping a swatch then removes that color.'], ['#palTools', 'Make ramps, import and export palettes.'],
  ['#brushRow .chip, #brushN, #brushDown, #brushUp', 'Brush size sets how many pixels wide a stroke is. The pixel under the pointer is the center for odd sizes, and the upper left of the center four for even sizes. With Snap on Cell it counts whole cells instead.', '[ and ]'],
  ['#sbBrush', 'The brush size of this tool, and with Snap on Cell the pixels it covers. Tap to go to the size control.', '[ and ]'],
  ['#lineSnap', 'Keeps lines on the 2:1 stair.'], ['#rectFill', 'Fills the rectangle instead of drawing its outline.'], ['#ovalFill', 'Fills the ellipse instead of drawing only its outline.'], ['#ovalCircle', 'Keeps the ellipse a circle, as Shift does.'], ['#ovalCenter', 'Draws the ellipse out from where the drag starts, as Alt does.'],
  ['#perfect', 'At brush size 1, takes out the doubled corner a quick stroke leaves, so lines stay one pixel thin. Remembered for 2D and Isometric separately.'],
  ['#fillAll', 'Fill stops at colors on any layer.'], ['#fillOne', 'Fill reads only the active layer.'],
  ['#placeTabShapes', 'Place shapes you set up yourself.'], ['#placeTabLib', 'Place ready-made items.'],
  ['#libKindStamps', 'Pixel art to place like a paste: characters, animals, things, icons and effects.'], ['#libKindObjects', 'Objects that stay editable: buildings, nature, props and vehicles.'],
  ['#stmSearch', 'Filters the stamps by name or tag.'], ['#stmCats .chip', 'Shows one category. Mine holds the stamps you saved.'], ['#stmGrid .shapecard', 'Puts this stamp on the pen as a floating selection. Drag it, then Done or Enter places it.'],
  ['#stmFaces button', 'Another drawing of the same stamp, facing another way. Flip in the selection bar mirrors it.'], ['#stmRows select', 'The palette ramp this part of the stamp is painted with. The steps keep their places along the new ramp.'],
  ['#stmShuffle', 'Picks other ramps for the stamp\'s parts. Outlines stay, and skin moves only among ramps named for skin.'], ['#stmOwn', 'Puts back the ramps the stamp came with, or the nearest ones in this palette.'],
  ['#stmKeep', 'After placing, another copy goes on the pen, for a row or a crowd. Shift with Enter or a tap does the same once.'], ['#stmDel', 'Removes your stamp from this project. Copies already placed stay.'],
  ['#kitOpen, #charKit', 'Builds a character from parts: body, head, hair, clothes and accessories, in four templates. It lands on a new Character layer.'],
  ['#kitFrom', 'Loads a preset kept in this project, or one of the cast, to change from there.'], ['#kitTpls button', 'The size and view the character is drawn for. Parts that exist in both carry over.'],
  ['#kitShuffle', 'Picks other parts and colors at random, from the next seed. A slot or the colors with Keep on stay as they are.'], ['#kitUndo', 'Goes back to the character before the last shuffle or preset.'],
  ['#kitSeed', 'The number the shuffle starts from. The same seed gives the same character on the same palette.'], ['#kitOut button', 'None, a dark line around the character, or sel-out: each edge two steps darker than the color inside it.'],
  ['#kitKeepColors', 'Shuffle leaves the colors alone.'], ['[data-lock]', 'Shuffle leaves this slot alone.'], ['#kitColors select', 'The palette ramp this part of the character is painted with.'], ['#kitOwn', 'Puts back the colors the character started with, or the nearest ramps on this palette.'],
  ['#kitSlots .shapecard', 'Wears this part. A part greyed out cannot be worn with one already chosen.'], ['#kitName', 'The name for the layer, the stamp or the preset. Empty, it is made from the hair and top.'],
  ['#kitAdd', 'Adds the character on a new Character layer at the middle of the view, its pivot on the feet, with its other view on a second layer. One undo step.'],
  ['#kitStampBtn', 'Keeps the character as a stamp in this project, under Mine and Characters, with its colors still changeable.'], ['#kitPreset', 'Keeps the choices in this project, to build the character again or vary it. A preset of the same name is replaced.'],
  ['[data-sel="stamp"]', 'Keeps the selected pixels as a stamp in this project, under Mine, to place again and recolor.'], ['#stmSaveOk', 'Saves the stamp.'],
  ['#libSearch', 'Filters the library by name.'], ['#libCats .chip', 'Shows one category.'], ['#libGrid .shapecard', 'Puts this item on the pen. Then tap the canvas.'],
  ['#libTurnL', 'Turns the item a quarter turn before placing.'], ['#libTurnR', 'Turns the item a quarter turn before placing.', 'R'], ['#libMirror', 'Mirrors the item before placing.', 'M'],
  ['#libDel', 'Removes your item from this project\'s library. Placed copies stay.'], ['#libExport', 'Saves your items to a .qtiles-lib.json file.'], ['#libImport', 'Adds items from a .qtiles-lib.json file.'],
  ['#shapeCards .shapecard:not([data-hint])', 'The shape to place.'],
  ['#objW', 'Width in half tiles.'], ['#objD', 'Depth in half tiles.'], ['#objH', 'Height in pixels.'],
  ['[data-step^="objW"]', 'Width in half tiles.'], ['[data-step^="objD"]', 'Depth in half tiles.'], ['[data-step^="objH"]', 'Height in pixels.'],
  ['[data-sc-mode="paint"]', 'Paint objects along a stroke.'], ['[data-sc-mode="erase"]', 'Remove objects along a stroke.'], ['[data-sc-mode="path"]', 'Set objects along a straight line.'],
  ['#scAdd', 'Adds an item to what gets scattered.'], ['#scList .chip', 'Tap to take this out of what gets scattered.'],
  ['#scSpacing', 'Tiles between items.'], ['#scJitter', 'How far each item strays from its mark.'], ['#scSize', 'How many sizes above the base an item can be.'], ['#scDensity', 'Share of marks that get an item.'],
  ['#scTurn', 'Gives each item a random facing.'], ['#scAvoid', 'Skips a mark that would overlap an object.'], ['#scReroll', 'Redoes your last stroke with a new seed.'], ['#scBrush', 'How far Erase reaches from the stroke, in tiles.'],
  ['#dragMove', 'Dragging moves objects across the surface.'], ['#dragHeight', 'Dragging moves objects straight up and down, by levels.'],
  ['[data-ter-mode="raise"]', 'Each tile goes up.'], ['[data-ter-mode="lower"]', 'Each tile goes down.'], ['[data-ter-mode="level"]', 'Tiles take the height you started on.'],
  ['[data-ter-brush]', 'How many tiles wide a terrain stroke is. This is not the brush size.'], ['[data-ter-side="dirt"]', 'Terrain walls in dirt.'], ['[data-ter-side="stone"]', 'Terrain walls in stone.'],
  ['#wandAll', 'The wand reads what you see.'], ['#wandOne', 'The wand reads only the active layer.'],
  ['#shadeDark', 'Steps pixels darker.'], ['#shadeLight', 'Steps pixels lighter.'],
  ['[data-opt^="shadowEdge"]', 'A hard edge, or a checker pattern at the edge.'],
  ['#tileTex', 'What fills a tile: a flat color or a texture.'], ['#tileVariants', 'How many versions of the texture to mix.'], ['#tileRandom', 'Each tile picks a version. Off, every tile uses the one you pick.'], ['#tileVar', 'The version to stamp.'],
  ['#tileSeed', 'The same seed and tile give the same version.'], ['#tileReroll', 'Picks a new seed.'],
  ['[data-opt^="tileRim"]', 'A darker line along the tile\'s edges.'], ['#tileH', 'Gives a tile walls this many pixels tall.'], ['.seamBtn', 'Repeats a tile 3 x 3 so that seams show.'],
  ['#ditherBrush', 'Paint the pattern at the brush size.'], ['#ditherGrad', 'Fade between the two colors across an area.'], ['#ditherPat', 'The pattern to paint.'], ['#ditherLevel', 'How much of the first color the pattern has.'],
  ['#offSecond', 'The gaps take the second color.'], ['#offClear', 'The gaps stay as they are.'],
  ['[data-light]', 'Where the light comes from, for the whole project.'],
  ['[data-sel="duplicate"]', 'Copies the selection in place, to move. Alt-drag does the same.', 'Ctrl+J'],
  ['[data-sel="all"]', 'Selects the whole canvas.', 'Ctrl+A'], ['[data-sel="none"]', 'Clears the selection.', 'Ctrl+D'], ['[data-sel="invert"]', 'Selects everything that is not selected.', 'Ctrl+I'],
  ['[data-selop="set"]', 'A new selection replaces the old one.'], ['[data-selop="add"]', 'A new selection adds to the old one.'], ['[data-selop="sub"]', 'A new selection cuts from the old one.'],
  ['#mirrorX', 'Repeats strokes across a vertical line.', 'S'], ['#mirrorY', 'Repeats strokes across a horizontal line.'],
  ['#axisPlace', 'Tap the canvas to set where the mirror line goes.'], ['#axisCenter', 'Moves the mirror line to the middle of the canvas.'], ['#axisSnap', 'Keeps the mirror line on tile corners.'],
  ['.lgrip', 'Hold, then drag to move. It takes linked layers along, and a group takes all its layers. Drop on a group to put a layer in it. Up and Down buttons do the same.'], ['.tag', 'A color to find this by in the list.'],
  ['.lgroup .lname', 'Tap to select this group, tap again to rename it.'], ['.lgroup [aria-label^="Collapse"], .lgroup [aria-label^="Expand"]', 'Hides or shows this group\'s layers in the list.'],
  ['.lgroup [aria-label^="Hide"], .lgroup [aria-label^="Show "]:not([aria-label^="Show only"])', 'Shows or hides the whole group. Each layer keeps its own setting.'], ['.lgroup [aria-label^="Lock"], .lgroup [aria-label^="Unlock"]', 'Nothing in a locked group can be changed. Each layer keeps its own lock.'], ['.lgroup [aria-label*="only"], .lgroup [aria-label^="Stop"]', 'Hides everything outside this group while you look at it.'],
  ['#lPick', 'While on, tapping a layer name selects it for grouping. With a mouse, Ctrl-click or Shift-click does the same.'], ['#lGroup', 'Puts the selected layers in a new group, or the active layer if none is selected. New layers then go in the group while one of its layers is active.'],
  ['#gOpacity', 'How see-through the whole group is. It multiplies each layer\'s opacity.'], ['#gUp', 'Moves the whole group up one place.'], ['#gDown', 'Moves the whole group down one place.'], ['#gUngroup', 'Removes the group and keeps its layers where they are.'], ['#gMerge', 'Flattens the group into one layer, as it looks now.'],
  ['.layer .lname', 'Tap to select this layer, tap again to rename it.'], ['.lname-in', 'Type a new name.'], ['.lkind[data-kind="ghost"]', 'This layer is the tracing ghost. Tap to clear it and draw on it again.'], ['.lkind', 'What this layer holds. Tap to change it.'],
  ['.layer [aria-label^="Hide"], .layer [aria-label^="Show "]', 'Shows or hides this layer.'], ['.layer [aria-label^="Lock"], .layer [aria-label^="Unlock"]', 'A locked layer cannot be changed.'], ['.layer [aria-label*="only"], .layer [aria-label^="Stop"]', 'Hides every other layer while you look at this one.'],
  ['#layerOpacity', 'How see-through this layer is.'],
  ['#lAdd', 'Adds an empty layer above this one.'], ['#lDup', 'Adds a copy of this layer.'], ['#lUp', 'Moves this layer up one place.'], ['#lDown', 'Moves this layer down one place.'], ['#lMerge', 'Joins this layer into the one below.'], ['#lDel', 'Deletes this layer.'],
  ['#lObj', 'Adds a layer for objects, which stay editable.'], ['#lShadowOp', 'How strong this layer\'s live shadows are.'],
  ['#castLen', 'How long a cast shadow runs.'], ['#castBtn', 'Bakes this layer\'s shadow once, following the light.'],
  ['[data-opt^="outN"]', 'Whether the outline fills corners.'], ['[data-opt^="outSide"]', 'Whether the outline sits around the art or inside its edge.'], ['#outColor', 'What color the outline takes.'], ['[data-opt^="outSteps"]', 'How many ramp steps darker the outline is.'],
  ['#outBtn', 'Writes an outline to a linked layer.'], ['#outMerge', 'Joins the outline into the layer it came from.'],
  ['#pivotSet', 'Dragging puts the pivot of this character layer where you let go.'], ['#pivotMove', 'Dragging moves all of this layer and its pivot.'],
  ['#charSet', 'Picks the Set pivot tool. Then tap the character\'s feet.', 'P'], ['#charSnap', 'Moves the pivot to the center of the tile under it. The art stays put.'], ['#charTile', 'While on, moving this layer lands its pivot on the center of a tile.'],
  ['#charMirror', 'Copies this layer, flipped left to right around its pivot, and links the copy to it.'], ['#charUpdate', 'Flips the source layer again into its linked mirror. Hand fixes on the mirror are replaced.'], ['#charBack', 'Adds a blank layer with the same type and pivot, for the view from behind.'],
  ['#ghostFrom', 'Shows this layer faintly over the others to trace. It cannot be drawn on, read or exported while it is the ghost.'], ['#ghostClear', 'Turns the ghost back into a normal layer.'], ['#charOnion', 'Shows the frames before and after the active one, tinted.'], ['#charFrame', 'Saves this layer alone, cropped to its pixels, at a whole-number scale.'],
  ['#animSel', 'The animation shown in this panel.'], ['#animNew', 'Starts an animation, with this layer as its first frame if it is a character layer.'], ['#animName', 'The name used for its sprite sheet.'],
  ['.frname', 'Shows this frame alone among its animation\'s frames and makes it the active layer.'], ['.frms', 'How long this frame stays on screen, in milliseconds.'], ['[aria-label^="Move frame"]', 'Changes the order of the frames.'], ['[aria-label^="Duplicate frame"]', 'Copies this frame\'s layer and adds the copy right after it.'], ['[aria-label^="Take frame"]', 'Takes this frame out of the animation. Its layer stays.'],
  ['#animAdd', 'Adds this character layer as the last frame.'], ['#animPlay', 'Plays the frames here with their pivots lined up. The canvas stays as it is.'], ['#animSheet', 'Saves all frames in one PNG, with a .json file of where each one is.'], ['#animDel', 'Removes this animation. Its layers stay.'],
  ['#cvResizeBtn', 'Sets an exact canvas size.'],
  ['#cvLock, #cvLock2', 'Keeps the canvas at this size. Art past the edge is cut off, and the + and − handles go. Resize still works.'], ['.toastact', 'Turns the canvas lock off, so art past the edge grows the canvas again.'],
  ['#newFlat', 'Opens the project in 2D, with square pixels and a square grid. You can switch later.'], ['#newIso', 'Opens the project on the 2:1 tile grid. You can switch later.'],
  ['#newMoreBtn', 'Shows every preset size, and a size of your own.'],
  ['.szcard', 'Chooses this size. Sprite and Character sizes start with the canvas size locked.'], ['#newW, #newH', 'Any size from 1 to 4096 px. A typed size starts unlocked.'], ['#newOk', 'Starts a new project at this size and mode.'],
  ['#cvLink', 'Keeps width and height in the canvas\'s proportions.'], ['#cvWDown, #cvHDown', 'One pixel less.'], ['#cvWUp, #cvHUp', 'One pixel more.'], ['#sprScales .chip, #frmScales .chip', 'Each pixel becomes this many pixels across.'],
  ['#extStep', 'How far the + and − handles move a canvas edge.'], ['#tileSel, #tileCustom', 'The size of the tile grid. Pixels already drawn stay put.'], ['[data-opt^="edgeRun"]', 'How the tile edge steps: runs of 2, 3 or 4 pixels.'], ['#guideBtn', 'Shows the exact shape of one tile.'],
  ['#levelH', 'The height of one level.'], ['#levelAuto', 'Sets a level to half a tile.'], ['[data-nudge]', 'Moves the grid one pixel. The art stays put.'], ['#originReset', 'Puts the grid back where it started.'],
  ['#cellSel, #cellCustom', 'The width of one cell of the square grid, in pixels. Pixels already drawn stay put.'],
  ['[data-grid^="gridShow"]', 'What the grid shows: nothing, its lines, or those and a line around every pixel at 8x and above.'], ['[data-grid^="major"]', 'A stronger line every this many cells or tiles.'],
  ['[data-grid="snap:pixel"]', 'The brush lands on any pixel.'], ['[data-grid="snap:cell"]', 'The brush paints whole cells, and its size counts cells.'], ['[data-grid="snap:corner"]', 'Lines, rectangles and ellipses start and end on cell corners.'], ['[data-grid="snap:tile"]', 'Lines and rectangles start and end on tile corners.'],
  ['.tip .chip', 'Takes you to this in the app.'], ['.tipcheck input', 'Ticks are saved with the project.'], ['#tipsSearch', 'Filters the tips as you type.'], ['#tipsClose', 'Closes the tips.', 'Esc'],
  ['#fSave', 'Saves the project file.', 'Ctrl+S'],
  ['#guideGrid', 'Lines of the grid: tiles in Iso, cells in 2D. Grid display says how much they show.'], ['#guideHover', 'Tints and outlines the tile or cell under the pointer. It needs Grid on.'], ['#rulersOn', 'Shows cell numbers along the top and left of the canvas, on canvases up to 64 cells a side. They need Grid on.'],
  ['#guideRef', 'Shows or hides every reference on the canvas for now. Each one also has its own switch in the Reference section.'], ['#guideMirror', 'Shows the dashed line that strokes mirror across. Hiding it leaves symmetry on. Symmetry turns mirroring itself on and off.'], ['#guideSec', 'Shows the lines between sections. The same switch as Sections under Views and sections.'],
  ['#heightBtn', 'Dotted lines that show where the ghost or the selected object stands and how tall it is. Off, Lines or Planes.'], ['#guideHeight', 'Shows or hides the height guides. Their level is set under Height guides in the Place object and Select object options, or in Preferences.'], ['[data-hg="off"]', 'No height guides and no placement line in the status bar.'], ['[data-hg="lines"]', 'Dotted lines at each corner, level ticks, the footprint on its surface, and drop lines to the ground under anything raised.'], ['[data-hg="planes"]', 'Lines, plus two faint walls behind the volume.'],
  ['#seamGuard', 'Near a section\'s edge, shows the 4 px across the seam on your side, so a pattern can carry on. It needs Sections on.'], ['#objFootOpt', 'Draws every object\'s footprint as a thin diamond on the ground, whatever height it stands at.'],
  ['#sizeChip', 'Canvas size, grid and brush at a glance. Tap to see how they fit together and change them.'], ['#szCv', 'The canvas, grid and brush to scale.'], ['#szResize', 'Sets an exact canvas size.'],
  ['#szBrushDown, #szBrushUp, #szBrushN', 'How many pixels wide the brush is, or how many cells with Snap on Cell.', '[ and ]'], ['#szGridDown, #szGridUp, #szGridN', 'The size of one cell or tile. Pixels already drawn stay put.'], ['#sizesPop [data-pop-close]', 'Closes the sizes.', 'Esc'],
  ['#miniBtn, #miniOpt, #miniClose', 'Shows or hides the map of the whole canvas.'],
  ['#miniWhole', 'The map shows the whole canvas, with a rectangle for the view. Tap to jump there, or drag the rectangle.'], ['#miniFollow', 'The map shows the art at its real size around the pointer, or the whole design when it fits, so you can watch it at 1x while you draw zoomed in. A tap moves the view there.'],
  ['[data-mscale]', 'How many screen pixels each art pixel takes in Follow.'], ['#miniGrip', 'Drag to make the map larger or smaller, up to twice its size.'],
  ['[data-view="flip"]', 'Shows the canvas mirrored left to right, to catch lopsided shapes. Drawing lands where you point on the mirrored picture. The art itself is not flipped.', 'K'],
  ['[data-view="gray"]', 'Shows the art in gray by its lightness (Rec. 709), to check that the values read. The palette stays in color, and the art is unchanged.', 'Y'],
  ['[data-view="sil"]', 'Fills every painted pixel with one color, to check that the shape reads on its own. The art is unchanged.', 'J'],
  ['#ckLayer', 'Checks the active layer.'], ['#ckShown', 'Checks every shown layer together, as it looks. Fix is not offered, as it would change one layer only.'], ['#ckSel', 'Checks the active layer inside the selection.'],
  ['#ckRun', 'Scans for stray pixels, doubled corners, uneven runs, banding, soft edges, colors off the palette, near twins and art drawn big, and lists what it finds. A big canvas shows progress and can be canceled.'],
  ['#ckPrev, #ckNext', 'Moves the view to the previous or next mark of this kind, at 8x or closer.'], ['#ckFix', 'Fixes every mark of this kind, after you confirm, as one undo step.'],
  ['#ckYes', 'Changes the marked pixels, as one undo step.'], ['#ckNo', 'Leaves the pixels as they are.'], ['#ckUnhide', 'Shows the kinds of check you ignored again.'],
  ['#ckTip, #tipsCheck', 'Opens the tip on what the checks find and what they miss.'], ['#guideChecks', 'Shows the marks of the kind chosen in Checks. They are never part of the art or its exports.'],
  ['#silOne', 'Silhouette for the active layer only, to check one sprite in a scene.'],
  ['.refrow .vname', 'Chooses this reference for the controls below.'], ['.refrow [aria-label^="Hide"], .refrow [aria-label^="Show"]', 'Turns this reference off without removing it, or on again.'], ['.refrow [aria-label^="Lock"], .refrow [aria-label^="Unlock"]', 'A locked reference cannot be moved, scaled or turned by accident.'], ['.refrow [aria-label^="Remove"]', 'Takes this reference out of the project. The toast can bring it back.'],
  ['#refAbove', 'Draws the reference over the art, to trace it. The picker takes its color wherever it shows.'], ['#refBelow', 'Draws the reference under the art, so what you paint covers it. The picker takes its color only where the art is empty.'],
  ['#refOp', 'How strongly the reference shows, 10 to 100 percent.'], ['#refPix', 'Shows the reference as the art grid would hold it: one color per pixel of the canvas.'],
  ['#refWinOn', 'Shows the whole picture in a window of its own beside the work, with its own pan and zoom. A tap there takes its color.'], ['#refKeep', 'Saves the reference in the project file, made small enough to keep. Off, it stays for this session and its recovery copies only.'],
  ['#refAdjust', REF_HELP[1] + ' One finger moves it, two scale and turn it.', 'Esc'], ['#refFit', 'Places the whole reference on the canvas, centered and upright.'], ['#refUnturn', 'Takes away any turn and stretch, keeping its size and place.'],
  ['#refSnap', 'A color taken from a reference becomes the nearest color of the palette, by how alike they look. The exact one shows under Color.'], ['#refMakeBtn', 'Turns the reference into a new pixel layer in a few colors, as a starting point to paint over.'],
  ['#refPickedAdd', 'Adds the exact color from the photo as a loose color and uses it.'], ['#refWinFitBtn', 'Shows the whole picture again.'], ['#refWinClose', 'Closes the reference window. The reference stays.'], ['#refWinCv', 'Drag or pinch to move and zoom. A tap takes the color under it.'],
  ['#rmCanvas', 'The layer is the size of the canvas, the picture stretched to fill it.'], ['#rmShape', 'The layer keeps the picture\'s shape, at the width you give, inside the canvas.'], ['#rmW', 'Width of the new layer\'s art in pixels. The height follows the picture.'], ['#rmH', 'Height of the new layer\'s art, from the width and the picture\'s shape.'],
  ['#rmPal', 'Every pixel becomes the nearest color of the project palette.'], ['#rmPhoto', 'Chooses a few colors from the photo itself, by median cut.'], ['#rmN', 'How many colors to choose from the photo, 2 to 32.'], ['#rmDither', 'None, or an ordered Bayer pattern that mixes neighboring colors.'], ['#rmOk', 'Makes the new layer. One undo takes it away.'],
  ['#viewSave', 'Keeps this position and zoom in the project, up to 9.'], ['.vname', 'Jumps to this view.'], ['.vrow [aria-label^="Rename"]', 'Gives this view a name.'], ['.vrow [aria-label^="Delete"]', 'Removes this view. The art stays as it is.'],
  ['#secOn', 'Divides the canvas into a grid of sections, to walk a big map in order.'], ['#secSize', 'How big a section is. Marks stay with their numbers.'], ['#secDone', 'Marks the section in view as done. The map tints it.'], ['#secNote', 'A note on the section in view, saved with the project.'],
  ['#secPrev', 'Goes to the section before this one, in reading order.'], ['#secNext', 'Goes to the next section, in reading order.'], ['#secTodo', 'Goes to the next section not marked done.'], ['#secX', 'The section\'s number across.'], ['#secY', 'The section\'s number down.'], ['#secGo', 'Goes to that section and zooms to fit it.'],
  ['[data-xp-mode="image"]', 'One PNG of what is chosen below.'], ['[data-xp-mode="layers"]', 'One PNG per visible layer in a .zip, with a list of offsets.'], ['[data-xp-mode="tiles"]', 'Cuts the picture into square tiles named column_row.png, in a .zip.'],
  ['#expLayerOnly', 'Exports the active layer, not all that show.'], ['#expCrop', 'Trims away the empty space around the art.'], ['#expSel', 'Exports only the selected pixels.'],
  ['#expClear', 'Empty pixels stay transparent.'], ['#expSolid', 'Empty pixels take the second color.'], ['#expScales .chip', 'Each pixel becomes this many pixels across.'], ['#expShare', 'Picks the smallest whole scale that makes the long side at least 512 px, for posting online. It is always a PNG, which keeps every pixel sharp.'],
  ['#expTile', 'The width and height of each tile.'], ['#expOverlap', 'Each tile repeats 1 px of its neighbors, which hides seams in game engines. Stitched by tiles.json, the tiles still line up.'], ['#expSkip', 'Leaves out tiles with nothing on them. tiles.json lists the ones that are there.'],
  ['#expOk', 'Starts the export. A long one shows its progress and can be canceled.'], ['#busyStop', 'Stops this export. Nothing is saved.', 'Esc']
];

const GESTURES = [
  ['Pencil or mouse', 'Draws'],
  ['One finger', 'Pans, or draws with Finger draws on in Preferences'],
  ['Two fingers', 'Pinch to zoom, drag to pan'],
  ['Two-finger tap', 'Undo'],
  ['Three-finger tap', 'Redo'],
  ['Hold a control', 'Shows what it does'],
  ['Pencil hover or mouse', 'Tints the cell and outlines the pixels a press paints'],
  ['Finger, when it draws', 'Shows the same, with the cell number above it'],
  ['Hand tool', 'Pencil, mouse or one finger moves the view'],
  ['Size chip, in the status bar', 'Shows canvas, grid and brush. Tap to change them']
];

/* 2D has no objects, so there the tool places stamps only, and says so (setMode). */
const PLACE_HELP = { iso: TOOL_HELP.place, flat: ['Place', 'Places stamps: small pixel art that lands as plain pixels on the active layer, to edit like anything drawn.', 'tap a stamp in the panel, drag it into place, then Enter or Done.'] };

/* A trailing "(Ctrl+Z)" in an aria-label or title is the shortcut. */
const splitKey = s => { const m = /^(.*\S)\s*\(([^()]+)\)\.?$/.exec(s || ''); return m ? [m[1], m[2]] : [s || '', '']; };
/* The first words in an element: a label's text comes before its control, whose own text (a select's options) must not count. */
function firstText(el) {
  for (const n of el.childNodes) {
    if (n.nodeType === 3 && n.textContent.trim()) return n.textContent.trim();
    if (n.nodeType === 1 && !n.matches('select, input, textarea')) { const t = firstText(n); if (t) return t; }
  }
  return '';
}
const toolKey = t => Object.keys(KEYS).find(k => KEYS[k] === t).toUpperCase();
const HELP_SEL = 'button, input:not([type="file"]), select, textarea, label, [data-hint], [role="slider"], .curswatch';
function helpFor(el) {
  const c = el.matches('label') && el.querySelector('input, select, textarea') || el, [aria, ariaKey] = splitKey(c.getAttribute('aria-label')), [title, titleKey] = splitKey(c.title);
  const tool = c.dataset.tool && TOOL_HELP[c.dataset.tool], row = HELP.find(h => c.matches(h[0])), wrap = c.closest('label');
  const name = (tool && TOOL_NAMES[c.dataset.tool]) || aria || (wrap && firstText(wrap)) || firstText(c) || title;
  const up = c.parentElement && c.parentElement.closest('[data-hint]');
  const desc = (tool && tool[1]) || (row && row[1]) || c.dataset.hint || (title !== name && title) || (up && up.dataset.hint) || '';
  const key = (tool && toolKey(c.dataset.tool)) || (row && row[2]) || ariaKey || titleKey;
  return { name, key, desc };
}

/* ---------- long press ---------- */
const LP = { timer: null, x: 0, y: 0, fired: false };
function hideHelp() { $('hintPop').hidden = true; }
function showHelp(el) {
  const h = helpFor(el), p = $('hintPop'), r = el.getBoundingClientRect(), name = document.createElement('b'), head = document.createElement('div'); p.textContent = ''; head.className = 'row between'; name.textContent = h.name; head.appendChild(name);
  if (h.key) { const k = document.createElement('kbd'); k.className = 'mono'; k.textContent = h.key; head.appendChild(k); }
  p.appendChild(head);
  if (h.desc) { const d = document.createElement('div'); d.textContent = h.desc; p.appendChild(d); }
  p.hidden = false;
  const room = r.top - p.offsetHeight - 8;
  p.style.left = Math.max(16, Math.min(window.innerWidth - p.offsetWidth - 16, r.left)) + 'px'; p.style.top = (room >= 8 ? room : Math.min(r.bottom + 8, window.innerHeight - p.offsetHeight - 8)) + 'px';
}
function lpCancel() { clearTimeout(LP.timer); LP.timer = null; }
function lpDown(e) {
  LP.fired = false; lpCancel(); hideHelp();
  if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;   // a slow mouse click is still a click, and a mouse has title
  const hit = (document.elementFromPoint && document.elementFromPoint(e.clientX, e.clientY)) || e.target, el = hit.closest && hit.closest(HELP_SEL); if (!el || el.matches('.lgrip')) return;   // a disabled button is not always the target, and it needs naming too
  LP.x = e.clientX; LP.y = e.clientY;
  LP.timer = setTimeout(() => { LP.timer = null; LP.fired = true; showHelp(el); }, LONG_PRESS_MS);
}
function lpMove(e) { if (LP.timer && Math.hypot(e.clientX - LP.x, e.clientY - LP.y) > LP_SLOP) lpCancel(); }
/* Holding Delete to learn what it does must not delete anything. */
function lpClick(e) { if (LP.fired) { LP.fired = false; e.preventDefault(); e.stopPropagation(); } }
/* Chromium on Android turns a long press into a context menu. */
function lpMenu(e) { if (LP.timer || LP.fired) e.preventDefault(); }

/* ---------- labels and the status hint ---------- */
function setLabels(on) { $('tools').classList.toggle('labels', on); }
function labelsStart() {
  const saved = prefGet('labels'); setLabels(saved === null ? COARSE() : saved);
}
function syncToolHelp() { $('sbTool').textContent = (RF.adjust ? 'Adjust reference' : TOOL_NAMES[S.tool]) + ':'; $('sbHint').textContent = (RF.adjust ? REF_HELP : TOOL_HELP[S.tool])[2]; }
function syncFinger() { $('sbFinger').hidden = !S.fingerDraws; }
/* A phone has no Pencil, so there a finger draws until someone chooses otherwise. */
function fingerStart() { const saved = prefGet('fingers'); S.fingerDraws = saved === null ? PHONE() : saved; syncFinger(); }

/* ---------- coach marks ---------- */
const COACH = [
  { target: 'tools', title: 'Tools', also: ['fileBtn', 'saveBtn'], text: 'Pick a tool here. Hold any button to read what it does. File, at the top left, opens and exports, and Save is beside it. Preferences, under File, shows or hides the tool names.' },
  { target: 'stage', title: 'On the canvas', text: 'What your hands and the Pencil do here:', legend: true },
  { target: 'layersSec', title: 'Layers', text: 'Keep ground, props and characters on separate layers. Each row can hide, lock or show one layer alone.', panel: true }
];
const CO = { step: -1, seen: false, opened: false, scroll: 0, el: null, timer: null };
function coachSeen() { return CO.seen || prefGet('onboarded'); }
function legendFill(host) {
  host.textContent = '';
  for (const [a, b] of GESTURES) { const t = document.createElement('dt'), d = document.createElement('dd'); t.textContent = a; d.textContent = b; host.append(t, d); }
}
function sidePanel(on) { $('side').classList.toggle('open', on); $('panelBtn').setAttribute('aria-expanded', on); }
function coachPlace() {
  if (CO.step < 0) return;
  const c = $('coach'), r = CO.el.getBoundingClientRect(), w = c.offsetWidth, h = c.offsetHeight, m = 16, W = window.innerWidth, H = window.innerHeight; let x, y;
  if (CO.step === 1) { x = r.left + (r.width - w) / 2; y = r.top + 16; }   // the canvas itself: inside it, at the top
  else if (r.right + 8 + w <= W - m) { x = r.right + 8; y = r.top + 8; }
  else if (r.left - 8 - w >= m) { x = r.left - 8 - w; y = r.top + 8; }
  else { x = m; y = H - h - m - 36; }   // no room beside it on a phone: low down, clear of the status bar
  c.style.left = Math.max(m, Math.min(W - w - m, x)) + 'px'; c.style.top = Math.max(8, Math.min(H - h - 8, y)) + 'px';
}
function coachUnmark() { document.querySelectorAll('.coachalso').forEach(e => e.classList.remove('coachalso')); if (CO.el) CO.el.classList.remove('coachmark'); }
function coachGo(k) {
  const s = COACH[k], side = $('side'); CO.step = k;
  coachUnmark();
  CO.el = $(s.target); CO.el.classList.add('coachmark');
  for (const id of s.also || []) $(id).classList.add('coachalso');
  if (s.panel) {
    CO.scroll = side.scrollTop;
    if (getComputedStyle(side).visibility === 'hidden') { sidePanel(true); CO.opened = true; }
    panelReveal(CO.el);
    if (CO.el.scrollIntoView) CO.el.scrollIntoView({ block: 'start' });
  }
  $('coachTitle').textContent = s.title; $('coachText').textContent = s.text; $('coachCount').textContent = (k + 1) + ' of ' + COACH.length;
  $('coachLegend').hidden = !s.legend; $('coachNext').textContent = k === COACH.length - 1 ? 'Done' : 'Next'; $('coach').hidden = false;
  coachPlace(); clearTimeout(CO.timer); CO.timer = setTimeout(coachPlace, 220);   // the side panel slides in
}
function coachEnd() {
  if (CO.step < 0) return;
  const side = $('side'); CO.step = -1; CO.seen = true; $('coach').hidden = true; clearTimeout(CO.timer);
  coachUnmark(); CO.el = null;
  if (CO.opened) { sidePanel(false); CO.opened = false; }
  side.scrollTop = CO.scroll; CO.scroll = 0;
  prefSet('onboarded', true);
}
function coachStart() { coachEnd(); CO.scroll = $('side').scrollTop; coachGo(0); }
/* The tap that ends the tour reaches the canvas as usual, so nothing stands between a first-time user and drawing. A long press does not end it, because step one suggests one. */
function coachTap(e) { if (CO.step >= 0 && !LP.fired && !(e.target.closest && e.target.closest('#coach'))) coachEnd(); }

/* ---------- Esc ---------- */
/* One thing per press, top first. A sheet is left to the handler in ui.js. A press used here stops, so it cannot also drop a floating selection or an object selection. Leaving Hand comes last, for the same reason. */
function helpEscape() {
  if (xpEscape()) return true;
  if (!$('hintPop').hidden) { hideHelp(); return true; }
  if (CO.step >= 0) { coachEnd(); return true; }
  if (!$('sheetFile').hidden) { fileMenuClose(); return true; }
  if (document.querySelector('.scrim:not([hidden])')) return false;
  for (const id of ['sizesPop', 'seamPop', 'guidePop', 'heightPop', 'histPop']) if (!$(id).hidden) { togglePop(id, false); return true; }
  if (SK.side) { shrinkClose(); return true; }
  if (!$('tipsDrawer').hidden) { tipsShow(false); return true; }
  if ($('side').classList.contains('open')) { sidePanel(false); $('panelBtn').focus({ preventScroll: true }); return true; }
  if (RF.adjust) { refAdjustSet(false); return true; }
  if (S.tool === 'hand') { setTool('hand'); return true; }
  return false;
}

function initHelp() {
  document.querySelectorAll('#tools .btn').forEach(b => { const s = document.createElement('span'), t = TOOL_HELP[b.dataset.tool]; s.className = 'tlabel'; s.textContent = t ? t[0] : VIEW_WORDS[b.dataset.view] || ''; b.appendChild(s); });
  fingerStart(); syncToolHelp(); labelsStart();
  document.addEventListener('pointerdown', lpDown, true);
  document.addEventListener('pointermove', lpMove, true);
  document.addEventListener('pointerup', e => { lpCancel(); coachTap(e); }, true);
  document.addEventListener('pointercancel', lpCancel, true);
  document.addEventListener('click', lpClick, true);
  document.addEventListener('contextmenu', lpMenu, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && helpEscape()) e.stopPropagation(); }, true);
  window.addEventListener('resize', coachPlace);
  legendFill($('coachLegend')); legendFill($('gestureList'));
  $('coachNext').onclick = () => { if (CO.step < COACH.length - 1) coachGo(CO.step + 1); else coachEnd(); };
  $('coachSkip').onclick = coachEnd;
}

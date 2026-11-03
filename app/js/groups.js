'use strict';
/* qtiles layer groups. A group is a record in S.groups and the contiguous run of layers whose `group` names it; the layer order stays one flat array, so compositing, history and saving have nothing nested to walk.
   Records are immutable, like object records: an undo step holds the array it replaced. A family is a layer and everything linked to it (shadow, outline, mirror). It stays together and always shares a group. */

const LG = { marks: new Set(), pick: false, press: null, drag: null, opWas: null };   // marks are layer ids, so they outlive applyResize
const TAG_NAMES = ['None', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Gray'];
const GRIP_MS = 250, GRIP_SLOP = 4, DROP_INSIDE_PX = 36, DRAG_EDGE_PX = 32, DRAG_SCROLL_PX = 6;
const groupMembers = g => S.layers.filter(L => L.group === g.id);
const cleanTag = t => Number.isInteger(t) && t > 0 && t < TAG_NAMES.length ? t : undefined;

/* ---------- undo ---------- */
function groupState() { return { list: S.layers.slice(), of: S.layers.map(L => L.group), groups: S.groups, act: activeLayer() }; }
/* Collapsing and solo are how the panel is being looked at, not edits, so a step keeps them as they are now. */
function groupPut(st) {
  S.layers = st.list.slice(); st.list.forEach((L, k) => { L.group = st.of[k]; });
  S.groups = st.groups.map(g => { const c = S.groups.find(x => x.id === g.id); return c && (c.collapsed !== g.collapsed || c.solo !== g.solo) ? { ...g, collapsed: c.collapsed, solo: c.solo } : g; });
  const k = S.layers.indexOf(st.act); S.active = k >= 0 ? k : Math.min(S.active, S.layers.length - 1);
  hooks.layers(); requestRender();
}
function groupCommit(was, bytes) {
  const now = groupState();
  if (now.groups === was.groups && now.list.every((L, k) => L === was.list[k] && now.of[k] === was.of[k]) && now.list.length === was.list.length) return false;
  groupPut(now); pushHistory({ bytes: bytes || 64, undo: () => groupPut(was), redo: () => groupPut(now) });
  shadowTidy(); return true;
}
/* One undo step around a change of S.layers, S.groups or any layer's group. */
function groupStep(fn, bytes) { const was = groupState(); fn(); return groupCommit(was, bytes); }
function groupPatch(id, patch) { S.groups = S.groups.map(g => g.id === id ? { ...g, ...patch } : g); }
function groupEdit(id, patch) { return groupStep(() => groupPatch(id, patch)); }
function groupFold(g) { groupPatch(g.id, { collapsed: !g.collapsed }); hooks.layers(); setDirty(true); }
function groupSolo(g) { const on = !g.solo; soloClear(); groupPatch(g.id, { solo: on }); hooks.layers(); requestRender(); }
function tagLayer(L, v) {
  const id = L.id, was = L.tag, put = t => { const x = layerById(id); if (x) x.tag = t; hooks.layers(); };
  if (was === v) return; put(v); pushHistory({ bytes: 16, undo: () => put(was), redo: () => put(v) });
}

/* ---------- order ---------- */
/* A place between two layers of one family, or inside a group the moving layers are not joining, would split it. */
const gapBad = (list, k, gid) => { const a = list[k - 1], b = list[k]; return !!a && !!b && (linkRoot(a) === linkRoot(b) || (!!a.group && a.group === b.group && a.group !== gid)); };
function gapNear(list, k, gid) {
  for (let d = 0; d <= list.length; d++) for (const n of [k + d, k - d]) if (n >= 0 && n <= list.length && !gapBad(list, n, gid)) return n;
  return k;
}
/* `at` is a place in S.layers as it stands, counted before the moving layers come out. */
function layerPlace(moving, at, gid) {
  const A = activeLayer(), rest = S.layers.filter(L => !moving.includes(L)), k = gapNear(rest, S.layers.slice(0, at).filter(L => !moving.includes(L)).length, gid);
  moving.forEach(L => { L.group = gid; }); rest.splice(k, 0, ...moving); S.layers = rest; S.active = rest.indexOf(A);
}
/* The far end of the unbroken run of a family, which is what a move steps over. Older files may have a linked layer far from its source. */
function runEnd(L, dir) { const r = linkRoot(L); let e = S.layers.indexOf(L); while (S.layers[e + dir] && linkRoot(S.layers[e + dir]) === r) e += dir; return e; }
function layerBounds(list) { const at = list.map(L => S.layers.indexOf(L)); return { lo: Math.min(...at), hi: Math.max(...at) }; }
/* What one press of Move does: step over a neighbor, walk out of a group at its end, walk into an open group, or jump a closed one whole. */
function moveStep(dir) {
  const A = activeLayer(), block = family(A), gid = linkRoot(A).group, { lo, hi } = layerBounds(block), near = dir > 0 ? hi + 1 : lo, n = S.layers[dir > 0 ? hi + 1 : lo - 1];
  if (gid && (!n || n.group !== gid)) return { block, at: near, gid: undefined };
  if (!n) return null;
  const h = !gid && groupOf(n);
  if (h && !h.collapsed) return { block, at: near, gid: h.id };
  const { lo: l2, hi: h2 } = h ? layerBounds(groupMembers(h)) : { lo: runEnd(n, -1), hi: runEnd(n, 1) };
  return { block, at: dir > 0 ? h2 + 1 : l2, gid };
}
function moveLayer(dir) { const m = moveStep(dir); if (m) groupStep(() => layerPlace(m.block, m.at, m.gid)); }
function groupMoveStep(g, dir) {
  const M = groupMembers(g), { lo, hi } = layerBounds(M), n = S.layers[dir > 0 ? hi + 1 : lo - 1]; if (!n) return null;
  const h = groupOf(n), far = h ? layerBounds(groupMembers(h)) : { lo: runEnd(n, -1), hi: runEnd(n, 1) };
  return { M, at: dir > 0 ? far.hi + 1 : far.lo };
}
function groupMove(g, dir) { const m = groupMoveStep(g, dir); if (m) groupStep(() => layerPlace(m.M, m.at, g.id)); }

/* ---------- group, ungroup, merge ---------- */
function layerMark(L, ev) {
  if (!LG.pick && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) return false;
  if (ev.shiftKey) { const a = S.layers.indexOf(L), b = S.active; S.layers.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => LG.marks.add(x.id)); }
  else { if (!LG.pick && !LG.marks.size) LG.marks.add(activeLayer().id); if (!LG.marks.delete(L.id)) LG.marks.add(L.id); }
  hooks.layers(); return true;
}
function groupMark(g) {
  const ids = groupMembers(g).map(L => L.id), all = ids.every(id => LG.marks.has(id));
  ids.forEach(id => { if (all) LG.marks.delete(id); else LG.marks.add(id); }); hooks.layers();
}
function markClear() { LG.marks.clear(); LG.pick = false; }
/* Layers between the chosen ones stay where they are, so the group gathers at the topmost chosen layer. That can change what covers what, as it does in any editor that keeps groups in one run. */
function groupMake() {
  const chosen = LG.marks.size ? S.layers.filter(L => LG.marks.has(L.id)) : [activeLayer()], roots = chosen.map(linkRoot), moving = S.layers.filter(L => roots.includes(linkRoot(L)));
  let n = S.groups.length + 1; while (S.groups.some(g => g.name === 'Group ' + n)) n++;
  const g = { id: layerSeq++, name: 'Group ' + n, collapsed: false, visible: true, locked: false, opacity: 1 }, top = layerBounds(moving).hi + 1;
  markClear(); groupStep(() => { S.groups = [...S.groups, g]; layerPlace(moving, top, g.id); }); return g;
}
function ungroup(g) { groupStep(() => { groupMembers(g).forEach(L => { L.group = undefined; }); S.groups = S.groups.filter(x => x.id !== g.id); }); }
/* Refuses before the sheet opens, so nobody confirms something that then cannot happen. */
function groupMergeAsk() {
  commitFloat(); const g = groupOf(activeLayer()); if (!g) return;
  const M = groupMembers(g), on = M.filter(L => L.visible);
  if (!g.visible) { toast('This group is hidden. Show it to merge it.'); return; }
  if (g.locked || M.some(L => L.locked && !L.live)) { toast('This group has something locked. Unlock it in the Layers panel.'); return; }
  if (M.some(L => L.ghost)) { toast(GHOST_MSG); return; }
  if (!on.length) { toast('Every layer in this group is hidden.'); return; }
  const obj = on.filter(L => L.objectLayer).length, off = M.filter(L => !L.visible && !L.live).length, say = [];
  if (obj) say.push(obj + (obj > 1 ? ' object layers turn' : ' object layer turns') + ' into plain pixels and stop being editable as objects.');
  if (off) say.push(off + (off > 1 ? ' hidden layers are' : ' hidden layer is') + ' left out and removed.');
  if (!say.length) { groupMerge(g); return; }
  $('mergeNote').textContent = say.join(' '); openSheet('sheetMerge');
}
/* The result takes the group's opacity into its pixels, so it stands alone. Like Merge down, a translucent layer leaves translucent pixels: that is what keeps the look. Hidden layers do not count, as they do not show. */
function groupMerge(g) {
  const M = groupMembers(g), on = M.filter(L => L.visible), R = makeLayer(g.name), px = R.px, kinds = new Set(on.filter(L => L.kind !== 'shadow').map(L => L.kind)), piv = on.find(L => L.pivot), at = layerBounds(M).lo;
  for (const L of on) { const p = L.px, op = L.opacity * g.opacity; for (let i = 0; i < px.length; i++) { const s = p[i]; if (s >>> 24) px[i] = (px[i] === 0 && op >= 1) ? s : over(px[i], s, op); } }
  flush(R); if (kinds.size === 1) R.kind = [...kinds][0]; if (piv) { R.pivot = piv.pivot; R.onTile = piv.onTile; } R.tag = g.tag;
  objSelect(null); markClear();
  groupStep(() => { const list = S.layers.filter(L => !M.includes(L)); list.splice(at, 0, R); S.layers = list; S.active = at; S.groups = S.groups.filter(x => x.id !== g.id); }, S.w * S.h * 4);
}

/* ---------- loading ---------- */
/* Never reorders: that would change how an old file looks. A second run of a group, or a group with no record, leaves its layers ungrouped. */
function cleanGroups(raw) {
  const ids = new Set(); S.groups = [];
  for (const g of Array.isArray(raw) ? raw : []) {
    if (!g || !Number.isInteger(g.id) || ids.has(g.id)) continue;
    ids.add(g.id); S.groups.push({ id: g.id, name: String(g.name || 'Group').slice(0, 40), collapsed: !!g.collapsed, visible: g.visible !== false, locked: !!g.locked, opacity: Number.isFinite(g.opacity) ? Math.max(0, Math.min(1, g.opacity)) : 1, tag: cleanTag(g.tag) });
  }
  const ended = new Set(); let cur;
  for (const L of S.layers) {
    if (L.group !== cur) { if (cur) ended.add(cur); cur = L.group; }
    if (L.group && (ended.has(L.group) || !ids.has(L.group))) { L.group = undefined; cur = undefined; }
  }
  S.groups = S.groups.filter(g => S.layers.some(L => L.group === g.id));
}

/* ---------- dragging ---------- */
function gripBtn(label, what) {
  const b = document.createElement('button'); b.className = 'lgrip'; b.innerHTML = ICON.grip; b.setAttribute('aria-label', 'Reorder ' + label);
  b.onpointerdown = e => dragDown(e, b, what); b.oncontextmenu = e => e.preventDefault(); return b;   // Chromium on Android turns a held press into a menu
}
function dragDown(e, el, what) {
  if (e.button) return;
  const touch = e.pointerType === 'touch' || e.pointerType === 'pen', d = { el, what, x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, timer: null };
  LG.press = d; e.preventDefault(); if (el.setPointerCapture && e.pointerId !== undefined) try { el.setPointerCapture(e.pointerId); } catch (_) {}
  el.onpointermove = dragMove; el.onpointerup = dragUp; el.onpointercancel = dragAbort;
  if (touch) d.timer = setTimeout(() => { d.timer = null; if (LG.press === d) dragLift(d); }, GRIP_MS);
  else d.mouse = true;
}
function dragMove(e) {
  const d = LG.press; if (!d) return; d.px = e.clientX; d.py = e.clientY;
  const far = Math.hypot(d.px - d.x, d.py - d.y) > GRIP_SLOP;
  if (LG.drag) d.moved = d.moved || far;
  else if (far && d.mouse) dragLift(d);
  else if (far) dragForget();
  if (LG.drag) dragAim();
}
/* Row positions are read once here, and nothing rebuilds the list until the drop, so a frame of dragging does the same small work at 50 layers as at 5. */
function dropRows() {
  const box = $('layers'), b = box.getBoundingClientRect();
  return [...box.querySelectorAll('.layer, .lgroup')].map(el => {
    const r = el.getBoundingClientRect(), g = el.dataset.group ? S.groups.find(x => x.id === +el.dataset.group) : null, span = g && layerBounds(groupMembers(g));
    return { el, top: r.top - b.top, bottom: r.bottom - b.top, g, k: g ? span.hi : +el.dataset.k };
  });
}
function dragLift(d) {
  const box = $('layers'), g = d.what.name !== undefined && S.groups.includes(d.what) ? d.what : null, line = document.createElement('div'); line.className = 'ldrop'; line.hidden = true; box.appendChild(line);
  const moving = g ? groupMembers(g) : family(d.what), rows = dropRows();
  for (const r of rows) if (r.g ? r.g === g : moving.includes(S.layers[r.k])) r.el.classList.add('dragging');
  LG.drag = { rows, moving, group: g, line, target: null, hot: null, scroller: box.closest('.side') || box };
  box.classList.add('sorting'); dragAim(); dragTick();
}
function dragForget() { const d = LG.press; LG.press = null; if (!d) return; clearTimeout(d.timer); d.el.onpointermove = d.el.onpointerup = d.el.onpointercancel = null; }
/* Above and below a group row is beside the group; its middle is into it. Below a group's last open row, how far right the pointer is says which side of the group's end it means. */
function dropTarget(rows, y, x, group) {
  if (!rows.length) return null;
  let i = rows.findIndex(r => y < r.bottom); if (i < 0) i = rows.length - 1;
  const r = rows[i], h = r.bottom - r.top, into = !group && r.g && y >= r.top + h / 4 && y < r.bottom - h / 4;
  if (into) return { at: r.k + 1, gid: r.g.id, row: r };
  const gap = y < r.top + h / 2 ? i : i + 1, up = rows[gap - 1], dn = rows[gap], layerOf = q => S.layers[q.k];
  const a = up && (up.g ? (up.g.collapsed ? undefined : up.g.id) : layerOf(up).group), b = dn && !dn.g ? layerOf(dn).group : undefined;
  const gid = group ? group.id : a && (a === b || x > DROP_INSIDE_PX) ? a : undefined;
  return { at: dn ? dn.k + 1 : 0, gid, y: dn ? dn.top : rows[rows.length - 1].bottom, inside: !!gid && !group };
}
function dragAim() {
  const D = LG.drag, d = LG.press; if (!D || !d) return;
  const b = $('layers').getBoundingClientRect(), t = D.target = dropTarget(D.rows, d.py - b.top, d.px - b.left, D.group), hot = t && t.row ? t.row.el : null;
  if (hot !== D.hot) { if (D.hot) D.hot.classList.remove('drop'); if (hot) hot.classList.add('drop'); D.hot = hot; }
  D.line.hidden = !t || !!t.row; if (t && !t.row) { D.line.style.transform = 'translateY(' + t.y + 'px)'; D.line.classList.toggle('inside', t.inside); }
}
/* A held Pencil sends no events, so scrolling near the panel's edge runs on frames. */
function dragTick() {
  const D = LG.drag, d = LG.press; if (!D || !d) return;
  const s = D.scroller.getBoundingClientRect(), top = s.top + (D.scroller === $('side') ? $('secBar').offsetHeight + panelOf('layers').head.offsetHeight : 0), v = d.py < top + DRAG_EDGE_PX ? -DRAG_SCROLL_PX : d.py > s.bottom - DRAG_EDGE_PX ? DRAG_SCROLL_PX : 0;
  if (v) { D.scroller.scrollTop += v; dragAim(); }
  D.raf = requestAnimationFrame(dragTick);
}
function dragClose() {
  const D = LG.drag; LG.drag = null; if (!D) return;
  cancelAnimationFrame(D.raf); D.line.remove(); $('layers').classList.remove('sorting'); if (D.hot) D.hot.classList.remove('drop');
  D.rows.forEach(r => r.el.classList.remove('dragging'));
}
function dragDrop(moving, t) { groupStep(() => layerPlace(moving, t.at, t.gid)); }
function dragUp() {
  const D = LG.drag, d = LG.press; dragClose(); dragForget();
  if (D && d && !d.moved && !d.mouse) { showHelp(d.el); return; }   // the grip takes the long press, so this is its way to explain itself
  if (D && D.target) dragDrop(D.moving, D.target);
}
function dragAbort() { dragClose(); dragForget(); }

/* ---------- panel ---------- */
function groupRow(g, hasActive) {
  const row = document.createElement('div'); row.className = 'lgroup' + (hasActive ? ' active' : '') + (g.visible ? '' : ' off'); row.dataset.group = g.id; if (g.tag) row.dataset.tag = g.tag;
  const n = groupMembers(g), M = n.filter(L => !L.live).length, fold = iconBtn(g.collapsed ? ICON.chevR : ICON.chevD, (g.collapsed ? 'Expand ' : 'Collapse ') + g.name, () => groupFold(g));
  const nm = document.createElement('button'); nm.className = 'lname'; nm.textContent = g.name; nm.title = 'Tap to select, tap again to rename';
  if (n.every(L => LG.marks.has(L.id))) { nm.classList.add('marked'); nm.setAttribute('aria-pressed', 'true'); }
  nm.onclick = ev => {
    if (LG.pick || ev.ctrlKey || ev.metaKey) { groupMark(g); return; }
    if (!hasActive) { const top = n.filter(L => !ghostly(L)).pop(); if (top) { S.active = S.layers.indexOf(top); hooks.layers(); } return; }
    nameEdit(nm, g.name, v => groupEdit(g.id, { name: v }));
  };
  const cnt = document.createElement('span'); cnt.className = 'lcount mono'; cnt.textContent = M;
  const eye = iconBtn(g.visible ? ICON.eye : ICON.eyeOff, (g.visible ? 'Hide ' : 'Show ') + g.name, () => groupEdit(g.id, { visible: !g.visible }));
  const lk = iconBtn(g.locked ? ICON.lock : ICON.unlock, (g.locked ? 'Unlock ' : 'Lock ') + g.name, () => groupEdit(g.id, { locked: !g.locked }), g.locked);
  const so = iconBtn(ICON.solo, (g.solo ? 'Stop soloing ' : 'Show only ') + g.name, () => groupSolo(g), !!g.solo);
  row.append(gripBtn(g.name, g), fold, nm, cnt, eye, lk, so); return row;
}
function nameEdit(nm, name, done, same = hooks.layers) {
  const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'lname-in'; inp.value = name; inp.maxLength = 40;
  nm.replaceWith(inp); inp.focus(); inp.select();
  inp.onblur = () => { const v = inp.value.trim(); if (v && v !== name) done(v); else same(); }; inp.onkeydown = ev => { if (ev.key === 'Enter') inp.blur(); };
}
function tagRow(box, cur, pick) {
  box.textContent = '';
  TAG_NAMES.forEach((name, t) => {
    const b = document.createElement('button'); b.className = 'tag'; b.setAttribute('aria-label', 'Label: ' + name); b.title = name; if (t) b.dataset.tag = t;
    press(b, (cur || 0) === t); b.onclick = () => pick(t || undefined); box.appendChild(b);
  });
}
function groupSync() {
  for (const id of LG.marks) if (!layerById(id)) LG.marks.delete(id);
  const A = activeLayer(), g = groupOf(A), n = LG.marks.size;
  press($('lPick'), LG.pick); $('lGroup').textContent = n ? 'Group selected (' + n + ')' : 'Group selected';
  tagRow($('lTags'), A.tag, t => tagLayer(activeLayer(), t));
  $('gBox').hidden = !g; if (!g) return;
  $('gTitle').textContent = g.name; if (!LG.opWas) $('gOpacity').value = Math.round(g.opacity * 100);
  tagRow($('gTags'), g.tag, t => groupEdit(g.id, { tag: t }));
  $('gUp').disabled = !groupMoveStep(g, 1); $('gDown').disabled = !groupMoveStep(g, -1);
}
function initGroups() {
  const active = () => groupOf(activeLayer());
  $('lPick').onclick = () => { LG.pick = !LG.pick; if (!LG.pick) LG.marks.clear(); hooks.layers(); };
  $('lGroup').onclick = groupMake;
  $('gUngroup').onclick = () => { const g = active(); if (g) ungroup(g); };
  $('gMerge').onclick = groupMergeAsk;
  $('mergeOk').onclick = () => { const g = active(); closeSheets(); if (g) groupMerge(g); };
  $('gUp').onclick = () => { const g = active(); if (g) groupMove(g, 1); }; $('gDown').onclick = () => { const g = active(); if (g) groupMove(g, -1); };
  $('gOpacity').oninput = e => { const g = active(); if (!g) return; if (!LG.opWas) LG.opWas = groupState(); groupPatch(g.id, { opacity: e.target.value / 100 }); requestRender(); };
  $('gOpacity').onchange = () => { const was = LG.opWas; LG.opWas = null; if (was) groupCommit(was); };   // a drag of the slider is one step
}

// One jsdom page holding the built app, and the shared helpers.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const LIMIT = 150;
const DIST = process.env.QTILES_DIST || path.join(__dirname, '..', 'dist', 'qtiles.html');

async function boot() {
  const html = fs.readFileSync(DIST, 'utf8'), errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.detail || e.message || e))); vc.on('error', e => errors.push(String(e)));
  const dom = new JSDOM('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<link[^>]*>/g, '') + '</body></html>',
    { runScripts: 'dangerously', url: 'https://example.test/', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
      const noop = () => {}, ctx = new Proxy({}, { get: (t, k) => k === 'createPattern' ? () => ({ setTransform: noop }) : k === 'createImageData' || k === 'getImageData' ? (a, b) => ({ data: new Uint8ClampedArray(a * b * 4 || 4) }) : (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
      w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.toBlob = cb => cb(new w.Blob(['x'])); w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,' + 'A'.repeat(w.urlLen || 64);
      w.Element.prototype.getBoundingClientRect = () => ({ width: 800, height: 500, left: 0, top: 0, right: 800, bottom: 500 });
      w.ResizeObserver = class { observe() {} }; w.matchMedia = () => ({ matches: false, addEventListener() {} });
      // jsdom has no streams, so gzipped examples decode through zlib here. Saving stays raw.
      w.DecompressionStream = class {}; w.Blob.prototype.stream = function () { return { pipeThrough: () => this }; };
      w.Response = class { constructor(b) { this.b = b; } async arrayBuffer() { const buf = await new Promise(r => { const f = new w.FileReader(); f.onload = () => r(f.result); f.readAsArrayBuffer(this.b); }), z = zlib.gunzipSync(Buffer.from(buf)); return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength); } };
    } });
  const w = dom.window, ev = s => w.eval(s), wait = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => w.document.getElementById(id);

  const t = { w, ev, wait, $, errors, passed: 0, failed: 0, gz: b => zlib.gzipSync(Buffer.from(b)), gunz: b => zlib.gunzipSync(Buffer.from(b)) };
  t.check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (ok) t.passed++; else { t.failed++; process.exitCode = 1; } };
    t.every = (name, items, fn) => { let bad; for (const x of items) { let ok = false; try { ok = fn(x); } catch (e) { ok = false; } if (!ok) { bad = x; break; } } t.check(name + (bad === undefined ? '' : ', first failing: ' + bad), bad === undefined); };

  const ptr = (type, x, y, extra) => { const e = new w.MouseEvent(type, Object.assign({ clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }, extra)); Object.defineProperty(e, 'pointerId', { value: 1 }); Object.defineProperty(e, 'pointerType', { value: 'pen' }); return e; };
  t.ptr = ptr;
  const view = () => $('view'), scr = (x, y) => [ev('S.ox') + x * ev('S.z') + ev('S.z') / 2, ev('S.oy') + y * ev('S.z') + ev('S.z') / 2];
  t.path = (pts, extra) => { const q = pts.map(p => scr(...p)), v = view(); v.dispatchEvent(ptr('pointerdown', ...q[0], extra)); q.slice(1).forEach(p => v.dispatchEvent(ptr('pointermove', ...p, extra))); v.dispatchEvent(ptr('pointerup', ...q[q.length - 1], extra)); };
  t.tap = (x, y, extra) => t.path([[x, y]], extra);
  t.drag = (x0, y0, x1, y1, extra) => t.path([[x0, y0], [x1, y1]], extra);
  t.key = (k, extra) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, extra)));

  // Slow in jsdom and fixed markup, so each is looked up once.
  const FIXED = /^(\[data-(guide|sel|selop|grid)[=\]]|\.float-only$|\.selmore$|#brushRow \.chip$)/, doc = w.document, qa = doc.querySelectorAll, q1 = doc.querySelector, found = new Map();
  const memo = (f, tag) => function (s) { if (!FIXED.test(s)) return f.call(doc, s); const k = tag + s; if (!found.has(k)) found.set(k, f.call(doc, s)); return found.get(k); };
  doc.querySelectorAll = memo(qa, 'a'); doc.querySelector = memo(q1, 'o');

  for (let k = 0; k < 500 && !ev('typeof NW !== "undefined" && NW.start'); k++) await wait(10);

  /* Helpers inside the page, J on both sides. T.doc() is everything undo must put back. */
  global.J = JSON.stringify; ev("window.J = JSON.stringify");
  ev(`window.T = {
    L: () => activeLayer(), get l0() { return S.layers[0]; }, get h0() { return T.hash(T.l0.px); }, get hL() { return T.hash(T.L().px); },
    hash(a) { let h = 7; for (let i = 0; i < a.length; i++) h = (Math.imul(h, 31) + a[i] + i) | 0; return h; },
    recs(L) { return L.objects ? J(L.objects, (k, v) => k === 'fit' ? undefined : v) : null; },
    doc() { return J({ w: S.w, h: S.h, gox: S.gox, goy: S.goy, groups: S.groups, layers: S.layers.map(L => [L.id, L.name, L.kind, L.visible, L.locked, L.opacity, L.group, L.tag, L.shadowFor, L.outlineFor, L.mirrorOf, L.pivot, L.px.length, T.hash(L.px), T.recs(L)]) }); },
    near(p) { return p.every((q, k) => !k || Math.max(Math.abs(q[0] - p[k - 1][0]), Math.abs(q[1] - p[k - 1][1])) <= 1); },
    painted(L = activeLayer()) { let n = 0; for (const v of L.px) if (v >>> 24) n++; return n; },
    fill(x0, y0, x1, y1, hex, L = activeLayer()) { beginStroke(L); rectP(x0, y0, x1, y1, true, plotLayer, packHex(hex)); endStroke(); },
    reset(w, h, mode) { closeSheets(); selectNone(); newDoc(w, h, 'test'); setMode(mode || 'iso'); Object.assign(S, { mirrorX: false, mirrorY: false, tile: 32, edgeRun: 2, level: 0, sizeLock: false, snap: 'pixel', fillAll: true }); S.gox = Math.floor(w / 2) & ~15; S.goy = 0; usePalette(PALETTES[0]); setLight('left'); setColor('#3f8a4f'); S.color2 = '#24593f'; setBrush(1); setTool('pencil'); fitView(); setDirty(false); },
    box(f) { return objNew(Object.assign({ id: objSeq++, outline: 'none', look: lookFrom('#7bb661') }, f)); },
    shape(t, f) { const g = defOf(t); return shapeFit(objNew(Object.assign({ id: objSeq++, type: t, w: g.w, d: g.d, h: g.h(), outline: 'none', look: lookNew(t) }, f)), {}); },
    fullSame() { const L = activeLayer(), a = L.px.slice(), b = L.ids.slice(); objRenderAll(L); return L.px.every((v, i) => v === a[i]) && L.ids.every((v, i) => v === b[i]); }
  };`);

  /* Undo gives back the state before, redo the state after, and it is left undone. Returns false rather than throwing. */
  const D = t.doc = () => ev('T.doc()');
  t.undoExact = (run, { steps: n = 1 } = {}) => {
    const a = D(), h = ev('H.pos'), go = (s, want) => { for (let k = 0; k < n; k++) ev(s); return D() === want; }; if (typeof run === 'function') run(); else ev(run); const b = D();
    return a !== b && ev('H.pos') === h + n && go('undo()', a) && go('redo()', b) && go('undo()', a);
  };
  t.ok = (name, f) => t.check(name, f());
  t.fn = s => ev('(() => { ' + s + ' })()');
  t.load = o => ev('(o => loadProject(JSON.parse(o)))')(J(o));
  t.saved = async () => JSON.parse(await ev('serialize().then(o => J(o))'));
  return t;
}

module.exports = { boot, LIMIT };

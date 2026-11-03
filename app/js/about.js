'use strict';

const ABOUT = {
  madeBy: { name: 'Dan V', link: 'https://danv.is/' },   // name, then an optional link
  license: '',                      // the app's own license, in words
  kofi: '',                         // the Ko-fi page's URL
  what: 'qtiles is a free pixel-art editor for still images, in 2D and isometric. It works with a mouse or an Apple Pencil and keeps your work in your own files, with no account and no server.',
  files: [
    'Your project is one .qtiles.json file that you keep where you like: on this device; it is the master copy. To continue another day, choose Open and pick the same file from the same place.',
    'Where a browser can write to a file, the first save asks where and later saves write straight back to it. Elsewhere each save makes a new file: pick the same place and replace the old one.',
    'Recovery copies are a safety net in this browser, and the browser may clear them.',
    'The app makes no network requests and has no tracking.'
  ],
  logo: { name: 'Graphic design icons created by Magnific - Flaticon', url: 'https://www.flaticon.com/free-icons/graphic-design' },
  fonts: [
    { name: 'Inter', by: 'The Inter Project Authors', license: 'SIL Open Font License 1.1', file: 'fonts/LICENSE-Inter.txt', source: 'https://github.com/rsms/inter' },
    { name: 'JetBrains Mono', by: 'The JetBrains Mono Project Authors', license: 'SIL Open Font License 1.1', file: 'fonts/LICENSE-JetBrainsMono.txt', source: 'https://github.com/JetBrains/JetBrainsMono' },
    { name: 'Momo Trust Display', by: 'The Momo Trust Project Authors', license: 'SIL Open Font License 1.1', file: 'fonts/LICENSE-MomoTrustDisplay.txt', source: 'https://fontsource.org/fonts/momo-trust-display' }
  ],
  reading: [
    { name: 'Clip Studio tips: isometric pixel art', url: 'https://tips.clip-studio.com/en-us/articles/4969' },
    { name: 'Sprite AI: isometric pixel art guide', url: 'https://www.sprite-ai.art/guides/isometric-pixel-art' },
    { name: 'Isometric NYC', url: 'https://cannoneyed.com/projects/isometric-nyc' },
    { name: 'Pixelblog 54: isometric pixel art', url: 'https://www.slynyrd.com/blog/2025/1/23/pixelblog-54-isometric-pixel-art' }
  ]
};
const ABOUT_CUP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h12v6a5 5 0 01-5 5h-2a5 5 0 01-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 010 5H17"/><path d="M9 3v3M13 3v3"/></svg>';
const AB = { from: null };

function abEl(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }
function abLink(text, url, cls) { const a = abEl('a', text, cls); a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a; }
function abList(rows) { const u = abEl('ul'); for (const r of rows) { const li = abEl('li'); li.append(...[].concat(r)); u.appendChild(li); } return u; }
function abSection(title, ...kids) { const s = abEl('section'); if (title) s.appendChild(abEl('h3', title)); s.append(...kids); return s; }
/* The one-file bundle has no fonts/ or palettes/ folder beside it. */
const abServed = () => !!document.querySelector('script[src]');
const abFile = (text, path) => abServed() ? [abLink(text, path)] : [];

function aboutCredits() {
  const made = PALETTES.filter(p => !p.credit).map(p => p.name).join(', ');
  return [
    abEl('h4', 'Logo icon'),
    abLink(ABOUT.logo.name, ABOUT.logo.url),
    abEl('h4', 'Fonts'),
    abList(ABOUT.fonts.map(f => { const l = abEl('span', '', 'aboutlinks'); l.append(...abFile('License', f.file), abLink('Source', f.source)); return [f.name + ' by ' + f.by + ', ' + f.license + '.', l]; })),
    abEl('h4', 'Palettes'),
    abList(PALETTES.filter(p => p.credit).map(p => p.credit + '.')),
    abEl('p', 'Made for qtiles: ' + made + '.'),
    abEl('h4', 'Reading behind the tips'),
    abList(ABOUT.reading.map(r => abLink(r.name, r.url)))
  ];
}
function aboutBuild() {
  const { madeBy, license, kofi } = ABOUT, host = $('aboutBody'), brand = abEl('div', '', 'aboutbrand'), last = RC.at ? ' Last copy at ' + dayTime(RC.at) + '.' : '';
  brand.append(document.querySelector('.topbar .brand').cloneNode(true), abEl('span', 'Version ' + APP_VERSION, 'mono'));
  host.textContent = ''; $('aboutVer').textContent = 'qtiles ' + APP_VERSION;
  host.append(abSection('', brand, abEl('p', ABOUT.what)));
  if (madeBy.name) host.append(abSection('Made by', madeBy.link ? abLink(madeBy.name, madeBy.link) : abEl('p', madeBy.name)));
  host.append(abSection('Your files', ...ABOUT.files.map((t, i) => abEl('p', t + (i === 2 ? last : '')))));
  host.append(abSection('Credits and licenses', ...aboutCredits()));
  if (license) host.append(abSection('License', abEl('p', license)));
  if (kofi) { const a = abLink('Support on Ko-fi', kofi, 'btn'); a.id = 'aboutKofi'; a.insertAdjacentHTML('afterbegin', ABOUT_CUP); host.append(abSection('Support', a)); }
}
/* Focus goes to the text, so arrow keys scroll it, and no field raises the iPad's keyboard. */
function aboutOpen() {
  coachEnd(); const a = document.activeElement; AB.from = a && a.closest('#sheetFile') ? $('fileBtn') : a; closeSheets();
  aboutBuild(); openSheet('sheetAbout'); $('aboutBody').scrollTop = 0; $('aboutBody').focus({ preventScroll: true });
}
function aboutClose() {
  sheetsBack();
  const f = AB.from; AB.from = null; if (f && f.isConnected && f.focus) f.focus({ preventScroll: true });
}
/* As in Preferences: a tool's shortcut must not fire behind it, and Tab stays inside. */
function aboutKey(e) {
  e.stopPropagation();
  if (e.key === 'Escape') { aboutClose(); return; }
  tabInside(e, $('aboutBox'));
}
function initAbout() {
  $('aboutBtn').onclick = $('fAbout').onclick = aboutOpen; $('aboutClose').onclick = aboutClose;
  $('aboutTips').onclick = () => { closeSheets(); tipsShow(true); };
  $('aboutGestures').onclick = () => { closeSheets(); openSheet('sheetGestures'); };
  $('aboutBox').addEventListener('keydown', aboutKey);
}

// Writes the wordmark in app/index.html: qtiles in Momo Trust Display, white, with a soft shadow. Run: node scripts/make_logo.js
// WORD is the font's own outlines from @fontsource/momo-trust-display 5.3.0, in its 1000 units with y up and set with its kerning, so this runs offline and no font file is bundled.
const fs = require('fs'), path = require('path');

const WORD = 'M283 -15Q210 -15 153 23Q96 61 64 128Q32 195 32 282Q32 371 66 440Q101 508 162 546Q222 585 301 585Q408 585 460 492L472 570H609V-180H447V57Q419 21 376 3Q334 -15 283 -15ZM325 118Q381 118 414 162Q447 205 447 280Q447 355 414 399Q381 443 325 443Q266 443 232 399Q197 355 197 280Q197 205 232 162Q266 118 325 118ZM943 0Q873 0 830 42Q788 85 788 155V440H694V570H788V720H950V570H1066V440H950V183Q950 164 962 152Q974 140 992 140H1083V0ZM1233 632Q1194 632 1168 655Q1141 678 1141 715Q1141 751 1168 774Q1194 797 1233 797Q1271 797 1298 774Q1324 751 1324 715Q1324 678 1298 655Q1271 632 1233 632ZM1152 0V570H1314V0ZM1587 0Q1517 0 1474 42Q1432 85 1432 155V750H1594V183Q1594 164 1606 152Q1618 140 1636 140H1667V0ZM2017 -15Q1930 -15 1866 22Q1802 58 1766 126Q1731 193 1731 285Q1731 377 1766 444Q1801 511 1864 548Q1928 585 2014 585Q2103 585 2166 545Q2228 505 2260 429Q2291 353 2286 246H1894Q1902 182 1936 146Q1970 110 2024 110Q2068 110 2096 132Q2124 153 2131 184H2282Q2272 122 2236 78Q2199 33 2143 9Q2087 -15 2017 -15ZM2015 461Q1966 461 1934 430Q1902 398 1894 345H2126Q2122 408 2089 434Q2056 461 2015 461ZM2592 -15Q2477 -15 2411 38Q2345 92 2345 185H2488Q2496 142 2523 122Q2550 102 2590 102Q2625 102 2648 116Q2671 130 2671 156Q2671 176 2654 186Q2636 196 2588 208Q2554 216 2528 222Q2503 229 2474 239Q2440 251 2412 268Q2383 285 2366 314Q2348 344 2348 392Q2348 446 2369 483Q2390 520 2425 542Q2460 565 2502 575Q2543 585 2583 585Q2650 585 2702 562Q2754 538 2784 496Q2814 455 2814 400H2662Q2662 430 2636 450Q2609 470 2573 470Q2548 470 2523 458Q2498 446 2498 419Q2498 401 2514 388Q2530 376 2576 363Q2593 359 2616 353Q2640 347 2663 342Q2686 336 2701 331Q2766 312 2796 273Q2825 234 2825 175Q2825 85 2764 35Q2702 -15 2592 -15Z';
const BOX = [32, -180, 2825, 797];   // of WORD: left, bottom, right, top
const FONT_PX = 22, SHADOW = { y: 1, blur: 0.75, spread: 0.5, opacity: 0.5 };   // in px at that size

const unit = 1000 / FONT_PX, [x0, y0, x1, y1] = BOX, ID = 'lgw';
// Room for the shadow, as an svg clips, then whole px each way so the word stays the same size on screen.
const pad = SHADOW.spread + SHADOW.blur * 3;
const wide = Math.ceil((x1 - x0) / unit + pad * 2), high = Math.ceil((y1 - y0) / unit + pad * 2 + SHADOW.y);
const left = x0 - pad * unit, top = -y1 - pad * unit;
const num = n => +n.toFixed(1);

// The spread is a stroke, as feMorphology rounds to whole device pixels. The blur is on the shadow alone, so the word stays sharp where a browser filters at 1 x.
const shadow = `fill:var(--logo-shadow);stroke:var(--logo-shadow);stroke-width:${num(SHADOW.spread * 2 * unit)};stroke-linejoin:round;opacity:${SHADOW.opacity}`;
const word = `<use href="#${ID}Text" style="${shadow}" transform="translate(0 ${num(SHADOW.y * unit)})" filter="url(#${ID}Blur)"/><use href="#${ID}Text" style="fill:var(--logo)"/>`;
const defs = `<path id="${ID}Text" transform="scale(1 -1)" d="${WORD}"/><filter id="${ID}Blur" filterUnits="userSpaceOnUse" x="${num(left)}" y="${num(top)}" width="${num(wide * unit)}" height="${num(high * unit)}"><feGaussianBlur stdDeviation="${num(SHADOW.blur * unit)}"/></filter>`;

const file = path.join(__dirname, '..', 'app', 'index.html');
let html = fs.readFileSync(file, 'utf8');
// These get an svg of their own, as the word hides on a phone, and what is inside display: none draws nothing for the copies in About and the start screen.
html = html.replace(/<svg class="brand-defs"[^>]*>.*?<\/svg>\n/, '');
html = html.replace('<header class="island topbar">', `<svg class="brand-defs" aria-hidden="true"><defs>${defs}</defs></svg>\n<header class="island topbar">`);
html = html.replace(/<svg class="brand-word"[^>]*>.*?<\/svg>/, `<svg class="brand-word" viewBox="${num(left)} ${num(top)} ${num(wide * unit)} ${num(high * unit)}" aria-hidden="true">${word}</svg>`);
fs.writeFileSync(file, html);
console.log(`wrote the qtiles wordmark, ${wide} x ${high} px`);

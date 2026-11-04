// Runs the files below in order on one jsdom page of dist/qtiles.html.
const { boot, LIMIT } = require('./boot');
const FILES = ['data', 'history', 'draw', 'objects', 'ui'];

(async () => {
  const t0 = Date.now(), t = await boot();
  t.check('no storage: the welcome over a blank 2D canvas, then only news', t.ev(`!$('sheetNew').hidden && $('startBox').dataset.phase === 'welcome' && !S.example && S.mode === 'flat' && CO.step < 0 && !S.dirty && !welcomeDue(1, WELCOME_VERSION) && !welcomeDue(1, 0) && welcomeDue(1, 1, 2)`) && !t.errors.length);
  t.key('Escape'); t.tap(3, 3); t.check('closing the welcome marks it seen; the blank paints', t.ev(`$('sheetNew').hidden && prefGet('welcomeSeen') === WELCOME_VERSION && T.painted() === 1`)); t.ev('setDirty(false)');
  try {
    for (const f of FILES) if (!process.argv[2] || process.argv.slice(2).includes(f)) { const a = Date.now(); console.log('--- ' + f); await require('./' + f)(t); console.log('    ' + ((Date.now() - a) / 1000).toFixed(1) + ' s'); }
  } catch (e) { t.errors.push(e.stack || String(e)); }
  t.check('no runtime errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : ''), t.errors.length === 0);
  const n = t.passed + t.failed;
  if (n > LIMIT) { console.log('FAIL more than ' + LIMIT + ' checks'); process.exitCode = 1; }
  console.log((t.failed ? t.failed + ' FAILED of ' : 'all PASS, ') + n + ' checks (limit ' + LIMIT + ') in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(process.exitCode || 0);
})();

// Runs the files below in order on one jsdom page of dist/qtiles.html.
const { boot, LIMIT } = require('./boot');
const FILES = ['data', 'history', 'draw', 'objects', 'ui'];

(async () => {
  const t0 = Date.now(), t = await boot();
  t.check('with no storage: New and Examples on a blank 2D canvas, and nothing starts by itself', t.ev(`!$('sheetNew').hidden && $('stCont').hidden && !$('exWrap').hidden && !S.example && S.mode === 'flat' && CO.step < 0 && !S.dirty`) && !t.errors.length);
  try {
    for (const f of FILES) if (!process.argv[2] || process.argv.slice(2).includes(f)) { const a = Date.now(); console.log('--- ' + f); await require('./' + f)(t); console.log('    ' + ((Date.now() - a) / 1000).toFixed(1) + ' s'); }
  } catch (e) { t.errors.push(e.stack || String(e)); }
  t.check('no runtime errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : ''), t.errors.length === 0);
  const n = t.passed + t.failed;
  if (n > LIMIT) { console.log('FAIL more than ' + LIMIT + ' checks'); process.exitCode = 1; }
  console.log((t.failed ? t.failed + ' FAILED of ' : 'all PASS, ') + n + ' checks (limit ' + LIMIT + ') in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(process.exitCode || 0);
})();

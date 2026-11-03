'use strict';
/* qtiles entry point: wires the pieces together and runs the render loop. */

(async function main() {
  keysMove(); themeApply(); readTheme(); resizeView(); initUI(); initGroups(); initHelp(); initTips(); initFiles(); initStorage(); initExamples();
  new ResizeObserver(() => { resizeView(); }).observe($('stage'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  startBlank(); await storageStart();
  if (prefGet('startScreen')) await startOpen(); else await storageResume();
  fitView(); storageTell();

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; let ants = 0;
  (function frame(t) {
    if ((SEL.edges || SEL.rect || OB.edges) && !still && t - ants > 120) { ants = t; SEL.phase = (SEL.phase + 1) % 8; requestRender(); }
    if (needRender) render();
    miniTick(t);
    requestAnimationFrame(frame);
  })(0);
})();

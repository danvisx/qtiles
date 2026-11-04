'use strict';
/* The live site's one network request: the Cloudflare Web Analytics beacon, page views only, no cookies or storage. */

const SITE = { host: 'qtiles.app', analytics: '3703f3f72b0c498f891a6576d7ee3412' };   // an empty host or token turns it off

// Only the live domain counts, so localhost, file://, workers.dev, previews and the claude.ai bundle send nothing.
function siteBeacon(host, gpc) {
  return !!(SITE.host && SITE.analytics) && !gpc && (host === SITE.host || host === 'www.' + SITE.host);
}

function siteStart() {
  if (!siteBeacon(location.hostname, navigator.globalPrivacyControl === true)) return;
  const s = document.createElement('script');
  s.defer = true; s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.dataset.cfBeacon = JSON.stringify({ token: SITE.analytics });
  s.onerror = () => s.remove();   // a blocker or no connection: nothing to tell anyone
  document.head.appendChild(s);
}

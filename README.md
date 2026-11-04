# qtiles

qtiles is a free, browser-based pixel-art editor for still images, in 2D and isometric: sprites, tiles, characters, props, scenes and backgrounds, including big detailed pieces drawn a little each day. It works with a mouse on a laptop and with Apple Pencil on an iPad.

A project is a single `.json` file that lives wherever you keep it, such as iCloud, Google Drive or OneDrive. There is no account and no server, and nothing you draw or save ever leaves your device. It is plain HTML, CSS and JavaScript with no build step.

## Run it

```
python3 -m http.server -d app 8000
```

Then open http://localhost:8000. Opening `app/index.html` directly from disk also works. Chromium/Chrome can save back to the same file; Firefox falls back to a normal download.

## Test it

```
npm install
npm test
```

This needs Node and Python 3. It bundles `app/` into `dist/qtiles.html` and runs the headless test against that page. `npm run perf` runs the timing budgets, which `npm test` leaves out.

## Stamps

The stamps in the Library are text in `scripts/stamp_art/*.px`, one letter per pixel, with roles that map to palette ramps; `scripts/make_stamps.js` describes the format. `npm test` rebuilds `app/library/stamps.js` when a source changes. To look at every stamp at 8x on one image:

```
npm run stamps -- --sheet stamps.png
```

## Character kit

New character builds a person from parts: a body, head, eyes, hair, top, bottom, shoes and up to two accessories, in four templates (16 x 16, 16 x 32 and 32 x 32 in 2D, and isometric). Each part is text in `scripts/kit_art/<template>/<slot>/<part>.px`, drawn by role with no outline of its own; the kit adds the outline around the whole character. `scripts/kit_art/cast.px` holds the 30 characters that show as stamps under Characters, rebuilt from the parts each time the app starts. `scripts/make_kit.js` describes the format, refuses a part that uses a letter outside the roles or does not fit its template, and checks every body with every top and bottom for spills, holes and gaps. To draw every part and the cast at 8x:

```
npm run kit -- --sheet kit.png              # add --cast for the cast alone, --only small for one template, --check to list what the fit check finds
```

## Deploy it

The site is the `app/` folder as it stands, and nothing else is served.

- **Netlify:** `netlify.toml` already sets this up. There is no build command and the publish directory is `app`.
- **Cloudflare Workers:** `wrangler.jsonc` already sets this up. Name the Worker `qtiles`, leave the build command empty and keep the deploy command `npx wrangler deploy`.
- **Visitor counts:** on qtiles.app only, the page loads the Cloudflare Web Analytics beacon (page views, no cookies). The domain and token are `SITE` in `app/js/site.js`; an empty token turns it off, and a browser sending Global Privacy Control is not counted.

# qtiles

qtiles is a free, browser-based pixel-art editor for still images, in 2D and isometric: sprites, tiles, characters, props, scenes and backgrounds, including big detailed pieces drawn a little each day. It works with a mouse on a laptop and with Apple Pencil on an iPad.

A project is a single `.json` file that lives wherever you keep it, such as iCloud, Google Drive or OneDrive. There is no account and no server, and the app makes no network requests. It is plain HTML, CSS and JavaScript with no build step.

## Run it

```
python3 -m http.server -d app 8000
```

Then open http://localhost:8000. Opening `app/index.html` directly from disk also works. Chromium and Chrome can save back to the same file; Firefox falls back to a normal download.

## Test it

```
npm install
npm test
```

This needs Node and Python 3. It bundles `app/` into `dist/qtiles.html` and runs the headless test against that page. `npm run perf` runs the timing budgets, which `npm test` leaves out.

## Deploy it

The site is the `app/` folder as it stands, and nothing else is served.

- **Netlify:** `netlify.toml` already sets this up. There is no build command and the publish directory is `app`.
- **Cloudflare Workers:** `wrangler.jsonc` already sets this up. Name the Worker `qtiles`, leave the build command empty and keep the deploy command `npx wrangler deploy`.

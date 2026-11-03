#!/usr/bin/env python3
"""Bundle app/ into one self-contained HTML page (dist/qtiles.html) for publishing as a claude.ai artifact.
The app itself needs no build step: serve app/ with `python3 -m http.server -d app 8000` and open it."""
import base64
import json
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent.parent
app = root / "app"
html = (app / "index.html").read_text()


def embed_examples():
    """Writes app/examples/embedded.js: the manifest and every project as JSON text. A page opened from disk cannot fetch, so the app reads this table however it is run."""
    folder = app / "examples"
    manifest = json.loads((folder / "index.json").read_text())
    lines = ["'use strict';", "/* Written by scripts/build_artifact.py from index.json and the project files here. Do not edit. */"]
    lines.append("EX_DATA.list = " + json.dumps(manifest, separators=(",", ":")) + ";")
    covers = folder / "covers.json"   # the welcome's covers: an example and a crop in art pixels each
    if covers.exists():
        lines.append("EX_DATA.covers = " + json.dumps(json.loads(covers.read_text()), separators=(",", ":")) + ";")
    for entry in manifest:
        text = json.dumps(json.loads((folder / entry["file"]).read_text()), separators=(",", ":"))
        lines.append(f"EX_DATA.files[{json.dumps(entry['file'])}] = {json.dumps(text)};")
    # every < is inside a string here, and escaping it means no text in a project can close the bundle's script tag
    (folder / "embedded.js").write_text("\n".join(lines).replace("<", "\\u003c") + "\n")


def px_stale():
    """A source in scripts/example_art with no project yet, or newer than its project."""
    for src in (root / "scripts" / "example_art").glob("*.px"):
        made = app / "examples" / (src.stem + ".qtiles.json")
        if not made.exists() or src.stat().st_mtime > made.stat().st_mtime:
            return True
    scenes = root / "scripts" / "example_art" / "scenes.js"
    for name in re.findall(r"id: '([\w-]+)'", scenes.read_text()):
        made = app / "examples" / (name + ".qtiles.json")
        if not made.exists() or scenes.stat().st_mtime > made.stat().st_mtime:
            return True
    return False


def bundle():
    head = re.search(r"<!--BUILD:HEAD-->(.*?)<!--/BUILD:HEAD-->", html, re.S).group(1)
    # the bundle is one file: the mark goes in as data, and what only a served site reads stays out
    mark = lambda text: re.sub(r"assets/layers-\d+\.png", lambda m: "data:image/png;base64," + base64.b64encode((app / m.group(0)).read_bytes()).decode(), text)
    head = mark("\n".join(l for l in head.splitlines() if not re.search(r'href="(style\.css|manifest\.webmanifest|assets/icon-)', l)).strip())
    css = (app / "style.css").read_text()
    # fonts become data: URIs so the single-file page works anywhere (the artifact sandbox only allows Google Fonts otherwise)
    css = re.sub(r"url\(fonts/([\w.-]+)\)", lambda m: "url(data:font/woff2;base64," + base64.b64encode((app / "fonts" / m.group(1)).read_bytes()).decode() + ")", css)
    scripts = re.search(r"<!--BUILD:SCRIPTS-->(.*?)<!--/BUILD:SCRIPTS-->", html, re.S).group(1)
    js = "\n".join((app / f).read_text() for f in re.findall(r'src="([^"]+)"', scripts))
    body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
    body = re.sub(r"<!--BUILD:SCRIPTS-->.*?<!--/BUILD:SCRIPTS-->", "", body, flags=re.S).strip()
    body = mark(body)

    out = f"{head}\n<style>\n{css}\n</style>\n{body}\n<script>\n{js}\n</script>\n"
    dist = root / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "qtiles.html").write_text(out)
    return out


embed_examples()
out = bundle()
if px_stale():
    # the builder runs inside the bundled app, so the outline and shadow are the app's own, and then the new projects go in the bundle
    try:
        made = subprocess.run(["node", str(root / "scripts" / "make_examples.js"), "--px"])
    except FileNotFoundError:
        sys.exit("Building the .px examples needs Node, and jsdom: npm install")
    if made.returncode:
        sys.exit("The examples did not build. Fix the source named above, or if it says jsdom is missing: npm install")
    embed_examples()
    out = bundle()
print(f"wrote {root / 'dist' / 'qtiles.html'} ({len(out) // 1024} KB)")

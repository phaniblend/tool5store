import type { FastifyInstance } from "fastify";

// Same-origin web UI, same visual identity as the other two apps' ui.ts —
// see apps/capture-api/src/routes/ui.ts for the shared design rationale.
// The render API takes an arbitrary-length timeline; this UI intentionally
// only exposes the common case (up to two clips back to back, plus one
// text overlay) rather than a full timeline builder, to stay usable
// without documentation. The full API still takes arbitrary timelines —
// see the curl example on the page.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Render — tool5store</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --concrete-900: #211f1c; --concrete-800: #2a2825; --concrete-700: #3c3934;
    --steel-200: #d8d5cd; --steel-400: #a7a297; --ember: #e8742a; --ember-dim: #a85a25;
    --concrete-500: #6b665c;
    --font-display: 'Bebas Neue', 'Arial Narrow', sans-serif;
    --font-body: 'IBM Plex Sans', 'Segoe UI', sans-serif;
    --font-mono: 'IBM Plex Mono', 'Consolas', monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--concrete-900); color: var(--steel-200); font-family: var(--font-body); line-height: 1.6; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 0 24px 64px; }
  header { padding: 28px 0 8px; }
  .back { font-family: var(--font-mono); font-size: 12px; color: var(--steel-400); text-decoration: none; letter-spacing: 0.06em; }
  .back:hover { color: var(--ember); }
  .eyebrow { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ember); margin: 24px 0 4px; }
  h1 { font-family: var(--font-display); font-size: clamp(40px, 8vw, 58px); letter-spacing: 0.02em; margin: 0 0 6px; text-wrap: balance; }
  .lede { color: var(--steel-400); margin: 0 0 28px; max-width: 52ch; }
  .panel {
    position: relative;
    background: linear-gradient(155deg, rgba(255,255,255,0.045), rgba(255,255,255,0) 25%), linear-gradient(12deg, var(--concrete-700), var(--concrete-800) 75%);
    border: 1px solid rgba(216,213,205,0.09); border-radius: 5px; padding: 24px;
  }
  .bolt { position: absolute; width: 9px; height: 9px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #9a978d, #55524a 65%, #2c2a26); box-shadow: 0 1px 2px rgba(0,0,0,0.6); }
  .bolt.tl { top: 12px; left: 12px; } .bolt.tr { top: 12px; right: 12px; }
  .bolt.bl { bottom: 12px; left: 12px; } .bolt.br { bottom: 12px; right: 12px; }
  fieldset { border: 1px solid rgba(216,213,205,0.1); border-radius: 3px; padding: 14px 14px 16px; margin: 0 0 14px; }
  legend { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--steel-400); padding: 0 6px; }
  label { display: block; font-family: var(--font-mono); font-size: 11px; color: var(--concrete-500); margin: 10px 0 4px; }
  label:first-child { margin-top: 0; }
  .row { display: flex; gap: 10px; }
  .row > div { flex: 1; }
  input[type=url], input[type=number], input[type=text] {
    width: 100%; background: rgba(0,0,0,0.32); border: 1px solid rgba(216,213,205,0.16); border-radius: 3px;
    color: var(--steel-200); font-family: var(--font-mono); font-size: 13px; padding: 10px 12px;
  }
  input:focus { outline: none; border-color: var(--ember); }
  button {
    background: var(--ember); color: #241505; border: none; border-radius: 3px; width: 100%;
    font-family: var(--font-display); font-size: 19px; letter-spacing: 0.05em; padding: 12px 0; cursor: pointer;
    box-shadow: 0 2px 0 var(--ember-dim); margin-top: 4px;
  }
  button:hover:not(:disabled) { filter: brightness(1.08); }
  button:active:not(:disabled) { transform: translateY(1px); box-shadow: 0 1px 0 var(--ember-dim); }
  button:disabled { opacity: 0.55; cursor: default; }
  .status-line { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-family: var(--font-mono); font-size: 12px; color: var(--concrete-500); min-height: 16px; }
  .lamp { width: 7px; height: 7px; border-radius: 50%; background: var(--concrete-500); flex-shrink: 0; }
  .lamp.busy { background: var(--ember); animation: pulse 1s ease-in-out infinite; }
  .lamp.ok { background: #6fae74; } .lamp.err { background: #c25b4a; }
  .status-line.ok { color: #8fc494; } .status-line.err { color: #d98a7a; }
  @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(232,116,42,0.55); } 50% { box-shadow: 0 0 0 5px rgba(232,116,42,0); } }
  @media (prefers-reduced-motion: reduce) { .lamp.busy { animation: none; } }
  .result { margin-top: 16px; }
  .result video { display: block; width: 100%; border-radius: 3px; border: 1px solid rgba(216,213,205,0.14); }
  .result a.dl { display: inline-block; margin-top: 10px; font-family: var(--font-mono); font-size: 12px; color: var(--steel-400); text-decoration: none; }
  .result a.dl:hover { color: var(--ember); }
  .docs { margin-top: 40px; }
  .docs h2 { font-family: var(--font-display); font-size: 22px; letter-spacing: 0.02em; margin: 0 0 10px; }
  pre { background: rgba(0,0,0,0.3); border: 1px solid rgba(216,213,205,0.1); border-radius: 3px; padding: 14px; font-family: var(--font-mono); font-size: 12px; overflow-x: auto; color: var(--steel-200); }
  footer { margin-top: 40px; font-family: var(--font-mono); font-size: 12px; color: var(--concrete-500); }
  footer a { color: var(--steel-400); text-decoration: none; }
  footer a:hover { color: var(--ember); }
</style>
</head>
<body>
<div class="wrap">
  <header><a class="back" href="https://tool5.store">&larr; tool5store</a></header>
  <p class="eyebrow">Station 02</p>
  <h1>Render</h1>
  <p class="lede">Stitch one or two clips together, drop a caption on top, get back an MP4. Renders can take a little while — the button will tell you when it's done.</p>

  <div class="panel">
    <div class="bolt tl"></div><div class="bolt tr"></div><div class="bolt bl"></div><div class="bolt br"></div>
    <form id="f">
      <fieldset>
        <legend>Clip 1 (required)</legend>
        <label for="c1url">Video URL</label>
        <input id="c1url" type="url" placeholder="https://example.com/a.mp4" required>
        <div class="row">
          <div><label for="c1s">Trim start (s)</label><input id="c1s" type="number" min="0" step="0.1" value="0"></div>
          <div><label for="c1e">Trim end (s, optional)</label><input id="c1e" type="number" min="0" step="0.1" placeholder="full length"></div>
        </div>
      </fieldset>
      <fieldset>
        <legend>Clip 2 (optional)</legend>
        <label for="c2url">Video URL</label>
        <input id="c2url" type="url" placeholder="leave blank to skip">
        <div class="row">
          <div><label for="c2s">Trim start (s)</label><input id="c2s" type="number" min="0" step="0.1" value="0"></div>
          <div><label for="c2e">Trim end (s, optional)</label><input id="c2e" type="number" min="0" step="0.1" placeholder="full length"></div>
        </div>
      </fieldset>
      <fieldset>
        <legend>Text overlay (optional)</legend>
        <label for="ovtext">Caption</label>
        <input id="ovtext" type="text" placeholder="leave blank to skip" maxlength="200">
      </fieldset>
      <button type="submit" id="run">RENDER</button>
    </form>
    <div class="status-line" id="status"><span class="lamp" id="lamp"></span><span id="status-text">Idle.</span></div>
    <div class="result" id="result"></div>
  </div>

  <div class="docs">
    <h2>Use it from code</h2>
    <p style="color:var(--steel-400);font-size:14px;margin:0 0 10px">The API accepts an arbitrary number of clips and overlays — this page only exposes the common case.</p>
    <pre>curl -X POST https://render.tool5.store/api/v1/render \\
  -H "Content-Type: application/json" \\
  -d '{
    "clips": [{ "url": "https://example.com/a.mp4", "trimEnd": 5 }],
    "textOverlays": [{ "text": "Hello", "start": 0, "end": 3 }]
  }'</pre>
  </div>

  <footer><a href="https://github.com/phaniblend/tool5store/tree/main/apps/video-api" target="_blank" rel="noopener">Source</a> &middot; <a href="https://tool5.store">tool5.store</a></footer>
</div>

<script>
(function () {
  var form = document.getElementById('f');
  var runBtn = document.getElementById('run');
  var statusLine = document.getElementById('status');
  var statusText = document.getElementById('status-text');
  var lamp = document.getElementById('lamp');
  var result = document.getElementById('result');

  function setState(state, text) {
    statusLine.className = 'status-line' + (state === 'ok' ? ' ok' : state === 'err' ? ' err' : '');
    lamp.className = 'lamp' + (state === 'busy' ? ' busy' : state === 'ok' ? ' ok' : state === 'err' ? ' err' : '');
    statusText.textContent = text;
  }

  function num(el) {
    var v = el.value.trim();
    return v === '' ? undefined : Number(v);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    var c1url = document.getElementById('c1url').value.trim();
    var c2url = document.getElementById('c2url').value.trim();
    var ovtext = document.getElementById('ovtext').value.trim();

    var clips = [{
      url: c1url,
      trimStart: num(document.getElementById('c1s')) || 0,
      trimEnd: num(document.getElementById('c1e')),
    }];
    if (c2url) {
      clips.push({
        url: c2url,
        trimStart: num(document.getElementById('c2s')) || 0,
        trimEnd: num(document.getElementById('c2e')),
      });
    }
    var textOverlays = ovtext ? [{ text: ovtext, start: 0 }] : [];

    runBtn.disabled = true;
    result.innerHTML = '';
    setState('busy', 'Rendering… this can take a bit');
    var started = performance.now();

    try {
      var res = await fetch('/api/v1/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: clips, textOverlays: textOverlays }),
      });
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(body.message || ('HTTP ' + res.status));

      var elapsed = ((performance.now() - started) / 1000).toFixed(1);

      if (body.url && body.url.indexOf('file://') === 0) {
        // Local-disk fallback (no S3 bucket configured server-side) — not
        // reachable from the browser, so say so instead of a dead video tag.
        setState('ok', 'Rendered in ' + elapsed + 's, but saved to local server disk (no object storage configured) — not downloadable from here.');
      } else {
        var video = document.createElement('video');
        video.src = body.url;
        video.controls = true;
        result.appendChild(video);
        var dl = document.createElement('a');
        dl.className = 'dl';
        dl.href = body.url;
        dl.download = 'render.mp4';
        dl.textContent = 'Download MP4';
        result.appendChild(dl);
        setState('ok', 'Rendered in ' + elapsed + 's');
      }
    } catch (err) {
      setState('err', 'Failed: ' + err.message);
    } finally {
      runBtn.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;

export async function uiRoutes(app: FastifyInstance) {
  app.get("/", async (_request, reply) => {
    reply.header("Content-Type", "text/html; charset=utf-8").send(PAGE);
  });
}

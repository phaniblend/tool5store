import type { FastifyInstance } from "fastify";

// A small, self-contained, same-origin web UI so this app is directly
// usable by a person, not just an API. Styling mirrors the tool5store
// landing page's "workshop" identity (concrete/steel/ember) so navigating
// here from a product card feels like the same site, not a bare API doc.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Capture — tool5store</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --concrete-900: #211f1c;
    --concrete-800: #2a2825;
    --concrete-700: #3c3934;
    --steel-200: #d8d5cd;
    --steel-400: #a7a297;
    --ember: #e8742a;
    --ember-dim: #a85a25;
    --concrete-500: #6b665c;
    --font-display: 'Bebas Neue', 'Arial Narrow', sans-serif;
    --font-body: 'IBM Plex Sans', 'Segoe UI', sans-serif;
    --font-mono: 'IBM Plex Mono', 'Consolas', monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--concrete-900);
    color: var(--steel-200);
    font-family: var(--font-body);
    line-height: 1.6;
  }
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
    border: 1px solid rgba(216,213,205,0.09);
    border-radius: 5px;
    padding: 24px;
  }
  .bolt { position: absolute; width: 9px; height: 9px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #9a978d, #55524a 65%, #2c2a26); box-shadow: 0 1px 2px rgba(0,0,0,0.6); }
  .bolt.tl { top: 12px; left: 12px; } .bolt.tr { top: 12px; right: 12px; }
  .bolt.bl { bottom: 12px; left: 12px; } .bolt.br { bottom: 12px; right: 12px; }
  form { display: flex; gap: 10px; flex-wrap: wrap; }
  input[type=url], select {
    flex: 1; min-width: 180px;
    background: rgba(0,0,0,0.32); border: 1px solid rgba(216,213,205,0.16); border-radius: 3px;
    color: var(--steel-200); font-family: var(--font-mono); font-size: 13.5px; padding: 12px 14px;
  }
  input[type=url]:focus, select:focus { outline: none; border-color: var(--ember); }
  button {
    background: var(--ember); color: #241505; border: none; border-radius: 3px;
    font-family: var(--font-display); font-size: 17px; letter-spacing: 0.05em; padding: 0 22px; cursor: pointer;
    box-shadow: 0 2px 0 var(--ember-dim);
  }
  button:hover:not(:disabled) { filter: brightness(1.08); }
  button:active:not(:disabled) { transform: translateY(1px); box-shadow: 0 1px 0 var(--ember-dim); }
  button:disabled { opacity: 0.55; cursor: default; }
  .opts { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
  .opts select { flex: none; min-width: 0; }
  .status-line { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-family: var(--font-mono); font-size: 12px; color: var(--concrete-500); min-height: 16px; }
  .lamp { width: 7px; height: 7px; border-radius: 50%; background: var(--concrete-500); flex-shrink: 0; }
  .lamp.busy { background: var(--ember); animation: pulse 1s ease-in-out infinite; }
  .lamp.ok { background: #6fae74; } .lamp.err { background: #c25b4a; }
  .status-line.ok { color: #8fc494; } .status-line.err { color: #d98a7a; }
  @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(232,116,42,0.55); } 50% { box-shadow: 0 0 0 5px rgba(232,116,42,0); } }
  @media (prefers-reduced-motion: reduce) { .lamp.busy { animation: none; } }
  .result { margin-top: 16px; }
  .result img { display: block; width: 100%; height: auto; border-radius: 3px; border: 1px solid rgba(216,213,205,0.14); }
  .result a.dl { display: inline-block; margin-top: 10px; font-family: var(--font-mono); font-size: 12px; color: var(--steel-400); text-decoration: none; }
  .result a.dl:hover { color: var(--ember); }
  .docs { margin-top: 40px; }
  .docs h2 { font-family: var(--font-display); font-size: 22px; letter-spacing: 0.02em; margin: 0 0 10px; }
  pre { background: rgba(0,0,0,0.3); border: 1px solid rgba(216,213,205,0.1); border-radius: 3px; padding: 14px; font-family: var(--font-mono); font-size: 12.5px; overflow-x: auto; color: var(--steel-200); }
  footer { margin-top: 40px; font-family: var(--font-mono); font-size: 12px; color: var(--concrete-500); }
  footer a { color: var(--steel-400); text-decoration: none; }
  footer a:hover { color: var(--ember); }
</style>
</head>
<body>
<div class="wrap">
  <header><a class="back" href="https://tool5.store">&larr; tool5store</a></header>
  <p class="eyebrow">Station 01</p>
  <h1>Capture</h1>
  <p class="lede">Paste a URL, get back a screenshot. Handles cookie banners and overlays automatically — nothing to sign up for.</p>

  <div class="panel">
    <div class="bolt tl"></div><div class="bolt tr"></div><div class="bolt bl"></div><div class="bolt br"></div>
    <form id="f">
      <input id="url" type="url" placeholder="https://example.com" required>
      <button type="submit" id="run">CAPTURE</button>
    </form>
    <div class="opts">
      <select id="format">
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
        <option value="webp">WebP</option>
      </select>
      <select id="fullpage">
        <option value="false">Viewport only</option>
        <option value="true">Full page</option>
      </select>
    </div>
    <div class="status-line" id="status"><span class="lamp" id="lamp"></span><span id="status-text">Idle.</span></div>
    <div class="result" id="result"></div>
  </div>

  <div class="docs">
    <h2>Use it from code</h2>
    <pre>curl -X POST https://capture.tool5.store/api/v1/capture \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","format":"png","fullPage":false}' \\
  --output shot.png</pre>
  </div>

  <footer><a href="https://github.com/phaniblend/tool5store/tree/main/apps/capture-api" target="_blank" rel="noopener">Source</a> &middot; <a href="https://tool5.store">tool5.store</a></footer>
</div>

<script>
(function () {
  var form = document.getElementById('f');
  var urlInput = document.getElementById('url');
  var formatSel = document.getElementById('format');
  var fullpageSel = document.getElementById('fullpage');
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

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    runBtn.disabled = true;
    result.innerHTML = '';
    setState('busy', 'Capturing…');
    var started = performance.now();
    try {
      var res = await fetch('/api/v1/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlInput.value,
          format: formatSel.value,
          fullPage: fullpageSel.value === 'true',
          viewport: { width: 1280, height: 800 },
        }),
      });
      if (!res.ok) {
        var errBody = await res.json().catch(function () { return {}; });
        throw new Error(errBody.message || ('HTTP ' + res.status));
      }
      var blob = await res.blob();
      var objUrl = URL.createObjectURL(blob);
      var elapsed = ((performance.now() - started) / 1000).toFixed(1);

      var img = document.createElement('img');
      img.src = objUrl;
      img.alt = 'Screenshot of ' + urlInput.value;
      result.appendChild(img);

      var dl = document.createElement('a');
      dl.className = 'dl';
      dl.href = objUrl;
      dl.download = 'capture.' + formatSel.value;
      dl.textContent = 'Download ' + formatSel.value.toUpperCase();
      result.appendChild(dl);

      setState('ok', 'Captured in ' + elapsed + 's · ' + Math.round(blob.size / 1024) + ' KB');
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

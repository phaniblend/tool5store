# Capture API

Headless screenshot capture service. Node.js + TypeScript + Playwright + Fastify.

## Endpoint

`POST /api/v1/capture`

```json
{
  "url": "https://example.com",
  "format": "png",
  "viewport": { "width": 1280, "height": 800 },
  "fullPage": false,
  "waitUntil": "networkidle",
  "timeoutMs": 15000,
  "dismissOverlays": true
}
```

Only `url` is required — everything else has a sane default (see
[src/schema/capture.schema.ts](src/schema/capture.schema.ts)).

Response: raw image bytes with `Content-Type: image/<format>` on success,
or a JSON error body (400/502/504) on failure.

## Local dev

```bash
npm install
npx playwright install --with-deps chromium
npm run dev
```

Then:

```bash
curl -X POST http://localhost:8080/api/v1/capture \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' \
  --output out.png
```

## Design notes

- **Browser caching** ([src/lib/browser.ts](src/lib/browser.ts)): one
  Chromium process per warm container, reused across requests. Each
  request gets its own `BrowserContext` (isolated cookies/storage), always
  closed in a `finally` block. If the browser process dies, the cache is
  invalidated and the next request launches a fresh one.
- **SSRF guard** ([src/lib/ssrf.ts](src/lib/ssrf.ts)): rejects non-http(s)
  schemes, embedded credentials, and resolves DNS to block private/loopback/
  link-local/cloud-metadata IP ranges. Also re-validated per-request via
  `context.route()` so redirects can't smuggle a request to an internal
  host after the initial check passes. DNS-rebinding TOCTOU is a known
  residual gap — see comments in that file for mitigation options if your
  threat model needs it closed further (e.g. an egress proxy/allowlist).
- **Overlay dismissal** ([src/lib/overlayDismiss.ts](src/lib/overlayDismiss.ts)):
  best-effort click/hide of common cookie-consent widgets (OneTrust,
  Cookiebot, Quantcast) via an injected init script. Heuristic, not
  exhaustive.

## Deploy (Cloud Run)

```bash
gcloud run deploy capture-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 60 \
  --concurrency 4
```

Notes:
- `--memory 2Gi` / `--cpu 2`: Chromium is memory-hungry; 512Mi/1 vCPu
  defaults will OOM or crawl.
- `--concurrency 4`: each concurrent capture opens its own page in the
  shared browser; keep this modest until you've load-tested your own
  memory ceiling.
- Cloud Run's free tier (180k vCPU-seconds, 2M requests/mo) applies as
  long as you stay within it — min-instances defaults to 0, so idle time
  costs nothing.

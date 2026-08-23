# Video API

Programmatic video rendering service. Node.js + TypeScript + FFmpeg
(`fluent-ffmpeg`) + Fastify.

## Endpoint

`POST /api/v1/render`

```json
{
  "output": { "width": 1280, "height": 720, "fps": 30 },
  "clips": [
    { "url": "https://example.com/a.mp4", "start": 0, "trimStart": 0, "trimEnd": 5 },
    { "url": "https://example.com/b.mp4", "start": 6, "trimStart": 2, "trimEnd": 4 }
  ],
  "textOverlays": [
    { "text": "Hello world", "start": 0, "end": 3, "x": "center", "y": "center" }
  ]
}
```

Response (200):

```json
{ "jobId": "...", "url": "https://<signed-download-url>", "expiresAt": "2026-08-24T00:00:00.000Z" }
```

Full schema: [src/schema/render.schema.ts](src/schema/render.schema.ts).

### Timeline semantics (v1 scope)

- Clips play in array order. Each clip's `start` is where it should land
  on the *output* timeline; if there's a gap between the previous clip's
  end and the next clip's `start`, it's filled with black video + silence
  so the requested start times are actually honored.
- Overlapping clips (a `start` earlier than where the previous clip ends)
  are rejected with 400 — true multi-track/overlapping composition isn't
  supported yet. Sequential-with-gaps is.
- A clip with no audio track gets silence synthesized for it (via
  `anullsrc`) so every segment has matching video+audio streams for
  `concat`.
- All clips are normalized to `output.width`×`output.height`/`fps`
  (letterboxed via `scale` + `pad`, not cropped) before concatenation.

## Local dev

Requires `ffmpeg`/`ffprobe` on `PATH`.

```bash
npm install
npm run dev
```

```bash
curl -X POST http://localhost:8080/api/v1/render \
  -H "Content-Type: application/json" \
  -d '{"clips":[{"url":"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4","trimEnd":3}]}'
```

Set `DEBUG_FFMPEG=1` to log the generated command + ffmpeg's stderr —
useful when iterating on the filter graph.

## Design notes

- **Filter graph construction** ([src/lib/ffmpeg.ts](src/lib/ffmpeg.ts)):
  builds a `-filter_complex` string per request — per-clip `trim` +
  `scale`/`pad`/`setsar`/`fps` normalization, gap fillers, a `concat`
  (`v=1:a=1`), then a chained `drawtext` per text overlay. Pure function,
  no I/O, so the graph-building logic is testable independent of actually
  invoking ffmpeg.
  - **Escaping gotcha** (documented in-line): ffmpeg's docs say wrapping a
    filter option value in apostrophes frees it from needing to escape
    `:`/`,`/`[`/`]`/`;`. Empirically, on this project's ffmpeg build, an
    unescaped `:` still breaks Windows drive-letter paths
    (`C:\Windows\Fonts\arial.ttf`) and an unescaped `,` inside
    `enable='between(t,0,3)'` still needs escaping. `quoteFilterValue()`
    backslash-escapes `\`, `:`, and `,` *and* wraps in apostrophes —
    verified against a real render, not just against the docs.
- **Asset ingestion** ([src/lib/download.ts](src/lib/download.ts)):
  concurrent (bounded, default 4-at-a-time) streamed downloads to
  `os.tmpdir()/video-api/<jobId>/` — never buffers a whole file in memory,
  and aborts mid-stream past a 300MB-per-file cap.
- **SSRF guard** ([src/lib/ssrf.ts](src/lib/ssrf.ts)): same protections as
  `apps/capture-api`, applied to every clip URL before it's fetched.
  Duplicated rather than shared across a workspace package for now — see
  the comment in that file.
- **Font resolution** ([src/lib/font.ts](src/lib/font.ts)): `drawtext`
  needs a real font *file*, not just a family name. Resolution order:
  `FONT_FILE_PATH` env var → Debian's `fonts-dejavu-core` path (what the
  Dockerfile installs) → Windows' bundled Arial (local dev convenience).
- **Storage & cleanup** ([src/lib/storage.ts](src/lib/storage.ts),
  [src/lib/download.ts](src/lib/download.ts)): generic S3-compatible
  upload + presigned GET URL (works with AWS S3, Cloudflare R2, MinIO —
  set `S3_ENDPOINT` for anything non-AWS). Falls back to writing the
  artifact to local disk if `S3_BUCKET` isn't set, so the pipeline is
  exercisable without cloud credentials. The job's entire tmp directory
  (downloaded sources + rendered output) is wiped in a `finally` block
  after every request, success or failure.

## Deploy (Modal)

See [modal_app.py](modal_app.py) — it wraps this app's own `Dockerfile`
and exposes the Node server via `modal.web_server`. One-time setup on your
machine (I can't do this part — needs your Modal account):

```bash
pip install modal
modal token new
modal secret create tool5store-video-api-secrets \
  S3_BUCKET=... S3_REGION=auto S3_ENDPOINT=... \
  S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
  ALLOWED_ORIGINS=https://tool5.store,https://app.tool5.store
```

Then:

```bash
modal serve modal_app.py   # ephemeral, for testing
modal deploy modal_app.py  # persistent URL
```

I haven't run this against a live Modal account — verify with `modal
serve` before trusting `modal deploy`. Point `render.tool5.store` at
whatever URL Modal gives you.

## Deploy (Railway)

`modal_app.py` isn't needed here — Railway builds and runs the
[`Dockerfile`](Dockerfile) directly, no Python wrapper required.

This is a monorepo, so as with capture-api, two settings on this
service's dashboard:

1. **Settings → Source → Root Directory**: set to `apps/video-api`
2. **Settings → Build**: should now pick up [`railway.json`](railway.json)
   in this directory, pinned to `DOCKERFILE` — needed for the apt-installed
   `ffmpeg` + `fonts-dejavu-core` the generic Node buildpack wouldn't include

Also set, on this service:
- The `S3_*` env vars from [.env.example](.env.example) (or leave unset
  to use the local-disk fallback, though that's ephemeral on Railway —
  fine for testing, not for production)
- `ALLOWED_ORIGINS` if you want browser-based callers
- A generous request timeout — renders of longer timelines can take a
  while; Railway's default may be too aggressive for anything beyond a
  few short clips

Railway injects `PORT` itself, already read from `process.env.PORT` in
`src/server.ts`.

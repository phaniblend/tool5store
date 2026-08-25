<p align="center">
  <img src="assets/logo.png" alt="tool5store — simple tools for brilliant minds" width="480">
</p>

# tool5store

A monorepo of small, self-hosted API tools — each cheap enough to run for
under $5/month by leaning on serverless/scale-to-zero hosting.

## Apps

| App | Description | Stack | Hosting |
|---|---|---|---|
| [`apps/capture-api`](apps/capture-api) | Headless screenshot capture API | Node.js, TypeScript, Playwright, Fastify | Google Cloud Run / Railway |
| [`apps/video-api`](apps/video-api) | Programmatic video rendering API | Node.js, TypeScript, FFmpeg, Fastify | Modal / Railway |
| [`apps/epub-api`](apps/epub-api) | EPUB → PDF conversion API | Node.js, TypeScript, Playwright, Fastify | Google Cloud Run / Railway |

Each app is independently deployable — its own `package.json`, `Dockerfile`,
`railway.json`, and README with deploy instructions. Each also serves its
own small web UI at `/` (see `src/routes/ui.ts` in each app) — the API
isn't the only way in; a person can just open the app and use it.

## Site

[`site/`](site) is the tool5.store landing page — a static product
catalog. Each card opens the corresponding app directly.

## Domain

- `tool5.store` → `site/index.html` (the catalog)
- `capture.tool5.store` → capture-api
- `render.tool5.store` → video-api
- `epub.tool5.store` → epub-api

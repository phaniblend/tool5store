<p align="center">
  <img src="assets/logo.png" alt="tool5store — simple tools for brilliant minds" width="480">
</p>

# tool5store

A monorepo of small, self-hosted API tools — each cheap enough to run for
under $5/month by leaning on serverless/scale-to-zero hosting.

## Apps

| App | Description | Stack | Hosting |
|---|---|---|---|
| [`apps/capture-api`](apps/capture-api) | Headless screenshot capture API | Node.js, TypeScript, Playwright, Fastify | Google Cloud Run |
| [`apps/video-api`](apps/video-api) | Programmatic video rendering API | Node.js, TypeScript, FFmpeg, Fastify | Modal |

Each app is independently deployable — its own `package.json`, `Dockerfile`,
and README with deploy instructions.

## Domain

Apps are served under `tool5.store`, one subdomain per app:

- `capture.tool5.store` → capture-api
- `render.tool5.store` → video-api

# tool5store

A monorepo of small, self-hosted API tools — each cheap enough to run for
under $5/month by leaning on serverless/scale-to-zero hosting.

## Apps

| App | Description | Stack | Hosting |
|---|---|---|---|
| [`apps/capture-api`](apps/capture-api) | Headless screenshot capture API | Node.js, TypeScript, Playwright, Fastify | Google Cloud Run |
| `apps/video-api` *(coming next)* | Programmatic video rendering API | Node.js, TypeScript, FFmpeg, Fastify | Modal |

Each app is independently deployable — its own `package.json`, `Dockerfile`,
and README with deploy instructions.

## Domain

Apps are served under `tool5.store`, one subdomain per app:

- `capture.tool5.store` → capture-api
- `render.tool5.store` → video-api

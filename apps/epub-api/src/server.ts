import Fastify from "fastify";
import cors from "@fastify/cors";
import { convertRoutes } from "./routes/convert.js";
import { uiRoutes } from "./routes/ui.js";
import { closeBrowser } from "./lib/browser.js";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = "0.0.0.0";
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024; // 80MB — generous for an EPUB, which is usually a few MB

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const app = Fastify({
  logger: true,
  bodyLimit: MAX_UPLOAD_BYTES,
});

// The upload endpoint takes the raw .epub bytes as the request body (no
// multipart form needed for a single-file upload) — accept both the
// correct EPUB media type and the generic binary one, since not every
// client sets Content-Type precisely.
for (const contentType of ["application/epub+zip", "application/octet-stream"]) {
  app.addContentTypeParser(contentType, { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
}

await app.register(cors, {
  origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
});

app.get("/healthz", async () => ({ status: "ok" }));

await app.register(uiRoutes);
await app.register(convertRoutes);

app.setErrorHandler((err: Error, _request, reply) => {
  app.log.error(err);
  reply.status(500).send({ error: "InternalServerError", message: err.message });
});

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  await closeBrowser();
  await app.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

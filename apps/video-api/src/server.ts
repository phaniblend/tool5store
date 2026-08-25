import Fastify from "fastify";
import cors from "@fastify/cors";
import { renderRoutes } from "./routes/render.js";
import { uiRoutes } from "./routes/ui.js";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = "0.0.0.0";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const app = Fastify({
  logger: true,
  bodyLimit: 2 * 1024 * 1024, // 2MB — a JSON timeline with many clips/overlays is still small
  // Rendering is CPU/IO-bound and can legitimately take a while for
  // longer timelines; keep Fastify from timing out the request itself
  // (the ffmpeg/download steps have their own timeouts).
  requestTimeout: 5 * 60 * 1000,
});

await app.register(cors, {
  origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
});

app.get("/healthz", async () => ({ status: "ok" }));

await app.register(uiRoutes);
await app.register(renderRoutes);

app.setErrorHandler((err: Error, _request, reply) => {
  app.log.error(err);
  reply.status(500).send({ error: "InternalServerError", message: err.message });
});

process.on("SIGTERM", () => {
  app.log.info("shutting down");
  void app.close().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  app.log.info("shutting down");
  void app.close().then(() => process.exit(0));
});

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

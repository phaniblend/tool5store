import Fastify from "fastify";
import cors from "@fastify/cors";
import { captureRoutes } from "./routes/capture.js";
import { closeBrowser } from "./lib/browser.js";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = "0.0.0.0";

// Comma-separated list of allowed browser-facing origins, e.g.
// "https://app.tool5.store,https://tool5.store". Empty by default (no
// browser origin allowed) so a server-to-server-only deployment doesn't
// need to set anything; server-to-server callers aren't subject to CORS
// anyway. Set this once you know which frontend(s) will call the API
// directly from the browser.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Cloud Run (and friends) send request bodies as JSON; screenshots we
// return can be several MB, so raise Fastify's default body/response
// limits a bit for the request side (response side is a raw buffer, not
// subject to this).
const app = Fastify({
  logger: true,
  bodyLimit: 1 * 1024 * 1024, // 1MB — plenty for a JSON capture request
});

await app.register(cors, {
  origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
});

app.get("/healthz", async () => ({ status: "ok" }));

await app.register(captureRoutes);

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

import type { FastifyInstance } from "fastify";
import { CaptureRequestSchema } from "../schema/capture.schema.js";
import { assertSafeUrl, SsrfValidationError } from "../lib/ssrf.js";
import { getBrowser } from "../lib/browser.js";
import { OVERLAY_DISMISS_SCRIPT } from "../lib/overlayDismiss.js";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function captureRoutes(app: FastifyInstance) {
  app.post("/api/v1/capture", async (request, reply) => {
    const parsed = CaptureRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "ValidationError",
        details: parsed.error.flatten(),
      });
    }

    const body = parsed.data;

    // SSRF check happens after schema validation (cheap checks first) and
    // before we ever hand the URL to the browser.
    try {
      await assertSafeUrl(body.url);
    } catch (err) {
      if (err instanceof SsrfValidationError) {
        return reply.status(400).send({ error: "SsrfValidationError", message: err.message });
      }
      throw err;
    }

    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: body.viewport.width, height: body.viewport.height },
      deviceScaleFactor: body.deviceScaleFactor,
      // Isolated per-request: no shared cookies/storage between callers.
    });

    // Defense in depth against redirect-based SSRF: re-validate every
    // navigation/subresource request's hostname, not just the initial URL.
    await context.route("**/*", async (route) => {
      try {
        await assertSafeUrl(route.request().url());
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });

    try {
      const page = await context.newPage();

      if (body.dismissOverlays) {
        await page.addInitScript(OVERLAY_DISMISS_SCRIPT);
      }

      await page.goto(body.url, {
        waitUntil: body.waitUntil,
        timeout: body.timeoutMs,
      });

      const screenshotOptions: Parameters<typeof page.screenshot>[0] = {
        type: body.format,
        fullPage: body.fullPage,
      };
      if (body.format !== "png" && body.quality !== undefined) {
        screenshotOptions.quality = body.quality;
      }

      const buffer = await page.screenshot(screenshotOptions);

      return reply
        .status(200)
        .header("Content-Type", CONTENT_TYPES[body.format])
        .header("Content-Length", buffer.length)
        .send(buffer);
    } catch (err) {
      request.log.error({ err, url: body.url }, "capture failed");
      const message = err instanceof Error ? err.message : "Unknown error";
      const timedOut = message.toLowerCase().includes("timeout");
      return reply.status(timedOut ? 504 : 502).send({
        error: timedOut ? "NavigationTimeout" : "CaptureFailed",
        message,
      });
    } finally {
      // Context is always torn down — never leaked back to the pool, even
      // though the underlying Browser process is reused.
      await context.close().catch(() => {});
    }
  });
}

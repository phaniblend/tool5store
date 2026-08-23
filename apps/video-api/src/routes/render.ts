import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { RenderRequestSchema } from "../schema/render.schema.js";
import { assertSafeUrl, SsrfValidationError } from "../lib/ssrf.js";
import { downloadClips, ensureJobDir, cleanupJobDir, jobTmpDir } from "../lib/download.js";
import { probe } from "../lib/ffprobe.js";
import { buildFilterGraph, renderToFile, TimelineValidationError } from "../lib/ffmpeg.js";
import { uploadArtifact } from "../lib/storage.js";
import { resolveFontFile } from "../lib/font.js";

export async function renderRoutes(app: FastifyInstance) {
  app.post("/api/v1/render", async (request, reply) => {
    const parsed = RenderRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
    }
    const body = parsed.data;

    // SSRF-validate every clip URL before downloading anything.
    try {
      await Promise.all(body.clips.map((c) => assertSafeUrl(c.url)));
    } catch (err) {
      if (err instanceof SsrfValidationError) {
        return reply.status(400).send({ error: "SsrfValidationError", message: err.message });
      }
      throw err;
    }

    const jobId = randomUUID();
    request.log.info({ jobId, clipCount: body.clips.length }, "render job started");

    try {
      await ensureJobDir(jobId);

      const downloaded = await downloadClips(
        jobId,
        body.clips.map((c) => c.url),
      );

      const probes = await Promise.all(downloaded.map((d) => probe(d.localPath)));

      const fontFile = await resolveFontFile();

      const { filterComplex, videoLabel, audioLabel, inputPaths } = buildFilterGraph({
        clips: body.clips,
        downloaded,
        probes,
        textOverlays: body.textOverlays,
        output: body.output,
        fontFile,
      });

      const outputPath = path.join(jobTmpDir(jobId), `output.${body.output.format}`);

      await renderToFile({
        inputPaths,
        filterComplex,
        videoLabel,
        audioLabel,
        fps: body.output.fps,
        outputPath,
      });

      const result = await uploadArtifact(outputPath, `renders/${jobId}.${body.output.format}`);

      return reply.status(200).send({
        jobId,
        url: result.url,
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      if (err instanceof TimelineValidationError) {
        request.log.warn({ err, jobId }, "invalid timeline");
        return reply.status(400).send({ error: "TimelineValidationError", message: err.message });
      }
      request.log.error({ err, jobId }, "render failed");
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(502).send({ error: "RenderFailed", message });
    } finally {
      await cleanupJobDir(jobId);
    }
  });
}

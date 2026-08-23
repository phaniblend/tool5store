import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { ConvertQuerySchema } from "../schema/convert.schema.js";
import { convertEpubToPdf } from "../lib/epubToPdf.js";

function safeFilename(title: string): string {
  const cleaned = title.replace(/[^a-zA-Z0-9\- _]/g, "").trim();
  return (cleaned || "converted").slice(0, 120);
}

export async function convertRoutes(app: FastifyInstance) {
  app.post("/api/v1/convert", async (request, reply) => {
    const parsedQuery = ConvertQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "ValidationError", details: parsedQuery.error.flatten() });
    }
    const { pageSize, chapterPageBreaks } = parsedQuery.data;

    const body = request.body as Buffer | undefined;
    if (!body || body.length === 0) {
      return reply.status(400).send({
        error: "ValidationError",
        message: "Request body is empty — POST the raw .epub file bytes as the body.",
      });
    }

    // EPUB is a zip file — a quick magic-byte check gives a clean 400 for
    // obviously-not-an-EPUB input instead of a confusing failure deeper in
    // the zip/XML parser.
    if (body[0] !== 0x50 || body[1] !== 0x4b) {
      return reply.status(400).send({
        error: "ValidationError",
        message: "Body doesn't look like a valid EPUB (not a zip archive).",
      });
    }

    const jobId = randomUUID();
    const jobDir = path.join(os.tmpdir(), "epub-api", jobId);
    const inputPath = path.join(jobDir, "input.epub");
    const outputPath = path.join(jobDir, "output.pdf");

    try {
      await mkdir(jobDir, { recursive: true });
      await writeFile(inputPath, body);

      const result = await convertEpubToPdf(
        inputPath,
        outputPath,
        { pageSize, chapterPageBreaks },
        (pct, message) => {
          if (process.env.DEBUG_CONVERT) request.log.debug({ jobId, pct, message }, "convert progress");
        },
      );

      const pdfBuffer = await readFile(outputPath);
      const filename = `${safeFilename(result.title)}.pdf`;

      return reply
        .status(200)
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .header("Content-Length", pdfBuffer.length)
        .header("X-Book-Title", encodeURIComponent(result.title))
        .header("X-Book-Author", encodeURIComponent(result.author))
        .header("X-Book-Chapters", String(result.chapters))
        .send(pdfBuffer);
    } catch (err) {
      request.log.error({ err, jobId }, "conversion failed");
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(502).send({ error: "ConversionFailed", message });
    } finally {
      await rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  });
}

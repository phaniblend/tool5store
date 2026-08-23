import { createWriteStream } from "node:fs";
import { mkdir, rm, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import os from "node:os";

const MAX_BYTES_PER_FILE = 300 * 1024 * 1024; // 300MB per source clip
const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Root scratch dir for a single render job; everything under it is wiped after the job finishes. */
export function jobTmpDir(jobId: string): string {
  return path.join(os.tmpdir(), "video-api", jobId);
}

export async function ensureJobDir(jobId: string): Promise<string> {
  const dir = jobTmpDir(jobId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupJobDir(jobId: string): Promise<void> {
  await rm(jobTmpDir(jobId), { recursive: true, force: true }).catch(() => {});
}

/**
 * Streams a remote URL to a local file without ever buffering the whole
 * body in memory — the response body stream is piped straight to a file
 * write stream. Enforces a byte cap by aborting mid-stream if the source
 * turns out to be larger than expected (a malicious or misconfigured
 * remote could otherwise fill the container's disk).
 */
async function downloadOne(url: string, destPath: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BYTES_PER_FILE) {
      throw new Error(
        `Source at ${url} declares ${contentLength} bytes, exceeding the ${MAX_BYTES_PER_FILE}-byte limit`,
      );
    }

    let bytesWritten = 0;
    const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
    nodeStream.on("data", (chunk: Buffer) => {
      bytesWritten += chunk.length;
      if (bytesWritten > MAX_BYTES_PER_FILE) {
        controller.abort();
      }
    });

    await pipeline(nodeStream, createWriteStream(destPath));
  } catch (err) {
    await unlink(destPath).catch(() => {});
    if (controller.signal.aborted) {
      throw new Error(`Download of ${url} aborted (timeout or exceeded ${MAX_BYTES_PER_FILE}-byte limit)`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Runs `fn` over `items` with at most `concurrency` in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export interface DownloadedClip {
  url: string;
  localPath: string;
}

/**
 * Downloads every clip URL concurrently (bounded) into the job's tmp dir.
 * If any download fails, the ones that already landed on disk are still
 * cleaned up by the caller's cleanupJobDir() call — this function itself
 * doesn't partially clean up so callers can inspect what succeeded if
 * they want to (currently unused, but keeps the function composable).
 */
export async function downloadClips(
  jobId: string,
  urls: string[],
  concurrency = 4,
): Promise<DownloadedClip[]> {
  const dir = await ensureJobDir(jobId);

  return mapWithConcurrency(urls, concurrency, async (url, index) => {
    const ext = path.extname(new URL(url).pathname).slice(0, 8) || ".mp4";
    const localPath = path.join(dir, `input-${index}${ext}`);
    await downloadOne(url, localPath);
    return { url, localPath };
  });
}

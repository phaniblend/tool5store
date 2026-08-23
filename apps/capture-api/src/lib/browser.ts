import { chromium, type Browser } from "playwright";

/**
 * Global browser singleton.
 *
 * Cloud Run (and similar "scale to zero, reuse warm containers" platforms)
 * bill CPU-seconds and charge cold-start latency on every container spin-up.
 * Launching a Chromium process is the most expensive part of a capture
 * request (several hundred ms), so we launch it once per container and
 * reuse it across requests for as long as the container stays warm.
 *
 * Isolation between requests is handled at the BrowserContext level, not
 * the Browser level — each request gets its own throwaway context (its own
 * cookie jar, cache, storage), and the context is always closed after the
 * request, whether it succeeded or not. Only the underlying Browser process
 * is shared.
 */

let browserPromise: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-setuid-sandbox",
      "--no-zygote",
    ],
  });

  // If the browser process dies (OOM, crash, killed), drop the cached
  // promise so the next request launches a fresh one instead of hanging
  // forever against a dead browser.
  browser.on("disconnected", () => {
    browserPromise = null;
  });

  return browser;
}

/**
 * Returns the shared Browser instance, launching it on first call
 * ("cold start") and reusing it thereafter ("warm start").
 */
export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }

  try {
    return await browserPromise;
  } catch (err) {
    // Launch itself failed — clear the cache so the next call retries
    // instead of permanently caching a rejected promise.
    browserPromise = null;
    throw err;
  }
}

/** For graceful shutdown (SIGTERM handler) and tests. */
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => {});
}

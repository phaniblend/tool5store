import { chromium, type Browser } from "playwright";

/**
 * Same global-browser-singleton pattern as apps/capture-api/src/lib/browser.ts
 * — one Chromium process per warm container, reused across requests, with
 * a fresh BrowserContext per request for isolation. See that file for the
 * full rationale.
 */

let browserPromise: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-setuid-sandbox", "--no-zygote"],
  });

  browser.on("disconnected", () => {
    browserPromise = null;
  });

  return browser;
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }

  try {
    return await browserPromise;
  } catch (err) {
    browserPromise = null;
    throw err;
  }
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => {});
}

// Converts an EPUB to PDF by stitching its chapters into one HTML document
// (with resource paths rewritten so images/CSS still resolve) and letting
// headless Chromium do the actual, high-quality layout and pagination — no
// external converter (Calibre, etc.) required.
//
// Ported from D:\epub2pdf\lib\epubToPdf.js (the epub2pdf desktop app). The
// only real change from that source: it used Electron's
// `BrowserWindow.webContents.printToPDF()` to render the final PDF (since
// it's an Electron app); this port uses Playwright's `page.pdf()` against
// the same headless-Chromium browser singleton apps/capture-api uses,
// since this is a server, not a desktop app. Everything upstream of that
// (parsing, HTML assembly, path rewriting) is unchanged logic.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { parseEpub, extractAll } from "./epubParser.js";
import { getBrowser } from "./browser.js";

const PAGE_SIZES = new Set(["A4", "A3", "Legal", "Letter", "Tabloid"]);

/** Rewrites relative src/href/xlink:href/url() references in `html`, which lives
 *  at `fromDir` (zip-relative), so they instead resolve from `toDir`. */
function rewriteRelativePaths(html: string, fromDir: string, toDir: string): string {
  const rebase = (raw: string) => {
    if (!raw || /^(https?:|data:|mailto:|#)/i.test(raw)) return raw;
    const abs = path.posix.normalize(path.posix.join(fromDir, raw));
    const rel = path.posix.relative(toDir, abs);
    return rel || ".";
  };
  return html
    .replace(/((?:src|href)\s*=\s*)(["'])(.*?)\2/gi, (_m, pre, q, val) => `${pre}${q}${rebase(val)}${q}`)
    .replace(/(xlink:href\s*=\s*)(["'])(.*?)\2/gi, (_m, pre, q, val) => `${pre}${q}${rebase(val)}${q}`)
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_m, q, val) => `url(${q}${rebase(val)}${q})`);
}

/** Strips <script>...</script> blocks and inline on* handlers — chapter HTML
 *  is rendered purely for pagination; it never needs JS, and we'd rather
 *  not execute script from an arbitrary uploaded file. */
function stripScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
}

function extractTag(html: string, tag: string): string {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
}

function escapeHtml(s: string | undefined | null): string {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

const BASE_STYLE = `
  html, body { margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #111; }
  img, svg { max-width: 100%; height: auto; }
  .epub-chapter { page-break-before: always; }
  .epub-chapter:first-of-type { page-break-before: avoid; }
  .epub-cover { page-break-after: always; height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; }
  .epub-cover img { max-height: 80vh; max-width: 90%; box-shadow: 0 0 0 1px rgba(0,0,0,.08); }
  .epub-cover h1 { font-size: 28pt; margin: 0.6em 0 0.2em; }
  .epub-cover h2 { font-size: 16pt; font-weight: normal; color: #444; margin: 0; }
  table { border-collapse: collapse; }
`;

export interface ConvertOptions {
  pageSize?: string;
  chapterPageBreaks?: boolean;
}

export interface ConvertResult {
  outputPdfPath: string;
  title: string;
  author: string;
  chapters: number;
}

export type ProgressFn = (pct: number, message: string) => void;

/**
 * Converts one EPUB file to PDF.
 */
export async function convertEpubToPdf(
  epubPath: string,
  outputPdfPath: string,
  options: ConvertOptions = {},
  onProgress: ProgressFn = () => {},
): Promise<ConvertResult> {
  const pageSize = options.pageSize && PAGE_SIZES.has(options.pageSize) ? options.pageSize : "A4";
  const chapterPageBreaks = options.chapterPageBreaks !== false;

  onProgress(2, "Opening EPUB…");
  const book = await parseEpub(epubPath);

  const tempDir = path.join(os.tmpdir(), `epub2pdf-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    onProgress(8, "Extracting book contents…");
    await extractAll(book.zip, tempDir);

    const workDir = book.opfDir ? path.join(tempDir, ...book.opfDir.split("/")) : tempDir;
    fs.mkdirSync(workDir, { recursive: true });

    const stylesheets = new Set<string>();
    const chapterHtmlParts: string[] = [];
    const total = book.spine.length;

    for (let i = 0; i < total; i++) {
      const item = book.spine[i];
      const abs = path.join(tempDir, ...item.href.split("/"));
      if (!fs.existsSync(abs)) continue;
      let raw = fs.readFileSync(abs, "utf8");
      raw = stripScripts(raw);

      const fromDir = path.posix.dirname(item.href);
      // Pull in the chapter's own <link rel="stylesheet"> tags.
      for (const m of raw.matchAll(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi)) {
        const hrefMatch = m[0].match(/href\s*=\s*["'](.*?)["']/i);
        if (hrefMatch) {
          const rel = path.posix.relative(book.opfDir, path.posix.normalize(path.posix.join(fromDir, hrefMatch[1])));
          stylesheets.add(rel);
        }
      }

      let body = extractTag(raw, "body") || raw;
      body = rewriteRelativePaths(body, fromDir, book.opfDir);
      chapterHtmlParts.push(`<section class="epub-chapter" id="chapter-${i}">${body}</section>`);

      if (total > 0) onProgress(8 + Math.round((i / total) * 70), `Rendering chapter ${i + 1} of ${total}…`);
    }

    let coverHtml = "";
    if (book.coverHref) {
      const rel = path.posix.relative(book.opfDir, book.coverHref);
      coverHtml = `<div class="epub-cover"><img src="${escapeHtml(rel)}" alt="Cover"></div>`;
    } else {
      coverHtml = `<div class="epub-cover"><h1>${escapeHtml(book.metadata.title)}</h1>${
        book.metadata.author ? `<h2>${escapeHtml(book.metadata.author)}</h2>` : ""
      }</div>`;
    }

    const linkTags = [...stylesheets].map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join("\n");
    const combinedHtml = `<!DOCTYPE html>
<html lang="${escapeHtml(book.metadata.language || "en")}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(book.metadata.title)}</title>
${linkTags}
<style>${BASE_STYLE}${chapterPageBreaks ? "" : ".epub-chapter{page-break-before:auto;}"}</style>
</head>
<body>
${coverHtml}
${chapterHtmlParts.join("\n")}
</body>
</html>`;

    const combinedPath = path.join(workDir, "__epub2pdf_combined__.html");
    fs.writeFileSync(combinedPath, combinedHtml, "utf8");

    onProgress(80, "Laying out pages…");
    const browser = await getBrowser();
    // javaScriptEnabled: false mirrors the desktop app's `javascript: false`
    // webPreferences — chapter content is untrusted, static book markup,
    // rendered purely for pagination. Scripts are also already stripped
    // above; this is defense in depth.
    const context = await browser.newContext({ javaScriptEnabled: false });
    let pdfBuffer: Buffer;
    try {
      const page = await context.newPage();
      await page.goto(`file://${combinedPath}`, { waitUntil: "load" });
      // Give embedded images/fonts a moment to finish decoding before print.
      await page.waitForTimeout(400);

      onProgress(90, "Generating PDF…");
      pdfBuffer = await page.pdf({
        format: pageSize,
        printBackground: true,
        preferCSSPageSize: false,
        margin: { top: "0.4in", bottom: "0.4in", left: "0.4in", right: "0.4in" },
      });
    } finally {
      await context.close().catch(() => {});
    }

    fs.mkdirSync(path.dirname(outputPdfPath), { recursive: true });
    fs.writeFileSync(outputPdfPath, pdfBuffer);

    onProgress(100, "Done");
    return { outputPdfPath, title: book.metadata.title, author: book.metadata.author, chapters: total };
  } finally {
    fs.rm(tempDir, { recursive: true, force: true }, () => {});
  }
}

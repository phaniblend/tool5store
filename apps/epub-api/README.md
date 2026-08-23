# epub-api

EPUB → PDF conversion service. Node.js + TypeScript + Playwright + Fastify.

Ported from the epub2pdf desktop app (Electron) — its conversion pipeline
(`lib/epubParser.js`, `lib/epubToPdf.js`) had no
Electron dependency except the final render step, which used
`BrowserWindow.printToPDF()`. That's swapped here for Playwright's
`page.pdf()` against the same headless-Chromium browser singleton
[apps/capture-api](../capture-api) uses — everything else (EPUB parsing,
chapter HTML assembly, path rewriting) is an unchanged port.

Not ported (desktop-only features of the source app, out of scope here
unless wanted): standalone images→PDF conversion, and the PDF
annotate/insert-image editor.

## Endpoint

`POST /api/v1/convert?pageSize=A4&chapterPageBreaks=true`

Request body: the raw `.epub` file bytes (not multipart/form-data — just
the file, like `curl --data-binary @book.epub`). `Content-Type` should be
`application/epub+zip` or `application/octet-stream`.

Query params (both optional):
- `pageSize`: `A4` (default) | `A3` | `Legal` | `Letter` | `Tabloid`
- `chapterPageBreaks`: `true` (default) | `false` — whether each chapter
  starts on a new page

Response: the PDF as `application/pdf`, `Content-Disposition: attachment`
with the book's title as the filename. Also sets `X-Book-Title`,
`X-Book-Author`, `X-Book-Chapters` headers (URL-encoded).

## Local dev

```bash
npm install
npx playwright install --with-deps chromium
npm run dev
```

```bash
curl -X POST "http://localhost:8080/api/v1/convert?pageSize=A4" \
  -H "Content-Type: application/epub+zip" \
  --data-binary @book.epub \
  --output book.pdf
```

Set `DEBUG_CONVERT=1` to log per-chapter conversion progress.

## Design notes

- **Parsing** ([src/lib/epubParser.ts](src/lib/epubParser.ts)): EPUB is a
  zip of XHTML + OPF/XML metadata — parsed with `jszip` + `fast-xml-parser`,
  no DOM library needed.
- **Conversion** ([src/lib/epubToPdf.ts](src/lib/epubToPdf.ts)): stitches
  every spine chapter into one combined HTML document (rewriting relative
  image/CSS paths so they still resolve, stripping `<script>` tags since
  chapter content is untrusted), then renders it with `javaScriptEnabled:
  false` in a fresh browser context and calls `page.pdf()`. Page breaks
  before each chapter, a generated or extracted cover page.
- **Browser reuse** ([src/lib/browser.ts](src/lib/browser.ts)): identical
  singleton pattern to capture-api — one warm Chromium process reused
  across requests.
- **Upload handling** ([src/routes/convert.ts](src/routes/convert.ts)):
  raw request body (no multipart), a magic-byte check (`PK` zip signature)
  for a clean 400 on non-EPUB input before it reaches the parser, 80MB
  body-size cap.

## Deploy (Railway)

Same monorepo pattern as the other two apps:

1. **Settings → Source → Root Directory**: `apps/epub-api`
2. Should pick up [`railway.json`](railway.json), pinned to `DOCKERFILE`
   for the same Playwright/Chromium reasons as capture-api
3. Same memory consideration as capture-api — Chromium needs real memory
   (1–2GB), and conversion of a large/image-heavy EPUB briefly holds the
   whole book's assets in a temp dir

Railway injects `PORT` itself, already read from `process.env.PORT`.

## Deploy (Cloud Run)

```bash
gcloud run deploy epub-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 120 \
  --concurrency 2
```

Lower `--concurrency` than capture-api (2 vs 4) since a conversion holds
the browser context open longer than a single screenshot does.

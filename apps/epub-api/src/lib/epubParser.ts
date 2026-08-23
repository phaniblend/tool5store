// EPUB (a zip of XHTML + OPF metadata) parsing helpers.
// Ported from D:\epub2pdf\lib\epubParser.js (the epub2pdf desktop app) —
// this half of that app has zero Electron dependency, so the port is a
// straight TypeScript translation, no logic changes.
//
// No DOM library is used — EPUB internals are XML we can parse with
// fast-xml-parser, and chapter bodies are handled with small, well-scoped
// regexes (good enough for the well-formed XHTML that EPUB requires).

import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: false,
});

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

export interface EpubMetadata {
  title: string;
  author: string;
  language: string;
  publisher: string;
  description: string;
}

export interface ParsedEpub {
  zip: JSZip;
  opfDir: string;
  manifest: Map<string, ManifestItem>;
  spine: ManifestItem[];
  metadata: EpubMetadata;
  coverHref: string | null;
}

function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(", ");
  if (typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)["#text"]);
  }
  return "";
}

function asArray<T>(node: T | T[] | null | undefined): T[] {
  if (node == null) return [];
  return Array.isArray(node) ? node : [node];
}

async function loadZip(epubPath: string): Promise<JSZip> {
  const data = fs.readFileSync(epubPath);
  return JSZip.loadAsync(data);
}

async function readZipText(zip: JSZip, zipPath: string): Promise<string> {
  const entry = zip.file(zipPath);
  if (!entry) throw new Error(`Missing file inside EPUB: ${zipPath}`);
  return entry.async("string");
}

/** Resolves a relative href against a zip-internal directory, POSIX style. */
function resolveZipPath(dir: string, href: string): string {
  if (!href) return href;
  const clean = href.split("#")[0];
  return path.posix.normalize(path.posix.join(dir, clean)).replace(/^(\.\.\/)+/, "");
}

/**
 * Opens an EPUB and returns its structure: metadata, manifest, spine
 * (in reading order), the OPF directory, and the cover image path (if any).
 */
export async function parseEpub(epubPath: string): Promise<ParsedEpub> {
  const zip = await loadZip(epubPath);

  const containerXml = await readZipText(zip, "META-INF/container.xml");
  const container = xmlParser.parse(containerXml);
  const rootfile = asArray(container?.container?.rootfiles?.rootfile)[0];
  const opfPath: string | undefined = rootfile?.["@_full-path"];
  if (!opfPath) throw new Error("EPUB is missing a valid META-INF/container.xml rootfile entry.");

  const opfDir = path.posix.dirname(opfPath) === "." ? "" : path.posix.dirname(opfPath);
  const opfXml = await readZipText(zip, opfPath);
  const opf = xmlParser.parse(opfXml);
  const pkg = opf.package;
  if (!pkg) throw new Error("EPUB OPF file is malformed (no <package> root element).");

  // ---- Manifest: id -> { href (zip-relative), mediaType, properties } ----
  const manifest = new Map<string, ManifestItem>();
  for (const item of asArray<Record<string, string>>(pkg.manifest?.item)) {
    const id = item["@_id"];
    const href = item["@_href"];
    if (!id || !href) continue;
    manifest.set(id, {
      id,
      href: resolveZipPath(opfDir, href),
      mediaType: item["@_media-type"] || "",
      properties: item["@_properties"] || "",
    });
  }

  // ---- Spine: ordered list of manifest items that make up the reading order ----
  const spine: ManifestItem[] = [];
  for (const itemref of asArray<Record<string, string>>(pkg.spine?.itemref)) {
    if (itemref["@_linear"] === "no") continue;
    const item = manifest.get(itemref["@_idref"]);
    if (item) spine.push(item);
  }
  if (spine.length === 0) throw new Error("EPUB has an empty spine — nothing to convert.");

  // ---- Metadata ----
  const md = pkg.metadata || {};
  const title = textOf(asArray(md["dc:title"])[0]) || path.basename(epubPath, path.extname(epubPath));
  const creators = asArray(md["dc:creator"]).map(textOf).filter(Boolean);
  const author = creators.join(", ");
  const language = textOf(asArray(md["dc:language"])[0]);
  const publisher = textOf(asArray(md["dc:publisher"])[0]);
  const description = textOf(asArray(md["dc:description"])[0]);

  // ---- Cover image detection (EPUB3 properties, then EPUB2 meta/guide) ----
  let coverHref: string | null = null;
  for (const item of manifest.values()) {
    if (item.properties && item.properties.split(/\s+/).includes("cover-image")) {
      coverHref = item.href;
      break;
    }
  }
  if (!coverHref) {
    const coverMeta = asArray<Record<string, string>>(md.meta).find((m) => m["@_name"] === "cover");
    const coverId = coverMeta?.["@_content"];
    if (coverId && manifest.has(coverId)) coverHref = manifest.get(coverId)!.href;
  }
  if (!coverHref) {
    const guideRef = asArray<Record<string, string>>(pkg.guide?.reference).find((r) =>
      (r["@_type"] || "").includes("cover"),
    );
    if (guideRef?.["@_href"]) coverHref = resolveZipPath(opfDir, guideRef["@_href"]);
  }

  return {
    zip,
    opfDir,
    manifest,
    spine,
    metadata: { title, author, language, publisher, description },
    coverHref,
  };
}

/** Extracts every file in the EPUB zip to destDir, preserving internal paths. */
export async function extractAll(zip: JSZip, destDir: string): Promise<void> {
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const outPath = path.join(destDir, ...entry.name.split("/"));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const content = await entry.async("nodebuffer");
    fs.writeFileSync(outPath, content);
  }
}

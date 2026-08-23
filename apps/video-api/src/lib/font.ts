import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

/**
 * drawtext needs a concrete font file path (fontfile=...), not just a
 * family name, unless ffmpeg was built with fontconfig AND the container
 * has a fontconfig cache — brittle across environments, so we sidestep it
 * entirely by requiring a real file path.
 *
 * Resolution order:
 *   1. FONT_FILE_PATH env var, if set and the file exists.
 *   2. A handful of common defaults (Debian/Ubuntu apt install of
 *      fonts-dejavu-core for containers; Windows' bundled Arial for local
 *      dev on this machine).
 *
 * Throws if none resolve — callers should surface that as a clear 502
 * rather than let ffmpeg fail with an opaque "Cannot find font" error.
 */
const CANDIDATE_PATHS = [
  process.env.FONT_FILE_PATH,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", // Debian/Ubuntu fonts-dejavu-core
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "C:\\Windows\\Fonts\\arial.ttf", // local Windows dev
].filter((p): p is string => Boolean(p));

let cached: string | null = null;

export async function resolveFontFile(): Promise<string> {
  if (cached) return cached;

  for (const candidate of CANDIDATE_PATHS) {
    try {
      await access(candidate, fsConstants.R_OK);
      cached = candidate;
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    "No usable font file found for text overlays. Set FONT_FILE_PATH to a valid .ttf/.otf path " +
      "(in the container image, `apt-get install fonts-dejavu-core` and point at " +
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf).",
  );
}

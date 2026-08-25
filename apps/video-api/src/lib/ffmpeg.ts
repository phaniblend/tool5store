import ffmpeg from "fluent-ffmpeg";
import type { Clip, TextOverlay } from "../schema/render.schema.js";
import type { DownloadedClip } from "./download.js";
import type { ProbeResult } from "./ffprobe.js";

export interface OutputSpec {
  width: number;
  height: number;
  fps: number;
}

/** A timeline that's structurally invalid given the clips' actual (probed) durations — a client input problem, not a render/encode failure. */
export class TimelineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineValidationError";
  }
}

/**
 * ffmpeg filtergraph escaping for a drawtext option value.
 *
 * The docs claim wrapping a value in apostrophes frees it from needing to
 * escape `:`/`,`/`[`/`]`/`;` — empirically (verified against this
 * project's ffmpeg 8.1/Windows build) that's not quite true for `:` and
 * `,`: an unescaped colon still terminates the value early (breaks on
 * Windows drive-letter paths like `C:\...`), and an unescaped comma inside
 * something like `enable='between(t,0,3)'` needs escaping too. So this
 * belt-and-suspenders approach backslash-escapes `\`, `:`, and `,` *and*
 * wraps the result in apostrophes. The one thing that still can't appear
 * inside an apostrophe-quoted value (no in-quote escape exists for it) is
 * the apostrophe itself, so it's swapped for a typographic right single
 * quote rather than attempting the close-quote/escape/reopen-quote dance.
 */
function quoteFilterValue(value: string): string {
  const sanitized = value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "’")
    .replace(/%/g, "%%");
  return `'${sanitized}'`;
}

function fmt(n: number): string {
  // Fixed precision keeps the filtergraph string deterministic and avoids
  // floating-point noise like 1.2000000000000002 leaking into it.
  return n.toFixed(3);
}

interface Segment {
  videoLabel: string;
  audioLabel: string;
  filters: string[];
}

/**
 * Builds the -filter_complex graph string plus the final [v]/[a] labels to
 * map to the output. Pure function — no I/O — so it's unit-testable
 * independent of actually running ffmpeg.
 */
export function buildFilterGraph(params: {
  clips: Clip[];
  downloaded: DownloadedClip[];
  probes: ProbeResult[];
  textOverlays: TextOverlay[];
  output: OutputSpec;
  fontFile: string;
}): { filterComplex: string; videoLabel: string; audioLabel: string; inputPaths: string[] } {
  const { clips, probes, textOverlays, output, fontFile } = params;
  const { width: W, height: H, fps: FPS } = output;

  const filters: string[] = [];
  const segments: Segment[] = [];
  let cumulativeEnd = 0;

  clips.forEach((clip, i) => {
    const probeDuration = probes[i].durationSec;
    const trimEnd = clip.trimEnd ?? probeDuration;
    const clipDuration = trimEnd - clip.trimStart;

    if (clipDuration <= 0) {
      throw new TimelineValidationError(
        `clips[${i}]: trimStart (${clip.trimStart}) leaves no duration against source length ${fmt(probeDuration)}s`,
      );
    }

    // Gap filler: honor a clip's declared `start` by inserting black
    // video + silence between the previous clip's end and this one. An
    // omitted `start` means "right after the previous clip" (gap = 0),
    // which is always valid — there's nothing to check it against.
    const declaredStart = clip.start ?? cumulativeEnd;
    const gap = declaredStart - cumulativeEnd;
    if (gap > 0.01) {
      const vLabel = `vgap${i}`;
      const aLabel = `agap${i}`;
      filters.push(`color=c=black:s=${W}x${H}:d=${fmt(gap)}:r=${FPS}[${vLabel}]`);
      filters.push(`anullsrc=r=44100:cl=stereo:d=${fmt(gap)}[${aLabel}]`);
      segments.push({ videoLabel: vLabel, audioLabel: aLabel, filters: [] });
      cumulativeEnd += gap;
    } else if (gap < -0.01) {
      throw new TimelineValidationError(
        `clips[${i}]: start (${fmt(declaredStart)}) overlaps the previous clip, which ends at ${fmt(cumulativeEnd)}s — overlapping clips are not supported`,
      );
    }

    const vLabel = `v${i}`;
    const aLabel = `a${i}`;

    filters.push(
      `[${i}:v]trim=start=${fmt(clip.trimStart)}:end=${fmt(trimEnd)},setpts=PTS-STARTPTS,` +
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS}[${vLabel}]`,
    );

    if (probes[i].hasAudio) {
      filters.push(
        `[${i}:a]atrim=start=${fmt(clip.trimStart)}:end=${fmt(trimEnd)},asetpts=PTS-STARTPTS,` +
          `aformat=sample_rates=44100:channel_layouts=stereo[${aLabel}]`,
      );
    } else {
      // No source audio track — synthesize silence of matching duration so
      // every segment fed to `concat` has both a video and audio stream.
      filters.push(`anullsrc=r=44100:cl=stereo:d=${fmt(clipDuration)}[${aLabel}]`);
    }

    segments.push({ videoLabel: vLabel, audioLabel: aLabel, filters: [] });
    cumulativeEnd += clipDuration;
  });

  const concatInputs = segments.map((s) => `[${s.videoLabel}][${s.audioLabel}]`).join("");
  filters.push(`${concatInputs}concat=n=${segments.length}:v=1:a=1[vconcat][aconcat]`);

  // Chain text overlays onto the concatenated video track.
  let videoLabel = "vconcat";
  textOverlays.forEach((overlay, j) => {
    const nextLabel = `vtext${j}`;
    const x = overlay.x === "center" ? "(w-text_w)/2" : fmt(overlay.x);
    const y = overlay.y === "center" ? "(h-text_h)/2" : fmt(overlay.y);
    const end = overlay.end ?? cumulativeEnd;

    const parts = [
      `fontfile=${quoteFilterValue(fontFile)}`,
      `text=${quoteFilterValue(overlay.text)}`,
      `x=${x}`,
      `y=${y}`,
      `fontsize=${overlay.fontSize}`,
      `fontcolor=${overlay.color}`,
      overlay.box ? "box=1:boxcolor=black@0.5:boxborderw=8" : undefined,
      `enable=${quoteFilterValue(`between(t,${fmt(overlay.start)},${fmt(end)})`)}`,
    ].filter(Boolean);

    filters.push(`[${videoLabel}]drawtext=${parts.join(":")}[${nextLabel}]`);
    videoLabel = nextLabel;
  });

  return {
    filterComplex: filters.join(";"),
    videoLabel,
    audioLabel: "aconcat",
    inputPaths: params.downloaded.map((d) => d.localPath),
  };
}

export interface RenderOptions {
  inputPaths: string[];
  filterComplex: string;
  videoLabel: string;
  audioLabel: string;
  fps: number;
  outputPath: string;
}

/** Runs the actual ffmpeg encode. Wraps fluent-ffmpeg's event API in a Promise. */
export function renderToFile(opts: RenderOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    for (const input of opts.inputPaths) {
      command.input(input);
    }

    command
      .complexFilter(opts.filterComplex)
      .outputOptions([
        "-map",
        `[${opts.videoLabel}]`,
        "-map",
        `[${opts.audioLabel}]`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(opts.fps),
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
      ])
      .output(opts.outputPath)
      .on("start", (cmd) => {
        if (process.env.DEBUG_FFMPEG) console.error("[ffmpeg cmd]", cmd);
      })
      .on("stderr", (line) => {
        if (process.env.DEBUG_FFMPEG) console.error("[ffmpeg]", line);
      })
      .on("error", (err) => reject(new Error(`ffmpeg encode failed: ${err.message}`)))
      .on("end", () => resolve())
      .run();
  });
}

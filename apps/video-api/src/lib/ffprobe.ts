import ffmpeg from "fluent-ffmpeg";

export interface ProbeResult {
  durationSec: number;
  hasAudio: boolean;
}

/** Wraps fluent-ffmpeg's callback-based ffprobe() in a Promise. */
export function probe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        reject(new Error(`ffprobe failed for ${filePath}: ${err.message}`));
        return;
      }
      const durationSec = data.format.duration ?? 0;
      const hasAudio = data.streams.some((s) => s.codec_type === "audio");
      resolve({ durationSec, hasAudio });
    });
  });
}

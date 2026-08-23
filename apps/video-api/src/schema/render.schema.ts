import { z } from "zod";

export const ClipSchema = z.object({
  url: z.string().url("clip url must be a valid absolute URL").max(2048),
  // Where this clip begins on the OUTPUT timeline, in seconds. Clips are
  // placed in array order; a gap between one clip's end and the next
  // clip's declared `start` is filled with black video + silent audio so
  // the requested start times are honored. Overlapping clips (next start
  // earlier than previous end) are not supported in v1 — rejected with a
  // 400 rather than silently mis-compositing.
  start: z.number().min(0).default(0),
  // In-point within the source file, seconds.
  trimStart: z.number().min(0).default(0),
  // Out-point within the source file, seconds. Omit to use the full
  // remaining duration of the source (probed via ffprobe).
  trimEnd: z.number().min(0).optional(),
});

export const TextOverlaySchema = z.object({
  text: z.string().min(1).max(500),
  start: z.number().min(0).default(0),
  // Omit to run until the end of the rendered output.
  end: z.number().min(0).optional(),
  x: z.union([z.literal("center"), z.number()]).default("center"),
  y: z.union([z.literal("center"), z.number()]).default("center"),
  fontSize: z.number().int().min(8).max(300).default(36),
  color: z.string().max(32).default("white"),
  box: z.boolean().default(true),
});

export const RenderRequestSchema = z
  .object({
    output: z
      .object({
        width: z.number().int().min(64).max(3840).default(1280),
        height: z.number().int().min(64).max(2160).default(720),
        fps: z.number().int().min(1).max(60).default(30),
        format: z.enum(["mp4"]).default("mp4"),
      })
      .default({ width: 1280, height: 720, fps: 30, format: "mp4" }),

    clips: z.array(ClipSchema).min(1, "at least one clip is required").max(20),

    textOverlays: z.array(TextOverlaySchema).max(20).default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    for (let i = 1; i < data.clips.length; i++) {
      if (data.clips[i].start < data.clips[i - 1].start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `clips[${i}].start (${data.clips[i].start}) must be >= clips[${i - 1}].start (${data.clips[i - 1].start}); clips must be given in timeline order`,
          path: ["clips", i, "start"],
        });
      }
    }
    for (const [i, clip] of data.clips.entries()) {
      if (clip.trimEnd !== undefined && clip.trimEnd <= clip.trimStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `clips[${i}].trimEnd must be greater than trimStart`,
          path: ["clips", i, "trimEnd"],
        });
      }
    }
  });

export type RenderRequest = z.infer<typeof RenderRequestSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type TextOverlay = z.infer<typeof TextOverlaySchema>;

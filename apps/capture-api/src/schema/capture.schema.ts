import { z } from "zod";

export const CaptureRequestSchema = z
  .object({
    url: z
      .string({ required_error: "url is required" })
      .url("url must be a valid absolute URL (http/https)")
      .max(2048),

    format: z.enum(["png", "jpeg", "webp"]).default("png"),

    viewport: z
      .object({
        width: z.number().int().min(200).max(3840).default(1280),
        height: z.number().int().min(200).max(2160).default(800),
      })
      .default({ width: 1280, height: 800 }),

    fullPage: z.boolean().default(false),

    // Only meaningful for jpeg/webp; ignored for png.
    quality: z.number().int().min(1).max(100).optional(),

    waitUntil: z
      .enum(["load", "domcontentloaded", "networkidle"])
      .default("networkidle"),

    timeoutMs: z.number().int().min(1000).max(30000).default(15000),

    dismissOverlays: z.boolean().default(true),

    deviceScaleFactor: z.number().min(0.5).max(3).default(1),
  })
  .strict();

export type CaptureRequest = z.infer<typeof CaptureRequestSchema>;

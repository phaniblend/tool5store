import { z } from "zod";

// Options travel as query params since the request body is the raw EPUB
// file itself (see routes/convert.ts) — there's no JSON body to put them in.
export const ConvertQuerySchema = z
  .object({
    pageSize: z.enum(["A4", "A3", "Legal", "Letter", "Tabloid"]).default("A4"),
    chapterPageBreaks: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
  })
  .strict();

export type ConvertQuery = z.infer<typeof ConvertQuerySchema>;

import { z } from "zod";
import { idSchema } from "./common.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/**
 * A long-form writing entry (article, talk write-up). Structured fields
 * come from MDX frontmatter; `body` is the MDX document's prose, merged in
 * by the content loader before this schema runs.
 */
export const writingEntrySchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  publishedDate: isoDateSchema,
  summary: z.string().min(1),
  /** Canonical external URL, if first published elsewhere. */
  url: z.url().optional(),
  body: z.string().min(1),
});

export type WritingEntry = z.infer<typeof writingEntrySchema>;

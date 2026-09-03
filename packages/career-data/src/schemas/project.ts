import { z } from "zod";
import { idSchema } from "./common.js";

const linkSchema = z.object({
  label: z.string().min(1),
  url: z.url(),
});

/** `YYYY-MM` month-precision date, same convention as experience/education. */
const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

/**
 * When the project's work actually happened (#224). Optional because most
 * write-ups don't need one; a project that declares a period is only
 * "related" to experience entries whose own date span overlaps it — see
 * apps/web's related-projects rule. An omitted `end` means ongoing.
 */
const periodSchema = z
  .object({
    start: yearMonthSchema,
    end: yearMonthSchema.optional(),
  })
  .refine((period) => period.end === undefined || period.end >= period.start, {
    message: "end must not be before start",
    path: ["end"],
  });

/**
 * A project write-up. Structured fields (name, summary, tech, links) come
 * from MDX frontmatter; `body` is the MDX document's long-form prose,
 * merged in by the content loader before this schema runs.
 */
export const projectSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  summary: z.string().min(1),
  role: z.string().min(1),
  tech: z.array(z.string().min(1)).min(1),
  links: z.array(linkSchema),
  body: z.string().min(1),
  /**
   * Flagship/featured treatment (#191): a `featured: true` project is
   * surfaced first by the site's listing views and rendered with a
   * visually-distinct flagship card on `/projects` and the home page.
   * Optional — the overwhelmingly common case is an ordinary project with
   * no flag at all.
   */
  featured: z.boolean().optional(),
  /**
   * Optional `YYYY-MM` span of when the work happened — see
   * {@link periodSchema}. The flagship record carries one so tech-tag
   * overlap alone can't relate the 2026 portfolio to a 2013 role (#224).
   */
  period: periodSchema.optional(),
  /**
   * Optional lifecycle stage (#300) — explicit deployment maturity so search
   * and agents never have to infer from prose whether a write-up describes
   * something shipped or something tested. `proof-of-concept` work is
   * rendered and indexed with that label. Existing projects may omit it
   * until separately reviewed; never guessed.
   */
  stage: z.enum(["proof-of-concept", "pilot", "production"]).optional(),
});

export type Project = z.infer<typeof projectSchema>;

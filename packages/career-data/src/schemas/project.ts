import { z } from "zod";
import { idSchema } from "./common.js";

const linkSchema = z.object({
  label: z.string().min(1),
  url: z.url(),
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
});

export type Project = z.infer<typeof projectSchema>;

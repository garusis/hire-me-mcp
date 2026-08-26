import { z } from "zod";
import { idSchema } from "./common.js";

/** A single public contact surface, e.g. a website, email, or social link. */
const contactSchema = z.object({
  label: z.string().min(1),
  url: z.url(),
});

/**
 * Identity, headline, location and public contact surface — the singleton
 * "who is this" record content is sourced from `content/profile.json`.
 */
export const profileSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  headline: z.string().min(1),
  location: z.string().min(1),
  availability: z.enum(["open", "selective", "not-looking"]),
  /**
   * Purpose-written one-liner for share previews and SERP snippets (#236)
   * — capped at 200 characters because every consumer (og:description,
   * twitter:description, meta description) truncates around 120–200.
   * Optional: consumers fall back to `summary` when unauthored.
   */
  shortSummary: z.string().min(1).max(200).optional(),
  summary: z.string().min(1),
  contacts: z.array(contactSchema).min(1),
});

export type Profile = z.infer<typeof profileSchema>;

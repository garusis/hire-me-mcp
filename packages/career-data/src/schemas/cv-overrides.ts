import { z } from "zod";
import { idSchema } from "./common.js";

/**
 * The CV's two selectable audiences (#309 stage 3, open question 2):
 * `general` leads with full-stack range and is the default PDF; `ai` leads
 * with LLM/agentic depth for AI-tooling-company postings. Both read the
 * same canonical dataset — only selection, order and CV-only wording vary.
 */
export const cvVariantSchema = z.enum(["general", "ai"]);
export type CvVariant = z.infer<typeof cvVariantSchema>;

/** Per-variant CV-only text: at least one variant must be authored. */
const variantTextSchema = z
  .object({
    general: z.string().min(1).optional(),
    ai: z.string().min(1).optional(),
  })
  .refine((value) => value.general !== undefined || value.ai !== undefined, {
    message: "at least one of general/ai must be set",
  });

/** Per-variant CV-only bullet lists, replacing an experience entry's canonical `highlights` on the CV only. */
const variantBulletsSchema = z
  .object({
    general: z.array(z.string().min(1)).min(1).optional(),
    ai: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((value) => value.general !== undefined || value.ai !== undefined, {
    message: "at least one of general/ai must be set",
  });

/**
 * CV-only presentation for `profile.json` (#309 stage 3 actions 3, 4, 12):
 * a general-first vs. AI-first headline/summary and a time-zone clause the
 * profile schema has no field for yet. The canonical `Profile` is never
 * edited for this — see the design constraint in issue #309.
 */
const cvProfileOverrideSchema = z.object({
  headline: variantTextSchema.optional(),
  summary: variantTextSchema.optional(),
  /** e.g. "Remote (UTC-5, full US-hours overlap)" — appended after `profile.location` on the CV only. */
  timezoneLine: z.string().min(1).optional(),
});

/**
 * CV-only presentation for one `ExperienceEntry` (#309 stage 3 actions 1,
 * 2, 8, 10, 11): replacement bullets per variant, tech-line additions, and
 * — for the earliest roles — a single compact line that collapses the
 * entry into an "Earlier experience" block instead of a full entry.
 */
const cvExperienceOverrideSchema = z.object({
  id: idSchema,
  bullets: variantBulletsSchema.optional(),
  techAdditions: z.array(z.string().min(1)).optional(),
  /** When set, the CV renders this role as one dated line under "Earlier experience" instead of a full entry. */
  compactLine: z.string().min(1).optional(),
});

/** CV-only project inclusion (#309 stage 3 action 7): only entries listed here are ever hidden — everything else defaults to shown. */
const cvProjectOverrideSchema = z.object({
  id: idSchema,
  showOnCv: z.boolean(),
});

/**
 * CV-only education presentation (#309 stage 3 action 17 / open question 6):
 * `line` replaces the rendered institution/credential line; `showOnCv: false`
 * omits the entry from the CV entirely (e.g. a low-signal certificate that
 * doesn't fit the two-page budget, #309 stage 2 section 3.12) while it
 * stays fully present on the MCP and the site. Either, both, or neither
 * may be set.
 */
const cvEducationOverrideSchema = z.object({
  id: idSchema,
  line: z.string().min(1).optional(),
  showOnCv: z.boolean().optional(),
});

/**
 * CV-only skills presentation (#309 stage 3 actions 5, 6): the CV groups
 * `skills.json` by its existing `category` field rather than proficiency,
 * with human display labels, a variant-ordered group sequence, excluded
 * ids (the CV doesn't want AngularJS/Socket.IO/etc. in the keyword block —
 * they still appear on the early-career tech lines) and per-skill display
 * name overrides (ATS-friendly wording, canonical name unchanged).
 */
const cvSkillsOverrideSchema = z.object({
  categoryLabels: z.record(z.string().min(1), z.string().min(1)),
  groupOrder: z.object({
    general: z.array(z.string().min(1)).min(1),
    ai: z.array(z.string().min(1)).min(1),
  }),
  excludeIds: z.array(idSchema),
  displayNames: z.record(idSchema, z.string().min(1)),
});

/**
 * The whole CV-only overlay (#309 stage 3): everything a reader sees on
 * the generated PDF that isn't a straight pass-through of canonical text.
 * The MCP and the rest of the web app never read this file — only
 * `getCvView()` does — so it can be rewritten freely without touching
 * what the MCP or the site serve.
 */
export const cvOverridesSchema = z.object({
  profile: cvProfileOverrideSchema,
  experience: z.array(cvExperienceOverrideSchema),
  projects: z.array(cvProjectOverrideSchema),
  education: z.array(cvEducationOverrideSchema),
  skills: cvSkillsOverrideSchema,
});

export type CvProfileOverride = z.infer<typeof cvProfileOverrideSchema>;
export type CvExperienceOverride = z.infer<typeof cvExperienceOverrideSchema>;
export type CvProjectOverride = z.infer<typeof cvProjectOverrideSchema>;
export type CvEducationOverride = z.infer<typeof cvEducationOverrideSchema>;
export type CvSkillsOverride = z.infer<typeof cvSkillsOverrideSchema>;
export type CvOverrides = z.infer<typeof cvOverridesSchema>;

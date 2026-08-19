import { z } from "zod";
import { idSchema } from "./common.js";

/**
 * A skill/technology explicitly **not** claimed. First-class, not the
 * absence of a Skill record — a Gap is representable on its own, with no
 * corresponding Skill entry required, so downstream agents can answer "no,
 * he has not worked with X" from data instead of inferring it from silence.
 */
export const gapSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  /** The honest, first-person-neutral statement of what is not claimed and why. */
  statement: z.string().min(1),
  /** Ids of adjacent Skills that are claimed, for "closest thing he has done" framing. */
  relatedSkills: z.array(idSchema),
});

export type Gap = z.infer<typeof gapSchema>;

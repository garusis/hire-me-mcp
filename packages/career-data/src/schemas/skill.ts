import { z } from "zod";
import { citationSchema } from "./citation.js";
import { idSchema } from "./common.js";

/**
 * A skill claim, backed by at least one citation into evidence (an
 * ExperienceEntry or Project) — enforced here at the shape level; whether
 * cited entities actually exist is a cross-entity concern for #51.
 */
export const skillSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  category: z.string().min(1),
  proficiency: z.enum(["familiar", "proficient", "expert"]),
  evidence: z.array(citationSchema).min(1),
});

export type Skill = z.infer<typeof skillSchema>;

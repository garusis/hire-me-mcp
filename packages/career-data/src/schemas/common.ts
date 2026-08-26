import { z } from "zod";

/**
 * Stable, unique identifier shared by every citable entity (Profile,
 * ExperienceEntry, Project, Skill, Gap, EducationEntry, WritingEntry,
 * Recommendation).
 *
 * Kebab-case so ids double as readable, greppable filenames/anchors — e.g.
 * `senior-engineer-acme-2021`. `Citation.entityId` addresses this field.
 */
export const idSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "id must be lowercase kebab-case (e.g. senior-engineer-acme-2021)",
  );

/**
 * The set of entity kinds a Citation can address — one per citable schema
 * defined in this package, plus nothing else. Kept as a standalone export so
 * `Citation` and the content loader's entity-type-to-schema map share a
 * single source of truth.
 */
export const citableEntityTypeSchema = z.enum([
  "profile",
  "experience",
  "project",
  "skill",
  "gap",
  "education",
  "writing",
  "recommendation",
]);

export type CitableEntityType = z.infer<typeof citableEntityTypeSchema>;

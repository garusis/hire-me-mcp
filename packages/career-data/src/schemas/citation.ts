import { z } from "zod";
import { citableEntityTypeSchema, idSchema } from "./common.js";

/**
 * A stable, machine-readable pointer to the source entry backing a claim.
 *
 * Every domain-service response in `packages/core` attaches Citations
 * instead of composing prose, so downstream consumers can resolve a claim
 * back to the exact record (and optionally sub-field) that supports it.
 */
export const citationSchema = z.object({
  /** Which schema the cited entity belongs to. */
  entityType: citableEntityTypeSchema,
  /** The cited entity's own stable `id`. */
  entityId: idSchema,
  /**
   * Optional anchor into a sub-part of the entity, e.g. `highlights.0` for
   * the first highlight of an ExperienceEntry. Freeform because the shape it
   * addresses varies per entity type.
   */
  fragment: z.string().min(1).optional(),
  /** Human-readable label for rendering the citation, e.g. in a footnote. */
  label: z.string().min(1),
});

export type Citation = z.infer<typeof citationSchema>;

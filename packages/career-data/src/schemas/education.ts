import { z } from "zod";
import { idSchema } from "./common.js";

const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

/**
 * A single credential earned at an institution, with an optional open end
 * date and an optional start date.
 *
 * `startDate` is optional as a documented deviation from the general
 * "every entry has start" convention: unlike roles (where the start date is
 * always known), a credential's start date is sometimes genuinely not on
 * record anywhere (e.g. a long-running in-progress degree). Rather than
 * invent a plausible-looking date for a public-facing record, the schema
 * allows omitting it.
 */
export const educationEntrySchema = z
  .object({
    id: idSchema,
    institution: z.string().min(1),
    credential: z.string().min(1),
    /** Omitted when the credential's start date is not on record. */
    startDate: yearMonthSchema.optional(),
    /** Omitted means the credential is in progress. */
    endDate: yearMonthSchema.optional(),
  })
  .refine(
    (entry) =>
      entry.startDate === undefined ||
      entry.endDate === undefined ||
      entry.endDate >= entry.startDate,
    {
      message: "endDate must not be before startDate",
      path: ["endDate"],
    },
  );

export type EducationEntry = z.infer<typeof educationEntrySchema>;

import { z } from "zod";
import { idSchema } from "./common.js";

const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

/** A single credential earned at an institution, with an optional open end date. */
export const educationEntrySchema = z
  .object({
    id: idSchema,
    institution: z.string().min(1),
    credential: z.string().min(1),
    startDate: yearMonthSchema,
    /** Omitted means the credential is in progress. */
    endDate: yearMonthSchema.optional(),
  })
  .refine((entry) => entry.endDate === undefined || entry.endDate >= entry.startDate, {
    message: "endDate must not be before startDate",
    path: ["endDate"],
  });

export type EducationEntry = z.infer<typeof educationEntrySchema>;

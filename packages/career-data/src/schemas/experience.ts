import { z } from "zod";
import { idSchema } from "./common.js";

/** `YYYY-MM` month-precision date, used across career-data date fields. */
const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

/** A single role held at a company, with an optional open end date. */
export const experienceEntrySchema = z
  .object({
    id: idSchema,
    company: z.string().min(1),
    role: z.string().min(1),
    startDate: yearMonthSchema,
    /** Omitted (or undefined) means the role is current. */
    endDate: yearMonthSchema.optional(),
    summary: z.string().min(1),
    highlights: z.array(z.string().min(1)).min(1),
    tech: z.array(z.string().min(1)),
  })
  .refine((entry) => entry.endDate === undefined || entry.endDate >= entry.startDate, {
    message: "endDate must not be before startDate",
    path: ["endDate"],
  });

export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;

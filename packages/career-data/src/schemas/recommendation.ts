import { z } from "zod";
import { idSchema } from "./common.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/**
 * A recommendation received on LinkedIn (#190), stored verbatim — `text` is
 * the full recommendation exactly as written by its author, never trimmed
 * or paraphrased.
 *
 * LinkedIn exposes no per-recommendation permalinks, so verifiability is
 * carried by two URLs instead: `recommenderProfileUrl` (the author's own
 * LinkedIn profile) and `sourceUrl` (the received-recommendations section
 * of Marcos's profile, where the entry itself is publicly visible).
 */
export const recommendationSchema = z.object({
  id: idSchema,
  /** The recommender's full name, as shown on LinkedIn. */
  recommenderName: z.string().min(1),
  /** The recommender's title/role at the time the recommendation was written. */
  recommenderTitle: z.string().min(1),
  /**
   * The working relationship LinkedIn recorded for the recommendation,
   * e.g. "Jeff was senior to Marcos but not his direct manager".
   */
  relationship: z.string().min(1),
  /** The date the recommendation was written (YYYY-MM-DD). */
  date: isoDateSchema,
  /** The recommendation's full text, verbatim. */
  text: z.string().min(1),
  /** The recommender's LinkedIn profile URL. */
  recommenderProfileUrl: z.url(),
  /**
   * The recommendations section of Marcos's LinkedIn profile — the closest
   * verifiable source link LinkedIn offers, since individual
   * recommendations have no permalinks.
   */
  sourceUrl: z.url(),
});

export type Recommendation = z.infer<typeof recommendationSchema>;

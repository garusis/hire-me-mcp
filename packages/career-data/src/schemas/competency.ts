import { z } from "zod";

/**
 * The controlled behavioral-competency vocabulary (#289) — the single typed
 * source of truth every `CareerStory` draws its `primaryCompetency` and
 * `supportingCompetencies` from.
 *
 * A competency describes a transferable behavior a recruiter can evaluate
 * independently of company, domain, or technology. Technologies, vendors,
 * architectures, domains, situations, and outcomes are retrieval facets or
 * narrative evidence, never competencies — and no value here may equal a
 * story's retrieval tag (enforced by the story schema). Compound values
 * such as `resilience-and-adaptability` are deliberately absent: a story
 * expresses more than one behavior through supporting competencies, not
 * through a wider vocabulary.
 *
 * Add a value only when an owner-approved story demonstrates a genuinely
 * different recruiter-relevant behavior the taxonomy cannot express without
 * distortion. Kept sorted so a diff shows exactly what changed.
 */
export const COMPETENCIES = [
  "adaptability",
  "collaboration",
  "communication",
  "customer-focus",
  "decision-making",
  "influence",
  "integrity",
  "leadership",
  "learning-agility",
  "learning-from-failure",
  "mentoring",
  "navigating-ambiguity",
  "ownership",
  "personal-accountability",
  "prioritization",
  "problem-solving",
  "process-improvement",
  "receptiveness-to-feedback",
  "resilience",
  "risk-management",
  "self-awareness",
  "stakeholder-management",
  "technical-judgment",
  "technical-leadership",
] as const;

export const competencySchema = z.enum(COMPETENCIES);

export type Competency = z.infer<typeof competencySchema>;

/** Whether `value` is a member of the controlled competency vocabulary. */
export function isCompetency(value: string): value is Competency {
  return (COMPETENCIES as readonly string[]).includes(value);
}

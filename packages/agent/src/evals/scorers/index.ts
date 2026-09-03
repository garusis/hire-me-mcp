/** Public surface of the eval suite's scorers (#72) — see each module for its scoring rules. */

export {
  scoreAnswerAssertions,
  scoreFactualBoundaryCompliance,
  scorePreferredSourceCompliance,
} from "./answer-assertions.js";
export type { GapHonestyDirection } from "./gap-honesty.js";
export { scoreGapHonesty } from "./gap-honesty.js";
export { scoreGroundedness } from "./groundedness.js";
export { scoreRelevance } from "./relevance.js";
export { scoreStoryCompleteness } from "./story-completeness.js";
export { scoreToolRouting } from "./tool-routing.js";
export type { EvalTranscript, ReturnedCitation, ScoreResult } from "./types.js";
export { clampScore } from "./types.js";

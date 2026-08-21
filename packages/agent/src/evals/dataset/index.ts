/** Public surface of the eval suite's dataset (#72). */

export { EVAL_CASES } from "./cases.js";
export type {
  EvalCase,
  EvalCaseCategory,
  EvalCaseGapHonestyDirection,
} from "./schema.js";
export {
  evalCaseCategorySchema,
  evalCaseSchema,
  evalDatasetSchema,
  gapHonestyDirectionSchema,
} from "./schema.js";

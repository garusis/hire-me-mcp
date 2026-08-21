/**
 * Per-turn agent step/tool-call cap for `POST /api/chat` (#68) — bounds how
 * many tool-call round trips a single turn can take, so a looping or
 * confused model can't burn unbounded provider budget on one request.
 *
 * `maxSteps` is passed straight through to `agent.stream()`'s own
 * `maxSteps` option (Mastra's step budget — see `handler.ts`), and enforced
 * a second time, mechanically, in the handler's own chunk loop: once the
 * number of distinct tool calls observed on the stream exceeds this limit,
 * the handler stops reading and emits a `step_limit_exceeded` error event
 * regardless of what Mastra's internal accounting does — see `handler.ts`
 * for why both layers exist (defense in depth against a stub or future
 * Mastra version that doesn't actually stop the model loop at `maxSteps`).
 *
 * Default of 8: the interview agent has four tools (#64), each answering
 * one bounded query; a genuine multi-part question ("compare his backend
 * and frontend experience") plausibly needs 2-4 calls. 8 is double a
 * generous real turn's usage — enough headroom for retries within a turn,
 * tight enough that a loop is stopped within a bounded number of provider
 * calls rather than running to the route's 60s `maxDuration` ceiling.
 */

const DEFAULT_MAX_STEPS = 8;

export const CHAT_AGENT_LIMITS_DEFAULTS = { maxSteps: DEFAULT_MAX_STEPS } as const;

/** Minimal shape of `process.env` this module reads. */
export type ChatAgentLimitEnv = Record<string, string | undefined>;

/** Reads the `CHAT_AGENT_MAX_STEPS` override from `env` (defaults to `process.env`), falling back to the default for anything unset, empty, non-numeric, non-integer, or non-positive. */
export function readChatAgentStepLimit(env: ChatAgentLimitEnv = process.env): number {
  const raw = env.CHAT_AGENT_MAX_STEPS;
  if (!raw) return DEFAULT_MAX_STEPS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_MAX_STEPS;
  return parsed;
}

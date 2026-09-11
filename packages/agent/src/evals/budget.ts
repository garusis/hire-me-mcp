/**
 * Budget enforcement for the eval suite (#72) — mandatory per the issue:
 * "a configurable maximum number of cases and maximum token/cost budget per
 * run, enforced by the runner, which aborts with a clear message rather
 * than silently spending."
 *
 * `assertWithinBudget` is called by the runner (`./runner.ts`) before each
 * case and after tallying its usage; it throws {@link BudgetExceededError}
 * — never silently truncates the run — the instant any cap would be
 * crossed, naming exactly which cap and the numbers involved.
 *
 * ## Cost estimation
 *
 * The default chat provider is Gemini free tier (`packages/agent/README.md`
 * — "Gemini free tier is the default"), so a real run's actual dollar cost
 * is $0 today. `estimateCostUsd`/`getModelPricing` exist as a **safety
 * net**, not a live pricing feed: if the project ever switches
 * `CHAT_PROVIDER` to a paid binding (or Gemini's free tier is retired for
 * this model), the cost cap still fires instead of the run silently
 * spending on a provider nobody priced. `MODEL_PRICING` below is a small,
 * intentionally conservative table of publicly documented per-million-token
 * list prices (approximate, checked at the time this suite was built —
 * update it if a provider repricing is confirmed); unrecognized model ids
 * fall back to `DEFAULT_PRICING`, a deliberately pessimistic (i.e. higher
 * than any listed price) per-token rate so an unpriced model still trips
 * the cost cap before an unbounded spend, rather than silently reporting
 * $0.
 */

import type { RetryAttemptRecord } from "./retry.js";

export interface BudgetConfig {
  maxCases: number;
  maxTotalTokens: number;
  maxCostUsd: number;
}

export interface BudgetUsage {
  casesRun: number;
  totalTokens: number;
  costUsd: number;
}

/**
 * Thrown by {@link assertWithinBudget} the instant a configured cap would be
 * crossed. Never silently swallowed by the runner.
 *
 * `attempts` (#307 review issuecomment-5577656024, finding 1) carries the
 * KNOWN per-attempt usage trace collected for whichever case was in flight
 * when a {@link BudgetGuard.assertNotExceeded} check stopped it mid-case —
 * `./cli.ts`'s `createRunCase` attaches the current case's tracker attempts
 * before rethrowing this error, so `./runner.ts` can fold that known usage
 * into totals instead of discarding it, and tell "stopped mid-case" apart
 * from "never started" (an empty trace). Defaults to `[]`: every OTHER
 * throw site (`assertWithinBudget`'s own post-case cap check, or a guard
 * check with no case context) has no such trace to attach.
 */
export class BudgetExceededError extends Error {
  attempts: readonly RetryAttemptRecord[];

  constructor(message: string, attempts: readonly RetryAttemptRecord[] = []) {
    super(message);
    this.name = "BudgetExceededError";
    this.attempts = attempts;
  }
}

/** Throws {@link BudgetExceededError} if `usage` has crossed any of `config`'s caps. Checked before AND after each case by the runner. */
export function assertWithinBudget(config: BudgetConfig, usage: BudgetUsage): void {
  if (usage.casesRun > config.maxCases) {
    throw new BudgetExceededError(
      `Eval case cap exceeded: ${usage.casesRun} case(s) run, max is ${config.maxCases}. Aborting rather than spending further.`,
    );
  }
  if (usage.totalTokens > config.maxTotalTokens) {
    throw new BudgetExceededError(
      `Eval token budget exceeded: ${usage.totalTokens} total token(s) used, max is ${config.maxTotalTokens}. Aborting rather than spending further.`,
    );
  }
  if (usage.costUsd > config.maxCostUsd) {
    throw new BudgetExceededError(
      `Eval cost budget exceeded: $${usage.costUsd.toFixed(4)} spent, max is $${config.maxCostUsd.toFixed(4)}. Aborting rather than spending further.`,
    );
  }
}

/** Per-million-token USD list pricing for a model — see module docs for how this is used and its limits. */
export interface TokenPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Small, approximate, documented-at-build-time pricing table (see module docs) — not a live feed. */
const MODEL_PRICING: Readonly<Record<string, TokenPricing>> = {
  "gemini-3.5-flash-lite": { inputPerMillion: 0, outputPerMillion: 0 }, // free tier — the project's default
  "gemini-3.6-flash": { inputPerMillion: 0, outputPerMillion: 0 }, // free tier — former default, still swappable via CHAT_MODEL_ID
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
};

/** Deliberately pessimistic fallback for a model id not in {@link MODEL_PRICING}, so an unpriced/unknown model still trips the cost cap instead of reporting $0. */
const DEFAULT_PRICING: TokenPricing = { inputPerMillion: 15, outputPerMillion: 75 };

/** Look up a model's per-million-token pricing, falling back to a pessimistic default for an unrecognized id — never throws. */
export function getModelPricing(modelId: string): TokenPricing {
  return MODEL_PRICING[modelId] ?? DEFAULT_PRICING;
}

/** Estimate a run's USD cost from token counts and per-million-token pricing. */
export function estimateCostUsd(
  tokens: { inputTokens: number; outputTokens: number },
  pricing: TokenPricing,
): number {
  const inputCost = (tokens.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (tokens.outputTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}

/**
 * Enforces the token/cost budget BEFORE every provider request, not once per
 * case after it completes (#307 second independent-review correction, 2nd
 * round, finding 2). `assertWithinBudget` above is checked by `./runner.ts`
 * only after a whole case returns, so a multi-step case (model call -> tool
 * call -> another model call) could issue further real requests after an
 * earlier step already exhausted the budget. `createBudgetGuard` is the
 * shared-consumption tracker one instance spans an entire eval run
 * (every case, every request, every retry) — `./retry.ts`'s
 * `RetryPolicyOptions.beforeAttempt` calls `assertNotExceeded` before EVERY
 * attempt, and `./cli.ts`'s `main()` calls `recordUsage` from the retry
 * policy's own `onAttempt` the instant a request's real usage is known, so
 * consumption from a request in progress is visible to the very next one —
 * including a later step of the SAME case, or the first request of the NEXT
 * case.
 */
export interface BudgetGuard {
  /** Accumulate one request's known usage — never resets, shared for the whole run. */
  recordUsage(
    usage: { inputTokens: number; outputTokens: number; totalTokens: number },
    pricing: TokenPricing,
  ): void;
  /** Throws {@link BudgetExceededError} if accumulated KNOWN usage has already crossed the token or cost cap. Case-count is not this guard's job — see `./runner.ts`'s own `assertWithinBudget` check for that. */
  assertNotExceeded(): void;
}

/** Build a {@link BudgetGuard} tracking only the token/cost caps of `config`. */
export function createBudgetGuard(
  config: Pick<BudgetConfig, "maxTotalTokens" | "maxCostUsd">,
): BudgetGuard {
  let totalTokens = 0;
  let costUsd = 0;
  return {
    recordUsage(usage, pricing) {
      totalTokens += usage.totalTokens;
      costUsd += estimateCostUsd(usage, pricing);
    },
    assertNotExceeded() {
      // #307 review issuecomment-5577656024: equality also stops — known
      // consumption sitting EXACTLY on the cap must never let one more real
      // provider request through. The cap is a ceiling to stop AT, not a
      // threshold to cross before stopping.
      if (totalTokens >= config.maxTotalTokens) {
        throw new BudgetExceededError(
          `Eval token budget exceeded: ${totalTokens} total token(s) already spent, max is ${config.maxTotalTokens}. Stopping before issuing another provider request.`,
        );
      }
      if (costUsd >= config.maxCostUsd) {
        throw new BudgetExceededError(
          `Eval cost budget exceeded: $${costUsd.toFixed(4)} already spent, max is $${config.maxCostUsd.toFixed(4)}. Stopping before issuing another provider request.`,
        );
      }
    },
  };
}

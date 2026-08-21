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

/** Thrown by {@link assertWithinBudget} the instant a configured cap would be crossed. Never silently swallowed by the runner. */
export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
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
  "gemini-3.6-flash": { inputPerMillion: 0, outputPerMillion: 0 }, // free tier — the project's default
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

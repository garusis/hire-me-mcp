/**
 * Eval suite runner (#72): executes dataset cases against the real agent,
 * captures the answer + tool citations + token usage each case produced,
 * scores each with the three scorers, enforces the case/budget caps, and
 * assembles the final machine-readable report (`./report.ts`).
 *
 * ## Dependency injection — the zero-model-call test seam
 *
 * `runEvalSuite`'s SECOND argument, `RunnerDeps`, is where a real model
 * call lives — `runCase(question)` is expected to call the real
 * `getInterviewAgent().generate(question)` and shape its result into
 * `{ answer, toolCitations, usage }` (see `./cli.ts`, the only place that
 * wires a real implementation). `runner.test.ts` injects a stub instead —
 * same `MockLanguageModelV4`-flavored pattern the rest of this package
 * uses (`../interview-agent.test.ts`) — so this module's own test suite
 * makes zero real model calls while still exercising the full budget-abort
 * and case-cap logic for real.
 *
 * This module has NO timer of its own (see "Rate limiting" below), so its
 * test suite needs no clock seam either — every test here is pure.
 *
 * ## Budget enforcement
 *
 * Cases run at most `budget.maxCases` times — case count is a fact known
 * ahead of time, so this is a simple slice, not a thrown abort. Token/cost
 * usage is NOT known ahead of time (a model's real answer length varies),
 * so after every case's usage is tallied, `assertWithinBudget`
 * (`./budget.ts`) is checked; the instant either cap is crossed, the run
 * throws `BudgetExceededError` and stops — no further cases run, and the
 * caller (`./cli.ts`) never gets a "successful" report for a run that
 * overspent its budget.
 *
 * ## Rate limiting is NOT this module's job (#282)
 *
 * This runner used to sleep between CASES, converting an `rpmLimit` into a
 * minimum per-case delay. That was wrong, and it broke `agent-evals` for
 * real: one case is not one request. A single `deps.runCase` — a real
 * `agent.generate()` turn — is a model call, then a tool call, then another
 * model call to compose the answer, so a nominal 10 "RPM" issued 20-30
 * actual requests per minute and blew straight through
 * `gemini-3.5-flash-lite`'s 15 RPM free-tier ceiling.
 *
 * Throttling now lives at the MODEL boundary, where the provider counts
 * requests: `./rate-limit.ts` wraps the language model itself, so every
 * request a case makes — including retries and any future extra step —
 * waits its turn in one sliding 60-second window. There is deliberately no
 * second, competing throttle here; this loop runs cases back to back and
 * lets the limiter pace the real calls underneath.
 */

import {
  assertWithinBudget,
  type BudgetConfig,
  BudgetExceededError,
  estimateCostUsd,
  getModelPricing,
  type TokenPricing,
} from "./budget.js";
import type { EvalCase } from "./dataset/schema.js";
import {
  buildReport,
  type CaseReport,
  type EvalReport,
  type EvalTotals,
  type FailedCaseReport,
} from "./report.js";
import { type RetryAttemptRecord, sumKnownUsage } from "./retry.js";
import {
  scoreAnswerAssertions,
  scoreFactualBoundaryCompliance,
  scoreGapHonesty,
  scoreGroundedness,
  scorePreferredSourceCompliance,
  scoreRelevance,
  scoreStoryCompleteness,
  scoreToolRouting,
} from "./scorers/index.js";
import type { ToolCall } from "./scorers/tool-routing.js";
import type { ReturnedCitation } from "./scorers/types.js";
import type { ScorerThresholds } from "./thresholds.js";

/** One case's captured real-agent run — the shape `RunnerDeps.runCase` must return. */
export interface CaseRunResult {
  answer: string;
  toolCitations: ReturnedCitation[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  /**
   * Every tool call made during this run's `agent.generate()` — name plus
   * the arguments the model actually supplied — in call order (duplicates
   * allowed). The trace `scoreToolRouting` (#75, argument/sequence-aware
   * since #294) checks a case's `expectedToolCall` against: presence alone
   * for `"search-career"`/`"list-career-stories"`/`"deterministic-only"`,
   * and both the `sourceTypes` argument and call order for
   * `"search-career-story-scoped"`. Optional and defaults to an empty trace
   * when omitted, so a `RunnerDeps.runCase` stub written before #75/#294
   * (these fields' introduction) keeps compiling and running unchanged;
   * `./cli.ts`'s real implementation always supplies it.
   */
  toolCalls?: ToolCall[];
  /**
   * `false` when `usage` had to fall back to an all-zero placeholder
   * because neither `agent.generate`'s own `totalUsage` nor any collected
   * attempt carried known usage (#307 second independent-review correction,
   * finding 4) — distinguishes a genuine zero-token answer from "we don't
   * actually know". Optional and defaults to `true` (known), so a stub
   * written before this field existed keeps compiling and running
   * unchanged; `./cli.ts`'s real implementation always supplies it.
   */
  usageKnown?: boolean;
  /**
   * Every attempt `./retry.ts`'s `onAttempt` recorded for this case's own
   * request(s), in order (#307 second independent-review correction,
   * finding 4) — persisted for a SUCCESSFUL case too, not just a failed
   * one (`CaseFailureInfo.attempts` above already covered failures).
   * Optional and defaults to `[]`.
   */
  attempts?: RetryAttemptRecord[];
}

/** Injected dependencies — the real-model-call seam. See module docs. */
export interface RunnerDeps {
  /**
   * Throws {@link EvalCaseError} (never a raw provider error) when the
   * case's provider call(s) failed TERMINALLY — after `./retry.ts`'s single
   * retry owner already exhausted every retry it would attempt. The runner
   * treats any `EvalCaseError` as "stop the suite here", never as a signal
   * to try this case again.
   */
  runCase: (question: string) => Promise<CaseRunResult>;
}

/**
 * Sanitized info about one case's terminal provider failure (#307 C5) —
 * exactly what {@link FailedCaseReport} needs, minus the case's own
 * id/category/question (the runner already has those from the `EvalCase`
 * being run when it catches this error).
 */
export interface CaseFailureInfo {
  statusCode?: number;
  errorName?: string;
  errorMessage: string;
  /** Every attempt `./retry.ts`'s `onAttempt` recorded for this case's request(s), in order. */
  attempts: RetryAttemptRecord[];
}

/**
 * Thrown by a `RunnerDeps.runCase` implementation (`./cli.ts`'s real one)
 * when a case's provider call failed TERMINALLY — a 429, a permanent error,
 * exhausted transient retries, or a deadline (see `./retry.ts`'s module
 * docs for the full classification). `runEvalSuite` catches exactly this
 * type to stop the suite and produce a partial report (#307 C5, "Codex
 * supervision correction": stop launching further requests AND cases,
 * never continue after a terminal failure or regenerate a completed
 * answer). Any OTHER thrown error (e.g. a bug in `runCase` itself) is not
 * caught here and propagates as before.
 */
export class EvalCaseError extends Error {
  readonly failure: CaseFailureInfo;

  constructor(message: string, failure: CaseFailureInfo) {
    super(message);
    this.name = "EvalCaseError";
    this.failure = failure;
  }
}

/** Configuration for one eval suite run. */
export interface RunnerConfig {
  cases: readonly EvalCase[];
  budget: BudgetConfig;
  promptVersion: string;
  modelId: string;
  thresholds?: ScorerThresholds;
}

/**
 * The dataset-composition group a case id belongs to, purely from its id
 * prefix — currently just `story-manifest-*` (#295's locked behavioral
 * manifest, appended after the base dataset in `./dataset/cases.ts`) versus
 * everything else. Exported for `runner.test.ts` and any future group.
 */
function groupKeyOf(evalCase: EvalCase): string {
  return evalCase.id.startsWith("story-manifest-") ? "story-manifest" : "base";
}

/**
 * Select up to `maxCases` cases from `cases`, proportionally covering every
 * id-prefix group present instead of a naive `cases.slice(0, maxCases)`.
 *
 * #295 correction (independent Codex review, agent package `1dd7ac7`,
 * finding 1): the real dataset appends `story-manifest-*` (38 cases) after
 * 28 base cases, so a prefix slice under CI's then-current 25-case default
 * cap ran zero of the new cases — CI stayed green while covering none of
 * this package's own new coverage. A later #295 integration correction
 * raised `agent-evals.yml`'s (and `release-readiness.yml`'s) default cap to
 * 66 — the full dataset size — so the normal run now covers every case
 * regardless of ordering; round-robining across groups (in each group's own
 * original relative order) still matters for any run under a smaller cap
 * (a `workflow_dispatch` override, or the dataset growing past whatever cap
 * is committed at the time), guaranteeing every group present gets a fair
 * share instead of the group that sorts last being silently dropped.
 */
function groupCasesById(cases: readonly EvalCase[]): EvalCase[][] {
  const groups = new Map<string, EvalCase[]>();
  for (const evalCase of cases) {
    const key = groupKeyOf(evalCase);
    const group = groups.get(key);
    if (group) {
      group.push(evalCase);
    } else {
      groups.set(key, [evalCase]);
    }
  }
  return [...groups.values()];
}

/** One round-robin pass over `groups`, adding at most one case per group to `selected` (stops early once `maxCases` is reached); returns whether anything was added. */
function roundRobinRound(
  groups: readonly EvalCase[][],
  cursor: number,
  selected: Set<EvalCase>,
  maxCases: number,
): boolean {
  const before = selected.size;
  for (const group of groups) {
    if (selected.size >= maxCases) break;
    const candidate = group[cursor];
    if (candidate !== undefined) selected.add(candidate);
  }
  return selected.size > before;
}

export function selectCasesForBudget(cases: readonly EvalCase[], maxCases: number): EvalCase[] {
  if (maxCases >= cases.length) return [...cases];

  const groups = groupCasesById(cases);
  const selected = new Set<EvalCase>();
  for (let cursor = 0; selected.size < maxCases; cursor += 1) {
    if (!roundRobinRound(groups, cursor, selected, maxCases)) break; // every group exhausted
  }

  return cases.filter((evalCase) => selected.has(evalCase));
}

function scoreCase(evalCase: EvalCase, run: CaseRunResult): CaseReport {
  const transcript = {
    question: evalCase.question,
    answer: run.answer,
    toolCitations: run.toolCitations,
  };
  const gapHonesty =
    evalCase.gapHonestyDirection === "n/a"
      ? null
      : scoreGapHonesty(transcript, evalCase.gapHonestyDirection);
  // #307 second independent-review correction (finding 1): the case's own
  // acceptable story ids — the same derivation `scoreStoryCompleteness`
  // already needs below — must reach `scoreToolRouting` too, so its
  // either-route shortcut can tell "cited an acceptable story" from "cited
  // any story a tool happened to return."
  const storyCompletenessRequirement = storyCompletenessRequirementOf(evalCase);
  const toolRouting =
    evalCase.expectedToolCall === undefined
      ? null
      : scoreToolRouting(run.toolCalls ?? [], evalCase.expectedToolCall, {
          expectedCompetencies: evalCase.expectedCompetencies,
          answer: run.answer,
          acceptableStoryIds:
            storyCompletenessRequirement.storyIds.length > 0
              ? storyCompletenessRequirement.storyIds
              : undefined,
        });
  const answerAssertions =
    evalCase.answerAssertions === undefined
      ? null
      : scoreAnswerAssertions(run.answer, evalCase.answerAssertions, run.toolCitations);
  // #295 correction (finding 2): score behavioral-story completeness only
  // for a case that expects a complete story citation — mustCiteEntity or
  // citationGroups — not every case with any answerAssertions block (a
  // base-dataset mustMatch-only fact check has no "story" to be complete).
  const expectsStoryCitation =
    (evalCase.answerAssertions?.mustCiteEntity?.length ?? 0) > 0 ||
    (evalCase.answerAssertions?.citationGroups?.length ?? 0) > 0;
  const storyCompleteness = expectsStoryCitation
    ? scoreStoryCompleteness(
        { answer: run.answer },
        storyCompletenessRequirement.storyIds,
        storyCompletenessRequirement.mode,
      )
    : null;
  const preferredSourceCompliance = scorePreferredSourceCompliance(
    run.answer,
    evalCase.answerAssertions,
    run.toolCitations,
  );
  const factualBoundaryCompliance = scoreFactualBoundaryCompliance(
    run.answer,
    evalCase.answerAssertions,
  );

  return {
    id: evalCase.id,
    category: evalCase.category,
    question: evalCase.question,
    answer: run.answer,
    scores: {
      groundedness: scoreGroundedness(transcript, evalCase.category),
      gapHonesty,
      relevance: scoreRelevance(transcript),
      toolRouting,
      answerAssertions,
      storyCompleteness,
      preferredSourceCompliance,
      factualBoundaryCompliance,
    },
    // #307 track 2: persist the run's own tool-call trace (name, args,
    // returned citations, in call order) alongside the scores, so a report
    // can distinguish a retrieval failure from the model ignoring a
    // returned result — see ./report.ts's CaseReport.toolTrace doc comment.
    toolTrace: run.toolCalls ?? [],
    // #307 second independent-review correction, finding 4: a successful
    // case's own attempt trace must reach the report too, not just a
    // failed case's.
    attempts: run.attempts ?? [],
    // #307 second independent-review correction, 2nd round, finding 3:
    // `run.usageKnown` was collected but previously dropped here — thread it
    // through so `./report.ts`'s `buildReport` can compute
    // `totals.usageComplete` honestly.
    usageKnown: run.usageKnown ?? true,
  };
}

/**
 * `scoreStoryCompleteness`'s acceptable/required story ids plus the `any`/
 * `all` mode to score them under (#295 third-independent-review correction,
 * finding 3), derived from `evalCase.answerAssertions`'s `mustCiteEntity`
 * (single required story, scored with best-of-one `"any"` semantics) or
 * `citationGroups` (an eval case declares at most one group — see
 * `../dataset/story-manifest-cases.ts` — so its own `mode` carries directly:
 * `"all"` for a cross-cutting case requires full coverage of EVERY listed
 * story, `"any"` keeps best-of-cited-and-acceptable semantics).
 */
function storyCompletenessRequirementOf(evalCase: EvalCase): {
  storyIds: string[];
  mode: "any" | "all";
} {
  const assertions = evalCase.answerAssertions;
  if (!assertions) return { storyIds: [], mode: "any" };
  const fromCite = (assertions.mustCiteEntity ?? [])
    .filter((ref) => ref.entityType === "story")
    .map((ref) => ref.entityId);
  if (fromCite.length > 0) {
    return { storyIds: [...new Set(fromCite)], mode: "any" };
  }
  const group = assertions.citationGroups?.[0];
  if (!group) return { storyIds: [], mode: "any" };
  const storyIds = [
    ...new Set(group.refs.filter((ref) => ref.entityType === "story").map((ref) => ref.entityId)),
  ];
  return { storyIds, mode: group.mode };
}

/** Run the eval suite: execute up to `config.budget.maxCases` dataset cases against the real agent (via `deps.runCase`), score each, and assemble the final report. Throws `BudgetExceededError` (see `./budget.ts`) the instant the token or cost cap is crossed. */
/**
 * Build the partial report for a `deps.runCase` rejection — either a
 * `BudgetExceededError` (#307 second independent-review correction, 2nd
 * round, finding 2: the run's own shared-budget guard stopped a request
 * before it was issued, mid-case) or an `EvalCaseError` (#307 C5: the
 * case's provider call failed terminally after every retry was exhausted).
 * Returns `null` for any OTHER error, which `runEvalSuite` rethrows
 * unchanged. Split out of `runEvalSuite` purely to keep that function's
 * cognitive complexity under this repo's Biome limit — no behavior change
 * from the inline version this replaces (runner.test.ts's "terminal case
 * failure"/"budget exceeded" suites cover every branch either way).
 */
function buildReportForRunCaseFailure(
  error: unknown,
  context: {
    config: RunnerConfig;
    casesToRun: readonly EvalCase[];
    caseReports: CaseReport[];
    index: number;
    evalCase: EvalCase;
    totals: EvalTotals;
    pricing: TokenPricing;
  },
): EvalReport | null {
  const { config, casesToRun, caseReports, index, evalCase, totals, pricing } = context;

  if (error instanceof BudgetExceededError) {
    // #307 review issuecomment-5577656024, finding 1: `error.attempts` is
    // the aborted case's OWN attempt trace, attached by `./cli.ts`'s
    // `createRunCase` before rethrowing. Note this can be NON-empty even
    // when NO real request was ever dispatched: `./retry.ts`'s `run()`
    // records a "stopped-budget-exceeded" attempt for a `beforeAttempt`
    // check that fires BEFORE issuing the request. The real signal for "did
    // this case make genuine progress" is whether any of its attempts
    // carries KNOWN usage — not merely whether the trace is non-empty.
    const attempts = error.attempts;
    const caseUsage = sumKnownUsage(attempts);
    // The aborted case's own KNOWN usage (e.g. a successful first request
    // before a second one was blocked) is real spend — fold it into totals
    // exactly once, the same "never discard known usage from a case that
    // didn't finish" treatment the EvalCaseError branch below already gets.
    // `sumKnownUsage` never fabricates a number for an attempt with no known
    // usage, so this never invents spend that didn't happen.
    const finalTotals =
      caseUsage.usage === "unknown"
        ? totals
        : {
            inputTokens: totals.inputTokens + caseUsage.usage.inputTokens,
            outputTokens: totals.outputTokens + caseUsage.usage.outputTokens,
            totalTokens: totals.totalTokens + caseUsage.usage.totalTokens,
            costUsd: totals.costUsd + estimateCostUsd(caseUsage.usage, pricing),
          };

    const wasMidCase = caseUsage.usage !== "unknown";
    return buildReport({
      promptVersion: config.promptVersion,
      modelId: config.modelId,
      cases: caseReports,
      totals: finalTotals,
      thresholds: config.thresholds,
      // A case aborted mid-flight is classified separately (partialCases,
      // below) — only the cases strictly AFTER it never started at all.
      // A stop before this case's own first request keeps the prior
      // behavior: this case, and everything after it, is unexecuted.
      unexecutedCaseIds: casesToRun.slice(wasMidCase ? index + 1 : index).map((c) => c.id),
      partialCases: wasMidCase
        ? [{ id: evalCase.id, category: evalCase.category, question: evalCase.question, attempts }]
        : [],
      budgetExceeded: { message: error.message },
    });
  }

  if (!(error instanceof EvalCaseError)) return null;

  // Terminal failure (#307 C5): stop launching further requests AND
  // cases — no continuing the suite, no regenerating this or any other
  // completed answer. Preserve every case that DID complete (with its
  // known usage) plus this failure and the ids of everything left
  // unexecuted, rather than losing the whole run to one rejection.
  const failedCase: FailedCaseReport = {
    id: evalCase.id,
    category: evalCase.category,
    question: evalCase.question,
    ...error.failure,
  };
  const unexecutedCaseIds = casesToRun.slice(index + 1).map((c) => c.id);

  // #307 second independent-review correction, finding 4: a case that
  // failed terminally can still have spent real, KNOWN tokens on earlier
  // successful attempts within the same request — add that known usage to
  // the totals rather than discarding it just because the case itself
  // produced no scored answer. `sumKnownUsage` never fabricates a number
  // for an attempt with no known usage, so this never double-counts or
  // invents spend that didn't happen.
  const failedCaseUsage = sumKnownUsage(error.failure.attempts);
  const finalTotals =
    failedCaseUsage.usage === "unknown"
      ? totals
      : {
          inputTokens: totals.inputTokens + failedCaseUsage.usage.inputTokens,
          outputTokens: totals.outputTokens + failedCaseUsage.usage.outputTokens,
          totalTokens: totals.totalTokens + failedCaseUsage.usage.totalTokens,
          costUsd: totals.costUsd + estimateCostUsd(failedCaseUsage.usage, pricing),
        };

  return buildReport({
    promptVersion: config.promptVersion,
    modelId: config.modelId,
    cases: caseReports,
    totals: finalTotals,
    thresholds: config.thresholds,
    failedCases: [failedCase],
    unexecutedCaseIds,
  });
}

export async function runEvalSuite(config: RunnerConfig, deps: RunnerDeps): Promise<EvalReport> {
  const pricing = getModelPricing(config.modelId);

  const casesToRun = selectCasesForBudget(config.cases, config.budget.maxCases);
  const caseReports: CaseReport[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  for (const [index, evalCase] of casesToRun.entries()) {
    let run: CaseRunResult;
    try {
      run = await deps.runCase(evalCase.question);
    } catch (error) {
      const partialReport = buildReportForRunCaseFailure(error, {
        config,
        casesToRun,
        caseReports,
        index,
        evalCase,
        totals: { inputTokens, outputTokens, totalTokens, costUsd },
        pricing,
      });
      if (partialReport) return partialReport;
      throw error;
    }

    caseReports.push(scoreCase(evalCase, run));

    inputTokens += run.usage.inputTokens;
    outputTokens += run.usage.outputTokens;
    totalTokens += run.usage.totalTokens;
    costUsd += estimateCostUsd(run.usage, pricing);

    try {
      assertWithinBudget(config.budget, {
        casesRun: index + 1,
        totalTokens,
        costUsd,
      });
    } catch (error) {
      if (!(error instanceof BudgetExceededError)) throw error;

      // #307 second independent-review correction, finding 5: a budget
      // overage must never lose the report already built — preserve every
      // case that DID complete (this one included; its usage is already
      // folded into the totals above) and list every case left unexecuted,
      // the same partial-report treatment a terminal `EvalCaseError` gets.
      // No further requests are issued once this branch is taken.
      return buildReport({
        promptVersion: config.promptVersion,
        modelId: config.modelId,
        cases: caseReports,
        totals: { inputTokens, outputTokens, totalTokens, costUsd },
        thresholds: config.thresholds,
        unexecutedCaseIds: casesToRun.slice(index + 1).map((c) => c.id),
        budgetExceeded: { message: error.message },
      });
    }
  }

  return buildReport({
    promptVersion: config.promptVersion,
    modelId: config.modelId,
    cases: caseReports,
    totals: { inputTokens, outputTokens, totalTokens, costUsd },
    thresholds: config.thresholds,
  });
}

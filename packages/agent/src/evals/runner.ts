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
  estimateCostUsd,
  getModelPricing,
} from "./budget.js";
import type { EvalCase } from "./dataset/schema.js";
import { buildReport, type CaseReport, type EvalReport } from "./report.js";
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
}

/** Injected dependencies — the real-model-call seam. See module docs. */
export interface RunnerDeps {
  runCase: (question: string) => Promise<CaseRunResult>;
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
 * 28 base cases, so a prefix slice under CI's current 25-case default cap
 * ran zero of the new cases — CI stayed green while covering none of this
 * package's own new coverage. Round-robining across groups (in each
 * group's own original relative order) guarantees every group present gets
 * a fair share of any budget cap, however small, without this package
 * editing the CI-owned cap itself (`.github/workflows/agent-evals.yml`,
 * out of `packages/agent/**` scope — see the correction's issue-295 note
 * for the still-unavoidable cross-package ask: raising that cap toward the
 * dataset's full size is the only way to exercise every manifest case in
 * one default run).
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
  const toolRouting =
    evalCase.expectedToolCall === undefined
      ? null
      : scoreToolRouting(run.toolCalls ?? [], evalCase.expectedToolCall, {
          expectedCompetencies: evalCase.expectedCompetencies,
          answer: run.answer,
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
  const storyCompletenessRequirement = storyCompletenessRequirementOf(evalCase);
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
export async function runEvalSuite(config: RunnerConfig, deps: RunnerDeps): Promise<EvalReport> {
  const pricing = getModelPricing(config.modelId);

  const casesToRun = selectCasesForBudget(config.cases, config.budget.maxCases);
  const caseReports: CaseReport[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  for (const [index, evalCase] of casesToRun.entries()) {
    const run = await deps.runCase(evalCase.question);
    caseReports.push(scoreCase(evalCase, run));

    inputTokens += run.usage.inputTokens;
    outputTokens += run.usage.outputTokens;
    totalTokens += run.usage.totalTokens;
    costUsd += estimateCostUsd(run.usage, pricing);

    assertWithinBudget(config.budget, {
      casesRun: index + 1,
      totalTokens,
      costUsd,
    });
  }

  return buildReport({
    promptVersion: config.promptVersion,
    modelId: config.modelId,
    cases: caseReports,
    totals: { inputTokens, outputTokens, totalTokens, costUsd },
    thresholds: config.thresholds,
  });
}

/**
 * The locked 38-case behavioral-story eval manifest (#295), agent-package
 * slice: same 16 authored stories, questions, and any/all/preferred-source
 * semantics the issue locks, scored here for AGENT behavior — complete-story
 * use, exact citation, preferred-source selection, and honest routing — not
 * retrieval precision/recall (that's `packages/core`'s own manifest,
 * implemented independently per the #295 orchestration split).
 *
 * ## Story references
 *
 * | Ref | Stable source id | Primary competency |
 * | --- | --- | --- |
 * | 001 | `xogito-client-account-recovery` | leadership |
 * | 002 | `mutual-informal-leadership` | leadership |
 * | 003 | `cross-team-onboarding-framework` | mentoring |
 * | 004 | `house-numbers-communication-service-ownership` | ownership |
 * | 005 | `house-numbers-deterministic-document-checks` | technical-judgment |
 * | 006 | `fullstack-labs-sap-migration` | risk-management |
 * | 007 | `house-numbers-prompt-platform-migration` | influence |
 * | 008 | `house-numbers-secure-public-document-upload` | risk-management |
 * | 009 | `house-numbers-zod-production-incident` | problem-solving |
 * | 010 | `house-numbers-vendor-extraction-contract` | problem-solving |
 * | 011 | `house-numbers-loan-analysis-pipeline-decomposition` | risk-management |
 * | 012 | `mutual-sustainable-ownership-failure` | learning-from-failure |
 * | 013 | `rokk3r-sustainable-performance-feedback` | receptiveness-to-feedback |
 * | 014 | `belatrix-destructive-deployment-accountability` | personal-accountability |
 * | 015 | `house-numbers-cross-service-debugging-skill` | process-improvement |
 * | 016 | `house-numbers-ai-pivot-after-paternity-leave` | adaptability |
 *
 * ## Route notation
 *
 * `list` -> `expectedToolCall: "list-career-stories"` with `expectedCompetencies`
 * set to the controlled competency the question maps to (the story's own
 * `primaryCompetency` or a `supportingCompetencies` entry, so a real
 * `list-career-stories` call with that competency actually surfaces the
 * expected story). `story-search` -> `expectedToolCall:
 * "search-career-story-scoped"` (#294's fuzzy-behavioral route: a
 * story-scoped `search-career` call, checked by the same scorer either way).
 * `absence` -> the same `search-career-story-scoped` route: its scorer
 * already enforces the honest-fallback contract (state plainly that no
 * direct story was found; label any broader result as related/closest
 * evidence, never the behavioral event itself) for an empty/unavailable
 * scoped result, which is exactly what N01/N02 require.
 *
 * ## Citation semantics
 *
 * A single expected story uses plain `mustCiteEntity`. Several honest
 * candidates use `citationGroups` (`./schema.ts`): `mode: "any"` requires
 * exactly one of them cited (the manifest's one-story-answer semantics), with
 * `preferredRef` set wherever the manifest locks a preference (e.g. #305
 * decision 8's "story 001 > 002"); `mode: "all"` (cross-cutting) requires
 * every listed story cited.
 *
 * ## Factual-boundary guards (#295's "absence of invented metrics, authority,
 * motives, confidential details, or results")
 *
 * `FACTUAL_BOUNDARY_GUARDS` below is applied to every case's `mustNotMatch`:
 * a general guard against inventing a formal-authority title none of these
 * stories' real titles carry, and against inventing confidential personal
 * identifiers no story content contains. This is a proportionate, general
 * guard, not an exhaustive per-story audit of every quantifiable claim
 * (e.g. the exact "96 times in 24 hours" restart count in story 009) — a
 * fuller per-story numeric-claim audit is flagged as follow-up work, not
 * silently deferred.
 */

import type { Competency } from "@hire-me-mcp/core";
import type { EvalCase } from "./schema.js";

const FACTUAL_BOUNDARY_GUARDS: readonly string[] = [
  // No invented authority: none of the 16 stories' real titles are an
  // executive/formal-management role.
  "\\b(?:CTO|Chief Technology Officer|VP of Engineering|Engineering Manager|founder|co-founder)\\b",
  // No invented confidential identifiers: no story content contains a real
  // SSN, borrower name, or salary figure to relay.
  "\\bSSN\\b|social security number|\\$\\d{2,3},\\d{3}\\s*(?:salary|per year|annually)",
];

/**
 * Per-story factual-boundary guards (#295 correction, independent Codex
 * review, agent package `1dd7ac7`, finding 3) — the audited wording risks
 * #295's "Story-specific factual-boundary assertions" section names for
 * stories 001, 004, 008, 009, 010, 011, 014, 015, and 016, made executable
 * rather than deferred. Keyed by stable story id, merged into a case's
 * `mustNotMatch` (alongside `FACTUAL_BOUNDARY_GUARDS`) by
 * `singleStoryAssertions`/`groupAssertions` for every case whose target (or
 * group of acceptable targets) includes that story — the guard holds
 * regardless of which acceptable alternative the agent actually cites.
 */
const STORY_FACTUAL_GUARDS: Readonly<Record<string, string>> = {
  // 001: additional client work (further projects, an internal-team
  // invitation) may be a later observed OUTCOME, never something Marcos
  // personally caused, won, or secured. Broadened (#295 second
  // independent-review correction, finding 3) beyond a fixed verb list to
  // any causal-subject + causal-verb-ish phrase followed by
  // "commission"/"award" — catches "his leadership led the client to
  // commission..." (the review's exact counterexample), not just
  // "won"/"secured"/"landed"/"caused"/"brought in".
  "xogito-client-account-recovery":
    "\\b(?:he |marcos )?(?:personally )?(?:won|secured|landed|caused|brought (?:in|about)|led|drove|resulted in|generated)\\b[^.]{0,60}\\b(?:commission(?:ed|ing)?|award(?:ed|ing)?|(?:follow-on|additional|further|another|next|new)\\b[^.]{0,20}\\b(?:project|contract|engagement|work)s?)\\b",
  // 004: the ~70% observed effective-triage outcome must never be called
  // "LLM accuracy", nor may the outcome be attributed to the model alone
  // (#295 second independent-review correction, finding 3 — "achieved
  // about 70% effective triage because the LLM handled it" never says
  // "LLM accuracy" verbatim but makes the same forbidden claim).
  "house-numbers-communication-service-ownership":
    "\\bLLM accuracy\\b|\\baccuracy of (?:the )?(?:model|LLM)\\b|\\bbecause (?:the )?(?:the )?(?:llm|model|ai)\\b[^.]{0,30}\\bhandled\\b|\\bthe (?:llm|model)\\b[^.]{0,20}\\b(?:alone )?(?:achieved|was responsible for)\\b",
  // 008: "roughly two out of every three submissions" is an owner-provided
  // estimate, never a formally measured rate or percentage — and never a
  // named regulatory-compliance regime the approved narrative doesn't
  // claim (#295 second independent-review correction, finding 3 — "was
  // fully HIPAA compliant" is an invented compliance claim, not a
  // percentage/measured-rate framing the first guard already caught).
  "house-numbers-secure-public-document-upload":
    "\\bformally measured\\b|\\bmeasured (?:failure|success) rate\\b|\\d+(?:\\.\\d+)?\\s*%|\\b(?:HIPAA|SOC\\s*2|GDPR|PCI[- ]?DSS|CCPA|FERPA)\\b",
  // 009: documents were reprocessed after historical reconciliation, never
  // permanently lost and recovered.
  "house-numbers-zod-production-incident":
    "\\bpermanent(?:ly)? lost\\b|\\blost (?:and (?:later )?recovered|forever)\\b",
  // 010: the original documents stayed available in the provider's system;
  // only the historical structured extraction was unavailable.
  "house-numbers-vendor-extraction-contract":
    "\\bdocuments? (?:were|was|got|are) lost\\b|\\blost the documents?\\b",
  // 011: identifying a proactive risk, never an invented quantified
  // performance improvement.
  "house-numbers-loan-analysis-pipeline-decomposition":
    "\\d+(?:\\.\\d+)?\\s*(?:%|x|times)\\s*(?:faster|improvement|reduction|increase)\\b",
  // 014: the destructive deployment affected only a shared development
  // environment, never production or customer data.
  "belatrix-destructive-deployment-accountability":
    "\\bproduction\\b[^.]{0,20}\\b(?:data|environment|customers?)\\b|\\bcustomer data\\b[^.]{0,20}\\b(?:affected|impacted|deleted|lost)\\b",
  // 015: engineers improving a versioned debugging skill from incident
  // lessons, never autonomous learning or autonomous self-healing.
  // Broadened (#295 second independent-review correction, finding 3) to
  // also catch "learned from incidents and fixed itself" — the review's
  // exact counterexample, which never says "autonomous" or "self-healing"
  // but still claims the skill fixed/healed itself.
  "house-numbers-cross-service-debugging-skill":
    "\\bself-healing\\b|\\bautonomous(?:ly)?\\b[^.]{0,20}\\b(?:learn(?:ing|s|ed)?|heal(?:ing|s|ed)?|fix(?:ing|es|ed)?)\\b|\\bfix(?:ed|es|ing)? itself\\b|\\bheal(?:ed|s|ing)? itself\\b",
  // 016: a self-described feeling during a personal/technical transition,
  // never a clinical diagnosis.
  "house-numbers-ai-pivot-after-paternity-leave": "\\bdiagnosed with\\b|\\bclinical(?:ly)?\\b",
};

/** Every `STORY_FACTUAL_GUARDS` entry for the stories named in `refs`, deduplicated. */
function storyGuardsFor(refs: readonly { entityId: string }[]): string[] {
  const guards = refs
    .map((ref) => STORY_FACTUAL_GUARDS[ref.entityId])
    .filter((guard): guard is string => guard !== undefined);
  return [...new Set(guards)];
}

interface StoryRef {
  entityType: "story";
  entityId: string;
}

function story(entityId: string): StoryRef {
  return { entityType: "story", entityId };
}

const S = {
  xogito: story("xogito-client-account-recovery"),
  mutualLeadership: story("mutual-informal-leadership"),
  onboarding: story("cross-team-onboarding-framework"),
  commService: story("house-numbers-communication-service-ownership"),
  deterministicChecks: story("house-numbers-deterministic-document-checks"),
  sapMigration: story("fullstack-labs-sap-migration"),
  promptMigration: story("house-numbers-prompt-platform-migration"),
  publicUpload: story("house-numbers-secure-public-document-upload"),
  zodIncident: story("house-numbers-zod-production-incident"),
  vendorContract: story("house-numbers-vendor-extraction-contract"),
  pipelineDecomposition: story("house-numbers-loan-analysis-pipeline-decomposition"),
  mutualFailure: story("mutual-sustainable-ownership-failure"),
  rokk3rFeedback: story("rokk3r-sustainable-performance-feedback"),
  belatrixAccountability: story("belatrix-destructive-deployment-accountability"),
  crossServiceDebugging: story("house-numbers-cross-service-debugging-skill"),
  aiPivot: story("house-numbers-ai-pivot-after-paternity-leave"),
} as const;

/** A single required story citation, plus one distinguishing keyword, the shared factual-boundary guards, and that story's own audited-risk guard (if any). */
function singleStoryAssertions(ref: StoryRef, keyword: string) {
  return {
    mustMatch: [keyword],
    mustNotMatch: [...FACTUAL_BOUNDARY_GUARDS, ...storyGuardsFor([ref])],
    mustCiteEntity: [ref],
  };
}

/** An `any`/`all` citation group, plus the shared factual-boundary guards and every member story's own audited-risk guard. */
function groupAssertions(mode: "any" | "all", refs: readonly StoryRef[], preferredRef?: StoryRef) {
  return {
    mustNotMatch: [...FACTUAL_BOUNDARY_GUARDS, ...storyGuardsFor(refs)],
    citationGroups: [{ mode, refs: [...refs], ...(preferredRef ? { preferredRef } : {}) }],
  };
}

export const STORY_MANIFEST_CASES: readonly EvalCase[] = [
  // ---- exact cases (X01-X10) ----
  {
    id: "story-manifest-x01",
    category: "grounded",
    question: "Tell me about a time Marcos stepped into leadership without formal authority.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "list-career-stories",
    expectedCompetencies: ["leadership"],
    answerAssertions: groupAssertions(
      "any",
      [S.xogito, S.mutualLeadership, S.onboarding, S.crossServiceDebugging],
      S.xogito,
    ),
    notes:
      "#305 decision 8 locked invariant: story 001 (xogito-client-account-recovery) must " +
      "outrank 002 (mutual-informal-leadership) for this generic wording. Competencies: " +
      "influence, leadership.",
  },
  {
    id: "story-manifest-x02",
    category: "grounded",
    question: "When has Marcos put a product's mission ahead of personal financial benefit?",
    gapHonestyDirection: "claimed",
    expectedToolCall: "list-career-stories",
    expectedCompetencies: ["integrity"],
    answerAssertions: groupAssertions(
      "any",
      [S.mutualLeadership, S.mutualFailure],
      S.mutualLeadership,
    ),
    notes:
      "stories/mutual-informal-leadership.json and stories/mutual-sustainable-ownership-failure.json " +
      "both carry supportingCompetencies: integrity; 002 is the preferred grounding (the mission- " +
      "over-money renunciation itself). Competencies: integrity.",
  },
  {
    id: "story-manifest-x03",
    category: "grounded",
    question:
      "Give me an example of an onboarding practice Marcos introduced that spread across roles and teams.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "list-career-stories",
    expectedCompetencies: ["mentoring"],
    answerAssertions: singleStoryAssertions(S.onboarding, "onboarding"),
    notes:
      "stories/cross-team-onboarding-framework.json (story 003). Competencies: mentoring, " +
      "process-improvement.",
  },
  {
    id: "story-manifest-x04",
    category: "grounded",
    question:
      "Tell me about a time Marcos chose a deterministic implementation over a more technically fashionable AI approach.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "list-career-stories",
    expectedCompetencies: ["technical-judgment"],
    answerAssertions: singleStoryAssertions(S.deterministicChecks, "deterministic"),
    notes:
      "stories/house-numbers-deterministic-document-checks.json (story 005). Competencies: " +
      "decision-making, technical-judgment.",
  },
  {
    id: "story-manifest-x05",
    category: "grounded",
    question: "Give an example of Marcos investigating a subtle financial-data discrepancy.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "list-career-stories",
    expectedCompetencies: ["risk-management"],
    answerAssertions: singleStoryAssertions(S.sapMigration, "SAP"),
    notes: "stories/fullstack-labs-sap-migration.json (story 006). Competencies: risk-management.",
  },
  {
    id: "story-manifest-x06",
    category: "grounded",
    question: "How has Marcos handled sensitive data in a public-facing workflow?",
    gapHonestyDirection: "claimed",
    expectedToolCall: "list-career-stories",
    expectedCompetencies: ["risk-management"],
    answerAssertions: singleStoryAssertions(S.publicUpload, "public"),
    notes:
      "stories/house-numbers-secure-public-document-upload.json (story 008). Competencies: " +
      "risk-management.",
  },
  {
    id: "story-manifest-x07",
    category: "grounded",
    question:
      "Tell me about a time a major dependency upgrade caused an unexpected production problem.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "list-career-stories",
    expectedCompetencies: ["problem-solving"],
    answerAssertions: singleStoryAssertions(S.zodIncident, "Zod"),
    notes:
      "stories/house-numbers-zod-production-incident.json (story 009). Competencies: " +
      "problem-solving.",
  },
  {
    id: "story-manifest-x08",
    category: "grounded",
    question:
      "How has Marcos validated a vendor's documented data contract against production traffic?",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.vendorContract, "vendor"),
    notes:
      "stories/house-numbers-vendor-extraction-contract.json (story 010). Route: story-search " +
      "per the manifest's route table. Competencies: problem-solving.",
  },
  {
    id: "story-manifest-x09",
    category: "grounded",
    question: "Tell me about a code-review mistake Marcos made and how he responded.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "list-career-stories",
    expectedCompetencies: ["personal-accountability"],
    answerAssertions: singleStoryAssertions(S.belatrixAccountability, "Belatrix"),
    notes:
      "stories/belatrix-destructive-deployment-accountability.json (story 014). Competencies: " +
      "personal-accountability.",
  },
  {
    id: "story-manifest-x10",
    category: "grounded",
    question:
      "How did Marcos adapt when House Numbers pivoted from B2C to an AI-assisted B2B platform?",
    gapHonestyDirection: "claimed",
    expectedToolCall: "list-career-stories",
    expectedCompetencies: ["adaptability"],
    answerAssertions: singleStoryAssertions(S.aiPivot, "paternity leave"),
    notes:
      "stories/house-numbers-ai-pivot-after-paternity-leave.json (story 016). Competencies: " +
      "adaptability, learning-agility.",
  },

  // ---- held-out fuzzy cases (F01-F16) ----
  {
    id: "story-manifest-f01",
    category: "grounded",
    question:
      "Tell me about a time Marcos had to rebuild a damaged client relationship while deciding what to deliver first.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.xogito, "Xogito"),
    notes:
      "stories/xogito-client-account-recovery.json (story 001). Competencies: communication, " +
      "customer-focus, navigating-ambiguity, prioritization, stakeholder-management.",
  },
  {
    id: "story-manifest-f02",
    category: "grounded",
    question:
      "Tell me about a time Marcos helped a stalled mission-driven project move again without formal authority.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions(
      "any",
      [S.mutualLeadership, S.mutualFailure],
      S.mutualLeadership,
    ),
    notes: "any: 002, 012; preferred: 002. Competencies: leadership.",
  },
  {
    id: "story-manifest-f03",
    category: "grounded",
    question: "How does Marcos help new teammates become independent?",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.onboarding, "onboarding"),
    notes:
      "stories/cross-team-onboarding-framework.json (story 003). Competencies: collaboration, " +
      "mentoring.",
  },
  {
    id: "story-manifest-f04",
    category: "grounded",
    question: "Tell me about a critical operational system Marcos continued owning after launch.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.commService, "communications"),
    notes:
      "stories/house-numbers-communication-service-ownership.json (story 004). Competencies: " +
      "customer-focus, ownership.",
  },
  {
    id: "story-manifest-f05",
    category: "grounded",
    question: "When has Marcos decided not to use AI for a problem that could be solved with it?",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.deterministicChecks, "deterministic"),
    notes:
      "stories/house-numbers-deterministic-document-checks.json (story 005). Competencies: " +
      "customer-focus, decision-making, technical-judgment.",
  },
  {
    id: "story-manifest-f06",
    category: "grounded",
    question: "Tell me about a risky legacy migration Marcos handled.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.sapMigration, "SAP"),
    notes:
      "stories/fullstack-labs-sap-migration.json (story 006). Competencies: risk-management, " +
      "technical-judgment.",
  },
  {
    id: "story-manifest-f07",
    category: "grounded",
    question:
      "Tell me about a technical change Marcos had to advocate for over an extended period.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.promptMigration, "prompt"),
    notes:
      "stories/house-numbers-prompt-platform-migration.json (story 007). Competencies: " +
      "communication, influence, stakeholder-management, technical-leadership.",
  },
  {
    id: "story-manifest-f08",
    category: "grounded",
    question:
      "Tell me about a public-facing system Marcos designed to handle sensitive information safely.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.publicUpload, "public"),
    notes:
      "stories/house-numbers-secure-public-document-upload.json (story 008). Competencies: " +
      "customer-focus, risk-management.",
  },
  {
    id: "story-manifest-f09",
    category: "grounded",
    question:
      "Tell me about a production problem that was difficult to reproduce outside the live environment.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.zodIncident, "Zod"),
    notes:
      "stories/house-numbers-zod-production-incident.json (story 009). Competencies: " +
      "problem-solving.",
  },
  {
    id: "story-manifest-f10",
    category: "grounded",
    question:
      "Tell me about a time Marcos discovered that missing information came from a third-party system rather than his team's implementation.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.vendorContract, "vendor"),
    notes:
      "stories/house-numbers-vendor-extraction-contract.json (story 010). Competencies: " +
      "navigating-ambiguity, problem-solving, stakeholder-management.",
  },
  {
    id: "story-manifest-f11",
    category: "grounded",
    question:
      "Tell me about an architecture Marcos changed proactively to prevent future reliability problems.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.pipelineDecomposition, "pipeline"),
    notes:
      "stories/house-numbers-loan-analysis-pipeline-decomposition.json (story 011). " +
      "Competencies: decision-making, risk-management, technical-judgment, technical-leadership.",
  },
  {
    id: "story-manifest-f12",
    category: "grounded",
    question: "Tell me about something Marcos shipped that he still considers unsuccessful.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.mutualFailure, "Mutual|hackathon"),
    notes:
      "stories/mutual-sustainable-ownership-failure.json (story 012). Competencies: integrity, " +
      "learning-from-failure, personal-accountability, self-awareness.",
  },
  {
    id: "story-manifest-f13",
    category: "grounded",
    question: "Tell me about feedback that made Marcos change an unhealthy way of working.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.rokk3rFeedback, "Rokk3r"),
    notes:
      "stories/rokk3r-sustainable-performance-feedback.json (story 013). Competencies: " +
      "communication, learning-from-failure, receptiveness-to-feedback, resilience, self-awareness.",
  },
  {
    id: "story-manifest-f14",
    category: "grounded",
    question:
      "Tell me about a serious mistake Marcos accepted responsibility for as a technical leader.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.belatrixAccountability, "Belatrix"),
    notes:
      "stories/belatrix-destructive-deployment-accountability.json (story 014). Competencies: " +
      "mentoring, ownership, personal-accountability, technical-leadership.",
  },
  {
    id: "story-manifest-f15",
    category: "grounded",
    question: "Tell me about a team process Marcos improved using agentic tooling.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.crossServiceDebugging, "debugging"),
    notes:
      "stories/house-numbers-cross-service-debugging-skill.json (story 015). Competencies: " +
      "collaboration, leadership, process-improvement, technical-leadership.",
  },
  {
    id: "story-manifest-f16",
    category: "grounded",
    question:
      "Tell me about a time Marcos had to learn a new technical field while navigating a major personal transition.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: singleStoryAssertions(S.aiPivot, "paternity leave"),
    notes:
      "stories/house-numbers-ai-pivot-after-paternity-leave.json (story 016). Competencies: " +
      "adaptability, learning-agility, resilience, self-awareness.",
  },

  // ---- multiple-valid-answer cases (A01-A08) ----
  {
    id: "story-manifest-a01",
    category: "grounded",
    question: "Tell me about a time Marcos challenged a technical direction others preferred.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions(
      "any",
      [S.deterministicChecks, S.promptMigration],
      S.deterministicChecks,
    ),
    notes: "any: 005, 007; preferred: 005. Competencies: influence.",
  },
  {
    id: "story-manifest-a02",
    category: "grounded",
    question: "Give me one example of Marcos diagnosing a difficult production failure.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions("any", [S.zodIncident, S.vendorContract], S.zodIncident),
    notes: "any: 009, 010; preferred: 009.",
  },
  {
    id: "story-manifest-a03",
    category: "grounded",
    question:
      "Tell me about a time psychological safety changed how Marcos or someone he supported handled work.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions("any", [S.onboarding, S.rokk3rFeedback, S.aiPivot]),
    notes: "any: 003, 013, 016 (no preferred source). Competencies: collaboration.",
  },
  {
    id: "story-manifest-a04",
    category: "grounded",
    question:
      "What is an internal engineering practice or developer tool Marcos introduced that other engineers adopted?",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions(
      "any",
      [S.onboarding, S.promptMigration, S.crossServiceDebugging],
      S.crossServiceDebugging,
    ),
    notes: "any: 003, 007, 015; preferred: 015. Competencies: collaboration, process-improvement.",
  },
  {
    id: "story-manifest-a05",
    category: "grounded",
    question: "Give me one interview example from Marcos's work on Mutual.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions("any", [S.mutualLeadership, S.mutualFailure]),
    notes: "any: 002, 012 (no preferred source).",
  },
  {
    id: "story-manifest-a06",
    category: "grounded",
    question: "Tell me about a design change Marcos made inside the Document Analysis system.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions("any", [S.deterministicChecks, S.pipelineDecomposition]),
    notes: "any: 005, 011 (no preferred source).",
  },
  {
    id: "story-manifest-a07",
    category: "grounded",
    question: "Tell me about a personal mistake or judgment Marcos acknowledged and learned from.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions("any", [
      S.mutualFailure,
      S.rokk3rFeedback,
      S.belatrixAccountability,
    ]),
    notes:
      "any: 012, 013, 014 (no preferred source). Competencies: learning-from-failure, personal-accountability.",
  },
  {
    id: "story-manifest-a08",
    category: "grounded",
    question: "How has Marcos made production workflows easier to observe and debug?",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions("any", [S.commService, S.crossServiceDebugging]),
    notes: "any: 004, 015 (no preferred source).",
  },

  // ---- cross-cutting cases (C01-C02) ----
  {
    id: "story-manifest-c01",
    category: "grounded",
    question:
      "Compare how Marcos handled preventable risk in a data migration, a public upload flow, and an AI pipeline.",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions("all", [
      S.sapMigration,
      S.publicUpload,
      S.pipelineDecomposition,
    ]),
    notes: "all: 006, 008, 011. Competencies: risk-management.",
  },
  {
    id: "story-manifest-c02",
    category: "grounded",
    question:
      "How has Marcos turned individual expertise into repeatable team capability across onboarding and production debugging?",
    gapHonestyDirection: "claimed",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: groupAssertions("all", [S.onboarding, S.crossServiceDebugging]),
    notes: "all: 003, 015. Competencies: collaboration.",
  },

  // ---- absent-topic cases (N01-N02) ----
  {
    id: "story-manifest-n01",
    category: "gap",
    question: "Tell me about a time Marcos managed two equally urgent client projects at once.",
    gapHonestyDirection: "gap",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: {
      mustMatch: [
        "no (?:direct|specific) story|doesn'?t have a (?:direct|specific) story|hasn'?t (?:got|captured) a (?:direct|specific) story",
      ],
    },
    notes:
      "Locked absent-topic case: no authored story covers simultaneously managing two equally " +
      "urgent client engagements. expectEmpty per the #295 manifest.",
  },
  {
    id: "story-manifest-n02",
    category: "gap",
    question: "Describe a deadline Marcos could not move and how he cut scope to meet it.",
    gapHonestyDirection: "gap",
    expectedToolCall: "search-career-story-scoped",
    answerAssertions: {
      mustMatch: [
        "no (?:direct|specific) story|doesn'?t have a (?:direct|specific) story|hasn'?t (?:got|captured) a (?:direct|specific) story",
      ],
    },
    notes:
      "Locked absent-topic case: no authored story covers an immovable deadline forcing scope " +
      "cuts — a recorded gap. expectEmpty per the #295 manifest.",
  },
];

/**
 * The locked manifest's "Controlled competency coverage" table (#295's
 * issue body), typed against every case id it actually names.
 *
 * #295 correction (independent Codex review, agent package `1dd7ac7`,
 * finding 5): the previous coverage test only proved a competency's enum
 * string appears somewhere in the dataset's free-form `notes` — true even
 * with zero real case association. This table instead names the SPECIFIC
 * case ids per competency, machine-checked (`story-manifest-cases.test.ts`)
 * against real dataset ids and — for every `list-career-stories` case —
 * against the `expectedCompetencies` `../scorers/tool-routing.ts` actually
 * asserts on that case's real tool-call trace, not documentation prose.
 */
export const COMPETENCY_COVERAGE: Readonly<Record<Competency, readonly string[]>> = {
  adaptability: ["story-manifest-x10", "story-manifest-f16"],
  collaboration: [
    "story-manifest-f03",
    "story-manifest-f15",
    "story-manifest-a03",
    "story-manifest-a04",
    "story-manifest-c02",
  ],
  communication: ["story-manifest-f01", "story-manifest-f07", "story-manifest-f13"],
  "customer-focus": [
    "story-manifest-f01",
    "story-manifest-f04",
    "story-manifest-f05",
    "story-manifest-f08",
  ],
  "decision-making": ["story-manifest-x04", "story-manifest-f05", "story-manifest-f11"],
  influence: ["story-manifest-x01", "story-manifest-f07", "story-manifest-a01"],
  integrity: ["story-manifest-x02", "story-manifest-f12"],
  leadership: ["story-manifest-x01", "story-manifest-f02", "story-manifest-f15"],
  "learning-agility": ["story-manifest-x10", "story-manifest-f16"],
  "learning-from-failure": ["story-manifest-f12", "story-manifest-f13", "story-manifest-a07"],
  mentoring: ["story-manifest-x03", "story-manifest-f03", "story-manifest-f14"],
  "navigating-ambiguity": ["story-manifest-f01", "story-manifest-f10"],
  ownership: ["story-manifest-f04", "story-manifest-f14"],
  "personal-accountability": [
    "story-manifest-x09",
    "story-manifest-f12",
    "story-manifest-f14",
    "story-manifest-a07",
  ],
  prioritization: ["story-manifest-f01"],
  "problem-solving": [
    "story-manifest-x07",
    "story-manifest-x08",
    "story-manifest-f09",
    "story-manifest-f10",
  ],
  "process-improvement": ["story-manifest-x03", "story-manifest-f15", "story-manifest-a04"],
  "receptiveness-to-feedback": ["story-manifest-f13"],
  resilience: ["story-manifest-f13", "story-manifest-f16"],
  "risk-management": [
    "story-manifest-x05",
    "story-manifest-x06",
    "story-manifest-f06",
    "story-manifest-f08",
    "story-manifest-f11",
    "story-manifest-c01",
  ],
  "self-awareness": ["story-manifest-f12", "story-manifest-f13", "story-manifest-f16"],
  "stakeholder-management": ["story-manifest-f01", "story-manifest-f07", "story-manifest-f10"],
  "technical-judgment": [
    "story-manifest-x04",
    "story-manifest-f05",
    "story-manifest-f06",
    "story-manifest-f11",
  ],
  "technical-leadership": [
    "story-manifest-f07",
    "story-manifest-f11",
    "story-manifest-f14",
    "story-manifest-f15",
  ],
};

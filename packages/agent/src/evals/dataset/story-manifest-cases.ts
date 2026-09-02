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

import type { EvalCase } from "./schema.js";

const FACTUAL_BOUNDARY_GUARDS: readonly string[] = [
  // No invented authority: none of the 16 stories' real titles are an
  // executive/formal-management role.
  "\\b(?:CTO|Chief Technology Officer|VP of Engineering|Engineering Manager|founder|co-founder)\\b",
  // No invented confidential identifiers: no story content contains a real
  // SSN, borrower name, or salary figure to relay.
  "\\bSSN\\b|social security number|\\$\\d{2,3},\\d{3}\\s*(?:salary|per year|annually)",
];

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

/** A single required story citation, plus one distinguishing keyword and the shared factual-boundary guards. */
function singleStoryAssertions(ref: StoryRef, keyword: string) {
  return {
    mustMatch: [keyword],
    mustNotMatch: [...FACTUAL_BOUNDARY_GUARDS],
    mustCiteEntity: [ref],
  };
}

/** An `any`/`all` citation group, plus the shared factual-boundary guards. */
function groupAssertions(mode: "any" | "all", refs: readonly StoryRef[], preferredRef?: StoryRef) {
  return {
    mustNotMatch: [...FACTUAL_BOUNDARY_GUARDS],
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

/**
 * The golden retrieval dataset (#41, epic #6) — recruiter/hiring-manager
 * phrased questions, each answerable purely from `packages/career-data`'s
 * published content, with expected SOURCE ids (`sourceType`/`sourceId`,
 * never chunk ids — see `./schema.ts`'s docstring) `searchCareer` (#34)
 * should surface.
 *
 * **Target size**: 25 entries, chosen so a single flaky query moves the
 * aggregate recall/precision/MRR by at most 4 percentage points — enough
 * margin that one borderline case can't single-handedly swing a threshold
 * verdict. **Weighted toward fuzzy/cross-cutting** (14 of 25, 56%) per the
 * issue's locked decision that semantic search must "earn its keep" on
 * exactly those categories, with `exact` entries (6) kept as a sanity floor
 * and `absent-topic` entries (5) covering genuinely-absent topics.
 *
 * Every `notes` field cites the exact `packages/career-data/content/*` file
 * the entry is grounded in or absent from, for reviewers checking the
 * "public-facts only, no private data" acceptance criterion and for whoever
 * adds the next entry. `./validate-sources.test.ts` asserts every
 * `expectedSources` pointer here resolves to a real record in the current
 * career-data content (no dangling ids).
 */

import type { GoldenQuery } from "./schema.js";

export const GOLDEN_QUERIES: readonly GoldenQuery[] = [
  // ---- exact (deterministic single-fact questions — sanity floor) ----
  {
    id: "exact-location-availability",
    query: "Where is he based, and is he currently open to new roles?",
    category: "exact",
    expectedSources: [{ sourceType: "profile", sourceId: "marcos-alvarez" }],
    notes: "profile.json: location, availability",
  },
  {
    id: "exact-education-background",
    query: "What is his educational and certification background?",
    category: "exact",
    expectedSources: [
      { sourceType: "education", sourceId: "unad-bs-systems-engineering" },
      {
        sourceType: "education",
        sourceId: "international-scrum-institute-2020-scrum-master-product-owner",
      },
    ],
    notes: "education.json: both entries",
  },
  {
    id: "exact-typescript-skill",
    query: "Does he have expert-level TypeScript experience?",
    category: "exact",
    expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
    notes: "skills.json: typescript (proficiency: expert)",
  },
  {
    id: "exact-aws-skill",
    query: "What's his experience level with AWS?",
    category: "exact",
    expectedSources: [{ sourceType: "skill", sourceId: "aws" }],
    notes: "skills.json: aws (proficiency: expert)",
  },
  {
    id: "exact-house-numbers-role",
    query: "What was his role and company at House Numbers?",
    category: "exact",
    expectedSources: [
      { sourceType: "experience", sourceId: "house-numbers-2022-senior-full-stack-engineer" },
    ],
    notes: "experience/house-numbers-2022-senior-full-stack-engineer.json: role, company",
  },
  {
    id: "exact-xogito-role",
    query: "What did he do as Senior Software Development Engineer at Xogito Group?",
    category: "exact",
    expectedSources: [
      {
        sourceType: "experience",
        sourceId: "xogito-group-2020-senior-software-development-engineer",
      },
    ],
    notes: "experience/xogito-group-2020-senior-software-development-engineer.json",
  },

  // ---- fuzzy (recruiter phrasing, no literal wording overlap) ----
  {
    id: "fuzzy-event-driven-architecture",
    query: "Does he have experience with event-driven architecture?",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "skill", sourceId: "event-driven-architecture" },
      { sourceType: "experience", sourceId: "house-numbers-2022-senior-full-stack-engineer" },
    ],
    notes: "skills.json: event-driven-architecture, evidence highlights.1",
  },
  {
    id: "fuzzy-mentoring-onboarding",
    query: "Has he mentored or onboarded other engineers onto a team?",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "skill", sourceId: "mentoring" },
      {
        sourceType: "experience",
        sourceId: "xogito-group-2020-senior-software-development-engineer",
      },
    ],
    notes: "skills.json: mentoring, evidence highlights.2",
  },
  {
    id: "fuzzy-cost-optimization",
    query: "Anything about cost optimization or tracking the spend on AI features?",
    category: "fuzzy",
    expectedSources: [{ sourceType: "project", sourceId: "llm-evaluation-infrastructure" }],
    notes: "projects/llm-evaluation-infrastructure.mdx: per-call cost tracing",
  },
  {
    id: "fuzzy-ai-demo-to-production",
    query: "How does he take an AI feature from a demo to something reliable in production?",
    category: "fuzzy",
    expectedSources: [{ sourceType: "project", sourceId: "llm-evaluation-infrastructure" }],
    notes:
      "projects/llm-evaluation-infrastructure.mdx. The document-extraction project is deliberately " +
      "NOT expected here (#300): it was a proof of concept that never reached production, so it " +
      "cannot serve as evidence of taking a feature from demo to reliable production.",
  },
  // ---- document-extraction PoC status (#300): the record must answer honestly, as a PoC ----
  {
    id: "fuzzy-doc-extraction-production-status",
    query: "Was his document-extraction work deployed to production?",
    category: "fuzzy",
    expectedSources: [{ sourceType: "project", sourceId: "document-extraction-pipeline" }],
    notes:
      "projects/document-extraction-pipeline.mdx (stage: proof-of-concept) — the answer is no; " +
      "production kept the incumbent vendor plus the existing fallback.",
  },
  {
    id: "fuzzy-doc-extraction-poc-demonstrated",
    query: "What did the document-extraction proof of concept actually demonstrate?",
    category: "fuzzy",
    expectedSources: [{ sourceType: "project", sourceId: "document-extraction-pipeline" }],
    notes:
      "projects/document-extraction-pipeline.mdx: measured experimentation with stated " +
      "limitations — corpus bias found, a mapper bug corrected, coverage fixed before scoring.",
  },
  {
    id: "fuzzy-doc-extraction-vendor-cost-claim",
    query: "Did his extraction pipeline beat the OCR vendor at a few percent of its cost?",
    category: "fuzzy",
    expectedSources: [{ sourceType: "project", sourceId: "document-extraction-pipeline" }],
    notes:
      "projects/document-extraction-pipeline.mdx explains why the blanket claim is invalid: " +
      "experiment-run costs, no normalized denominator, no apples-to-apples accuracy result.",
  },
  {
    id: "fuzzy-message-classification-routing",
    query: "Has he built systems that automatically classify or route incoming messages?",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "experience", sourceId: "house-numbers-2022-senior-full-stack-engineer" },
    ],
    notes: "experience/house-numbers-2022-senior-full-stack-engineer.json: highlights.1",
  },
  {
    id: "fuzzy-legacy-system-migration",
    query: "Any experience modernizing or migrating a legacy system?",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "experience", sourceId: "rokk3r-2016-senior-full-stack-developer-and-devops" },
      { sourceType: "experience", sourceId: "fullstack-labs-2018-senior-software-engineer" },
    ],
    notes:
      "experience/rokk3r-2016-...json (Kubernetes migration), experience/fullstack-labs-2018-...json (legacy platform data migration)",
  },
  {
    id: "fuzzy-open-source-maintainer",
    query: "Has he built and maintained any open-source developer tools?",
    category: "fuzzy",
    expectedSources: [{ sourceType: "project", sourceId: "cowork" }],
    notes: "projects/cowork.mdx: open-source Python CLI, creator and maintainer",
  },
  {
    id: "fuzzy-docs-stay-current",
    query: "Does he care about keeping technical documentation from silently going stale?",
    category: "fuzzy",
    expectedSources: [{ sourceType: "project", sourceId: "monorepo-documentation-system" }],
    notes: "projects/monorepo-documentation-system.mdx",
  },
  {
    id: "fuzzy-real-time-systems",
    query: "Experience building real-time backend systems?",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "experience", sourceId: "jarvi-games-2013-full-stack-developer-and-devops" },
      { sourceType: "experience", sourceId: "rokk3r-2016-senior-full-stack-developer-and-devops" },
    ],
    notes:
      "experience/jarvi-games-2013-...json (real-time game backend), experience/rokk3r-2016-...json (real-time procurement platform)",
  },
  {
    id: "fuzzy-sensitive-data-handling",
    query: "Has he worked with sensitive or encrypted personal data?",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "skill", sourceId: "regulated-data-handling" },
      { sourceType: "experience", sourceId: "house-numbers-2022-senior-full-stack-engineer" },
    ],
    notes: "skills.json: regulated-data-handling, evidence highlights.1",
  },

  // ---- cross-cutting (answer spans multiple source records) ----
  {
    id: "cross-cutting-llms-and-agents",
    query: "What's his overall experience with LLMs and AI agents across his career?",
    category: "cross-cutting",
    expectedSources: [
      { sourceType: "skill", sourceId: "llms" },
      { sourceType: "skill", sourceId: "ai-agents" },
      { sourceType: "project", sourceId: "document-extraction-pipeline" },
      { sourceType: "project", sourceId: "cowork" },
      { sourceType: "project", sourceId: "llm-evaluation-infrastructure" },
    ],
    notes: "skills.json: llms, ai-agents; three project entries",
  },
  {
    id: "cross-cutting-fullstack-and-devops",
    query: "Does he combine full-stack development with DevOps or infrastructure work?",
    category: "cross-cutting",
    expectedSources: [
      { sourceType: "experience", sourceId: "rokk3r-2016-senior-full-stack-developer-and-devops" },
      { sourceType: "experience", sourceId: "jarvi-games-2013-full-stack-developer-and-devops" },
      { sourceType: "skill", sourceId: "docker" },
      { sourceType: "skill", sourceId: "kubernetes" },
    ],
    notes:
      "two experience titles literally pair full-stack + DevOps; skills.json: docker, kubernetes",
  },
  {
    id: "cross-cutting-solo-ownership",
    query: "What kind of engineering ownership has he had — solo-driven work versus team efforts?",
    category: "cross-cutting",
    expectedSources: [
      { sourceType: "project", sourceId: "llm-evaluation-infrastructure" },
      { sourceType: "project", sourceId: "monorepo-documentation-system" },
      {
        sourceType: "experience",
        sourceId: "xogito-group-2020-senior-software-development-engineer",
      },
    ],
    notes:
      "both projects list role 'Sole engineer / owner'; xogito experience: 'Owned backend architecture ... end to end'",
  },
  {
    id: "cross-cutting-measuring-ai-quality",
    query: "How does he think about measuring and evaluating AI system quality?",
    category: "cross-cutting",
    expectedSources: [
      { sourceType: "project", sourceId: "llm-evaluation-infrastructure" },
      { sourceType: "skill", sourceId: "prompt-engineering" },
      { sourceType: "skill", sourceId: "observability" },
    ],
    notes:
      "projects/llm-evaluation-infrastructure.mdx; skills.json: prompt-engineering, observability",
  },

  // ---- absent-topic (plausible recruiter questions, genuinely absent) ----
  {
    id: "absent-blockchain",
    query: "Does he have blockchain or smart-contract development experience?",
    category: "absent-topic",
    expectedSources: [],
    expectEmpty: true,
    notes: "No mention of blockchain/web3/smart contracts anywhere in the corpus.",
  },
  {
    id: "absent-salesforce-admin",
    query: "Has he worked with Salesforce administration or configuration?",
    category: "absent-topic",
    expectedSources: [],
    expectEmpty: true,
    notes: "No mention of Salesforce anywhere in the corpus.",
  },
  {
    id: "absent-embedded-firmware",
    query: "Any embedded systems or firmware development experience in C?",
    category: "absent-topic",
    expectedSources: [],
    expectEmpty: true,
    notes: "No mention of embedded systems, firmware, or C anywhere in the corpus.",
  },
  {
    id: "absent-sap-erp",
    query: "Does he have SAP ERP implementation experience?",
    category: "absent-topic",
    expectedSources: [],
    expectEmpty: true,
    notes: "No mention of SAP or ERP systems anywhere in the corpus.",
  },
  {
    id: "absent-penetration-testing",
    query: "Has he done penetration testing or offensive security work?",
    category: "absent-topic",
    expectedSources: [],
    expectEmpty: true,
    notes: "No mention of penetration testing or offensive security anywhere in the corpus.",
  },

  // ---- behavioral-story eval manifest (#295): the locked 38-case set ----
  // Story reference table (issue #295):
  // 001 xogito-client-account-recovery         009 house-numbers-zod-production-incident
  // 002 mutual-informal-leadership              010 house-numbers-vendor-extraction-contract
  // 003 cross-team-onboarding-framework         011 house-numbers-loan-analysis-pipeline-decomposition
  // 004 house-numbers-communication-service-... 012 mutual-sustainable-ownership-failure
  // 005 house-numbers-deterministic-document-.. 013 rokk3r-sustainable-performance-feedback
  // 006 fullstack-labs-sap-migration            014 belatrix-destructive-deployment-accountability
  // 007 house-numbers-prompt-platform-migration 015 house-numbers-cross-service-debugging-skill
  // 008 house-numbers-secure-public-document-.. 016 house-numbers-ai-pivot-after-paternity-leave

  // ---- exact (10) — retrieval-plumbing sanity cases, may reuse story wording ----
  {
    id: "story-x01-leadership-without-authority",
    query: "Tell me about a time Marcos stepped into leadership without formal authority.",
    category: "exact",
    expectedSources: [
      { sourceType: "story", sourceId: "xogito-client-account-recovery" },
      { sourceType: "story", sourceId: "mutual-informal-leadership" },
      { sourceType: "story", sourceId: "cross-team-onboarding-framework" },
      { sourceType: "story", sourceId: "house-numbers-cross-service-debugging-skill" },
    ],
    matchMode: "any",
    preferredSource: { sourceType: "story", sourceId: "xogito-client-account-recovery" },
    notes:
      "Leadership priority invariant (#295): 001 must outrank 002 whenever both are acceptable.",
  },
  {
    id: "story-x02-mission-over-financial-benefit",
    query: "When has Marcos put a product's mission ahead of personal financial benefit?",
    category: "exact",
    expectedSources: [
      { sourceType: "story", sourceId: "mutual-informal-leadership" },
      { sourceType: "story", sourceId: "mutual-sustainable-ownership-failure" },
    ],
    matchMode: "any",
    preferredSource: { sourceType: "story", sourceId: "mutual-informal-leadership" },
  },
  {
    id: "story-x03-onboarding-practice-spread",
    query:
      "Give me an example of an onboarding practice Marcos introduced that spread across roles and teams.",
    category: "exact",
    expectedSources: [{ sourceType: "story", sourceId: "cross-team-onboarding-framework" }],
  },
  {
    id: "story-x04-deterministic-over-ai-fashion",
    query:
      "Tell me about a time Marcos chose a deterministic implementation over a more technically fashionable AI approach.",
    category: "exact",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-deterministic-document-checks" },
    ],
  },
  {
    id: "story-x05-financial-data-discrepancy",
    query: "Give an example of Marcos investigating a subtle financial-data discrepancy.",
    category: "exact",
    expectedSources: [{ sourceType: "story", sourceId: "fullstack-labs-sap-migration" }],
  },
  {
    id: "story-x06-sensitive-public-facing-data",
    query: "How has Marcos handled sensitive data in a public-facing workflow?",
    category: "exact",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-secure-public-document-upload" },
    ],
  },
  {
    id: "story-x07-dependency-upgrade-incident",
    query:
      "Tell me about a time a major dependency upgrade caused an unexpected production problem.",
    category: "exact",
    expectedSources: [{ sourceType: "story", sourceId: "house-numbers-zod-production-incident" }],
  },
  {
    id: "story-x08-vendor-contract-validation",
    query:
      "How has Marcos validated a vendor's documented data contract against production traffic?",
    category: "exact",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-vendor-extraction-contract" },
    ],
  },
  {
    id: "story-x09-code-review-mistake",
    query: "Tell me about a code-review mistake Marcos made and how he responded.",
    category: "exact",
    expectedSources: [
      { sourceType: "story", sourceId: "belatrix-destructive-deployment-accountability" },
    ],
  },
  {
    id: "story-x10-b2c-to-ai-b2b-pivot",
    query:
      "How did Marcos adapt when House Numbers pivoted from B2C to an AI-assisted B2B platform?",
    category: "exact",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-ai-pivot-after-paternity-leave" },
    ],
  },

  // ---- held-out fuzzy (16) — natural recruiter wording, absent verbatim from indexed chunks ----
  {
    id: "story-f01-rebuild-client-relationship",
    query:
      "Tell me about a time Marcos had to rebuild a damaged client relationship while deciding what to deliver first.",
    category: "fuzzy",
    expectedSources: [{ sourceType: "story", sourceId: "xogito-client-account-recovery" }],
  },
  {
    id: "story-f02-stalled-mission-project",
    query:
      "Tell me about a time Marcos helped a stalled mission-driven project move again without formal authority.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "mutual-informal-leadership" },
      { sourceType: "story", sourceId: "mutual-sustainable-ownership-failure" },
    ],
    matchMode: "any",
    preferredSource: { sourceType: "story", sourceId: "mutual-informal-leadership" },
  },
  {
    id: "story-f03-help-teammates-independent",
    query: "How does Marcos help new teammates become independent?",
    category: "fuzzy",
    expectedSources: [{ sourceType: "story", sourceId: "cross-team-onboarding-framework" }],
  },
  {
    id: "story-f04-operational-system-ownership",
    query: "Tell me about a critical operational system Marcos continued owning after launch.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-communication-service-ownership" },
    ],
  },
  {
    id: "story-f05-decided-against-ai",
    query: "When has Marcos decided not to use AI for a problem that could be solved with it?",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-deterministic-document-checks" },
    ],
  },
  {
    id: "story-f06-risky-legacy-migration",
    query: "Tell me about a risky legacy migration Marcos handled.",
    category: "fuzzy",
    expectedSources: [{ sourceType: "story", sourceId: "fullstack-labs-sap-migration" }],
  },
  {
    id: "story-f07-sustained-technical-advocacy",
    query: "Tell me about a technical change Marcos had to advocate for over an extended period.",
    category: "fuzzy",
    expectedSources: [{ sourceType: "story", sourceId: "house-numbers-prompt-platform-migration" }],
  },
  {
    id: "story-f08-public-facing-sensitive-info",
    query:
      "Tell me about a public-facing system Marcos designed to handle sensitive information safely.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-secure-public-document-upload" },
    ],
  },
  {
    id: "story-f09-hard-to-reproduce-production-bug",
    query:
      "Tell me about a production problem that was difficult to reproduce outside the live environment.",
    category: "fuzzy",
    expectedSources: [{ sourceType: "story", sourceId: "house-numbers-zod-production-incident" }],
  },
  {
    id: "story-f10-missing-info-third-party",
    query:
      "Tell me about a time Marcos discovered that missing information came from a third-party system rather than his team's implementation.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-vendor-extraction-contract" },
    ],
  },
  {
    id: "story-f11-proactive-reliability-architecture",
    query:
      "Tell me about an architecture Marcos changed proactively to prevent future reliability problems.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-loan-analysis-pipeline-decomposition" },
    ],
  },
  {
    id: "story-f12-shipped-work-considered-unsuccessful",
    query: "Tell me about something Marcos shipped that he still considers unsuccessful.",
    category: "fuzzy",
    expectedSources: [{ sourceType: "story", sourceId: "mutual-sustainable-ownership-failure" }],
  },
  {
    id: "story-f13-feedback-changed-unhealthy-habit",
    query: "Tell me about feedback that made Marcos change an unhealthy way of working.",
    category: "fuzzy",
    expectedSources: [{ sourceType: "story", sourceId: "rokk3r-sustainable-performance-feedback" }],
  },
  {
    id: "story-f14-serious-mistake-accountability",
    query:
      "Tell me about a serious mistake Marcos accepted responsibility for as a technical leader.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "belatrix-destructive-deployment-accountability" },
    ],
  },
  {
    id: "story-f15-agentic-tooling-process-improvement",
    query: "Tell me about a team process Marcos improved using agentic tooling.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-cross-service-debugging-skill" },
    ],
  },
  {
    id: "story-f16-new-field-personal-transition",
    query:
      "Tell me about a time Marcos had to learn a new technical field while navigating a major personal transition.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-ai-pivot-after-paternity-leave" },
    ],
  },

  // ---- multiple-valid-answer fuzzy (8), matchMode: any ----
  {
    id: "story-a01-challenged-technical-direction",
    query: "Tell me about a time Marcos challenged a technical direction others preferred.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-deterministic-document-checks" },
      { sourceType: "story", sourceId: "house-numbers-prompt-platform-migration" },
    ],
    matchMode: "any",
    preferredSource: {
      sourceType: "story",
      sourceId: "house-numbers-deterministic-document-checks",
    },
  },
  {
    id: "story-a02-diagnosing-production-failure",
    query: "Give me one example of Marcos diagnosing a difficult production failure.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-zod-production-incident" },
      { sourceType: "story", sourceId: "house-numbers-vendor-extraction-contract" },
    ],
    matchMode: "any",
    preferredSource: { sourceType: "story", sourceId: "house-numbers-zod-production-incident" },
  },
  {
    id: "story-a03-psychological-safety",
    query:
      "Tell me about a time psychological safety changed how Marcos or someone he supported handled work.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "cross-team-onboarding-framework" },
      { sourceType: "story", sourceId: "rokk3r-sustainable-performance-feedback" },
      { sourceType: "story", sourceId: "house-numbers-ai-pivot-after-paternity-leave" },
    ],
    matchMode: "any",
  },
  {
    id: "story-a04-internal-tool-adopted",
    query:
      "What is an internal engineering practice or developer tool Marcos introduced that other engineers adopted?",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "cross-team-onboarding-framework" },
      { sourceType: "story", sourceId: "house-numbers-prompt-platform-migration" },
      { sourceType: "story", sourceId: "house-numbers-cross-service-debugging-skill" },
    ],
    matchMode: "any",
    preferredSource: {
      sourceType: "story",
      sourceId: "house-numbers-cross-service-debugging-skill",
    },
  },
  {
    id: "story-a05-mutual-interview-example",
    query: "Give me one interview example from Marcos's work on Mutual.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "mutual-informal-leadership" },
      { sourceType: "story", sourceId: "mutual-sustainable-ownership-failure" },
    ],
    matchMode: "any",
  },
  {
    id: "story-a06-document-analysis-design-change",
    query: "Tell me about a design change Marcos made inside the Document Analysis system.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-deterministic-document-checks" },
      { sourceType: "story", sourceId: "house-numbers-loan-analysis-pipeline-decomposition" },
    ],
    matchMode: "any",
  },
  {
    id: "story-a07-personal-mistake-learned-from",
    query: "Tell me about a personal mistake or judgment Marcos acknowledged and learned from.",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "mutual-sustainable-ownership-failure" },
      { sourceType: "story", sourceId: "rokk3r-sustainable-performance-feedback" },
      { sourceType: "story", sourceId: "belatrix-destructive-deployment-accountability" },
    ],
    matchMode: "any",
  },
  {
    id: "story-a08-observable-debuggable-workflows",
    query: "How has Marcos made production workflows easier to observe and debug?",
    category: "fuzzy",
    expectedSources: [
      { sourceType: "story", sourceId: "house-numbers-communication-service-ownership" },
      { sourceType: "story", sourceId: "house-numbers-cross-service-debugging-skill" },
    ],
    matchMode: "any",
  },

  // ---- cross-cutting (2), matchMode: all — evidence deliberately spans every listed source ----
  {
    id: "story-c01-preventable-risk-across-systems",
    query:
      "Compare how Marcos handled preventable risk in a data migration, a public upload flow, and an AI pipeline.",
    category: "cross-cutting",
    expectedSources: [
      { sourceType: "story", sourceId: "fullstack-labs-sap-migration" },
      { sourceType: "story", sourceId: "house-numbers-secure-public-document-upload" },
      { sourceType: "story", sourceId: "house-numbers-loan-analysis-pipeline-decomposition" },
    ],
    matchMode: "all",
  },
  {
    id: "story-c02-individual-expertise-to-team-capability",
    query:
      "How has Marcos turned individual expertise into repeatable team capability across onboarding and production debugging?",
    category: "cross-cutting",
    expectedSources: [
      { sourceType: "story", sourceId: "cross-team-onboarding-framework" },
      { sourceType: "story", sourceId: "house-numbers-cross-service-debugging-skill" },
    ],
    matchMode: "all",
  },

  // ---- absent-topic (2) — honestly-absent behavioral topics (#295) ----
  {
    id: "story-n01-two-equally-urgent-clients",
    query: "Tell me about a time Marcos managed two equally urgent client projects at once.",
    category: "absent-topic",
    expectedSources: [],
    expectEmpty: true,
    notes: "No authored story covers competing, equally-urgent concurrent client priorities.",
  },
  {
    id: "story-n02-immovable-deadline-scope-cut",
    query: "Describe a deadline Marcos could not move and how he cut scope to meet it.",
    category: "absent-topic",
    expectedSources: [],
    expectEmpty: true,
    notes: "No authored story covers an immovable deadline forcing a scope cut.",
  },
];

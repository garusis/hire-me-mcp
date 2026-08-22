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
    expectedSources: [
      { sourceType: "project", sourceId: "llm-evaluation-infrastructure" },
      { sourceType: "project", sourceId: "document-extraction-pipeline" },
    ],
    notes: "projects/llm-evaluation-infrastructure.mdx, projects/document-extraction-pipeline.mdx",
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
];

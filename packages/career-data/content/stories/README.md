# Career stories — corpus review checklist (#290)

One `CareerStory` per file. Every file was authored from an owner-approved
story comment on issue #290; the story `id`, `experienceId`,
`relatedExperienceIds`, competencies, and `retrievalTags` are copied
unchanged from that comment, and the narrative sections are the approved
public narrative split into situation / task / actions / results /
reflection. Retrieval questions are deliberately **not** persisted here
(they are the #295 authoring pool).

Story bodies are served only through explicit MCP or chat queries. They
are never rendered on portfolio pages, added to navigation, the sitemap,
the CV, SEO metadata, or `llms.txt` (#288 visibility boundary; enforced in
#296).

## Result-claim review

Every result claim below was compared against its approved source before
the file was written. "Approved comment" means the owner-approved story
comment on #290 (the interview record); other columns name the public
career evidence the claim is also visible in.

| # | Story id | Approved | Result claims and the evidence they rest on | Boundaries preserved |
| --- | --- | --- | --- | --- |
| 001 | `xogito-client-account-recovery` | 2026-08-28 | Trust returned over two or three sprints; corrected workflows accepted; ~6 months leading product conversations; later commissioned projects and the internal-team invitation. Source: approved comment; `experience/xogito…highlights.1`. | Further work is reported only as a later observed outcome, never as caused or "won" (#305 pt 9). No formal authority claimed. No client name. |
| 002 | `mutual-informal-leadership` | 2026-08-28 | Launched before the proposed deadline and handed to the government; no post-launch metrics. Source: approved comment. | Explicitly states the disagreement was not resolved. |
| 003 | `cross-team-onboarding-framework` | 2026-08-28 | Supervised developer improved; used with at least 15 people across Xogito and House Numbers; House Numbers adopted rotating buddies; results qualitative, not measured. Source: approved comment; `experience/xogito…highlights.2`. | "Qualitative rather than formally measured" retained verbatim. Related House Numbers role does not transfer the event (#305 pt 2). |
| 004 | `house-numbers-communication-service-ownership` | 2026-08-29 | Remains the deepest-knowledge owner; manual-triage shifts no longer needed; 57,000+ communications with ~70% observed effective-triage outcome over seven months. Source: approved comment; `experience/house-numbers…highlights.1`; recommendation `andre-treib-2026` (attributed, not canonical). | The 70% figure is explicitly "not LLM accuracy" and its remainder bucket is named. |
| 005 | `house-numbers-deterministic-document-checks` | 2026-08-30 | PM reported successful follow-up interviews; checks stable and deterministically tested; LLM runtime cost removed; LLMs retained where useful. Source: approved comment. | No numbers invented. Not framed as a vendor replacement (#300). |
| 006 | `fullstack-labs-sap-migration` | 2026-08-31 | Approved by legacy-system experts; no data loss or corruption; users stopped relying on SAP after MVP. Source: approved comment; `experience/fullstack-labs…highlights.1`. | Rounding root cause matches the existing highlight. Later Xogito migration is a reflection, not a second event. |
| 007 | `house-numbers-prompt-platform-migration` | 2026-08-31 | No significant interruption; cheaper models adopted under evals; CTO and team confirmed improvement; PM uses Claude Code for triage; recurring platform cost eliminated. Source: approved comment; `experience/house-numbers…highlights.2`; project `llm-evaluation-infrastructure`. | Teammate's cost-tracing origin credited. Decision "belonged to the team". No savings figure. |
| 008 | `house-numbers-secure-public-document-upload` | 2026-08-31 | Many uploads per day; borrower complaints about failed uploads stopped; support reports traceable. Source: approved comment; `experience/house-numbers…highlights.4` (public upload flows). | "Roughly two out of every three" is an owner-provided operational estimate, stated as "we estimated" (#305 pt 9). |
| 009 | `house-numbers-zod-production-incident` | 2026-08-31 | Cascade contained; affected window reprocessed; no permanent data loss. Source: approved comment; `experience/house-numbers…highlights.4` (incident response). | 96 restarts / 0-4 normal range are from the approved comment only. No incident details mixed from other events. |
| 010 | `house-numbers-vendor-extraction-contract` | 2026-08-31 | Vendor confirmed disabled capabilities and enabled them; mocks gave a grounded contract; fresh extractions matched. Source: approved comment. | The original documents remained available; only the historical structured extraction was unavailable (#305 pt 9). Vendor not named. |
| 011 | `house-numbers-loan-analysis-pipeline-decomposition` | 2026-08-31 | Redesign and deterministic-check migration reached production; stage isolation and observability. Source: approved comment. | "Had not caused a production outage" retained; proactive framing kept. |
| 012 | `mutual-sustainable-ownership-failure` | 2026-09-01 | Delivered, but the project is not considered a success; conflict unresolved. Source: approved comment. | Same event as 002 with a deliberately different frame; facts identical. |
| 013 | `rokk3r-sustainable-performance-feedback` | 2026-09-01 | Quality and rhythm restored; MVP delivered; client very happy. Source: approved comment. | Workload was self-imposed; PM's feedback quoted only as reported speech. Related Kubesoft role is employment context only. |
| 014 | `belatrix-destructive-deployment-accountability` | 2026-09-01 | Project-level allowlist and pipeline controls; org-wide protections by others; normal access restored after ~a month. Source: approved comment; `experience/belatrix…summary` (led the team). | Affected only a shared development environment, never production or customer data (#305 pt 9). Org-wide protections explicitly not Marcos's implementation. |
| 015 | `house-numbers-cross-service-debugging-skill` | 2026-09-01 | Shared, versioned process adopted by on-call engineers; alert-to-agent automation implemented by another engineer; consistent initial diagnosis. Source: approved comment; `experience/house-numbers…highlights.4` (observability, incident response). | Automation credited to another engineer; proposal not presented as final authority. |
| 016 | `house-numbers-ai-pivot-after-paternity-leave` | 2026-09-01 | Stayed; became one of the engineers building the production LLM/agentic systems; teammates trust his judgment. Source: approved comment; `experience/house-numbers…summary`. | "One of the engineers", not the sole builder. No PoC-to-production inflation (#300). |

## Authoring rules applied

- One primary competency and at most five distinct supporting ones from
  `src/schemas/competency.ts`; no retrieval tag equals a competency.
- Retrieval tags are the minimized, owner-reviewed sets from #305 decision 3
  (6-15 per story, 176 assignments, 166 distinct values across the corpus).
- No story exists for a role without an owner-approved event (Jarvi Games has
  none by decision; #305 point 1).
- The document-extraction PoC has no story: the owner paused that candidate
  on 2026-08-30 pending #300 and none was approved afterwards. The project
  record `document-extraction-pipeline` remains its detailed source of truth.

The field-to-story mapping #297 consumed lives in
`../story-preservation-map.json` and is validated by the
`story-preservation-map-resolves` content-lint rule. After the #297 cleanup,
each story is the only place its full narrative lives: the
`no-story-detail-in-experience` rule fails the lint if any story sentence is
copied verbatim into the parent experience's summary or highlights.

## Authoring a new story: truth and confidentiality checklist (#296)

Before adding a new `CareerStory` file, work through this list — it distills the review discipline
the 16 stories above were already held to (see the result-claim table and #305's review points),
stated forward for the next story rather than backward as a review record:

1. **Source every claim to an owner-approved record.** A story's situation/task/actions/results/
   reflection must trace to an owner-approved comment (an interview record, written approval, or
   equivalent) — never invented, inferred, or "plausible" detail. If a result isn't in the
   approved source, it doesn't go in the story.
2. **Never invent a number.** No metric, count, percentage, or duration appears unless the
   approved source states it. An estimate stays phrased as an estimate ("we estimated", "roughly")
   rather than presented as a measured fact (see story 008's "roughly two out of every three").
3. **State outcomes as observed, not as caused or won**, unless the source explicitly claims
   causation. Later positive developments (repeat business, promotions, trust earned) are reported
   as subsequent events, not as guaranteed consequences of the story's actions (#305 point 9).
4. **Never claim authority, title, or scope you didn't have.** Distinguish leading a team from
   contributing to one, a formal role from an informal one, and a personal decision from a team or
   org-wide one — the existing stories are explicit about this (e.g. story 001's "no formal
   authority claimed", story 014's "org-wide protections explicitly not Marcos's implementation").
5. **Protect third-party and client confidentiality.** No client, employer-external vendor, or
   named individual's identity is disclosed unless it is already public elsewhere in the career
   data; a vendor stays "a vendor," a client stays "a client" (see stories 001 and 010).
6. **Distinguish two similar events rather than merging them.** If a new story shares an
   underlying event with an existing one (as 002 and 012 deliberately do, told from different
   frames), keep the facts identical between them and state the relationship in the new story
   rather than quietly diverging.
7. **Scope the primary vs. related experience correctly.** The primary `experienceId` is where the
   event occurred; a related experience is context only — never let its actions or results appear
   to transfer (see the `cross-team-onboarding-framework` note above).
8. **Assign one primary and up to five supporting competencies** from `../../src/schemas/
   competency.ts`, and retrieval tags that never restate a competency (see "Authoring rules
   applied" above).
9. **Run `pnpm lint:content` before opening a PR.** `no-story-detail-in-experience`,
   `story-preservation-map-resolves`, and `story-preservation-map-complete` all fail the build on
   a violation — a new story does not, by itself, require a `story-preservation-map.json` entry
   unless it also changes what an experience's `summary`/`highlights` may say.
10. **Do not add a public route, link, or page reference for the new story.** Stories remain an
    explicit-query MCP/chat surface only (see [`docs/mcp.md`](../../../../docs/mcp.md#available-tools)) — the boundary this checklist protects is the same one #296 verifies mechanically.

# Stage 3 second review of the optimized CVs (#309)

Reviewed, no files changed: `apps/web/public/cv/marcos-javier-alvarez-cv.pdf` (general, 2 pages Letter) and `apps/web/public/cv/marcos-javier-alvarez-cv-ai.pdf` (AI, 2 pages Letter), their HTML in `docs/cv-review/`, the Stage 1 full dump `docs/cv-review/marcos-javier-alvarez-cv.full.html`, the first advisor's `docs/cv-review/stage2-recruiter-review.md`, `packages/career-data/content/cv-overrides.json`, the canonical experience/stories/skills/projects/recommendations, and the projection in `apps/web/src/lib/content/cv.ts`.

Short version: the general variant is a real CV now and would get forwarded. It is carrying four avoidable problems: outcomes sit at the end of every bullet instead of the front, the general variant has zero frontend evidence in the current role, the AI variant silently falls back to weak canonical bullets for Xogito and FullStack Labs because of a projection gap, and both PDFs split a role across the page break (the AI one strands a lone `Tech:` line at the top of page 2). None of these is expensive to fix.

---

## 1. The 30-second read

### General variant

Second 0-5, header. "Senior Full-Stack Engineer · TypeScript, Node.js, React, AWS · Production LLM systems". Correct signal: general SWE first, AI as a differentiator. "Cúcuta, Colombia (Remote) · UTC-5, full US-hours overlap" answers the two filters a US recruiter applies before reading anything else. Good. The contact line wraps and leaves "linkedin.com/in/garusis" alone on a second line; cosmetic.

Second 5-15, summary. Eight lines at 10pt. The recruiter reads the first line and a half: "13 years shipping TypeScript/Node.js, React and AWS products, the last four as one of the first non-founder engineers at House Numbers, helping grow a mortgage-lending platform from a handful of services to a 15-service event-driven monorepo." That is the right sentence. Then "57,000+ emails, SMS and calls" catches the eye in line 4. The recruiter now has: 13 years, the stack, early-stage ownership, one big number. They stop reading the paragraph around "Since 2023" and skip to Experience. Lines 6-8 ("Earlier: multi-tenant SaaS backend lead, legacy-SAP data migrations...") are not read by anyone at this stage.

Second 15-30, House Numbers. Five bullets, each three to four lines. The recruiter reads the first line of each:

- "Built and maintain the platform's communications service end to end: webhook-driven email, SMS and call intake," (the 57,000 number is on line 3)
- "Eliminated failed-upload complaints on a public document-upload flow where roughly two in three submissions had" (ok, the outcome leads)
- "Owned incident response on the document-processing path: contained a crash loop (96 restarts in 24 hours against a" (good)
- "Replaced hallucination-prone LLM-generated loan-document checks with deterministic, tested validation in under two" (good)
- "Led the multi-month migration off a prompt-management vendor (Orq.ai) to repository-native LLM infrastructure:" (outcome on line 4)

Conclusion at second 30: "Senior, owns production systems, has real incidents and real numbers, knows LLM work, remote-friendly. Forward." What the recruiter does not see: anything he built in React. For a full-stack req that is the one gap a hiring manager will raise ("is he actually a backend engineer who lists React?"). The word React appears in the headline, the tech lines and the skills block, never in a sentence describing work.

Where they stop: bottom of page 1, mid-Xogito. Page 2 is only read if the hiring manager asks for it, and page 2 opens with "Led a second, larger legacy-SAP data migration" plus an italic tech line, i.e. the tail of a role whose head is on the previous page. That is the one place the document looks careless.

### AI variant

Header is right for the audience: "LLM and agentic systems in production" leads, and the `/api/mcp` URL is a genuine hook for an AI-tooling company. The summary opens with a 63-word sentence; a recruiter reads "spent the last three years putting LLM and agentic features into production on a mortgage-lending platform and making them accountable: evaluation harnesses..." and gets the picture, then skims. The House Numbers block is the general block reordered (LLM-infra bullets second and third) plus a sixth bullet about a proof of concept that "was left to the team". Solid for an AI-adjacent full-stack req.

Then page 1 ends with two thin Xogito bullets ("Owned backend architecture and delivery for the multi-tenant inspection platform end to end.") and page 2 opens with a stranded "Tech: NestJS, TypeScript, PostgreSQL, Docker, GitLab CI, AWS." line with nothing above it. FullStack Labs then reads "Built and maintained full-stack features across the procurement platform." which is a filler bullet. The AI variant's pages 2 is visibly weaker than the general variant's, and a recruiter who has both will notice they describe Xogito and FullStack Labs differently. See 4.2 for why.

---

## 2. Include from the full dump

Ordered by how much each would move the interview rate. Sources are the Stage 1 dump (`.full.html`), the canonical stories, or the public recommendations. Items marked GATED come from a LinkedIn recommendation or a reflection field and are flagged in the dataset as not yet confirmed by the candidate; they go on paper only after Marcos confirms them.

1. **Frontend product work at House Numbers (canonical highlight 4, dropped from both variants).** Source: "Built and evolved flexible query filtering for the loan-application product end to end: the frontend filter flows and a reusable TypeScript filter library and query parser that compose MongoDB queries from them ... with tenant-scoped access for sensitive loan data." This is the only sentence in the dataset that proves he ships UI on the current product. Both variants dropped it. For a "senior full-stack" target that is the wrong thing to cut; #298 point 1 was about the profile reading as AI-only, and the fix for "reads as backend-only" is the same. Goes in: general variant, one line inside a sixth "platform" bullet (see 3.4). Do not spend 60 words on operator names.

2. **The on-call workflow's automated outcome (story "Standardizing production debugging", results).** Source: "Today, a human report or a New Relic alert can trigger an agent that reviews the available evidence and develops likely causes. When the problem maps to a code change, the agent can prepare a pull request. An engineer validates the root cause and reviews the proposed fix before anything is merged." Both CVs reduced this to "Authored the shared on-call investigation workflow the whole rotation adopted." The alert-to-PR outcome is the most concrete "agentic AI in production" fact in the dataset and it is absent from the AI variant, which instead spends its sixth bullet on a proof of concept that did not ship. Goes in: AI variant bullet 6 (replacing the PoC bullet), and as a clause in the general variant's platform bullet. Keep "another engineer implemented that automation" honest: "proposed and seeded the automation a teammate then built" or simply describe the workflow outcome without claiming the automation.

3. **The monorepo documentation system and breadth of ownership (canonical highlight 5, dropped).** Source: "Designed and delivered a monorepo-wide, agent-consumable documentation system with deterministic integrity gates in CI, alongside broad ownership of shared packages, public upload flows, user offboarding, observability, and production incident response." The first advisor recommended merging this with the on-call bullet; the implementation dropped it entirely. Goes in: the same sixth general bullet (platform tooling: on-call workflow, CI-gated docs, filter library).

4. **Communications-service hardening (story "Owning a critical communications service", actions).** Source: "I added monitoring, alerts, durable retries, periodic reconciliation for missed webhooks, and diagnostic tooling built on traces, structured logs, and persisted processing history." These are the reliability keywords #298 point 2 asked for (retries, reconciliation, alerting, tracing) and they cost eleven words: "hardened with monitoring, alerts, durable retries and webhook reconciliation". Goes in: end of the comms bullet, both variants, replacing "operations retired its manual-triage shifts" if space is tight (keep the 70% number, which already implies it).

5. **Stakeholder-facing duration at Xogito (story "Rebuilding client trust", results).** Source: "I continued leading the product conversations for approximately six months." and "one of their principal contacts invited me to become the first member of an internal technology team they were considering building." The CV says "rebuilt trust within a few sprints; the client went on to commission additional projects." Six months of leading client product conversations is the evidence for the $150k stakeholder-facing track; add "and led the client product conversations for about six months". The invitation is a nice detail but sounds like a boast on paper; leave it on the MCP.

6. **B2C-to-B2B pivot and "two platforms from the ground up" (Jeff Levinsohn recommendation; public, CEO-attributed).** Source: "he helped us build two very different platforms essentially from the ground up, including our eventual pivot into an AI-enabled mortgage operations company." The summary says "helping grow a mortgage-lending platform from a handful of services to a 15-service event-driven monorepo". Adding "through a B2C-to-B2B pivot" is five words and tells a hiring manager he has survived a rebuild. Reference-safe: the CEO wrote it. Goes in: general summary, first sentence. The canonical House Numbers summary already carries "the pivot into the platform's current product", so this is CV wording only.

7. **GATED: 2022 pricing/eligibility engine and 2023 conversational service (now canonical highlight 6, sourced from André Treib).** Source: "Built the platform's mortgage eligibility and pricing engine (2022), a declarative matcher scoring HECM, HELOC and HELOAN products with parallel, type-validated eligibility checks, and its conversational service (2023)..." The engineer added it to the canonical entry but neither CV projects it. Once Marcos confirms the specifics, this is bullet 2 of the general variant: it is core domain logic, pre-LLM, and it answers "is he only an AI guy" better than any sentence in the summary. Until confirmed, correctly left off.

8. **GATED: evaluation-infrastructure specifics (André Treib).** Source: "designed our LLM-as-a-judge scorers, an *.agents.ts convention that isolates model-dependent code in a CI lane that only fires when a prompt or an agent actually changes ... he moved our model selection out of environment variables so we could judge with an opposing provider." The AI variant's summary mentions "LLM-as-judge scoring" generically; this is the specific, shipped, peer-attested version and it beats the PoC bullet. Goes in: AI variant bullet, after confirmation. The MCP tool factory ("replaced 24 hand-written MCP tool files with a declarative factory that tripled our agent's tool coverage") is a second AI-variant candidate, same gate.

9. **Vendor accountability (story "Proved that documented extraction capabilities were disabled", and Crystal Butman: "He held our vendors accountable to what they promised").** One clause, general variant, optional: "traced missing structured extractions to capabilities disabled on the vendor's side and got them re-enabled". It shows debugging across an organizational boundary, which hiring managers like. Low priority; only if a line is free.

10. **hire-me-mcp concrete facts (project body).** Source: "Playwright e2e ... against the real Vercel preview deployment of every PR", "Retrieval evals — recall/precision/MRR over a committed golden-query dataset with hard thresholds — run as a required PR check", "RAG on Neon pgvector with task-typed Gemini embeddings". The CV line is "built as the demonstrable, inspectable evidence of how I ship production software", which is a claim about the project rather than a fact from it. See 3.6.

Not worth adding, and I checked: "many uploads every day" (no number), Belatrix "major supply-chain provider" (unnamed, adds nothing), the Kubesoft "government-supported" detail, Rokk3r "moving large parts of the monolith personally".

---

## 3. Swap

Before/after text. All are `cv-overrides` wording unless noted.

### 3.1 Comms bullet: lead with the number (both variants)

Before:
> Built and maintain the platform's communications service end to end: webhook-driven email, SMS and call intake, LLM-assisted extraction and classification kept separate from deterministic routing, and loan matching over field-level-encrypted data. 57,000+ communications in a recent seven-month window, ~70% reaching an automated triage outcome; operations retired its manual-triage shifts.

After:
> Built and maintain the communications service that triaged 57,000+ emails, SMS and calls in a recent seven-month window, ~70% to an automated outcome, letting operations retire its manual-triage shifts: webhook intake, LLM-assisted extraction and classification kept separate from deterministic routing, loan matching over field-level-encrypted data, hardened with alerts, durable retries and webhook reconciliation.

Same facts, number on line 1, reliability keywords added, one line shorter than it looks because the second sentence is gone.

### 3.2 Orq.ai bullet: lead with the outcome (both variants)

Before:
> Led the multi-month migration off a prompt-management vendor (Orq.ai) to repository-native LLM infrastructure: version-controlled prompts, provider failover, shared per-call cost tracing and automated evaluations, rolled out across four services with no significant regression; retired the platform cost and enabled cheaper model swaps under measured quality.

After:
> Retired a prompt-management vendor (Orq.ai) and its recurring cost by leading a multi-month, service-by-service migration to repository-native LLM infrastructure across four services with no significant regression: version-controlled prompts, provider failover, shared per-call cost tracing and automated evaluations that let the team swap in cheaper models under measured quality.

### 3.3 Deterministic-checks bullet: fix the overclaim while swapping (both variants)

Before:
> Replaced hallucination-prone LLM-generated loan-document checks with deterministic, tested validation in under two weeks, after decomposing the analysis pipeline into idempotent, retryable stages; processors adopted the checks and the LLM runtime cost was removed.

After:
> Replaced hallucination-prone LLM-generated loan-document checks with deterministic, tested validation (plus capped, evaluated AI observations) in under two weeks, after decomposing the monolithic analysis pipeline into three idempotent, retryable stages; processors adopted the checks and the open-ended LLM runtime cost for them was removed.

The story keeps a narrower LLM role ("capped, evaluated observations could provide up to three complementary suggestions"), so "the LLM runtime cost was removed" is not what happened. The first advisor's draft said "the LLM runtime cost for those checks was removed"; the implementation dropped the qualifier.

### 3.4 Sixth general bullet: platform tooling and frontend (new, replaces nothing; see 4.4 for the space)

> Platform tooling: authored the shared on-call investigation workflow the whole rotation adopted (a New Relic alert can now trigger an agent that gathers evidence and drafts a fix for engineer review); designed the CI-gated, agent-consumable monorepo documentation system; built the loan-application product's filter UI in React and the reusable TypeScript query library behind it, tenant-scoped for sensitive loan data.

### 3.5 Xogito bullet 4: the word "second" arrives before the first (general)

Before:
> Led a second, larger legacy-SAP data migration: evaluated ETL tooling, built custom scripts where existing tools fell short, and validated rounding compatibility early — no post-migration reconciliation was required.

After:
> Led a legacy-SAP data migration more complex than the FullStack Labs one below: evaluated ETL tooling, built custom scripts where existing tools could not represent the models, validated rounding compatibility early, and needed no post-migration reconciliation.

The CV is reverse-chronological, so "a second, larger" migration is read before the reader has met the first one. Also the source (the FullStack Labs story's reflection) says "more complex", not "larger".

### 3.6 hire-me-mcp line: facts instead of a claim about itself (both variants)

Before:
> This portfolio itself: an open-source MCP server, RAG-backed interview agent and Next.js site over one typed career dataset — built as the demonstrable, inspectable evidence of how I ship production software.

After:
> Public MCP server, RAG-backed interview agent (Neon pgvector, Gemini embeddings) and Next.js site over one typed career dataset; Vitest, Playwright e2e against real Vercel previews, and retrieval/agent evals as required CI gates.

Every clause is in the project body. "Demonstrable, inspectable evidence of how I ship production software" is marketing copy and recruiters skip marketing copy. Note this is the project's canonical `summary`, so either the projection gets a CV-only project summary override (`cv-overrides`) or the canonical summary changes (canonical fix; the web would improve too).

### 3.7 Xogito bullet 2: drop "enterprise" (general)

Before: "Recovered a frustrated enterprise client's account after the project manager resigned"
After: "Recovered a frustrated client's account after the project manager resigned: became the team's spokesperson, paired quick wins with core-workflow repairs, rebuilt trust within a few sprints and led the client product conversations for about six months; the client went on to commission additional projects."

Nothing in the story says "enterprise". Everything else in the "after" is in the story's results.

### 3.8 General summary: shorter, and the pivot (general)

Before: the current 8-line paragraph.

After (6 lines at the current type size):
> Senior full-stack engineer with 13 years shipping TypeScript/Node.js, React and AWS products, the last four as one of the first two non-founder engineers at House Numbers, helping take a mortgage-lending platform through a B2C-to-B2B pivot and from a handful of services to a 15-service event-driven monorepo. I own critical production systems end to end: a communications service that triaged 57,000+ emails, SMS and calls in a recent seven-month window (~70% automated), a hardened public document-upload boundary, and the on-call investigation workflow the whole rotation uses. For the last three years that has included putting LLM features into production with evaluation harnesses, cost tracing and deterministic safeguards. Earlier: main backend engineer on a multi-tenant SaaS, two legacy-SAP data migrations, monolith-to-Kubernetes migrations, client-facing delivery.

Changes: "one of the first two" matches Jeff's wording exactly; "Since 2023" (an inferred year) becomes "for the last three years", which matches the AI variant; "multi-tenant SaaS backend lead" becomes "main backend engineer", which is the canonical wording and what a Xogito reference would say; two lines saved for 4.4.

---

## 4. Fix

### 4.1 Claims that would not survive a reference check as written

- "the LLM runtime cost was removed" (HN bullet 4, both variants). See 3.3. The story: "I preserved a narrower role for AI".
- AI summary: "led the migration off a prompt-management vendor to repository-native LLM infrastructure across four services with no production regression." The story and the bullet on the same page say "no significant regression". The summary drops the qualifier. Say "no significant regression" in both places.
- "roughly two in three submissions had ended in a complaint or escalation" (HN bullet 2). Source: "we estimated that roughly two out of every three". Stated as a measured fact on the CV. "an estimated two in three" costs one word and is what a PM reference would say.
- "multi-tenant SaaS backend lead" (general summary). Canonical: "Main backend engineer". Use the canonical wording.
- "enterprise client" (Xogito bullet 2). Not in the source.
- "Since 2023" (general summary). The first advisor flagged this as inferred; the engineer shipped it anyway. Either Marcos confirms the year or it becomes "for the last three years".
- "15-service" (general summary) versus André Treib's public "sixteen-service platform". Unresolved from Stage 2 open question 3. A reference reading both notices. Pick the current count and align the canonical summary.
- "Led a second, larger legacy-SAP data migration" (Xogito). Source says "more complex". See 3.5.

Defensible and checked, for the record: 13 years (Feb 2013 to now), "one of the first non-founder engineers" (Jeff: "one of our first two non-founder engineering hires"), 57,000+ / ~70% (story results, correctly phrased without an accuracy claim), 96 restarts vs 0-4 (story), "under two weeks" (story: "In less than two weeks"), four services (Document Data Extractor, Loan Analysis, Communication, Task), "15+ people onboarded" (story: "at least 15"), "four-person team" at Belatrix (two developers, two QA), "acting technical lead" (story's own words), zero data loss at FullStack Labs (story), the PoC bullet's "worth pursuing" phrasing (project body, exactly).

### 4.2 Inconsistency between the variants (projection bug)

`cv-overrides.json` has `bullets.general` only for Xogito and FullStack Labs. `cv.ts` does `entryOverride?.bullets?.[variant] ?? entry.highlights.slice(0, maxHighlightsPerRole)`, so the AI variant gets the first two canonical highlights, not the general bullets. Result on the AI PDF:

- Xogito: "Owned backend architecture and delivery for the multi-tenant inspection platform end to end." and the long PM-left sentence; no stack, no mentoring, no SAP migration.
- FullStack Labs: "Built and maintained full-stack features across the procurement platform." (a filler bullet) and the weaker migration sentence without "zero data loss".

Two CVs from the same person describing the same job differently is the kind of thing a recruiter who keeps both on file will ask about. Fix in `cv.ts`: fall back `bullets[variant] ?? bullets.general ?? canonical`, the same fallback `resolveVariantText` already applies to headline and summary. `projection`.

### 4.3 Pagination

- General PDF: page 1 ends after Xogito bullet 3; page 2 opens with Xogito bullet 4 and the italic `Tech:` line. The role is split with its tail on the next page.
- AI PDF: page 2 opens with a lone "Tech: NestJS, TypeScript, PostgreSQL, Docker, GitLab CI, AWS." line. An orphan.
- Page 2 is about 93% full on both, so there is no free space to absorb a "keep together" rule without reclaiming lines. Reclaim: the general summary (3.8 saves two lines), the AI summary's first sentence (63 words; cut "and making them accountable" and the list to save one line), the third URL on the hire-me-mcp role line (drop `/api/mcp` in the general variant; it wraps to a second line in both), and "AWS, AWS ECS" in the House Numbers tech line (say "AWS (ECS)"). That is four to five lines. Then set `.tech { break-before: avoid; }` so a tech line can never start a page, and `break-inside: avoid` on the Xogito and FullStack Labs entries (short entries; the House Numbers entry can keep flowing). `render`.
- The header contact line wraps with "linkedin.com/in/garusis" alone on line 2. Either accept it or put the three links on their own line deliberately. Cosmetic.

### 4.4 Space for the sixth general bullet (3.4)

The general variant's page 1 currently ends mid-Xogito, so a fifth House Numbers line pushes more of Xogito to page 2. With the 3.8 summary cut (two lines), the 3.1 comms rewrite (one line), and the hire-me-mcp URL cut (one line), the sixth bullet is net neutral. If it still does not fit, drop the FullStack Labs bullet 1 ("Full-stack engineer (Node.js, React, PostgreSQL, AWS, Docker) on a procurement platform...") and put that context into the role's tech line; the migration bullet carries the role on its own.

### 4.5 ATS

- The four "Earlier Experience" roles are rendered as prose list items: "Belatrix Software, Senior Node.js Developer (acting technical lead), Jul–Nov 2018 — serverless architecture...". Most parsers (Workday, Greenhouse, Lever, iCIMS) will not recognize those as positions; the parsed profile will show three jobs starting Dec 2018 and compute about eight years of experience. Render them with the same structure as the full entries (bold company, em dash, role, middle dot, "Jul 2018 – Nov 2018") and one short description line. Keep the "Earlier Experience" heading if you like, but the structure is what parsers key on. `render`.
- "Jul–Nov 2018" is not a date range a parser reads. "Jul 2018 – Nov 2018". `cv-overrides`.
- Skills excluded that a platform/full-stack req will search for and that the dataset supports: "CI/CD" (excluded; GitHub Actions and GitLab CI are listed but the phrase is not), "Observability" (excluded; New Relic listed but the word is not, and structured logging/tracing appear in three stories), "Event-Driven Architecture" (excluded; the summary literally says "event-driven monorepo"), "Playwright" (excluded; Vitest kept, and Playwright is a required CI gate on the flagship project). Re-include all four. `cv-overrides` (`excludeIds`).
- "Frameworks: React, NestJS, Next.js." A frontend req recruiter scans for a "Frontend" label. Since the group is projected from `skills.json` `category`, relabel the group "Frontend & backend frameworks" or better, add "Frontend" to the Backend label's sibling: "Frontend: React, Next.js" and "Backend: Node.js, NestJS, REST APIs, Webhooks, Microservices, Event-driven services". That needs either a category split in `skills.json` (canonical) or a per-skill group override in the overlay. `cv-overrides` or `canonical fix`.
- "RAG (retrieval-augmented gen.)" is a display-name override that abbreviates the searchable term. "RAG (Retrieval-Augmented Generation)". `cv-overrides`.
- "LLM evaluation (human-graded, LLM-as-judge)" is the display name for the skill "LLMs (Large Language Models)". Harmless for search ("LLM" still matches), but the literal "Large Language Models" string is gone and the rename changes what the skill is. Either add an "LLM evaluation" skill canonically or keep the original name and add evaluation as a separate skill. Nit.
- Python is listed under Languages while `gaps.json` says "Python familiarity limited to tooling work — not enough to present as a Python specialist". Stage 2 open question 4 was not resolved in the data commit. Either soften the gap statement (cowork is a real Python codebase) or take Python off the Languages line. Leaving both is an inconsistency a Python-heavy recruiter will find in the MCP. `canonical fix`.
- Standard names are fine otherwise: section headings (Summary, Experience, Skills, Education, Projects) are what parsers expect; the PDF is text-based Chromium output, not rasterized.

### 4.6 Awkward phrasing and small errors

- "Tech: TypeScript, Node.js, React, MongoDB, AWS, AWS ECS, Redis, Kubernetes, ..." (House Numbers). "AWS, AWS ECS" reads as a typo. Also: ECS and Kubernetes on the same role line will draw the question "which one did House Numbers actually run?" The crash-loop story says ECS. If Kubernetes was not used at House Numbers, remove it from the entry's `tech` (`canonical fix`); if it was, fine.
- AI header: the MCP URL appears in the header line and again on the hire-me-mcp role line. Once is enough; keep it in the header for the AI variant and drop it from the project line.
- General summary: "the on-call investigation workflow the whole rotation uses" and HN bullet 3: "the shared on-call investigation workflow the whole rotation adopted" say the same thing twice on one page. Fine if bullet 3's clause moves to the platform bullet (3.4); otherwise cut one.
- AI summary first sentence is 63 words with a five-item colon list. Split after "making them accountable."
- "Document AI (OCR/vision-LLM)" is good. "PII / field-level encryption" reads as two unrelated items; "PII handling and field-level encryption".
- Education: "coursework toward B.S. Systems Engineering" with no years. Acceptable; a US recruiter would rather see that than "(in progress)". If Marcos can give a year range, add it.

### 4.7 What the first advisor recommended that the implementation silently skipped

Not errors, but the PR should say why: the sixth House Numbers bullet (docs system, on-call agent outcome, filter library), the comms-service hardening clause, "led the product conversations for about six months" at Xogito, the concrete hire-me-mcp line, and the skills block position. The first three are worth restoring (section 2). The skills position is fine where it is (section 5).

---

## 5. Disagreements with the first advisor

1. **"Metric-first bullets" was stated, not delivered.** The first review's section 5.3 promised "Bullets, metric or outcome first" and then drafted bullets whose numbers land in the third or fourth line ("Built and maintain the platform's communications service end to end: ... 57,000+ communications in a recent seven-month window"). The implementation copied those drafts verbatim. In a 30-second scan the recruiter reads the first line of each bullet; the 57,000 and the Orq.ai cost outcome are invisible at that speed. Section 3 above rewrites the two worst offenders. This is the single largest gap between the first advisor's intent and the result.

2. **Skills block on page 1.** The first advisor wanted "Core skills" above the experience ("Today it is on page 19"). The implementer left it at the end of page 2. I side with the implementer: for a 13-year senior IC, a US recruiter wants the current role on page 1, the headline already carries the four core keywords, and ATS does not care where the block sits. Fixing keyword coverage (4.5) matters; moving the block does not.

3. **Dropping the filter-library bullet entirely.** The first advisor said "Cut to one line or fold into a product-engineering bullet"; the implementer cut it to zero. Zero is wrong for a full-stack target. The general variant now has no sentence describing frontend work at any job since 2018. Keep one clause (3.4).

4. **The PoC as the AI variant's sixth bullet.** The first advisor allowed it "phrased around the measurement work". I would not spend the last bullet of the current role on something that did not ship when the dataset has a shipped agentic outcome (alert-to-PR workflow) and, once confirmed, André's eval-CI specifics. A proof of concept belongs in an interview, where the "we found and fixed our own measurement bugs" story is excellent. On paper it ends with "productionization was left to the team", which is the sentence the first advisor himself called "the single most damaging line" when it was bullet 1. Moving it to bullet 6 reduces the damage; it does not make it an asset.

5. **"Since 2023".** The first advisor wrote it, flagged it as inferred in his own defensibility note, and left it in the draft. A flagged inference should not go in the draft that the implementer will paste. "For the last three years" is exact enough and matches the AI variant.

6. **Version A summary length.** The first advisor's own budget table said "Summary: 4-5 lines". Version A renders at eight. He should have cut his own draft to his own budget; 3.8 does.

7. **The Xogito SAP migration wording.** He recommended lifting it from the reflection with "Led a second, larger SAP data migration"; the reflection says "more complex", and "second" reads wrong in reverse-chronological order. Minor, but it is now on the canonical highlight too (`highlights[3]` says "second, larger"), so the canonical fix should say "more complex".

8. **Where I agree and want it on record:** no stories on paper; no "$0.30 vs $25"; no "70% accuracy"; "acting technical lead" not "Tech Lead"; "Rokk3r (via Kubesoft SAS)"; drop the Scrum certificate; drop AngularJS/PHP/Socket.IO from skills; two pages Letter; general variant as the default PDF. All of those were right and are correctly implemented.

---

## 6. Scores

| Criterion | General | AI |
|---|---|---|
| First-impression clarity | 7 | 6 |
| Evidence of scale and outcomes | 7 | 7 |
| Claim defensibility | 8 | 7 |
| ATS keyword coverage | 6 | 6 |
| Progression visibility | 7 | 6 |
| Length and layout | 6 | 5 |
| **Overall** | **7.0** | **6.2** |

**General, 7/10.** The document now does what a CV has to do: headline, years, stack, one founding-era claim, one big production number, five bullets with real incidents and real outcomes, a clean progression from 2013, two pages. It loses points for putting outcomes at the end of bullets where a scanner never reaches them, for having no frontend evidence in the current role on a full-stack CV, for four missing searchable keywords that the dataset supports, for a split role at the page break, and for a handful of wording choices that are a notch stronger than the source ("LLM runtime cost was removed", "enterprise", "backend lead", an estimate stated as fact). All of that is a day of overlay edits and one CSS rule.

**AI, 6.2/10.** Same House Numbers block, correctly reordered, plus a good header hook. It is pulled down by a projection gap that gives it weaker Xogito and FullStack Labs bullets than the general variant, a stranded tech line at the top of page 2, a 63-word opening sentence, an internal contradiction ("no production regression" in the summary vs "no significant regression" in the bullet), and a sixth bullet about work that did not ship while the dataset holds a shipped agentic outcome. Fix the fallback and the orphan and it is a 7 as well.

**Expected outcome, plain terms.** Would a senior recruiter at a US product company forward the general variant to a hiring manager for a senior full-stack req? Yes. The header removes the remote/time-zone objection, the summary establishes 13 years and early-stage ownership in one line, and the first three bullets establish that he runs production systems with numbers attached. The hiring manager's likely follow-up is "how much frontend does he actually do?", which the current document cannot answer and section 3.4 fixes. For an AI-adjacent full-stack req the AI variant also gets forwarded; for a pure ML/AI-research req neither does, and neither should try to. The candidate's two-track target (stakeholder-facing $150k+ and engineering-focused $90k+) is served by the same document; the Xogito six-months clause (2.5) is what tips the stakeholder-facing screen.

---

## 7. Prioritized fix list

1. **Lead the comms and Orq.ai bullets with the outcome** (3.1, 3.2), and put the estimate word back on the upload bullet. `cv-overrides`
2. **AI variant falls back to canonical highlights for Xogito and FullStack Labs**: make `bullets[variant]` fall back to `bullets.general` before canonical, the way headline/summary already do. `projection`
3. **Add the sixth general bullet with frontend and platform-tooling evidence** (3.4): filter UI in React and the query library, CI-gated docs system, on-call workflow with the alert-to-PR outcome. `cv-overrides`
4. **Fix the two overclaims**: "the LLM runtime cost was removed" (3.3) and AI summary "no production regression" (say "no significant regression"). `cv-overrides`
5. **Pagination**: `.tech { break-before: avoid }`, `break-inside: avoid` on the short entries, and reclaim the lines to pay for it (summary cut per 3.8, AI first sentence split, drop the `/api/mcp` URL from the project line, "AWS (ECS)"). `render` plus `cv-overrides`
6. **Restore four excluded searchable skills**: CI/CD, Observability, Event-Driven Architecture, Playwright. `cv-overrides`
7. **Render "Earlier Experience" roles as structured entries with full date ranges** ("Jul 2018 – Nov 2018") so ATS parsers count seven positions and 13 years, not three and eight. `render` plus `cv-overrides`
8. **Shorten the general summary to six lines, "for the last three years" instead of "Since 2023", "main backend engineer" instead of "backend lead", "one of the first two", add the B2C-to-B2B pivot** (3.8). `cv-overrides`
9. **Xogito**: drop "enterprise", add "led the client product conversations for about six months", reword the SAP migration line ("more complex", not "second, larger"); also fix the canonical highlight's "second, larger" to "more complex" since the source says so. `cv-overrides` and `canonical fix`
10. **Replace the AI variant's PoC bullet** with the on-call agentic outcome now, and with André's eval-CI specifics once Marcos confirms them. `cv-overrides` (gated part: `canonical fix`)
11. **Project the 2022 pricing engine / 2023 conversational service as general bullet 2 once confirmed.** Until then, correctly absent. `cv-overrides`, gated on confirmation
12. **Resolve 15 vs 16 services** against André's public recommendation and align the canonical summary. `canonical fix`
13. **Resolve Python**: soften the Django gap statement or drop Python from Languages. `canonical fix`
14. **hire-me-mcp line**: facts from the project body instead of "demonstrable, inspectable evidence of how I ship production software" (3.6). `cv-overrides` (project summary override) or `canonical fix`
15. **Skills labels**: give React/Next.js a "Frontend" label a frontend recruiter can find; "RAG (Retrieval-Augmented Generation)" unabbreviated; "PII handling and field-level encryption". `cv-overrides`
16. **Confirm Kubernetes at House Numbers** alongside ECS; remove from the entry's `tech` if it was not used there. `canonical fix`
17. **Cosmetic**: contact-line wrap, duplicated on-call clause between summary and bullet 3, the AI header/project URL duplication. `render` / `cv-overrides`

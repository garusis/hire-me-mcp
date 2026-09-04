# Stage 3, round 2: independent grading of the fixed CVs (#309)

Graded, nothing edited: `apps/web/public/cv/marcos-javier-alvarez-cv.pdf` (general, 2 pages Letter), `apps/web/public/cv/marcos-javier-alvarez-cv-ai.pdf` (AI, 2 pages Letter), their HTML in `docs/cv-review/`, the Stage 1 full dump, both prior reviews, `packages/career-data/content/cv-overrides.json`, the canonical experience/stories/skills/projects/recommendations/gaps, the projection in `apps/web/src/lib/content/cv.ts`, the renderer in `apps/web/lib/cv/render-cv-html.ts`, and `git show 92b1a35` for the previous draft.

Short version: this is a shippable senior full-stack CV. Sixteen of the seventeen fixes landed (the seventeenth, 15 vs 16 services, is Marcos's call), the projection bug is gone, both PDFs break cleanly at the FullStack Labs entry, and every bullet now opens with its outcome. What is left is one needless cut (FullStack Labs went from two bullets to one while page 2 sits a quarter empty), the frontend evidence buried in the last clause of the last House Numbers bullet under a "Platform tooling:" label that misdescribes it, an eight-line summary that ends on a one-word widow, and a handful of one-word wording risks. A morning of overlay edits; no code.

---

## 1. The 30-second read

### General variant

Seconds 0-5, header. "Senior Full-Stack Engineer · TypeScript, Node.js, React, AWS · Production LLM systems" then "Cúcuta, Colombia (Remote) · UTC-5, full US-hours overlap · garusis@gmail.com · github.com/garusis · linkedin.com/in/garusis" on one line (the wrap from the previous draft is gone). Remote, time zone, stack, seniority: the four filters, answered before the recruiter has scrolled. No phone number; most ATS profiles have a required phone field and the import will leave it blank.

Seconds 5-15, summary. Eight lines at 9.6pt, the last line being the single word "delivery." The recruiter reads line one and a half: "13 years shipping TypeScript/Node.js, React and AWS products, the last four as one of the first two non-founder engineers at House Numbers, helping take a mortgage-lending platform through a B2C-to-B2B pivot and from a handful of services to a 15-service event-driven monorepo." That is the right sentence and it is better than the previous draft's ("one of the first two", the pivot). Eye lands on "57,000+" in line 4. Then they skip. Lines 6-8 ("For the last three years... Earlier: main backend engineer...") are unread at this stage. The one-word last line is the first thing that looks unfinished on the page.

Seconds 15-30, House Numbers, six bullets. First lines as the eye reads them:

- "Built and maintain the communications service that triaged 57,000+ emails, SMS and calls in a recent seven-month window," (number on line 1 now; previous draft had it on line 3)
- "Eliminated failed-upload complaints on a public document-upload flow where an estimated two in three submissions had"
- "Owned incident response on the document-processing path: contained a crash loop (96 restarts in 24 hours against a 0-4"
- "Replaced hallucination-prone LLM-generated loan-document checks with deterministic, tested validation (plus capped,"
- "Retired a prompt-management vendor (Orq.ai) and its recurring cost by leading a multi-month, service-by-service migration" (outcome on line 1; previous draft had it on line 4)
- "Platform tooling: authored the shared on-call investigation workflow the whole rotation adopted (a New Relic alert can now"

Five of six first lines carry a number or an outcome. That is the single largest improvement over the previous draft and it is exactly what the second advisor asked for. Conclusion at second 30: "13 years, founding-era at a startup that pivoted, owns production systems with numbers, has LLM work but is not an AI-only profile, remote-ready. Forward."

What the recruiter still does not see in 30 seconds: the word React in a sentence about work. It is there now ("built the loan-application product's filter UI in React and the reusable TypeScript query library behind it"), but it is the third clause of the sixth bullet, on line 3 of 4, under a label that says "Platform tooling". A scanner reads "Platform tooling: authored the shared on-call investigation workflow" and moves on. The frontend evidence the second advisor fought for was added and then hidden.

Where they stop: bottom of page 1, which now ends cleanly on "Tech: NestJS, TypeScript, PostgreSQL, Docker, GitLab CI, AWS." Page 2 opens with a fresh entry (FullStack Labs). Nothing looks careless at the break. Page 2 itself is about 72% full: FullStack Labs (one bullet), four structured earlier roles, two projects, seven skill lines, one education line, then roughly a quarter page of white space.

### AI variant

Header: "Senior Full-Stack Engineer · LLM and agentic systems in production · TypeScript, Node.js, React, AWS", plus a two-line portfolio callout ending in the bare `https://hire-me-mcp-web.vercel.app/api/mcp`. Right hook for an AI-tooling company. Summary first sentence is 42 words now (was 63) and reads in one breath: "spent the last three years putting LLM and agentic features into production on a mortgage-lending platform: evaluation harnesses with human-graded ground truth and LLM-as-judge scoring, per-call cost tracing, version-controlled prompts and provider failover." Then the comms number and the Orq.ai migration, "no significant regression" (the contradiction with the bullet is gone). Seven lines, no widow.

House Numbers bullets: comms, Orq.ai, deterministic checks, upload, incident, and a sixth that is now a shipped outcome: "Authored the shared on-call investigation workflow the whole rotation adopted, and proposed the alert-to-PR automation built on top of it: today a human report or a New Relic alert can trigger an agent that reviews the available evidence and develops likely causes, and prepares a pull request..." The PoC-that-did-not-ship bullet is gone. Good. One thing the reader notices: the summary's two facts (57,000+ / Orq.ai migration) are bullets 1 and 2 immediately below, nearly verbatim. Three exposures of the same two facts in twenty lines reads like the document has fewer facts than it does.

Page 2 is identical to the general variant's page 2, which is the point: Xogito and FullStack Labs are described the same way on both CVs now. Where they stop: same as general, bottom of page 1, after a full Xogito entry.

---

## 2. Verification of the 17 fixes (second review, section 7)

| # | Fix | Status | Evidence |
|---|---|---|---|
| 1 | Lead comms and Orq.ai bullets with the outcome; "an estimated two in three" | **done** | `cv-overrides.json` HN bullets 1, 2, 5 match the 3.1/3.2 drafts; "an estimated two in three submissions" on both PDFs. |
| 2 | AI variant falls back to `bullets.general` before canonical | **done** | `resolveVariantBullets()` in `cv.ts`: `value[variant] ?? value.general ?? value.ai ?? fallback`. AI PDF page 1 now shows the four general Xogito bullets and page 2 the FullStack Labs zero-data-loss bullet. `cv.test.ts` gained 127 lines covering it. |
| 3 | Sixth general bullet: filter UI in React, CI-gated docs, on-call outcome | **done, but weakened by placement** | Bullet 6 is the 3.4 draft verbatim. The React clause is last; the label "Platform tooling:" is wrong for a product filter UI. See 4.1. |
| 4 | Overclaims: "LLM runtime cost was removed"; AI summary "no production regression" | **done** | "the open-ended LLM runtime cost for them was removed"; AI summary "no significant regression". |
| 5 | Pagination: `.tech { break-before: avoid }`, keep-together on short entries, reclaim lines | **done** | CSS lines 381, 385 of `render-cv-html.ts`; `keepTogether: true` on Xogito and FullStack Labs in the overlay; `techExcludeIds: ["aws"]` gives "AWS ECS" alone; `/api/mcp` dropped from the project line via `excludeLinkLabels`. Both PDFs: page 1 ends on the Xogito tech line, page 2 opens with FullStack Labs. No orphan. The price was 9.6pt / 0.45in (see 5.3) and the FullStack Labs context bullet (see 4.2), the latter unnecessary. |
| 6 | Restore CI/CD, Observability, Event-Driven Architecture, Playwright | **done** | All four on the Skills block of both PDFs; `excludeIds` now lists only angularjs, socketio, php, mobile-hybrid, requirements-gathering, gemini, dynamodb. |
| 7 | Structured "Earlier Experience" entries with full date ranges | **done** | `renderEarlierExperienceEntry()` emits the same `.entry`/`.role`/`<ul><li>` shape; "Belatrix Software — Senior NodeJS Software Developer · Jul 2018 – Nov 2018". Side effect: the Kubesoft/Rokk3r overlap (Jan 2015 – Jun 2018 vs Feb 2016 – Jun 2018) is now two structured concurrent jobs; the previous draft's "(assigned to Rokk3r from Feb 2016)" on Kubesoft was dropped. See 5.1. |
| 8 | General summary: six lines, "for the last three years", "main backend engineer", "one of the first two", pivot | **partial** | Wording applied verbatim from 3.8 (122 words). It renders at eight lines, not six, and the eighth line is the lone word "delivery." The second advisor's line estimate was wrong; the engineer pasted without checking the render. |
| 9 | Xogito: drop "enterprise", add six months, "more complex" (CV and canonical) | **done** | Both PDFs; canonical `highlights[3]` now "Led a more complex legacy-SAP data migration". The CV wording "more complex than the FullStack Labs one below" is a cross-reference to another job; see 4.3. |
| 10 | Replace AI PoC bullet with the on-call agentic outcome | **done** | AI bullet 6 as quoted above; "proposed the alert-to-PR automation" keeps the authorship honest (story: "Another engineer implemented that automation"). The general variant's parenthetical is less careful; see 5.1. |
| 11 | Pricing engine / conversational service as general bullet 2 once confirmed | **correctly not done** | Gated. Canonical highlight 6 exists; the overlay does not project it. |
| 12 | Resolve 15 vs 16 services | **not done** | Canonical HN summary and the general summary still say "15-service"; André Treib's public text says "sixteen-service platform". Needs Marcos. |
| 13 | Resolve Python vs the Django gap statement | **done** | `gaps.json` django statement now: "Python itself is real production experience (the open-source cowork CLI is a Python codebase)". Python stays under Languages, consistently. |
| 14 | hire-me-mcp line: facts, not a claim about itself | **done** | Overlay `projects[0].summary`; every clause traces to the project body (Neon pgvector, Gemini embeddings, Vitest, Playwright against Vercel previews, retrieval/agent evals as CI gates). Canonical summary unchanged, which is fine. |
| 15 | Skills labels: Frontend, unabbreviated RAG, PII handling | **done** | `categoryOverrides` puts react/nextjs under a "Frontend" label, nestjs under "Backend"; "RAG (Retrieval-Augmented Generation)"; "PII handling and field-level encryption". The `llms` display-name nit ("LLM evaluation (human-graded, LLM-as-judge)" replacing "LLMs (Large Language Models)") is unchanged. |
| 16 | Confirm Kubernetes at House Numbers | **done** | Removed from the HN entry's `tech` and from the kubernetes skill's evidence in `skills.json`. Stays in Skills via Rokk3r, correctly. |
| 17 | Cosmetic: contact wrap, duplicated on-call clause, AI URL duplication | **partial** | Contact line fits on one line; the project line no longer repeats `/api/mcp`. The on-call clause is still in both the general summary ("the on-call investigation workflow the whole rotation uses") and bullet 6 ("authored the shared on-call investigation workflow the whole rotation adopted"). |

Nothing regressed relative to the previous draft except the two side effects noted (FullStack Labs context line, Kubesoft overlap note), both of which were cuts the advisor permitted only "if it still does not fit". It fits.

---

## 3. Include from the full dump

Ordered by effect on the interview rate. Only items the CV still lacks.

1. **FullStack Labs context (canonical summary and the dropped bullet).** Source, canonical: "Full-stack development of a platform supporting a fiduciary purchasing agent for FF&E/OS&E procurement, for a US client." The previous draft carried "Full-stack engineer (Node.js, React, PostgreSQL, AWS, Docker) on a procurement platform for a US fiduciary purchasing agent (FF&E/OS&E)." It is gone, so two years (Dec 2018 – Dec 2020) are now described by one data-migration bullet and the reader never learns what the product was or that he shipped React on it. Page 2 has room for eight of these. Placement: FullStack Labs bullet 1, before the migration bullet. This is the second of only two places in the dataset where frontend work at a job is stated in a sentence; dropping it while the advisor's whole point was "no frontend evidence" is the wrong cut.

2. **First engineer on the Xogito project (story "Rebuilding client trust", situation).** Source: "the first developer assigned to a large inspection and delivery-tracking platform" and "Because I had the longest history with the product". Placement: Xogito bullet 1, four words: "First engineer assigned to, then main backend engineer of, a multi-tenant SaaS...". It is the progression signal (#298 point 4) that "Main backend engineer" alone does not carry.

3. **The Kubesoft-Rokk3r relationship (Kubesoft canonical summary).** Source: "Kubesoft later assigned him to work directly with Rokk3r, recorded as the separate Rokk3r entry — one continuous employment rather than two parallel jobs." Now that both are structured entries with overlapping dates, the CV needs the one clause it had in the previous draft. Placement: Kubesoft compact line, "(from Feb 2016 assigned full-time to Rokk3r, above)".

4. **"Security" as a word (story "Redesigning a public document-upload flow", task).** Source: "designed and implemented the replacement, including its security architecture." The upload bullet lists CAPTCHA, rate limiting, replay protection and an encrypted audit trail but never uses the word "security", which is a keyword every full-stack and platform req contains. Neither PDF contains "security" or "secure" anywhere. Placement: HN bullet 2, "designed and built the replacement security boundary (opaque sessions, ...)". One word.

5. **Optional, AI variant only: the communications context feeds agents (Jeff Levinsohn, public, CEO-attributed).** Source: "make that context available to AI agents that could then take action." The AI variant's comms bullet ends on reliability keywords; for an agent-tooling audience, "and exposes the resulting loan context to the platform's AI agents" is the clause that ties the service to the headline. Not gated (it is the CEO describing the system, not a new claim about him), but it is not in the story either, so Marcos should nod at it first. Low priority.

6. **Optional, AI variant only: the PM-uses-Claude-Code outcome (story "Replacing a prompt-management vendor", results).** Source: "enabled our nontechnical product manager to use Claude Code to investigate reported prompt failures and create more precise engineering tickets". A concrete "made AI infrastructure usable beyond engineering" outcome. Would fit as the last clause of AI bullet 2 if a line is free; it is not on page 1, so skip unless something else is cut.

Gated upside, for the record and not penalized: André Treib's 2022 pricing/eligibility engine and 2023 conversational service (already canonical highlight 6, not projected) would be the best general bullet 2 in the document, because it is pre-LLM core domain logic; the "*.agents.ts convention" eval-CI lane and the "replaced 24 hand-written MCP tool files with a declarative factory" line would each beat the AI variant's current bullet 5. The "$0.30 per loan against their $25" figure stays off, correctly.

Checked and not worth adding: "many uploads every day" (no number), the client's invitation to join their internal team (reads as a boast), "moving large parts of the monolith personally", Rokk3r's insurance-broker and IoT platforms, the Belatrix incident, Mutual's launch timing.

---

## 4. Swap

All `cv-overrides` wording.

### 4.1 House Numbers bullet 6: lead with the product work, drop the label, attribute the automation

Before:
> Platform tooling: authored the shared on-call investigation workflow the whole rotation adopted (a New Relic alert can now trigger an agent that gathers evidence and drafts a fix for engineer review); designed the CI-gated, agent-consumable monorepo documentation system; built the loan-application product's filter UI in React and the reusable TypeScript query library behind it, tenant-scoped for sensitive loan data.

After:
> Built the loan-application product's filter UI in React and the reusable TypeScript query library behind it, tenant-scoped for sensitive loan data; authored the shared on-call investigation workflow the whole rotation adopted, which a teammate then wired to New Relic alerts so an agent gathers evidence and drafts a fix for engineer review; designed the CI-gated, agent-consumable monorepo documentation system.

Three reasons. React moves to line 1 of the bullet, where a scanner sees it. "Platform tooling:" was describing a product feature. And "authored the ... workflow ... (a New Relic alert can now trigger an agent ...)" lets a reader attribute the automation to him; the story says "I proposed the next step ... Another engineer implemented that automation." The AI variant already says "proposed"; the general variant should be equally careful. Same length.

### 4.2 FullStack Labs: restore the context bullet

Before (one bullet):
> Owned the migration of historical quote data out of a legacy SAP system with zero data loss: ...

After (two bullets):
> Full-stack engineer (Node.js, React, PostgreSQL) on a procurement platform rebuilt for a US fiduciary purchasing agent (FF&E/OS&E).
> Owned the migration of historical quote data out of a legacy SAP system with zero data loss: ...

Two lines on a page that is a quarter empty. "Rebuilt" comes from the story ("a project rebuilding a procurement platform").

### 4.3 Xogito bullet 4: stop cross-referencing another job

Before:
> Led a legacy-SAP data migration more complex than the FullStack Labs one below: evaluated ETL tooling, built custom scripts where existing tools could not represent the models, validated rounding compatibility early, and needed no post-migration reconciliation.

After:
> Led the platform's legacy-SAP data migration: evaluated ETL tooling, built custom scripts where existing tools could not represent the source and target models, validated rounding compatibility early with platform users, and needed no post-migration reconciliation.

"More complex than the FullStack Labs one below" makes the reader look down the page to calibrate a claim; the summary already says "two legacy-SAP data migrations", which is all the counting a CV needs. "With platform users" is from the canonical highlight ("iterated with platform users ahead of the bulk migration") and is a stakeholder-facing signal for free.

### 4.4 General summary: seven lines, no widow, no verbatim repeat of bullet 1

Before: the current 122-word paragraph ending "... client-facing delivery." with "delivery." alone on line 8.

After (about 105 words):
> Senior full-stack engineer with 13 years shipping TypeScript/Node.js, React and AWS products, the last four as one of the first two non-founder engineers at House Numbers, helping take a mortgage-lending platform through a B2C-to-B2B pivot and from a handful of services to a 15-service event-driven monorepo. I own critical production systems end to end, including a communications service handling 57,000+ emails, SMS and calls in a recent seven-month window (~70% automated) and a hardened public document-upload boundary, and for the last three years have put LLM features into production with evaluation harnesses, cost tracing and deterministic safeguards. Earlier: main backend engineer on a multi-tenant SaaS, two legacy-SAP data migrations, a monolith-to-Kubernetes migration, client-facing delivery.

Changes: the on-call clause leaves the summary (it lives in bullet 6, which resolves fix 17's duplicate); "triaged" becomes "handling" so the summary previews bullet 1 instead of quoting it; "monolith-to-Kubernetes migrations" becomes singular (see 5.1). Renders at seven full lines at the current type size.

### 4.5 Xogito bullet 1: the progression signal

Before: "Main backend engineer (NestJS, TypeScript, PostgreSQL, AWS, GitLab CI) on a multi-tenant SaaS for real-time quality-control inspections; owned backend architecture and delivery end to end."

After: "First engineer assigned to, then main backend engineer of, a multi-tenant SaaS for real-time quality-control inspections (NestJS, TypeScript, PostgreSQL, AWS, GitLab CI); owned backend architecture and delivery end to end."

### 4.6 Kubesoft compact line

Before: "Web/hybrid-mobile products for Colombian and international clients; built the first backend of Mutual, a hackathon-winning parenting app."

After: "Web/hybrid-mobile products for Colombian and international clients; built the first backend of Mutual, a hackathon-winning parenting app. From Feb 2016 assigned full-time to Rokk3r (above)."

---

## 5. Fix

### 5.1 Claims and wording that a reference check or a careful reader would catch

- **"monolith-to-Kubernetes migrations"** (general summary, plural). Source, Rokk3r highlight 1: "Migrated a real-time telecom procurement monolith ... to an AWS Kubernetes microservices cluster ... as part of a company-wide push to adopt microservices across several client monoliths." One migration is his; the others are the company's. Singular.
- **Bullet 6's on-call parenthetical** attributes the alert-to-PR automation by proximity. Story: "Another engineer implemented that automation." Fix per 4.1.
- **"15-service"** (general summary and canonical HN summary) vs André Treib's public "sixteen-service platform". Still open from Stage 2. A reference reading both LinkedIn and the CV notices. Marcos picks the number; the canonical summary and the overlay change together.
- **Kubesoft Jan 2015 – Jun 2018 and Rokk3r Feb 2016 – Jun 2018 as two structured entries.** With fix 7 applied, an ATS and a recruiter both see 28 months of concurrent full-time employment. "Via Kubesoft SAS:" at the start of the Rokk3r bullet explains it only to someone who reads the bullet. Fix per 4.6.
- **"more complex than the FullStack Labs one below"** is defensible (the FullStack Labs story's reflection says exactly that) but it is the candidate grading his own jobs against each other on the page. Fix per 4.3.
- **"Platform tooling:"** as the label for a bullet whose strongest clause is a product filter UI. Fix per 4.1.

Checked and defensible as written: "13 years" (Feb 2013 to Sep 2026), "one of the first two non-founder engineers" (Jeff: "one of our first two non-founder engineering hires"), "B2C-to-B2B pivot" (Jeff and the paternity-leave story), "57,000+ ... ~70%" (story results, no accuracy claim attached), "letting operations retire its manual-triage shifts" (story: "operations no longer needs the old manual-triage shifts"), "hardened with alerts, durable retries and webhook reconciliation" (story actions, verbatim facts), "an estimated two in three" (story: "we estimated that roughly two out of every three"), "96 restarts in 24 hours against a 0-4 baseline", "no permanent data loss", "under two weeks" ("In less than two weeks"), "plus capped, evaluated AI observations" ("capped, evaluated observations could provide up to three complementary suggestions"), "three idempotent, retryable stages" (decomposition story: three units, persisted progress, writes tolerate repeated delivery), "the open-ended LLM runtime cost for them was removed" (story: "removed the open-ended LLM overview", "removed unnecessary LLM runtime cost"), "Retired a prompt-management vendor (Orq.ai) and its recurring cost" ("eliminated a recurring platform cost"), "leading a multi-month, service-by-service migration ... across four services" (he initiated, designed the pattern, implemented two; others applied it to two: "leading" holds), "no significant regression" (story: "no significant interruption or regression"), "let the team swap in cheaper models under measured quality", "designed the CI-gated, agent-consumable monorepo documentation system" (canonical highlight 5), "filter UI in React and the reusable TypeScript query library ... tenant-scoped" (canonical highlight 4; React is the role's frontend), "led the client product conversations for about six months", "15+ people onboarded across the two companies", "rotating buddy program", "zero data loss" (story: "without data loss or corruption"), "Acting technical lead ... four-person team" (two developers, two QA), "Via Kubesoft SAS", "Full Stack Engineer" vs "Full-Stack Engineer" (canonical title vs headline; both forms match ATS searches), Education "coursework toward" (canonical "in progress"; the CV wording is the more conservative of the two). AI variant bullet 6 "proposed the alert-to-PR automation built on top of it" is the honest version.

### 5.2 Inconsistencies between variants and against canonical data

- The variants now agree on Xogito, FullStack Labs, earlier roles, projects, skills and the HN tech line. The only differences are the headline, the summary, the HN bullet order and HN bullet 6, all deliberate. Fix 2 worked.
- General summary says "13 years"; AI summary says "Thirteen years". Harmless.
- The canonical HN entry's first highlight is still the PoC ("productionization was left as a later team decision"), so the MCP and the web lead the current role with the weakest sentence in the dataset while the CV leads with the strongest. Out of scope for #309 (canonical order is not CV phrasing), but it is the first thing the interview agent will say about the job; worth its own issue.
- Skills display name for `llms`: "LLM evaluation (human-graded, LLM-as-judge)". The MCP says he has the skill "LLMs (Large Language Models)"; the CV says he has a skill called "LLM evaluation". Still the nit the second advisor flagged. Restore the canonical name and, if evaluation deserves a line, add it as its own skill canonically.

### 5.3 Layout, pagination, type size

- **Pagination is clean on both PDFs.** Page 1 ends on the Xogito tech line; page 2 opens on the FullStack Labs role line. No split role, no orphaned tech line, no heading at a page bottom.
- **The general summary's last line is the single word "delivery."** Visible in the PDF render; it is the only widow on either document and it sits in the most-read paragraph. Fix per 4.4.
- **9.6pt Arial, 1.28 line height, 0.45in margins: acceptable, at the floor.** At 110 dpi the page reads comfortably; on a printed Letter sheet 9.6pt Arial is what dense two-page senior CVs commonly use (9.5-10pt), and 0.45in is inside every office printer's safe zone. I would not go smaller, and I would not spend effort going back to 10pt/0.5in: doing so pushes Xogito (keep-together) onto page 2 and leaves a third of page 1 blank under House Numbers, which looks worse than the current density. Keep it; do not shrink again. The cost of this size is that page 2 is 28% white space, which is the reason 4.2 is free.
- **AI header is two lines** because of the bare `https://hire-me-mcp-web.vercel.app/api/mcp`. Fine for the audience; a recruiter at an AI-tooling company will paste it. Leave it.
- **Skills, Cloud line:** "AWS, Docker, Kubernetes, Serverless (Lambda/CloudFormation), GitLab CI, GitHub Actions, Vercel, New Relic, AWS ECS." ECS trails after New Relic because it was appended from `techExcludeIds` handling. Reads as an afterthought; order it after AWS. Cosmetic.

### 5.4 ATS

- Structured earlier entries with full "Mon YYYY – Mon YYYY" ranges: fixed. A parser now sees seven positions from Feb 2013.
- Text-based PDF, embedded Arial subsets, no ligature glyphs (checked: zero "ﬁ/ﬂ/ﬀ" in extracted text), standard headings (Summary, Experience, Earlier Experience, Selected Projects, Skills, Education). Parses.
- The Kubesoft/Rokk3r overlap will show as concurrent employment in the parsed profile. See 4.6.
- Keyword gaps the dataset supports and the CV still lacks: "security" (zero occurrences on either PDF; see 3.4), "testing"/"tests" (Vitest and Playwright are listed, the words "tested"/"tests" appear only in HN bullet 4; "focused unit and integration tests" from the decomposition story could ride along in that bullet at no cost). "GraphQL", "Terraform", "Go", "Java" are genuine gaps and correctly absent.
- No phone number anywhere. Not a data error (the canonical profile has no phone), but Workday/Greenhouse imports will flag the field; Marcos decides whether it goes on paper.

---

## 6. Scores

Same rubric as the second review. Previous draft in parentheses.

| Criterion | General (prev) | Δ | AI (prev) | Δ |
|---|---|---|---|---|
| First-impression clarity | 8 (7) | +1 | 7 (6) | +1 |
| Evidence of scale and outcomes | 7.5 (7) | +0.5 | 8 (7) | +1 |
| Claim defensibility | 8.5 (8) | +0.5 | 8.5 (7) | +1.5 |
| ATS keyword coverage | 8 (6) | +2 | 8 (6) | +2 |
| Progression visibility | 7.5 (7) | +0.5 | 7.5 (6) | +1.5 |
| Length and layout | 7.5 (6) | +1.5 | 7.5 (5) | +2.5 |
| **Overall** | **7.8 (7.0)** | **+0.8** | **7.7 (6.2)** | **+1.5** |

**General.**
- First impression 8: header answers remote/time zone/stack in one line and five of six bullet first-lines carry a number; held back by the eight-line summary ending on a one-word widow and the frontend evidence hidden under "Platform tooling:".
- Evidence 7.5: 57,000+/70%, an estimated two in three, 96 restarts, under two weeks, four services, six months, 15+ onboarded, zero data loss, four-person team. Still nothing on users, throughput, uptime or team size outside the AI work (#298 point 2), and the dataset has none to give; that ceiling is a data problem, not a CV problem.
- Defensibility 8.5: the four overclaims from the previous round are gone; what remains is one plural ("migrations"), one attribution by proximity (the alert automation), and the unresolved 15/16.
- ATS 8: seven structured positions, full date ranges, the four restored keywords, a "Frontend" label. Missing the word "security" and a phone field.
- Progression 7.5: 2013 game backend, 2015 mobile/web, 2016 DevOps and Kubernetes, 2018 acting tech lead, 2018-2020 senior engineer, 2020 main backend engineer, 2022 founding-era engineer: the arc is visible now that the early roles are structured. Held back by FullStack Labs shrinking to one migration bullet and the Kubesoft/Rokk3r overlap looking like two jobs.
- Layout 7.5: two pages, clean break, no orphans, acceptable density; the widow and a quarter-empty page 2 next to a cut that was made "for space".

**AI.**
- First impression 7: the header hook and the 42-word opening sentence work; the summary previews bullets 1 and 2 almost verbatim, so the top of the page repeats itself.
- Evidence 8: the general set plus a shipped agentic outcome (alert-to-PR) instead of a proof of concept.
- Defensibility 8.5: "no significant regression" in both places, "proposed" on the automation, no PoC sentence, no "$0.30 vs $25".
- ATS 8, progression 7.5, layout 7.5: same body as the general variant, same strengths and same two page-2 weaknesses; the stranded tech line is gone.

**Plain terms.** Would a senior recruiter at a US product company forward the general variant to a hiring manager for a senior full-stack req? Yes, without hesitation this time: the header clears remote and time zone, the first summary line establishes 13 years and founding-era ownership through a pivot, and the first three bullets are production systems with numbers on their first lines. For the stakeholder-facing $150k track, the Xogito six-months clause and "client-facing delivery" carry it; for the engineering-focused track, the incident and migration bullets do. The AI variant gets forwarded for an AI-adjacent full-stack or "AI platform engineer" req; neither should be sent to an ML-research req.

The hiring manager's first follow-up question: "House Numbers was three engineers at the pivot; how big is the team now, and how much of this was yours versus the other engineers?" The CV names him as one of the first two non-founder hires and then never states a team size, so the HM cannot tell whether six bullets of ownership means "the whole backend" or "my third of it". The second question is still "how much frontend?", because the only React sentence on the current role is the last clause of the last bullet.

---

## 7. Remaining fix list

Only what moves the score. Highest impact first.

1. **Reorder HN bullet 6** to lead with the React filter UI, drop "Platform tooling:", and attribute the alert automation to a teammate ("which a teammate then wired to New Relic alerts so an agent ..."). Per 4.1. `cv-overrides`
2. **Restore the FullStack Labs context bullet** ("Full-stack engineer (Node.js, React, PostgreSQL) on a procurement platform rebuilt for a US fiduciary purchasing agent (FF&E/OS&E)."). Page 2 has the room. Per 4.2. `cv-overrides`
3. **General summary to seven lines**: remove the on-call clause, "handling" instead of "triaged", singular "a monolith-to-Kubernetes migration", so the widow disappears and bullet 1 is no longer quoted verbatim ten lines above itself. Per 4.4. `cv-overrides`
4. **Add "security"** to HN bullet 2 ("the replacement security boundary") and "with focused unit and integration tests" to bullet 4 if it stays on three lines. `cv-overrides`
5. **Kubesoft compact line**: "From Feb 2016 assigned full-time to Rokk3r (above)." so the overlapping dates read as one employment. Per 4.6. `cv-overrides`
6. **Xogito**: bullet 1 "First engineer assigned to, then main backend engineer of, ..." and bullet 4 without the "more complex than the FullStack Labs one below" cross-reference. Per 4.3 and 4.5. `cv-overrides`
7. **Resolve 15 vs 16 services** against André Treib's public recommendation; change the canonical HN summary and the overlay summary together. Needs Marcos. `canonical fix`
8. **Skills**: order "AWS ECS" right after "AWS" in the Cloud line; restore "LLMs (Large Language Models)" as the `llms` display name and carry "LLM evaluation (human-graded, LLM-as-judge)" as its own canonical skill if it is to stay. `cv-overrides` (order) and `canonical fix` (skill)
9. **Gated, once Marcos confirms**: the 2022 pricing/eligibility engine and 2023 conversational service as general bullet 2 (canonical highlight 6 is already authored; the overlay just needs to project it), and André's eval-CI lane or MCP tool factory as an AI-variant bullet. `cv-overrides`, gated
10. **Phone number**: Marcos decides; if yes it is a `profile.json` contact and a one-line render change. `canonical fix` / `render`
11. **Not for this issue but worth filing**: the canonical House Numbers `highlights[0]` is still the PoC sentence, so the MCP and the web lead the current role with "productionization was left as a later team decision" while the CV leads with the communications service. Reorder canonical highlights. `canonical fix`

Do not change the type size or margins again; the current 9.6pt/0.45in is the floor and it is acceptable.

Ship status: items 1-6 are one overlay edit and a PDF regeneration, no code and no canonical change. With them applied I would call the general variant ready to send at about 8.2 and the AI variant at about 8.0; the remaining gap to a 9 is gated on facts only Marcos can confirm (items 7, 9) and on numbers the dataset does not hold (team size, upload volume, uptime). As it stands today, without items 1-6, the document is already forwardable; the fixes above raise the interview rate, they do not rescue it.

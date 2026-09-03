# Stage 2 recruiter-advisor review of the Stage 1 CV (#309)

Reviewed: `docs/cv-review/marcos-javier-alvarez-cv.full.html` / `apps/web/public/cv/marcos-javier-alvarez-cv.pdf` (19 pages), against `packages/career-data/content` (experience, stories incl. `reflection`, skills, gaps, projects, recommendations). No files were changed.

Target: senior IC full-stack / frontend / backend, full-time remote, Colombia-eligible, US/EU product companies, two pay tracks. Both general SWE and AI-adjacent roles must stay open.

---

## 1. 30-second read verdict

What a senior recruiter sees, in order:

1. **Headline**: "Senior Full-Stack Engineer · AI/LLM Systems in Production". Read as: *AI specialist*. For a general backend/full-stack req the recruiter's first thought is "is this person going to want to do plain product work?" That is #298 point 1, and it is correct.
2. **Summary**: opens with "specialized in taking AI from demo to production" and stays on AI for five of six lines. Full-stack range is the last sentence. Same narrowing. It also says "over the past four years", which reads as "four years of experience" to a skimmer. The 13-year career is invisible on page 1.
3. **First bullet under the current role**: a proof of concept that "stayed experimental: production kept the vendor ... productionization was left as a later team decision." The very first thing a recruiter learns about four years at House Numbers is a project that did not ship. It is honest and it belongs on the MCP, but as the lead bullet it is the single most damaging line on the document.
4. **Bullet shape**: every House Numbers bullet is 40-60 words, outcome last or absent. No number appears above the fold. The strongest numbers in the dataset (57,000+ communications, ~70% automated triage, 2-in-3 upload failures eliminated, 96-restart crash loop contained with no data loss, four-service vendor migration with no regression, checks replaced in under two weeks, 15+ people onboarded) are all on pages 2-8, inside stories a recruiter will never open.
5. **Length**: 19 pages. A screener gives a CV 30-60 seconds. Pages 2-19 are STAR interview stories, which is interview material, not CV material. Worse, several stories are candid growth narratives that read as red flags at screen stage (see section 3). At the screen stage this document is self-sabotaging; at the interview stage the same content is a strength. The fix is to keep the stories on the MCP and off the paper.
6. **Where interest is lost**: about line 25 (end of the PoC bullet). A recruiter who keeps going hits the paternity-leave story on the same page as the header.

Conclusion a recruiter reaches today: "Thoughtful AI engineer, hard to tell what he actually shipped, too long to forward to a hiring manager." Conclusion the data supports and the CV should produce: "Founding-era senior full-stack engineer who owns critical production systems end to end, has 13 years of shipping, and has spent the last three putting LLM features into production with real engineering discipline."

The raw material is unusually good. The problem is entirely selection, order and phrasing.

---

## 2. Target length and shape

**Two pages, US Letter.** One page undersells 13 years and drops the early progression; three pages is not read. For this profile the reader should be able to stop at the end of page 1 and already have the hire/no-hire signal.

Recommended section order and page budget:

| Section | Page | Budget | Why |
|---|---|---|---|
| Header: name, title line, location + time zone, links | 1 | 4 lines | Time zone (UTC-5, full US-hours overlap) is a screening filter for US companies and is currently missing. |
| Summary | 1 | 4-5 lines | General-first, AI-second (or the reverse for the AI variant). Must state years, stack and the biggest shipped system. |
| Core skills | 1 | 5-7 lines, grouped | ATS and human scanners both want the keyword block above the experience. Today it is on page 19. |
| House Numbers | 1 (rest) | 5-6 bullets + tech line | Roughly half of page 1. Metric-first bullets. |
| Xogito, FullStack Labs | 2 | 3 + 2 bullets | Client-facing leadership and data-migration ownership. |
| Earlier experience 2013-2018 (Belatrix, Rokk3r via Kubesoft, Kubesoft, Jarvi) | 2 | 1-2 lines each, dated | Keeps the progression visible without spending space (section 7). |
| Open-source projects | 2 | 2 entries, 1-2 lines each | hire-me-mcp and cowork only: they are public and inspectable. |
| Education | 2 | 1-2 lines | |

Everything else (summaries longer than one line, stories, the three House-Numbers-internal projects) stays on the MCP and the website, which the header already points to.

---

## 3. Remove

Each item quotes or references the Stage 1 text and gives the reason. "Remove" means remove from the CV projection; nothing here should be deleted from the canonical dataset unless marked.

### 3.1 All 16 behavioral stories (pages 1-18)

Reason: STAR stories are interview material. On a CV they cost 17 pages and the recruiter never reads them, but a curious one who does will find the following before learning anything about scale or outcomes:

- **"Returning from paternity leave into an AI-driven company pivot"**: "I seriously considered leaving", "I was exhausted, emotionally overwhelmed", "impostor syndrome". Excellent interview answer to "tell me about a time you struggled"; on a CV it is a flight-risk and burnout flag at the very top of the current role.
- **"Owning a destructive deployment mistake and rebuilding trust"** (Belatrix): a reviewed change "cleared data across every DynamoDB table in the shared development environment". Great accountability story in a behavioral round; on paper, without the interviewer's context, it is "candidate approved a change that wiped other teams' data".
- **"Replacing the rockstar-developer mindset with sustainable performance"** (Rokk3r): "exhaustion began producing the opposite result. My attention to detail deteriorated and the quality of my work declined." Same problem.
- **"Shipping the product while failing to build sustainable ownership"** (Kubesoft): "I do not consider the broader project a success". This is also a near-verbatim duplicate of "Creating momentum when a mission-driven project stalled": same situation, same actions, different reflection. Two stories, one event. On the CV that duplication is the first thing a careful reader notices.

Keep every one of these on the MCP; they are exactly what the interview agent should serve. Remove all of them from the CV projection (this is the default `includeStories: false`, so this is a matter of not shipping the Stage 1 flag).

### 3.2 House Numbers highlight 1 as the lead bullet

> "Led a multi-round proof of concept evaluating vision-LLM document splitting ... The PoC stayed experimental: production kept the vendor plus the existing LLM fallback, and productionization was left as a later team decision."

Reason: a non-shipped experiment cannot be the first line of the current role. It also appears a second time as the project "AI Document Extraction Proof of Concept ... never deployed". Keep at most one mention, as the last House Numbers bullet or as a one-line project, phrased around what was built (corpus, evaluation, cost tracing, measurement bugs found and fixed) rather than around the non-decision. Do not lift André Treib's "$0.30 per loan against their $25" into the CV: the project body explicitly says the cost was "never normalized against the vendor's per-loan price on the same work and coverage" and supports "worth pursuing", not "beat the vendor". A reference check that reaches the CTO would not back the stronger claim.

### 3.3 Projects "LLM Evaluation Infrastructure" and "Monorepo Agent-Consumable Documentation System"

Reason: both are House Numbers work already covered by highlights 3 and 5, so they are pure duplication on a two-page document. Additionally, both carry the role "Sole engineer / owner", and the eval entry's summary says "Solo-built ... per-call cost tracing", while the prompt-platform story says "A teammate had previously created cost-tracing functionality for our Agent Service; I generalized that work". Reference-check risk: a peer asked "did Marcos build the cost tracing solo?" would say no. Recommend "Lead engineer" on the eval project (canonical wording question for Marcos; the fact is contested by his own story) and dropping both from the CV projection.

### 3.4 House Numbers highlight 4 (the filter library)

> "Built and evolved flexible query filtering for the loan-application product end to end: the frontend filter flows and a reusable TypeScript filter library and query parser that compose MongoDB queries from them — multi-value, related-entity, date-range, set/unset, and regex-escaped text-search operators — with tenant-scoped access for sensitive loan data."

Reason: 60 words on a query parser. It is the only bullet that proves frontend product work, which matters for #298 point 1, but the operator list is implementation detail. Cut to one line (see 5.3) or fold into a product-engineering bullet.

### 3.5 Third-person parallel-employment explanations (Rokk3r and Kubesoft summaries and Kubesoft highlight 1)

> "an engagement his employer Kubesoft assigned him to, covering this whole period rather than a second parallel job."
> "Kubesoft later assigned him to work directly with Rokk3r, recorded as the separate Rokk3r entry — one continuous employment rather than two parallel jobs."
> "then spent the rest of the role on the Rokk3r assignment (see that entry) with no separate Kubesoft client work carried in parallel."

Reasons: (a) voice switches to third person ("his employer", "assigned him") in a document that is otherwise first-person/implicit; (b) it spends three sentences explaining what he did *not* do; (c) the negative-space bullet under Kubesoft is a wasted bullet. Replace with "Rokk3r (via Kubesoft SAS)" in the company line and let the dates do the rest. This is CV-only wording; the canonical summaries can stay as they are for the MCP, where the disambiguation is useful.

### 3.6 Belatrix highlight 2

> "Orchestrated automated deployments via CloudFormation."

Reason: too small to be a bullet on a senior CV. Fold "CloudFormation" into the tech line of a single bullet.

### 3.7 Rokk3r highlight 3

> "Delivered a digital insurance-broker platform and IoT video/academic platforms on experimental hardware."

Reason: vague ("IoT video/academic platforms") and "experimental hardware" invites a question with no answer on the page. Either name what the platforms were (canonical addition) or cut.

### 3.8 Jargon and number-free claims in House Numbers highlight 3

> "Turned agentic AI features into engineered systems ... and an AI cost-reduction workstream."

Reason: "turned features into engineered systems" is a slogan; "cost-reduction workstream" has no number and the stories do not give one. The defensible facts are: retired the Orq.ai platform cost, adopted cheaper models under measured quality, removed LLM runtime cost from the document checks. Say those.

### 3.9 Header line

> "Portfolio & detailed career evidence: hire-me-mcp-web.vercel.app · Query it from any MCP client: https://hire-me-mcp-web.vercel.app/api/mcp"

Reason: two URLs and an instruction. For an AI-tooling company the MCP endpoint is a differentiator; for everyone else it is noise. One line: "Portfolio, references and a queryable MCP endpoint: hire-me-mcp-web.vercel.app". Keep the `/api/mcp` link in the AI variant only, or in the projects entry.

### 3.10 Skills entries that date the candidate or do not match ATS vocabulary

- Familiar tier: "AngularJS, Socket.IO, PHP, Hybrid Mobile Development". AngularJS is end-of-life; PHP is one 2013 role. They already appear on the early-career tech lines, which is where they belong. Remove from the Skills block.
- "Turborepo, pnpm" as two skills: fold into "Turborepo/pnpm monorepos".
- "Regulated / Encrypted Data Handling" and "Vision-based Document Processing": not phrases anyone searches. Rename in the CV to "PII handling, field-level encryption" and "Document AI (OCR/vision-LLM extraction)".
- "Mentoring & Onboarding, Requirements Gathering" listed between "pnpm" and "Regulated / Encrypted Data Handling" under "Proficient": mixing tools and practices in one tier is what #298 point 3 is reacting to. See section 6.

### 3.11 The caveat sentence on the 70% figure

> "That figure is not LLM accuracy: the remaining bucket includes spam, unsupported edge cases, and an identified observability gap."

Reason: this caveat is correct on the MCP. On the CV, phrase the number so that no caveat is needed ("~70% reaching an automated triage outcome"), and never write "70% accuracy".

### 3.12 Scrum Master & Product Owner certificate (2020)

Reason: low signal for a senior IC; keep only if it fits on the last line of page 2.

---

## 4. Highlight and move up

Signals of scale, ownership, outcomes and progression that exist in the dataset and are currently buried, with where each should land.

| Signal | Source | Where it should appear |
|---|---|---|
| 57,000+ communications in a seven-month window, ~70% reaching an automated triage outcome, manual triage shifts retired | Story "Owning a critical communications service", results | House Numbers bullet 1 (lead), and the summary. This is the single best proof of production scale and ownership in the dataset. |
| Roughly 2 in 3 public uploads ended in a complaint or escalation; after the rebuild "borrower complaints about failed uploads stopped"; "many uploads every day" | Story "Redesigning a public document-upload flow" | House Numbers bullet 2. Security + product outcome in one line. |
| Vendor migration (Orq.ai) across four services, incremental, "no significant interruption or regression", platform cost eliminated, cheaper models adopted under evaluation, CTO confirmed improvement | Story "Replacing a prompt-management vendor" | House Numbers bullet 3. Replaces the vague "cost-reduction workstream". |
| Replaced hallucinating LLM checks with deterministic validation "in less than two weeks"; PM confirmed adoption; LLM runtime cost removed; pipeline first decomposed into three idempotent, retryable stages | Stories "Replacing unreliable LLM checks" and "Preventing a monolithic AI pipeline" | House Numbers bullet 4. This is the bullet that tells a hiring manager he knows when *not* to use a model. |
| Crash loop: 96 restarts in 24h vs 0-4 baseline; contained, made retryable, reprocessed, "no permanent data loss" | Story "Tracing a production crash loop" | House Numbers bullet 5. Concrete incident ownership, and it answers #298 point 2 (reliability) with a real number. |
| Shared on-call investigation workflow adopted by the whole rotation; New Relic alert can now trigger an agent that prepares a PR for engineer review | Story "Standardizing production debugging" | House Numbers bullet 6, merged with the docs system. Platform-level leverage. |
| Team went from three engineers at the pivot; "one of our first two non-founder engineering hires"; "from a handful of services to a sixteen-service platform" | Paternity-leave story situation; Jeff Levinsohn and André Treib recommendations | Summary and House Numbers role line ("founding-era engineer"). The recommendations are public LinkedIn text, so this is the most reference-safe scale claim available, but it is not in the canonical experience entry today. Canonical fix (add one sentence to the House Numbers summary). Note the 15 vs "sixteen" discrepancy: verify and align. |
| Pre-LLM backend systems in 2022-2023: "mortgage eligibility and pricing engine: a declarative matcher framework scoring HECM, HELOC and HELOAN products, with parallel eligibility checks" and "conversational service: stateful intents ... persisted chat history" | André Treib recommendation only; absent from experience.json | House Numbers bullet (optional 7th, or replacing the filter-library bullet). This is the strongest possible answer to #298 point 1: it proves he built core domain logic before LLMs were involved. Canonical fix, and Marcos must confirm the details before it is added. |
| "replaced 24 hand-written MCP tool files with a declarative factory that tripled our agent's tool coverage" | André Treib recommendation only | AI-variant bullet or skills evidence for "MCP". Canonical fix if Marcos confirms. |
| Client account recovered after PM left; led product conversations for ~6 months; client commissioned additional projects and invited him to found their internal tech team | Story "Rebuilding client trust", results | Xogito bullet 2. This is the stakeholder-facing evidence for the $150k+ track. |
| Onboarding approach used with 15+ people across two companies; adopted at House Numbers as a rotating buddy program | Story "Turning a poor onboarding experience into a repeatable framework", results | Xogito bullet 3 (and the "Mentoring" skill). |
| SAP migration: rounding discrepancy traced, zero data loss, users retired the legacy system after MVP; a second, larger SAP migration at Xogito that "did not require post-migration reconciliation" | Story "Preserving financial continuity", results and `reflection` | FullStack Labs bullet 2; the Xogito SAP migration is only in the reflection field and not in Xogito's highlights (canonical gap, see open questions). |
| Acting technical lead for a team of two developers and two QA engineers | Belatrix story situation | Belatrix line. First lead role, 2018, visible progression marker. |
| Monolith to AWS Kubernetes microservices; Parse shutdown migration under a hard deadline | Rokk3r highlights 1-2 | Keep, tightened to one line each. |
| Hackathon-winning, government-supported app launched before deadline | Kubesoft highlight 2 | Keep as the single Kubesoft line. |

---

## 5. Restructure and reword

### 5.1 Header and title line

Before:
> Senior Full-Stack Engineer · AI/LLM Systems in Production
> Cúcuta, Colombia (Remote) · garusis@gmail.com · github.com/garusis · linkedin.com/in/garusis
> Portfolio & detailed career evidence: hire-me-mcp-web.vercel.app · Query it from any MCP client: https://hire-me-mcp-web.vercel.app/api/mcp

After (general variant):
> Senior Full-Stack Engineer · TypeScript, Node.js, React, AWS · Production LLM systems
> Cúcuta, Colombia · Remote (UTC-5, full US-hours overlap) · garusis@gmail.com · github.com/garusis · linkedin.com/in/garusis
> Portfolio, references and queryable MCP endpoint: hire-me-mcp-web.vercel.app

After (AI-adjacent variant): swap the title to "Senior Full-Stack Engineer · LLM and agentic systems in production · TypeScript, Node.js, React, AWS" and keep the `/api/mcp` URL.

The time-zone clause is new information; the profile has no field for it (CV-only text or a small canonical `profile` addition).

### 5.2 Professional summary

Before (six lines, AI in five of them, "past four years" reads as total experience, no numbers).

**Version A: general SWE lead**

> Senior full-stack engineer with 13 years shipping TypeScript/Node.js, React and AWS products, the last four as one of the first non-founder engineers at House Numbers, helping grow a mortgage-lending platform from a handful of services to a 15-service event-driven monorepo. I own critical production systems end to end: a communications service that triaged 57,000+ emails, SMS and calls in a recent seven-month window (~70% automatically), a hardened public document-upload boundary, and the on-call investigation workflow the whole rotation uses. Since 2023 that has included putting LLM features into production with evaluation harnesses, cost tracing and deterministic safeguards, so they are measured like any other system. Earlier: multi-tenant SaaS backend lead, legacy-SAP data migrations, monolith-to-Kubernetes migrations, and client-facing delivery.

**Version B: AI-adjacent lead**

> Senior full-stack engineer (TypeScript, Node.js, React, AWS) who has spent the last three years putting LLM and agentic features into production on a mortgage-lending platform and making them accountable: evaluation harnesses with human-graded ground truth and LLM-as-judge scoring, per-call cost tracing, version-controlled prompts, provider failover, and deterministic rules wherever a model was the wrong tool. I built and maintain the platform's communications service (57,000+ emails, SMS and calls triaged in a recent seven-month window, ~70% automatically) and led the migration off a prompt-management vendor to repository-native LLM infrastructure across four services with no production regression. Thirteen years of full-stack, DevOps and client-facing delivery underneath, plus two open-source AI projects (an MCP server and an agent-orchestration CLI).

Defensibility notes: "13 years" is Feb 2013 to now. "One of the first non-founder engineers" and "handful of services to 15-service" come from the CEO and peer recommendations and the paternity story ("the engineering team consisted of three people"); they need to enter the canonical House Numbers summary before the CV can carry them (design constraint). "Since 2023" for LLM work is inferred from André's timeline (pricing engine 2022, conversational service 2023, "when LLM agents came") and the paternity story ("early in the LLM boom"); Marcos should confirm the year.

### 5.3 House Numbers (May 2022 - Present)

Role line: "Senior Full Stack Engineer" is fine. Consider "Senior Full Stack Engineer (founding-era engineer, one of the first two non-founder hires)" only if the canonical summary is updated.

One-line summary (CV-only, replaces the two-line canonical one if summaries are shown at all):
> AI-enabled mortgage-lending platform; 15-service TypeScript monorepo on AWS. Backend, frontend and infrastructure ownership across the platform.

Bullets, metric or outcome first, all sourced from stories:

1. **Built and maintain the platform's communications service end to end**: webhook-driven email, SMS and call intake, LLM-assisted extraction and classification kept separate from the deterministic rules that route each message, and loan matching over field-level-encrypted data. 57,000+ communications in a recent seven-month window, ~70% reaching an automated triage outcome; operations retired its manual-triage shifts. Hardened with monitoring, alerts, durable retries and webhook reconciliation.
2. **Eliminated failed-upload complaints on a public document-upload flow where roughly two in three submissions had ended in a complaint or escalation**: designed and built the replacement boundary (opaque sessions, CAPTCHA, scoped and global rate limiting, replay protection, minimal public responses, correlated audit trail with encrypted sensitive fields) and a hybrid deterministic/LLM routing model that avoided a per-upload LLM extraction cost while keeping ambiguous matches with a human.
3. **Led the multi-month migration off a prompt-management vendor (Orq.ai) to repository-native LLM infrastructure**: version-controlled prompts, direct provider integration with failover, shared per-call cost tracing and automated evaluations, rolled out service by service across four services with no significant regression; retired the platform cost and enabled cheaper model swaps under measured quality.
4. **Replaced hallucination-prone LLM-generated loan-document checks with deterministic, tested validation plus capped AI observations in under two weeks**, after first decomposing the monolithic analysis pipeline into three idempotent, independently retryable message-bus stages; processors adopted the checks (confirmed in PM follow-up interviews) and the LLM runtime cost for those checks was removed.
5. **Owned incident response on the document-processing path**: contained a crash loop (96 restarts in 24 hours against a 0-4 baseline) caused by an environment-specific Zod 4 schema mismatch and a non-frozen lockfile, made the failing path observable and retryable via the message-bus dead-letter mechanism, and reprocessed the affected window with no permanent data loss.
6. **Standardized on-call debugging across the platform**: authored the shared investigation command and specialist debugging skills the whole rotation adopted; a New Relic alert can now trigger an agent that gathers evidence and proposes a pull request for engineer review. Also designed the monorepo-wide, CI-gated documentation system and built the loan-application product's end-to-end filter flows and reusable TypeScript query library.

Optional 7 (only if canonical data is added and confirmed): **Built the mortgage eligibility and pricing engine (2022)**, a declarative matcher scoring HECM, HELOC and HELOAN products with parallel, type-validated eligibility checks, and the stateful conversational service (2023) that preceded the LLM work.

For the general variant, order 1, 2, 5, 6, 4, 3 (systems and reliability before LLM plumbing). For the AI variant, order 1, 3, 4, 2, 5, 6. Six bullets at this density is about half a page; if space is tight, merge 5 and 6.

Tech line: "TypeScript, Node.js, React, MongoDB, Redis, AWS (ECS), Kubernetes, message-bus/event-driven services, OpenAI and Anthropic APIs, New Relic, Zod."

### 5.4 Xogito Group (Dec 2020 - Mar 2022)

Before: three bullets, the middle one 55 words.

After:
1. **Main backend engineer (NestJS, TypeScript, PostgreSQL, AWS, GitLab CI) on a multi-tenant SaaS for real-time quality-control inspections across factories, product lots and distribution points**; owned backend architecture and delivery end to end.
2. **Recovered a frustrated enterprise client's account after the project manager resigned**: became the team's spokesperson, re-planned sprints to pair quick wins with core-workflow repairs, rebuilt trust within two to three sprints and led the product conversations for about six months; the client went on to commission additional projects.
3. **Onboarded and mentored new engineers** with an approach later adopted at House Numbers as a rotating buddy program; 15+ people onboarded across the two companies.

Optional (canonical addition from the FullStack Labs story's `reflection`): "Led a second, larger SAP data migration: evaluated ETL tooling, built custom scripts where tools could not represent the models, checked rounding compatibility early, iterated with platform users, no post-migration reconciliation required."

### 5.5 FullStack Labs (Dec 2018 - Dec 2020)

1. **Full-stack engineer (Node.js, React, PostgreSQL, AWS, Docker) on a procurement platform for a US fiduciary purchasing agent (FF&E/OS&E).**
2. **Owned the migration of historical quote data out of a legacy SAP system with zero data loss**: custom ETL with automated tests and expert verification, traced a financial-total discrepancy to rounding differences between SAP and JavaScript and reproduced the legacy rules for number continuity, ran a frozen cutover window with snapshot-backed reconciliation; users retired the legacy system after MVP launch.

### 5.6 Earlier experience (2013-2018), dated lines under one subheading

- **Belatrix Software, Senior Node.js Developer (acting technical lead), Jul-Nov 2018**: designed the serverless architecture (AWS Lambda, CloudFormation, DynamoDB) for a dynamic-document platform for a major supply-chain provider and led a four-person team (two developers, two QA) delivering it.
- **Rokk3r (via Kubesoft SAS), Senior Full Stack Developer and DevOps, Feb 2016 - Jun 2018**: migrated a real-time telecom procurement monolith from self-hosted servers to an AWS Kubernetes microservices cluster, moving large parts of it personally; migrated a mobile backend off Parse to AWS ahead of the platform's shutdown deadline by reading its source to work out undocumented internals.
- **Kubesoft SAS, Senior Full Stack and Mobile Developer, Jan 2015 - Jun 2018 (assigned to Rokk3r from Feb 2016)**: web and hybrid-mobile products for Colombian and international clients; built the first backend of Mutual, a government-supported, hackathon-winning parenting app, launched ahead of its deadline.
- **Jarvi Games, Full Stack Developer and DevOps, Feb 2013 - Jun 2015**: built a real-time game backend with micropayments (Node.js, MongoDB, PostgreSQL, PHP) and its infrastructure.

"DynamoDB" appears only in the Belatrix story, not in the entry's `tech`; adding it is a small canonical fix. "Acting technical lead" is the story's own wording ("held the title of Senior Node.js Developer while acting as the technical lead"), which is the defensible form; do not write "Tech Lead" as the title.

### 5.7 Projects

Keep two, one to two lines each, under "Open source":

- **hire-me-mcp** (github.com/garusis/hire-me-mcp, live at hire-me-mcp-web.vercel.app): public MCP server, RAG-backed interview agent (Neon pgvector, Gemini embeddings) and Next.js site over one typed career dataset; Vitest, Playwright e2e against real Vercel previews, retrieval and agent evals as required CI gates.
- **cowork** (github.com/garusis/cowork): Python CLI that orchestrates multiple AI coding agents into role-based teams with phase gates, per-role evals and cost reporting.

Drop the three House Numbers-internal projects from the CV (section 3.2, 3.3). The PoC can survive as the last House Numbers bullet in the AI variant: "Led a multi-round vision-LLM document extraction proof of concept: built and reviewed the ground-truth corpus, evaluation and per-run cost tracing, and found and corrected measurement bugs in the scoring; the result supported 'worth pursuing' and productionization was left to the team." Never stronger than that.

### 5.8 Education

> Universidad Nacional Abierta y a Distancia (UNAD), B.S. Systems Engineering, coursework (see open question 6)
> International Scrum Institute, Scrum Master and Product Owner, 2020 (optional)

---

## 6. Skills and ATS (#298 point 3)

Verdict on point 3: **good idea**. The current block is grouped by proficiency tier, which is the right model for the MCP (it is honest and evidence-linked) but the wrong presentation for ATS and for a human scanner, who both look for category headers and the target role's vocabulary. Two problems: mixed kinds inside a tier ("pnpm" next to "Mentoring & Onboarding"), and non-standard skill names that no search matches.

Proposed CV grouping (projection: `skills.json` already has `category`; the CV should group by it, order the groups per variant, and apply display-name overrides). Order for the general variant:

- **Languages**: TypeScript, JavaScript, SQL. (Python: tooling only; see open question 4.)
- **Backend**: Node.js, NestJS, REST APIs, webhooks, event-driven / message-bus services, microservices, multi-tenant SaaS.
- **Frontend**: React, Next.js.
- **Data**: PostgreSQL, MongoDB, Redis, pgvector, ETL and legacy data migrations.
- **Cloud and infrastructure**: AWS (ECS, Lambda, CloudFormation, DynamoDB), Docker, Kubernetes, CI/CD (GitHub Actions, GitLab CI), Turborepo/pnpm monorepos, observability (New Relic, structured logging, tracing).
- **AI / LLM engineering**: OpenAI, Anthropic and Gemini APIs; RAG; MCP (Model Context Protocol); agentic workflows; LLM evaluation (golden sets, human-graded ground truth, LLM-as-judge); prompt versioning; per-call cost tracing; document AI (OCR / vision-LLM extraction).
- **Practices**: test-first development (Vitest, Playwright), application security (rate limiting, replay protection, PII and field-level encryption), on-call and incident response, mentoring and onboarding, client-facing requirements.

For the AI variant, move "AI / LLM engineering" to second position.

Keywords that are evidenced in the dataset but absent from `skills.json` and therefore invisible to ATS today: Next.js, MCP, RAG, pgvector, Playwright, Vitest, Zod, GitHub Actions, Vercel, Gemini, New Relic, ECS, DynamoDB, webhooks, ETL. All appear in project `tech` tags, stories or the hire-me-mcp body. Adding them as skills with evidence links is a canonical fix (the MCP benefits too). Keep proficiency honest: most of these are "proficient" or "familiar", not "expert".

Do not do: a keyword wall, repeating "LLM" in every bullet, or listing frameworks he has not used in production (the `gaps.json` entries are correct and should stay off the CV).

Also note the internal inconsistency: `skills.json` has Python as "proficient" while `gaps.json` (django) says "Python familiarity limited to tooling work — not enough to present as a Python specialist". A recruiter for a Python-heavy role will probe. Pick one (open question 4).

---

## 7. Progression story (#298 point 4)

Verdict: **partly**. The right fix is not one big block; it is one dated line per role under an "Earlier experience" subheading (section 5.6). The dates and titles then tell the story by themselves:

- 2013-2015: solo full-stack and DevOps on a real-time backend (Jarvi).
- 2015-2018: senior at a consultancy; cloud migrations, Kubernetes adoption, Parse migration under deadline (Kubesoft / Rokk3r).
- 2018: first team-lead responsibility, serverless architecture, four-person team (Belatrix).
- 2018-2020: US client, owned a financial data migration end to end (FullStack Labs).
- 2020-2022: main backend engineer on a multi-tenant SaaS and de facto client lead after the PM left (Xogito).
- 2022-present: founding-era engineer on a platform that grew to 15 services; service owner, incident lead, platform tooling, production LLM systems (House Numbers).

The progression to sell is: individual contributor, to senior with infra ownership, to acting lead, to client-facing senior, to founding-era platform owner. That is a staff-adjacent arc and it is completely invisible in the Stage 1 document because every role reads at the same weight.

Two mechanics matter:

1. The Kubesoft/Rokk3r overlap (Jan 2015 - Jun 2018 and Feb 2016 - Jun 2018) currently costs three sentences of explanation. "Rokk3r (via Kubesoft SAS)" plus "(assigned to Rokk3r from Feb 2016)" on the Kubesoft line resolves it in six words. Canonical dates stay untouched.
2. Belatrix is a five-month role. A recruiter notices short stints; the acting-lead framing and the fact that FullStack Labs starts the following month make it read as a contract engagement, which is fine. Do not hide it and do not pad it.

Whether to actually compress the four earliest roles into a single visual block: yes, as a subheading with four dated lines, not as a paragraph. A paragraph is what created the #298 complaint in the first place.

---

## 8. Verdict on the four #298 points

1. **Summary overly AI-specific**: **good idea, and the headline has the same problem.** The fix is Version A (general-first) as the default with Version B available as a CV-only variant for AI-adjacent postings. Both keep the AI credibility; A leads with 13 years, stack and the largest owned system.
2. **No explicit scale / reliability outcomes outside the AI work**: **good idea, with a caveat.** The dataset has real numbers (57k+ communications, ~70% automated, 2-in-3 upload failures eliminated, 96-restart incident with no data loss, four-service migration with no regression, 15-service platform, 15+ people onboarded, zero-data-loss SAP migration); they are simply buried in stories. Lift those. The dataset does *not* have users, throughput, uptime or revenue figures, and none should be invented; whether Marcos can source any of them (loans per month, tenants, daily upload volume, ops-team size) is open question 1.
3. **Skills packed into categories rather than prioritized around searchable keywords**: **good idea.** See section 6: group by category, order groups by variant, standardize names, add the evidenced-but-missing keywords to `skills.json`.
4. **Earlier experience compressed into one block hiding progression**: **partly.** Compress in space, not in structure: one dated line per role, with a progression marker in each (section 7). Do not merge them into a paragraph.

---

## 9. Prioritized action list

Tags: `projection` = selection/ordering/grouping in `getCvView()` plus small CV-only metadata; `cv-only field` = CV-specific wording in an overlay/`cvHighlights`, MCP text unchanged; `canonical fix` = the underlying fact is missing, wrong or inconsistent and should change everywhere.

1. **Ship the CV without stories or long summaries** (the Stage 1 `includeStories`/`includeSummary` flags stay off for the real PDF; `maxHighlightsPerRole` becomes per-role via CV metadata). `projection`
2. **Replace the six House Numbers highlights with the metric-first set in 5.3**, in the general-variant order. `cv-only field`
3. **Rewrite the summary as Version A; keep Version B as a selectable variant.** `cv-only field` (profile overlay; `profile.summary` unchanged for the MCP)
4. **Change the title line to general-first** ("Senior Full-Stack Engineer · TypeScript, Node.js, React, AWS · Production LLM systems"). `cv-only field` (`profile.headline` unchanged)
5. **Regroup Skills by `category` with CV display names and variant-dependent group order**; drop AngularJS/Socket.IO/PHP/Hybrid Mobile from the block. `projection` (grouping) plus `cv-only field` (display names)
6. **Add the evidenced-but-missing skills** (Next.js, MCP, RAG, pgvector, Playwright, Vitest, Zod, GitHub Actions, Vercel, Gemini, New Relic, ECS, DynamoDB, webhooks, ETL) to `skills.json` with evidence links and honest tiers. `canonical fix`
7. **Projects: show only hire-me-mcp and cowork**; drop the three House Numbers-internal projects from the CV. `projection` (a `showOnCv` flag or featured-only rule)
8. **Move the PoC out of the lead position**: last House Numbers bullet in the AI variant only, phrased around the measurement work; never with André's per-loan cost figure. `cv-only field`
9. **Add the founding-era scale facts to the House Numbers canonical summary** ("one of the first two non-founder engineering hires; engineering team of three at the pivot; platform grew from a handful of services to 15") after verifying 15 vs 16. `canonical fix`
10. **Xogito and FullStack Labs bullets per 5.4 and 5.5.** `cv-only field`
11. **Earlier-experience block per 5.6**: one dated line per role, "Rokk3r (via Kubesoft SAS)", "(assigned to Rokk3r from Feb 2016)", "acting technical lead" at Belatrix. `projection` (subheading/compression rule driven by a CV metadata flag or a date cutoff) plus `cv-only field` (line text)
12. **Header: add time zone / US-overlap line, collapse the portfolio line to one URL.** `cv-only field` (or a small `profile` addition if the MCP should serve time zone too)
13. **Rename eval-infrastructure project role from "Sole engineer / owner" to "Lead engineer"** given the cost-tracing provenance in the prompt-platform story. `canonical fix` (fact is contested by his own story; Marcos decides)
14. **Resolve Python: "proficient" in skills vs "tooling only" in gaps.** `canonical fix`
15. **Add DynamoDB to Belatrix `tech`; consider adding the Xogito SAP migration (from the FullStack Labs story's reflection) as a Xogito highlight; consider adding the 2022 pricing engine and 2023 conversational service (from André's recommendation) as House Numbers highlights.** `canonical fix`, each gated on Marcos confirming details
16. **Drop or rewrite Rokk3r highlight 3 ("IoT video/academic platforms on experimental hardware").** `cv-only field` (omit) or `canonical fix` (name the platforms)
17. **Education line: decide how to present the unfinished degree.** `canonical fix`
18. **Tech lines: keep, but add ECS/New Relic/Zod to House Numbers and DynamoDB to Belatrix.** `canonical fix` (they are facts in the stories)
19. **Guard tests**: after 1-2, the story-leakage guard should pass again unchanged; add a guard that the CV never contains "never deployed", "stayed experimental" or "left as a later team decision" wording in the lead bullet position (a phrasing guard, not a content guard). `projection`

---

## 10. Open questions for Marcos

1. **Scale numbers you can defend**: loans processed per month, number of lender tenants, ops-team size served by the communications service, daily upload volume ("many uploads every day" has no figure), platform uptime or restart baselines beyond the one incident. Any of these you can state and a reference would confirm should go into the House Numbers canonical summary. If none, the CV uses only what exists now and that is still enough.
2. **Which track leads by default?** My recommendation is Version A (general) as the default PDF and Version B as an AI-variant, since the AI-adjacent reader will find the AI depth in the bullets anyway, but the general reader will bounce off Version B. If most of your pipeline is AI-tooling companies, invert it.
3. **15 or 16 services?** The canonical summary says 15; André's public recommendation says sixteen. Trivial, but a reference check that reads both will notice. Pick the current count.
4. **Python tier**: keep "proficient" (cowork is a real Python codebase) and soften the Django gap statement, or downgrade to "familiar" and stop listing it under Languages? I would not list it under Languages on a general SWE CV either way.
5. **André's pre-LLM facts** (2022 eligibility/pricing engine for HECM/HELOC/HELOAN; 2023 conversational service; 24 MCP tool files replaced by a declarative factory, "tripled" tool coverage): all three are public and attributable, none is in the canonical experience entry. Are the details right, and do you want them on the CV? The pricing engine in particular is the best answer to "is he only an AI guy".
6. **Degree**: "B.S. Systems Engineering (in progress)" with a career starting in 2013 will prompt "in progress since when?" from any US recruiter. Options: add an expected completion date if there is one; state "coursework completed toward" and the years; or drop the line. Please decide; I would not leave "(in progress)" without a date.
7. **"Still owns" the communications service**: the story says other engineers contribute and you "normally review significant changes"; André's recommendation says "without ever claiming ownership of it". "Built and maintain" (my wording) is safe; "own end to end" is what the canonical highlight says. Confirm which you want a reference to hear.
8. **"Sole engineer / owner" on LLM Evaluation Infrastructure and the Monorepo Documentation System**: the cost-tracing component was generalized from a teammate's work per your own story. Are you comfortable with "Lead engineer" for the eval project, or is "solo" accurate for everything except cost tracing?
9. **Xogito SAP migration**: your reflection on the FullStack Labs story says you led "a more complex SAP migration at Xogito" that needed no post-migration reconciliation. It is not in the Xogito highlights. Should it be? It is a stronger data-migration claim than the FullStack Labs one.
10. **Time zone and availability line**: do you want "UTC-5, full US-hours overlap" and "full-time, remote" on the header, and should the MCP serve time zone too (profile field) or is it CV-only?
11. **Belatrix**: five months. Was it a fixed-term contract? If yes, "(contract)" after the dates removes the short-stint question entirely.
12. **PoC on the CV at all?** My recommendation is: absent from the general variant, last bullet in the AI variant. If you feel it is your strongest AI story, it can be a bullet in both, but only in the "what I built and measured" phrasing, never with an accuracy or cost-versus-vendor claim.

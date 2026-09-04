# Stage 3, round 3: independent grading of the round-3 CVs (#309)

Graded, nothing edited: `apps/web/public/cv/marcos-javier-alvarez-cv.pdf` (general, 2 pages Letter, 10pt/0.5in), `apps/web/public/cv/marcos-javier-alvarez-cv-ai.pdf` (AI, 2 pages), their HTML in `docs/cv-review/`, the full dump, `cv-overrides.json`, the canonical experience/stories/skills/gaps/recommendations, the round-2 grading and its fix list, and `git diff 907a2b3..HEAD` for what changed. Candidate decisions listed in the brief were treated as fixed constraints.

Short version: ship it. Ten of the eleven round-2 items landed or were consciously declined; the one that moved backwards is layout, because restoring 10pt (a decision I respect) brought back the header wrap and now splits Xogito's last bullet across the page break, leaving a one-line widow ("post-migration reconciliation.") at the top of page 2 of the general variant. That is a one-line CSS fix, not a content problem. Everything else on the remaining list is a nit.

---

## 1. The 30-second read

### General variant

Seconds 0-5, header. "Senior Full-Stack Engineer · TypeScript, Node.js, React, AWS · Production LLM systems". Then the contact line, which at 10pt wraps again: "Cúcuta, Colombia (Remote) · UTC-5, full US-hours overlap · garusis@gmail.com · github.com/garusis ·" and a dangling "linkedin.com/in/garusis" on its own line. Remote, time zone, stack, seniority all answered; the orphaned LinkedIn line is the first visual blemish and it is on the first screen.

Seconds 5-15, summary. Eight lines. The first sentence is 62 words: "Senior full-stack engineer with 13 years shipping TypeScript/Node.js, React and AWS products, the last four at House Numbers — joined when the engineering team was three people, since grown to seven engineers (excluding design, PM and QA) — helping take a mortgage-lending platform through a B2C-to-B2B pivot and from a handful of services to a 16-service event-driven monorepo." The facts inside it are exactly what a hiring manager wants (13 years, 3-to-7 team, pivot, 16 services), but the em-dash aside with its own parenthetical makes a recruiter read the sentence twice. "(excluding design, PM and QA)" is interview-grade precision on a CV; it reads as hedging. Sentences two and three are fine: the 57,000+/~70% figure, the upload boundary, three years of LLM features "with evaluation harnesses, cost tracing and deterministic safeguards", and the "Earlier:" roll-up. The round-2 one-word widow is gone; the last line is a comfortable half line.

Seconds 15-30, House Numbers. Seven bullets, and the first line of six of them carries a number or a hard outcome: "57,000+ ... ~70%", "an estimated two in three", "filter UI in React", "96 restarts in 24 hours against a 0-4 baseline", "in under two weeks", "Retired a prompt-management vendor (Orq.ai) and its recurring cost". The React bullet now exists as bullet 3, so the "is he frontend at all?" question is answered before the fold. Bullet 7 opens with "Authored the shared on-call investigation workflow the whole rotation adopted, and proposed the alert-to-PR automation on top of it" - "proposed" is the honest verb and the sentence still lands as a platform-leadership signal. The Tech line ends page 1's House Numbers block at "Kubernetes, OpenAI API, Anthropic API, New Relic, Zod."

The page break: Xogito starts on page 1 with the role line and four bullets, and the fourth bullet breaks after "validated rounding compatibility early with platform users, and needed no" with "post-migration reconciliation." alone at the top of page 2, followed by the italic Tech line. A recruiter flipping pages sees a fragment and an italic line before any heading. It reads as a layout accident, not as a candidate problem, but it is the first thing on page 2.

Page 2: FullStack Labs (two bullets, the context bullet restored), Earlier Experience as four dated lines with the Kubesoft/Rokk3r overlap now explained in six words ("From Feb 2016 assigned full-time to Rokk3r (above)."), two projects, a categorised Skills block with "AWS, AWS ECS" adjacent and "LLMs (Large Language Models), LLM Evaluation (human-graded, LLM-as-judge)" both present, and the education line. Page 2 ends at roughly 85% of the sheet, so there is room to absorb the Xogito fix.

Does it read as AI-only? No. Bullets 3 and 4 have no LLM in them, bullet 5 is about replacing an LLM with deterministic code, and the summary opens on 13 years and a stack. The LLM material reads as depth inside a full-stack profile, which is the brief.

### AI variant

Header hook: "Senior Full-Stack Engineer · LLM and agentic systems in production · TypeScript, Node.js, React, AWS", plus a second portfolio line carrying the raw endpoint "https://hire-me-mcp-web.vercel.app/api/mcp" (the only URL on either document with a scheme). Summary: seven lines, opens on "the last three years putting LLM and agentic features into production on a mortgage-lending platform: evaluation harnesses with human-graded ground truth and LLM-as-judge scoring, per-call cost tracing, version-controlled prompts and provider failover", then the 57,000+ figure and the Orq.ai migration, then "Thirteen years of full-stack, DevOps and client-facing delivery underneath". Still previews bullets 1 and 2 nearly verbatim, as in round 2.

Bullet 2 is now the longest paragraph on either CV, seven lines: the Orq.ai migration sentence plus "Designed the *.agents.ts convention that isolates model-dependent tests into a CI lane triggered only when a prompt or agent changes, moved model selection out of environment variables so judging can use an opposing provider, and replaced 24 hand-written MCP tool definitions with a declarative factory the team still generates tools from." Those are the three most differentiating AI-engineering facts on the document, and they are the tail of a seven-line block where a skimmer stops reading at line three. The page break here is clean: Xogito's role line and two bullets on page 1, bullets 3-4 and Tech on page 2. Skills leads with "AI / LLM Engineering". Otherwise identical body.

---

## 2. Verification of the round-2 fix list (section 7 of `stage3-round2-grading.md`)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Reorder HN bullet 6 to lead with the React filter UI; drop "Platform tooling:"; attribute the alert automation to a teammate | **Done (candidate's variant)** | The filter UI is its own bullet 3 ("Built the loan-application product's filter UI in React and the reusable TypeScript query library behind it ..."); "Platform tooling:" is gone; teammate attribution declined by design and replaced with the honest verb "proposed the alert-to-PR automation", which is the story's own wording. Acceptable. |
| 2 | Restore the FullStack Labs context bullet | **Done** | "Full-stack engineer (Node.js, React, PostgreSQL) on a procurement platform rebuilt for a US fiduciary purchasing agent (FF&E/OS&E)." is back as bullet 1. |
| 3 | General summary to seven lines; drop the on-call clause; "handling" not "triaged"; singular Kubernetes migration | **Partial** | On-call clause removed, "handling 57,000+", "a monolith-to-Kubernetes migration": all done, and the one-word widow is gone. Still eight lines at 10pt because the team-size aside was added. See 3.3. |
| 4 | Add "security" to HN bullet 2; "unit and integration tests" to bullet 5 | **Done** | "the replacement security boundary"; "deterministic validation covered by focused unit and integration tests". |
| 5 | Kubesoft compact line: "From Feb 2016 assigned full-time to Rokk3r (above)." | **Done** | Verbatim. |
| 6 | Xogito bullet 1 progression wording; drop the FullStack Labs cross-reference in bullet 4 | **Done** | "First engineer assigned to, then main backend engineer of, ..."; bullet 4 is now "Led the platform's legacy-SAP data migration: ..." with no cross-reference. |
| 7 | Resolve 15 vs 16 services canonically | **Done** | Canonical HN summary and overlay both say 16; matches André Treib's "sixteen-service platform". |
| 8 | Skills: "AWS ECS" after "AWS"; restore "LLMs (Large Language Models)"; carry "LLM Evaluation" as its own canonical skill | **Done** | Canonical array reordered (commit 273f1bd); `llm-evaluation` added with evidence; the `llms` rename removed from the overlay. Both appear on the CV. |
| 9 | Gated: pricing engine / conversational service as a bullet; eval-CI lane or MCP factory on the AI variant | **Done as decided** | Pricing engine and conversational service deliberately off (and out of canonical); eval-CI lane, opposing-provider judging and the 24-tool factory are on the AI variant and in canonical highlight 3, without the "tripled" number. |
| 10 | Phone number | **Declined by candidate** | None. Noted, not scored. |
| 11 | Reorder canonical HN highlights (comms first, PoC last) | **Done** | `highlights[0]` is the communications service, `highlights[5]` the PoC; story-preservation map and tests updated. MCP and web now lead the same way the CV does. |

Regressions relative to round 2, all layout, all caused by the deliberate return to 10pt/0.5in with Xogito allowed to split:
- General variant: Xogito bullet 4 splits mid-sentence with a one-line widow on page 2 (`li { orphans: 2; widows: 2 }` did not hold it; Chrome honours those inconsistently inside list items).
- Both variants: the contact line wraps, stranding "linkedin.com/in/garusis".
- Line-height went from 1.28 to 1.24. At 10pt that is 12.4pt leading, essentially the same leading as round 2's 9.6pt x 1.28 = 12.3pt but with larger glyphs. It looks denser at a glance and is more legible on inspection. Not a problem; leave it.

Nothing regressed in content.

---

## 3. Include / swap / fix

Only what matters. Everything in the full dump that would raise the interview rate is now on the page; I went through every story and every canonical highlight again and the remaining unused material (the vendor-extraction contract investigation, the paternity-leave pivot story, Mutual's prize story, the Belatrix DynamoDB incident, the PM-using-Claude-Code outcome of the Orq.ai migration) is interview material, not CV material. No "include" items this round.

### 3.1 Fix: the Xogito split on the general variant (`render`)

Page 1 ends: "... validated rounding compatibility early with platform users, and needed no". Page 2 begins: "post-migration reconciliation." then "Tech: NestJS, TypeScript, PostgreSQL, Docker, GitLab CI, AWS." then the FullStack Labs heading. The candidate allowed Xogito to split as an entry; that is fine when the split falls between bullets (which is exactly what the AI variant does). A split inside a bullet is not fine. The fix is `li { break-inside: avoid; }` in `apps/web/lib/cv/render-cv-html.ts` (or the `keepTogether`-style class applied to bullets): bullet 4 moves whole to page 2, page 1 ends after bullet 3, page 2 opens with a full sentence. Page 2 of the general variant has roughly two inches free, so both variants stay at two pages. Re-check the AI variant after the change; its break currently falls between bullets 2 and 3 and should not move.

### 3.2 Fix: the contact-line wrap (`cv-overrides` or `render`)

"Cúcuta, Colombia (Remote) · UTC-5, full US-hours overlap · garusis@gmail.com · github.com/garusis · linkedin.com/in/garusis" is a few characters too long at 10pt. Dropping "full " ("UTC-5, US-hours overlap") should bring it back to one line; if it does not, the render can let the contact line sit at 9.5pt without touching body type. Verify in the PDF; it is on the first screen.

### 3.3 Swap (candidate's call): the 62-word first sentence of the general summary (`cv-overrides`)

The facts stay. The packaging is what I would change: "the last four at House Numbers, where I joined an engineering team of three (now seven) and helped take a mortgage-lending platform through a B2C-to-B2B pivot and from a handful of services to a 16-service event-driven monorepo." That drops the em-dash aside and "(excluding design, PM and QA)" (the qualifier lives in the canonical summary and the MCP, where a follow-up question can find it), saves about ten words, and very likely returns the summary to seven lines. If the candidate wants the qualifier on the CV, keep it; the cost is one line and one re-read, not a score point.

### 3.4 Swap: AI variant bullet 2 is a seven-line wall (`cv-overrides`)

Split at the sentence boundary that is already there. Bullet 2 keeps the Orq.ai migration sentence (four lines). New bullet 3: "Designed the team's LLM test and evaluation lane: the *.agents.ts convention that isolates model-dependent tests into a CI lane triggered only when a prompt or agent changes, model selection moved out of environment variables so judging can use an opposing provider, and a declarative factory that replaced 24 hand-written MCP tool definitions and still generates the team's tools." Same facts, same sources, now visible to a skimmer. Page 2 of the AI variant has room for the extra line the bullet break costs; verify the break still falls between Xogito bullets.

### 3.5 Claim check

Every bullet was re-read against its story. Nothing overclaims:
- "letting operations retire its manual-triage shifts": story says "operations no longer needs the old manual-triage shifts". Supported.
- "~70% to an automated outcome" (bullet) and "(~70% automated)" (summary): the story's figure with its "not LLM accuracy" caveat. The bullet's wording is exact; the summary's compression is the kind an interview clarifies in one sentence. Acceptable.
- "I own critical production systems end to end" (summary) vs "Built and maintain" (bullet 1): the canonical highlight says "Built and still owns ... end to end"; André's public line "without ever claiming ownership of it" describes modesty, not a different owner. A reference check survives it.
- "Eliminated failed-upload complaints": story says "borrower complaints about failed uploads stopped." Supported.
- "processors adopted the checks": story says the PM "reported successful results from follow-up interviews". Slightly indirect, accepted in round 2, still acceptable.
- "leading a multi-month, service-by-service migration ... across four services": he implemented two, others applied the pattern to two more; "leading" is the right verb. "shared per-call cost tracing" for a teammate's tracing that he generalised is fair.
- "proposed the alert-to-PR automation": exact.
- AI bullet 2 additions ("*.agents.ts", "opposing provider", "24 hand-written MCP tool definitions"): sourced from André's public recommendation, confirmed by the candidate, no "tripled". Fine.
- Xogito "15+ people onboarded across the two companies": story says "at least 15". "Recovered a frustrated client's account ... about six months; the client went on to commission additional projects": all in the story's results.
- Belatrix "led a four-person team": two developers plus two QA. Fine.
- "16-service": canonical and André agree.

Inconsistencies: none material. The role title reads "Senior Full Stack Engineer" while the headline reads "Senior Full-Stack Engineer"; ATS tokenises both identically. The cowork line "Open-source Python CLI that orchestrates multiple AI coding agents" is a factual description of the project's language, not a skill claim; with Python absent from Skills and the gap statement on the MCP saying "familiarity limited to tooling work", a Python-heavy recruiter gets a consistent answer. Keep it.

ATS: text-layer PDF with embedded Arial, clean `pdftotext` extraction, seven structured positions with full date ranges, a "Skills" block with category labels, "security" now present, "Earlier Experience" still contains the token "Experience" so section parsers pick it up. The Kubesoft/Rokk3r date overlap will make an ATS compute more years than the calendar allows; the "(above)" note handles the human reader, and no parser fix is worth it. No phone field, by choice.

Pagination and readability: line-height acceptable (see section 2). The Xogito split and the header wrap are the only two layout defects, both above.

---

## 4. Scores

Same rubric. Round 2 in parentheses.

| Criterion | General (r2) | Δ | AI (r2) | Δ |
|---|---|---|---|---|
| First-impression clarity | 8 (8) | 0 | 7.5 (7) | +0.5 |
| Evidence of scale and outcomes | 8 (7.5) | +0.5 | 8.5 (8) | +0.5 |
| Claim defensibility | 9 (8.5) | +0.5 | 8.5 (8.5) | 0 |
| ATS keyword coverage | 8.5 (8) | +0.5 | 8.5 (8) | +0.5 |
| Progression visibility | 8.5 (7.5) | +1 | 8.5 (7.5) | +1 |
| Length and layout | 7 (7.5) | -0.5 | 7.5 (7.5) | 0 |
| **Overall** | **8.2 (7.8)** | **+0.4** | **8.2 (7.7)** | **+0.5** |

**General.**
- First impression 8: the React bullet and the 3-to-7 team fact are wins; the 62-word first sentence and the wrapped contact line give them back. Net flat.
- Evidence 8: 16 services, three-to-seven engineers, 57,000+/~70%, two in three, 96 restarts against 0-4, under two weeks, four services, 15+ onboarded, six months, zero data loss, four-person team. The team-size fact answers round 2's first hiring-manager question. Still nothing on users, throughput or uptime, and the dataset has none; that ceiling stands.
- Defensibility 9: the plural "migrations" is now the two real SAP migrations plus a singular Kubernetes one; the alert automation is "proposed"; 15/16 is resolved; every number traces to a story or a public recommendation.
- ATS 8.5: "security", "AWS ECS", "LLM Evaluation", "LLMs" all present; Python correctly absent; no phone.
- Progression 8.5: 2013 game backend, 2015 mobile/web, 2016 Kubernetes and DevOps, 2018 acting technical lead, 2018-2020 US-client senior with an owned migration, 2020 "First engineer assigned to, then main backend engineer of", 2022 joined at three engineers on a platform that grew to 16 services. The arc is now legible in dates and first clauses alone.
- Layout 7: two pages, readable 10pt, page 2 no longer a quarter empty; but a mid-sentence split with a one-line widow at the top of page 2 and a dangling LinkedIn line at the top of page 1.

**AI.**
- First impression 7.5: the hook works and the summary's second sentence is concrete; it still previews bullets 1 and 2 almost verbatim, and the `https://` endpoint line is the one inconsistently styled URL on the page.
- Evidence 8.5: the general set plus a CI lane design, cross-provider judging and a 24-definition factory, all shipped rather than proposed.
- Defensibility 8.5: unchanged; the new facts have a public source and the candidate's confirmation.
- ATS 8.5, progression 8.5: same body as the general variant.
- Layout 7.5: clean page break between Xogito bullets, but bullet 2 is seven lines and the contact line wraps.

**Plain terms.** Forward for a senior full-stack req? Yes, and I would forward it to the hiring manager before fixing anything below; the fixes are polish. For the stakeholder-facing track the Xogito recovery bullet and the client-facing summary line carry it; for the engineering track, the incident, the upload boundary and the Orq.ai retirement do. The AI variant goes to AI-platform and applied-LLM full-stack reqs; neither goes to an ML-research req.

The hiring manager's first follow-up question, now that team size is on the page: "Seven engineers and sixteen services: which of those services are yours today, and roughly what share of your week is the React side?" The CV establishes that he owns the communications service and touches the loan-application frontend; it cannot tell the HM how the other fourteen services are split, and the dataset does not hold that either. It is a good question to get, because every answer to it is in the stories.

---

## 5. Remaining fix list

The document is ready to ship. Items 1 and 2 are worth a PDF regeneration before the first send; 3 to 6 are nits.

1. **Stop bullets splitting across pages**: `li { break-inside: avoid; }` (or a per-bullet keep-together class) in `apps/web/lib/cv/render-cv-html.ts`; regenerate; confirm the general variant's page 1 now ends after Xogito bullet 3 and both variants stay at two pages. `render`
2. **Contact line back to one line at 10pt**: change `timezoneLine` to "UTC-5, US-hours overlap" and verify; if it still wraps, let the render size the contact line at 9.5pt. `cv-overrides` / `render`
3. **AI variant: split bullet 2** at the existing sentence boundary so the *.agents.ts lane, opposing-provider judging and the MCP tool factory are their own bullet (wording in 3.4). `cv-overrides`
4. **General summary, candidate's call**: rephrase the first sentence's aside as "where I joined an engineering team of three (now seven)" and drop "(excluding design, PM and QA)" from the CV copy only; the canonical summary keeps the qualifier. Likely returns the summary to seven lines. `cv-overrides`
5. **AI variant summary**: it never states the 3-to-7 team or 16-service scale that the general summary does; if a clause fits without an eighth line ("on a 16-service mortgage-lending platform"), add it. Optional. `cv-overrides`
6. **AI header endpoint URL**: render "hire-me-mcp-web.vercel.app/api/mcp" without the scheme for consistency with every other URL on the page, or keep the scheme deliberately for copy-paste into an MCP client; either is fine, pick one. `render`

Do not touch type size, margins or line-height again; 10pt/0.5in/1.24 is readable and the candidate has decided it.

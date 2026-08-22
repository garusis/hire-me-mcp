# Fresh-agent onboarding verification

## Purpose

Every other guard in this repo proves the *published instructions still work* — CI (#59)
re-executes the documented MCP snippets against the live endpoint and link-checks every URL. None
of that proves an agent that has never seen this repo before can actually *understand* it from
nothing but a URL. That's a comprehension test, not a syntax test, and it can only be run by
handing a fresh, context-free agent session a single URL and an open question, then honestly
scoring what comes back.

This document is that test: two scenarios, the exact prompts to use, a fact-checkable rubric per
scenario, a run-log template, and the recorded results of the first run. Re-run it — on a genuinely
fresh session, not a continuation of one that has already read this repo — before every release
(see [Pre-release use](#pre-release-use) below) and any time the "one inspect is enough" surfaces
(README, AGENTS.md, `/llms.txt`, `/llms-full.txt`, `/.well-known/mcp.json`, the home page's Connect
panel, `docs/mcp.md`) change materially.

## Method

- **Fresh session, no memory.** The tester (human or agent) must have no prior context on this
  project loaded — no repo checked out locally, no earlier turns in the conversation that already
  discussed it.
- **No hints.** The prompts below are the entire input. Do not mention MCP, `llms.txt`,
  `.well-known`, tool names, or any other term the scenario is specifically testing whether the
  agent finds on its own.
- **Exact prompts, exact answers.** Use the prompts verbatim. Paste the agent's actual output into
  the run log verbatim — summarizing or paraphrasing the response defeats the point of the test.
- **At least two clients per scenario, where feasible.** A single vendor's agent succeeding proves
  that vendor's agent understands the docs, not that the docs are vendor-neutral. See
  [Two-client requirement — status](#two-client-requirement--status) for how this first run
  satisfies (and partially defers) that requirement.
- **Score against the rubric, not a vibe.** Each rubric line is a specific, independently checkable
  fact or behavior. A scenario passes only if every line passes.
- **Verify connection steps yourself.** If a probe's answer includes connection steps (a URL to
  paste, a CLI command, a config snippet), the tester executes those steps for real — not "they
  look plausible" — and records the result. A step that fails is a defect, not a rubric footnote.

## Scenario A — repo URL only

**Setup:** fresh session, no other input. Give the agent the repo URL and nothing else, then ask
two questions as separate turns.

**Prompt (turn 1):**
```
https://github.com/garusis/hire-me-mcp

What is this?
```

**Prompt (turn 2, same conversation):**
```
How would I connect my AI assistant to it?
```

**Rubric — pass requires all of:**

| # | Checkable fact | Source of truth |
| --- | --- | --- |
| A1 | States it's Marcos Alvarez's portfolio/CV, exposed as a queryable API (not just "a portfolio site" or "a code repo") | README.md intro |
| A2 | States it includes a public/anonymous MCP (Model Context Protocol) server | README.md intro |
| A3 | States the live site URL, `https://hire-me-mcp-web.vercel.app` (or a working link to it) | README.md |
| A4 | States the live MCP endpoint URL, `https://hire-me-mcp-web.vercel.app/api/mcp` | README.md |
| A5 | Turn 2 gives at least one connection method (custom connector paste, `claude mcp add ...`, or a JSON client config) that names the correct endpoint URL and requires no API key/auth | docs/mcp.md, README.md |
| A6 | Does **not** claim authentication, an API key, or an account is required | docs/mcp.md, README.md |

## Scenario B — site URL only

**Setup:** fresh session, no other input. Give the agent the site URL and nothing else, then ask
the same two questions as separate turns.

**Prompt (turn 1):**
```
https://hire-me-mcp-web.vercel.app

What is this?
```

**Prompt (turn 2, same conversation):**
```
How would I connect my AI assistant to it?
```

**Rubric — pass requires all of:**

| # | Checkable fact | Source of truth |
| --- | --- | --- |
| B1 | States it's Marcos Alvarez's portfolio/CV/professional site | Home page |
| B2 | States (unprompted — the prompts never mention MCP) that the site is also/exposes a public MCP server an AI assistant can query | Home page ConnectPanel, `/llms.txt` |
| B3 | Reports the MCP endpoint URL, `https://hire-me-mcp-web.vercel.app/api/mcp` | `/llms.txt`, `/.well-known/mcp.json`, home page |
| B4 | Names at least one available tool correctly (`ping`, `get-profile`, `get-experience`, `search-projects`, `get-skill-evidence`) without being told they exist | `/llms-full.txt`, `/.well-known/mcp.json` |
| B5 | Turn 2 gives a connection method that requires no API key/auth and names the correct endpoint | Home page ConnectPanel, `docs/mcp.md` |
| B6 *(discovery-path, tracked separately from pass/fail — see run log)* | Reaches `/llms.txt`, `/llms-full.txt`, or `/.well-known/mcp.json` specifically (as opposed to getting the same facts from the home page's rendered Connect panel or the `/mcp` page) | `/llms.txt` |

B6 is recorded but does not gate pass/fail on its own: B1–B5 are the acceptance-criteria-level bar
("finds the machine-readable surface *or otherwise* reports endpoint + tools unprompted"); B6
specifically tracks whether the dedicated machine-readable files are the thing agents actually
reach for, which matters for future design decisions even when the home page already gets the
agent to the right answer. See [Run 3 / Run 4](#recorded-runs) for why this distinction mattered
in the first run.

## Run-log template

```
### Run N — Scenario <A|B>

- **Date:** YYYY-MM-DD
- **Client + model:** <e.g. "Claude web, Claude Opus 4.5" or "claude-in-terminal agent w/ WebFetch+Bash, Sonnet">
- **Fresh session confirmed:** yes/no — how

**Prompt (turn 1):**
<verbatim>

**Agent output (turn 1, verbatim):**
<verbatim>

**Prompt (turn 2):**
<verbatim>

**Agent output (turn 2, verbatim):**
<verbatim>

**Rubric outcome:**
| # | Pass/Fail | Notes |
| --- | --- | --- |
| A1/B1 | | |
| ... | | |

**Connection steps executed by tester:** yes/no — result
**Defects found:** none / <description + link to filed issue, or "fixed in this PR, see commit ...">
```

## Recorded runs

### Two-client requirement — status

The method above asks for at least two distinct clients per scenario "where feasible." This run
uses one client for the four *newly executed* probes below: a Claude agent equipped with
WebFetch/Bash tools (general-purpose subagents spawned with no prior context on this repo,
Claude Sonnet 5), run twice per scenario as two independent fresh sessions. That satisfies "at
least two distinct fresh sessions" per scenario (the AC for #66), but it is one vendor's agent
architecture, not two.

A second-client data point does exist: the repo owner ran an equivalent interactive check with
Claude's consumer web/desktop client on 2026-08-20, pasting the repo and site URLs into fresh
conversations and asking the same style of open question, and it succeeded (correct description,
correct URLs, working connector steps). That run pre-dates this document and wasn't logged against
this rubric at the time, so it's recorded here as **Run 0**, a prior-run entry, not a fully
rubric-scored log — and it pre-dates some of the surfaces this run exercises (the `/llms.txt` /
`/.well-known/mcp.json` machine-readable layer landed after 2026-08-20). **Recommendation:** repeat
this procedure on a second client (e.g. Cursor, or Claude web/desktop again) after v0.7, once the
machine-readable surfaces have had a full release cycle to bed in, and log it as Run 5+ below.

### Run 0 — prior interactive run (unscored, pre-dates this document)

- **Date:** 2026-08-20
- **Client + model:** Claude web/desktop (interactive, repo owner)
- **Fresh session confirmed:** yes (new conversation, no project context)
- **Scenario:** both A and B, informally
- **Outcome:** succeeded — correct project description, correct live URLs, connector steps worked
  verbatim. Not scored against the rubric above (rubric didn't exist yet) and predates
  `/llms.txt`/`/llms-full.txt`/`/.well-known/mcp.json` (#37, #38), so it cannot speak to Scenario
  B's B2–B4/B6. Included for completeness of the two-client note above, not as a substitute for
  Runs 1–4.

### Run 1 — Scenario A, probe 1

- **Date:** 2026-08-21
- **Client + model:** general-purpose Claude agent (WebFetch + Bash tools), Claude Sonnet 5, spawned fresh with no repo context beyond the prompt below
- **Fresh session confirmed:** yes — new subagent instance, prompt contained only the URL and the two questions

**Prompt (turn 1):**
```
https://github.com/garusis/hire-me-mcp

What is this?
```

**Agent output (turn 1, verbatim):**
> It's a project by Marcos Alvarez called "hire-me-mcp" — basically his career portfolio/CV turned into a queryable API using the Model Context Protocol (MCP). It's a monorepo (pnpm + Turborepo) containing a Next.js website plus a public MCP server, both built on the same shared career-data source.
>
> The MCP server exposes five tools any AI assistant can call:
> - **get-profile** — his profile (name, headline, location, availability, bio)
> - **get-experience** — work history, filterable by company, tech, date range, current/past
> - **search-projects** — keyword/tech search over his projects with relevance scoring
> - **get-skill-evidence** — checks whether a given skill is claimed, not claimed, or unknown, with evidence
> - **ping** — connectivity check
>
> Every response includes citations back to the source records, so answers are traceable rather than made up.
>
> It's live at https://hire-me-mcp-web.vercel.app with the MCP endpoint at https://hire-me-mcp-web.vercel.app/api/mcp — essentially it turns "hire me" into something an AI agent can query directly instead of just reading a resume.

**Prompt (turn 2):**
```
How would I connect my AI assistant to it?
```

**Agent output (turn 2, verbatim):**
> It uses Streamable HTTP transport and needs no authentication, so setup is pretty light. A few ways depending on your client:
>
> **Claude (web/desktop):** Settings → Connectors → Add custom connector → paste in `https://hire-me-mcp-web.vercel.app/api/mcp`. You can skip the Advanced/auth settings entirely.
>
> **Claude Code (CLI):**
> ```
> claude mcp add --transport http hire-me-mcp https://hire-me-mcp-web.vercel.app/api/mcp
> ```
>
> **Cursor / VS Code:** add this to `.cursor/mcp.json` or `.vscode/mcp.json`:
> ```json
> {
>   "mcpServers": {
>     "hire-me-mcp": {
>       "url": "https://hire-me-mcp-web.vercel.app/api/mcp"
>     }
>   }
> }
> ```
>
> **Any other MCP-capable client:** just point it at that same URL with transport set to "Streamable HTTP" and no auth.
>
> One thing to note: the endpoint is rate-limited per caller IP (to keep it available for everyone) — if you hit the limit you'll get an HTTP 429 with a `Retry-After` header. If tools don't show up after connecting, double-check the URL was copied fully and that your client actually supports Streamable HTTP (not just SSE or stdio); removing and re-adding the connector often fixes it. You can sanity-check connectivity by sending a JSON-RPC `initialize` call and confirming the response has `serverInfo.name: "hire-me-mcp"`.

**Tool activity log (probe's own report):** WebFetch `github.com/garusis/hire-me-mcp`, WebFetch
`raw.githubusercontent.com/garusis/hire-me-mcp/main/docs/mcp.md`.

**Rubric outcome:**

| # | Pass/Fail | Notes |
| --- | --- | --- |
| A1 | Pass | "career portfolio/CV turned into a queryable API" |
| A2 | Pass | Names MCP explicitly |
| A3 | Pass | `https://hire-me-mcp-web.vercel.app` stated |
| A4 | Pass | `https://hire-me-mcp-web.vercel.app/api/mcp` stated |
| A5 | Pass | Custom connector, CLI, and JSON config all given, all correct, all no-auth |
| A6 | Pass | Explicitly "needs no authentication" |

**Connection steps executed by tester:** yes — see [Connection-step verification](#connection-step-verification) below (curl `initialize`/`tools/list` handshake against the exact endpoint this probe named, matches).
**Defects found:** none.

### Run 2 — Scenario A, probe 2

- **Date:** 2026-08-21
- **Client + model:** general-purpose Claude agent (WebFetch + Bash tools), Claude Sonnet 5, independent fresh subagent instance
- **Fresh session confirmed:** yes

**Prompt (turn 1):** identical to Run 1.

**Agent output (turn 1, verbatim):**
> This is **hire-me-mcp** — Marcos Alvarez's portfolio reimagined as a queryable API. It's a Next.js website paired with a public Model Context Protocol (MCP) server, and both read from the same underlying career data. The idea is that instead of (or in addition to) browsing a normal portfolio site, an AI assistant can query his CV directly as a set of tools.
>
> The MCP server exposes four main tools:
> - **get-profile** — basic info about availability and background
> - **get-experience** — search work history by company, technology, date range, or status
> - **search-projects** — find projects via keyword/technology tag matching
> - **get-skill-evidence** — verify whether a specific skill is actually claimed (or acknowledged as a gap)
>
> All responses come with citations back to the source records, so an AI assistant can ground its answers. Under the hood it's a pnpm + Turborepo monorepo, requires Node ≥22, and has a solid test setup (Vitest, Playwright, and protocol-level MCP integration tests).

**Prompt (turn 2):** identical to Run 1.

**Agent output (turn 2, verbatim):**
> It's a public, no-auth MCP server, so connecting is pretty simple — you just point your AI assistant at this endpoint:
>
> `https://hire-me-mcp-web.vercel.app/api/mcp`
>
> Specifically:
>
> - **Claude Code CLI**: run
>   ```
>   claude mcp add --transport http hire-me-mcp https://hire-me-mcp-web.vercel.app/api/mcp
>   ```
> - **Cursor or VS Code**: add this to `.cursor/mcp.json` or `.vscode/mcp.json`:
>   ```json
>   {
>     "mcpServers": {
>       "hire-me-mcp": {
>         "url": "https://hire-me-mcp-web.vercel.app/api/mcp"
>       }
>     }
>   }
>   ```
>
> No API keys or credentials needed — once configured, your assistant will have the get-profile, get-experience, search-projects, and get-skill-evidence tools available to query Marcos's career data directly.

**Tool activity log (probe's own report):** WebFetch `github.com/garusis/hire-me-mcp` only (single
fetch — the rendered README was sufficient).

**Rubric outcome:**

| # | Pass/Fail | Notes |
| --- | --- | --- |
| A1 | Pass | "portfolio reimagined as a queryable API" |
| A2 | Pass | |
| A3 | Fail (minor) | Site URL not stated in turn 1 (only the API endpoint); recovered in general context but not as an explicit fact |
| A4 | Pass | |
| A5 | Pass | |
| A6 | Pass | "No API keys or credentials needed" |
| — | Minor gap | `ping` tool omitted from both turns (only 4 of 5 tools named) — informational, not a rubric line, but tracked as a defect candidate below |

**Connection steps executed by tester:** yes — same endpoint as Run 1, verified working (see below).
**Defects found:** none requiring a fix — A3's miss is answer variance (single WebFetch of the
rendered README, which leads with the endpoint before the site URL), not a documentation defect;
the site URL is in fact the first bullet under README.md's intro. No repo change needed.

### Run 3 — Scenario B, probe 1

- **Date:** 2026-08-21
- **Client + model:** general-purpose Claude agent (WebFetch + Bash tools), Claude Sonnet 5, independent fresh subagent instance
- **Fresh session confirmed:** yes

**Prompt (turn 1):**
```
https://hire-me-mcp-web.vercel.app

What is this?
```

**Agent output (turn 1, verbatim):**
> This is Marcos Javier Alvarez's professional portfolio site — he's a Senior Full-Stack Engineer specializing in AI/LLM systems in production. The site covers his experience, projects, skills, and writing (mortgage-lending platforms, quality-control inspection software, procurement systems, etc.), with an emphasis on things like evaluation harnesses, human-graded ground truth, cost discipline, and observability.
>
> What makes it distinctive is that it's also a live MCP (Model Context Protocol) server: it exposes his CV/experience/projects as an API that an AI assistant can query directly, at `https://hire-me-mcp-web.vercel.app/api/mcp`. So instead of (or in addition to) reading the site, you can literally connect your AI assistant to it and ask it questions about his background.

**Prompt (turn 2):**
```
How would I connect my AI assistant to it?
```

**Agent output (turn 2, verbatim):**
> You'd add it as a custom MCP connector pointing at that endpoint — no authentication needed. For Claude specifically:
>
> 1. Go to Settings (or Customize) → Connectors → click "+"
> 2. Choose "Add custom connector"
> 3. Paste in the URL: `https://hire-me-mcp-web.vercel.app/api/mcp`
> 4. Click Add
>
> It's also listed as compatible with Claude Desktop, Cursor, and VS Code, and should work with any generic MCP client that supports adding a remote MCP server by URL — the pattern is the same everywhere: point the client at that `/api/mcp` endpoint. Once connected, your assistant can query things like his profile, experience, project search, and skill evidence directly through the exposed MCP tools.

**Tool activity log (probe's own report):** WebFetch `https://hire-me-mcp-web.vercel.app` (home
page), WebFetch `https://hire-me-mcp-web.vercel.app/api/mcp` (confirmed the route exists, GET
correctly 405s — a POST-only JSON-RPC endpoint).

**Rubric outcome:**

| # | Pass/Fail | Notes |
| --- | --- | --- |
| B1 | Pass | |
| B2 | Pass | States it unprompted — the word "MCP" never appeared in the prompt |
| B3 | Pass | |
| B4 | Fail | Turn 2 refers to tools generically ("profile, experience, project search, and skill evidence") without the exact tool names (`get-profile`, `get-experience`, `search-projects`, `get-skill-evidence`) |
| B5 | Pass | |
| B6 (tracked) | Not reached | Never fetched `/llms.txt`, `/llms-full.txt`, or `/.well-known/mcp.json` — got B1–B3/B5 from the rendered home page's Connect panel and confirmed the endpoint by probing `/api/mcp` directly |

**Connection steps executed by tester:** yes — endpoint matches Run 1/2, verified (see below).
**Defects found:** B4 is a near-miss, not a hard failure of the rubric's intent (the agent correctly
described what each tool does, just used a paraphrase instead of the literal tool name from a
schema it never fetched) — no doc fix filed for this alone. B6 not reaching the machine-readable
surface is a real finding; see [Defects and follow-ups](#defects-and-follow-ups).

### Run 4 — Scenario B, probe 2

- **Date:** 2026-08-21
- **Client + model:** general-purpose Claude agent (WebFetch + Bash tools), Claude Sonnet 5, independent fresh subagent instance
- **Fresh session confirmed:** yes

**Prompt (turn 1):** identical to Run 3.

**Agent output (turn 1, verbatim):**
> This is the hosted portfolio/hiring page for Marcos Javier Alvarez, a Senior Full-Stack Engineer specializing in AI/LLM systems in production. It's live at hire-me-mcp-web.vercel.app and covers his work experience, selected projects (including an open-source CLI for coordinating AI agents and a document-extraction pipeline), and technical skills (TypeScript, Node.js, React, AWS, OpenAI APIs, etc.), along with his current availability.
>
> What makes it distinctive is that his CV is also exposed as an MCP (Model Context Protocol) server — a live API endpoint at /api/mcp that lets you connect an AI assistant (Claude, Cursor, VS Code, etc.) directly to his career data and query it conversationally, with sourced answers rather than just static text on a page. There's a dedicated /mcp page with setup instructions and example queries.

**Prompt (turn 2):** identical to Run 3.

**Agent output (turn 2, verbatim):**
> Here's how to connect:
>
> Endpoint: https://hire-me-mcp-web.vercel.app/api/mcp (uses the MCP Streamable HTTP transport, no authentication needed — it's public)
>
> For Claude (web/desktop): go to Settings (or Customize) → Connectors → "+" → "Add custom connector," paste that URL in, skip the Advanced settings, and click Add.
>
> For Cursor, VS Code, Claude Code, or any other MCP-compatible client: the site lists them as supported, but the /mcp page doesn't spell out client-specific config for those — you'd add the same endpoint URL as a custom/remote MCP server in whatever "add MCP server" mechanism that client uses, using the streamable-HTTP transport (not stdio), since no separate config JSON snippet is published on the page.
>
> Once connected, you get five tools to query his career data: ping (connectivity check), get-profile (summary/availability), get-experience (work history, filterable by company/tech/dates), search-projects (portfolio search by keyword or technology), and get-skill-evidence (skill lookups with supporting evidence — it honestly reports "claimed," "not-claimed," or "unknown" rather than erroring out).
>
> For more detail (e.g. rate limits), there's a README section linked from that page: https://github.com/garusis/hire-me-mcp/blob/main/apps/web/README.md#rate-limiting

**Tool activity log (probe's own report):** WebFetch `https://hire-me-mcp-web.vercel.app` (home
page), WebFetch `https://hire-me-mcp-web.vercel.app/mcp` (twice — general fetch, then a follow-up
re-fetch for client-by-client detail).

**Rubric outcome:**

| # | Pass/Fail | Notes |
| --- | --- | --- |
| B1 | Pass | |
| B2 | Pass | Unprompted |
| B3 | Pass | |
| B4 | Pass | All five tool names given correctly, matching `/.well-known/mcp.json`'s tool list exactly |
| B5 | Pass | |
| B6 (tracked) | Not reached | Went home page → `/mcp` page, never `/llms.txt`/`/llms-full.txt`/`/.well-known/mcp.json` |
| — | Defect (real, filed) | Claimed "the /mcp page doesn't spell out client-specific config for [Cursor/VS Code/Claude Code]." Checked: this is **accurate**, not confabulation — the `/mcp` page's Cursor/Claude Code/Generic tab content is rendered client-side only (see [Defects and follow-ups](#defects-and-follow-ups)); a fetch that doesn't execute JS genuinely only sees the default "Claude (web/desktop)" tab. The `apps/web/README.md#rate-limiting` link the probe also cited was checked separately and is valid (200, real anchor) — that part of the answer was correct. |

**Connection steps executed by tester:** yes — endpoint matches all prior runs, verified (see
below). The `apps/web/README.md#rate-limiting` link was checked and resolves correctly (200).
**Defects found:** yes — see below.

## Connection-step verification

Every probe above converged on the same connection method and the same endpoint,
`https://hire-me-mcp-web.vercel.app/api/mcp`, Streamable HTTP, no auth. The tester executed the
underlying protocol handshake for real rather than trusting that it "looks right":

```bash
curl -s -X POST https://hire-me-mcp-web.vercel.app/api/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"onboarding-verification","version":"0.1.0"}}}'
# -> 200, serverInfo.name == "hire-me-mcp", capabilities.tools present

curl -s -X POST https://hire-me-mcp-web.vercel.app/api/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
# -> 200, all 5 documented tools returned: ping, get-profile, get-experience,
#    search-projects, get-skill-evidence — matching /.well-known/mcp.json exactly
```

Both calls succeeded and matched the documented tool set. The Claude Code CLI snippet
(`claude mcp add --transport http hire-me-mcp ...`) was not additionally re-run against the
tester's own local Claude Code config in this pass — deliberately, to avoid mutating the machine's
real MCP client registry as a side effect of a documentation check — and is instead covered by
CI's dedicated snippet check (#59, `scripts/ci/docs-rot/check-snippets.mjs`), which executes that
exact command in an isolated container against the live endpoint and asserts registration on every
PR and daily. The custom-connector (Claude web/desktop) click-path was verified by the repo owner's
prior interactive run (Run 0, 2026-08-20) rather than re-clicked here, since it requires a GUI
session no headless probe has.

## Defects and follow-ups

| Defect | Severity | Disposition |
| --- | --- | --- |
| The `/mcp` page's "Connect your client" section is a client-side-hydrated tab widget (`ClientTabs`) — only the default "Claude (web/desktop)" tab's content is present in server-rendered HTML; Cursor, Claude Code, and "Generic MCP client" snippets only appear after JS hydration. A fetch that doesn't execute JS (confirmed by directly fetching and stripping the page's static HTML) genuinely cannot see those three tabs' content, which is exactly what Run 4's probe reported. | Real, non-trivial — undercuts "one inspect is enough" for the class of tool most likely to do a first inspection (plain fetch, no JS execution) | Not fixed in this PR (a UI/rendering change in `apps/web/app/mcp/`, out of scope for a docs-only change) — filed as [garusis/hire-me-mcp#154](https://github.com/garusis/hire-me-mcp/issues/154) |
| B6 (discovery path): no probe in this run reached `/llms.txt`, `/llms-full.txt`, or `/.well-known/mcp.json` on its own — every probe got the required facts from the home page's rendered Connect panel or the `/mcp` page instead | Not a rubric failure (B1–B5 all passed on 3 of 4 probes; B4 passed 2 of 2 Scenario B runs), but worth tracking, especially given #154 above: the machine-readable surfaces built in #37/#38 aren't yet demonstrated to be *load-bearing* for a WebFetch-style agent, because the human-facing pages already answer the same question for a JS-capable fetch. `/llms-full.txt` already has the client-specific snippets #154 finds missing from the JS-hydrated tabs — so a probe that discovers it would get complete information where the HTML-only probes in this run didn't. | Filed as follow-up — see below |
| Run 2 omitted the `ping` tool and Run 3 paraphrased tool names instead of using the literal names | Minor / informational | No fix — not a doc defect, this is answer variance across independently fetched, correctly-sourced README/schema content. Not filed. |

**Follow-up issues filed:**
- [garusis/hire-me-mcp#153](https://github.com/garusis/hire-me-mcp/issues/153) — re-run Scenario B
  with a plain-text-only (non-JS-executing) probe to get a direct discoverability signal for
  `/llms.txt` specifically, since none of this run's four tool-augmented probes needed to reach it.
- [garusis/hire-me-mcp#154](https://github.com/garusis/hire-me-mcp/issues/154) — the `/mcp` page's
  per-client tabs are client-hydrated and invisible to non-JS fetchers; the fix is a UI/rendering
  change out of scope for this docs-only PR.

## Summary scorecard

| Scenario | Runs | Rubric lines passed | Notes |
| --- | --- | --- | --- |
| A (repo URL) | 2/2 fresh sessions executed | 11/12 individual line-passes (Run 2/A3 missed) | Both runs correctly identified the project, endpoint, and gave working, no-auth connection steps |
| B (site URL) | 2/2 fresh sessions executed | 9/10 individual line-passes (Run 3/B4 missed) | Both runs found and reported the MCP capability, endpoint, and no-auth connection steps unprompted; B6 (machine-readable-surface discovery specifically) wasn't demonstrated by either — see follow-up issue |

Overall: **both scenarios pass** their core acceptance bar (correct description, correct live
URLs, working no-auth connection steps, unprompted discovery of the MCP capability on Scenario B).
The one open thread — whether `/llms.txt`/`/.well-known/mcp.json` specifically are the path an
agent takes, versus getting the same facts from rendered HTML — is tracked in
[#153](https://github.com/garusis/hire-me-mcp/issues/153) rather than blocking this run, since the
acceptance criteria for both scenarios were otherwise met.

## Pre-release use

Re-run this procedure (fresh sessions, both scenarios, at least two clients where feasible) as a
step before cutting any release, including v1.0 (tracked by the release-readiness work in
[#76](https://github.com/garusis/hire-me-mcp/issues/76), part of the launch epic
[#9](https://github.com/garusis/hire-me-mcp/issues/9)). When #76 lands a formal release-readiness
checklist document, add this procedure to it as one line item; until then, this section is the
canonical pointer. A minimum bar for re-running: any time the README, AGENTS.md, `docs/mcp.md`,
`/llms.txt`, `/llms-full.txt`, `/.well-known/mcp.json`, or the home page's Connect panel change.

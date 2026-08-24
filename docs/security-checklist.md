# Security review checklist (#57)

A one-time security pass over the v1.0 public surface — an anonymous public MCP endpoint
(`/api/mcp`), an LLM chat endpoint (`/api/chat`), a semantic-search path (`search-career`), and the
static site. Everything is unauthenticated, so abuse control is rate limiting plus input
validation, not auth. This file is the reproducible record: what was checked, what was found, what
was fixed, what was accepted and why, and how to re-run each check. Update it whenever any of the
four areas below changes materially.

## 1. Dependency / supply-chain audit

**Checked**: `pnpm audit` across the whole workspace (767 dependencies), plus GitHub-native
scanning.

**Found and fixed** (`f8d22d7`):
- `next` 15.3.9 → 15.5.23, resolving every Next.js high/moderate advisory current at review time
  (DoS via Server Actions, Turbopack middleware/proxy bypass, SSRF via rewrites and custom-server
  Server Actions, cache-confusion response-body issues, image-optimization DoS, internal
  Server Function endpoint disclosure, unbounded Edge Server Action payload).
- pnpm overrides added for transitive advisories: `postcss >=8.5.23`, `uuid@<11.1.1 -> >=11.1.1`,
  `tmp >=0.2.6`, `sharp >=0.35.0`.
- Result: 35 advisories → 1.

**Accepted, with rationale and expiry**:

| Advisory | Package | Path | Severity | Why accepted | Expiry |
| --- | --- | --- | --- | --- | --- |
| [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) (CVE-2026-56876) — unvalidated symlink path traversal on zip extraction | `extract-zip` 2.0.1 | `@lhci/cli > lighthouse > puppeteer-core > @puppeteer/browsers > extract-zip` | High (CVSS 8.1) | No patched version exists (`patched_versions: <0.0.0`) — nothing to upgrade to. Dev-only: reached exclusively through `@lhci/cli`'s Puppeteer/Chromium downloader, used only by the `pnpm lighthouse` CI job against this repo's own build output — never a runtime dependency, never processes a zip from an untrusted source (the archives it extracts are Chromium builds from Google's own CDN, fetched by Puppeteer's own downloader, not attacker-influenced). | Re-check on every `pnpm audit` CI run (below) — a fix landing removes it automatically since the CI step only ignores *unfixable* advisories, not this specific one by ID. Re-triage manually if `@lhci/cli`/Lighthouse is ever pointed at untrusted zip input. |

**Automated scanning enabled** (`8d8671e`, verified via `gh api` on the repo):
- Dependabot alerts (`vulnerability-alerts`) — on.
- Dependabot security updates (`automated-security-fixes`) — on.
- Secret scanning + push protection — on (public-repo default, pre-existing).
- `.github/dependabot.yml` — weekly version-update PRs across every pnpm workspace package
  (`apps/web`, `packages/*`, root) and GitHub Actions.

**Wired into CI**: `pnpm run audit` (root `package.json`) runs
`pnpm audit --audit-level=high --ignore-unfixable` as a step in the `quality` job
(`.github/workflows/ci.yml`) on every PR and push to `main`. `--ignore-unfixable` only skips
advisories with no published fix at all (currently the one row above) — a new *fixable*
high/critical advisory fails the build. `--audit-level=high` mutes low/moderate noise; re-run
locally with `pnpm audit` (no flags) for the full report including moderate/low findings.

**Re-run**: `pnpm run audit` from the repo root. Full report (including the accepted advisory):
`pnpm audit`.

### Dependabot PR #183 triage

`build(deps): bump next from 15.3.9 to 15.5.21` — **superseded, recommend closing, do not merge**.
This branch already carries `next@15.5.23` (`f8d22d7`, above), newer than PR #183's target
(15.5.21) and covering every advisory PR #183 was opened for. All of PR #183's checks are green,
but merging it after this PR lands would attempt to downgrade `next`; Dependabot will detect the
version is already satisfied and auto-close or need a manual close once this branch merges to
`main`. No action needed beyond closing it (not done by this PR — left for the repo owner per
task instructions not to merge/close dependency PRs from this review).

## 2. Secrets hygiene

**Checked**:
- Full git history (`git log --all -p`, every branch/ref, not just `main`) grepped for the key
  shapes named in the review scope: `AIza…` (Google API keys), `AQ\.…` (some OAuth token shapes),
  `re_…` (Resend API keys), `npg_…` (Neon Postgres passwords), `sk-…` (OpenAI/Anthropic-style
  secret keys), `postgres://user:pass@…` (embedded DB credentials). **Zero matches.**
- The specific concern raised for this review — a Neon `DATABASE_URL` password possibly pasted
  into issue/PR text during the #14-era (Neon pgvector) work — checked directly: every issue body,
  every issue comment, every PR review comment in `garusis/hire-me-mcp` fetched via the GitHub API
  and grepped for `postgres://` / `npg_`. **Zero matches.** No rotation action needed.
- A Resend API key (`re_…`) was also specifically checked for, since `packages/core/src/contact/`
  (below) suggested an email-sending integration might once have existed. **Never found in
  history.** `apps/web/app/privacy/privacy-content.test.ts` confirms Resend was cut before
  integration (#81 decision — the privacy page deliberately does not name it as a third party).
  No key was ever provisioned or committed; no rotation needed.
- Working tree: same patterns, plus a scan for any live-looking value assigned to an env var name.
  Every `postgres://user:pass@…`-shaped string in the tree is a test fixture (`packages/core/src/db/*.test.ts`,
  `packages/agent/src/tools/search-career-client.test.ts`, `apps/web/lib/mcp/tools/search-career.test.ts`)
  using the literal placeholder `user`/`pass`/`secret-password`, never a real credential.
- `.env.example` (repo root): every entry is commented out with an empty `NAME=` placeholder or
  pure documentation — no value present for any of `UPSTASH_REDIS_REST_URL/TOKEN`,
  `RATELIMIT_*`, `CHAT_*`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`,
  `NEON_API_KEY`/`NEON_PROJECT_ID`, `CRON_SECRET`, `STATS_SECRET`, `SITE_URL`.
- `NEXT_PUBLIC_*` audit: `grep -rn "NEXT_PUBLIC_" apps/web` (excluding `node_modules`/`.next`)
  returns **zero matches** — this codebase defines no `NEXT_PUBLIC_*` variable at all, so nothing
  server-only can leak into the client bundle through that mechanism. If a future feature needs
  one, add it to this list with an explicit non-sensitivity justification.
- Production error/log hygiene: asserted by tests, not just read.
  - `apps/web/mcp-e2e/fuzz.spec.ts`'s `LEAK_PATTERNS` (`assertNoLeak`) fails any MCP response
    containing a JS stack frame, an absolute `/Users/`/`/home/` path, `node_modules`, or the
    literal names `DATABASE_URL`, `UPSTASH_REDIS_REST_TOKEN`, `GOOGLE_GENERATIVE_AI_API_KEY`,
    `ANTHROPIC_API_KEY`, `CRON_SECRET`, `STATS_SECRET`, or a `postgres://` URI — checked on every
    hostile-input case in the suite (see §3).
  - `apps/web/app/api/chat/handler.test.ts` — `"returns a 400 with a typed error payload and no
    stack trace for an invalid request"` and the provider-error/step-limit tests assert the chat
    stream's error envelope is a fixed, closed-set error code (`apps/web/lib/chat/error-codes.ts`)
    plus a short message, never a raw exception.

**Found**: no committed secret, in the working tree or anywhere in git history on any branch; no
`NEXT_PUBLIC_*` variable exists to audit; `.env.example` is placeholder-only.

**Dormant code note (not a secret, flagged for scope-of-trust)**: `packages/core/src/contact/`
(from #168) implements a contact-submission domain service — Zod validation, spam heuristics,
normalization — but is **not wired to any route or MCP tool**. It has no live attack surface today
(no way for an external caller to reach it) and needs no rate-limit/secret handling review yet.
**Accepted as dormant** until an epic actually mounts it behind a route; when that happens, this
review's rate-limiting and fuzzing bar (§3, §4) applies to that new endpoint before it ships, and
this checklist should be re-run for it specifically. No expiry — this is a standing note, not an
accepted risk with a clock.

**Re-run**:
```bash
# Full-history key-shape scan (any branch/ref)
git log --all -p | grep -E 'AIza[0-9A-Za-z_-]{20,}|AQ\.[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{20,}|npg_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}|postgres://[^ "'"'"']*:[^ "'"'"']*@'

# Working-tree scan
grep -rEn 'AIza[0-9A-Za-z_-]{20,}|AQ\.[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{20,}|npg_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}|postgres://[^ "'"'"']*:[^ "'"'"']*@' -r . --exclude-dir=node_modules --exclude-dir=.git

# NEXT_PUBLIC_* audit
grep -rn "NEXT_PUBLIC_" apps/web --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next

# Issue/PR text scan (requires gh auth)
gh api repos/garusis/hire-me-mcp/issues/comments -F per_page=100 --paginate --jq '.[] | select(.body | test("postgres://|npg_"))'
gh api repos/garusis/hire-me-mcp/pulls/comments -F per_page=100 --paginate --jq '.[] | select(.body | test("postgres://|npg_"))'
```

## 3. MCP input fuzzing

**Checked / built**: `apps/web/mcp-e2e/fuzz.spec.ts` (`54528c6`) — drives every registered MCP
tool (`ping`, `get-profile`, `get-experience`, `search-projects`, `get-skill-evidence`,
`search-career`) plus the raw JSON-RPC envelope with:
- oversized payloads (1MB strings, ~5MB raw body, 500-level deep nesting),
- wrong types on every field (string where object expected, array where string expected, etc.),
- missing/extra fields, malformed/absent `jsonrpc`, malformed `id` shapes,
- unicode/control characters (null bytes, ANSI escapes, RTL override + zero-width, surrogate-pair
  emoji spam, long combining-character stacks),
- injection-shaped strings aimed at the LLM (prompt injection) and any query layer (SQL, NoSQL,
  template injection, path traversal),
- rapid repeated/concurrent calls (30 concurrent mixed tool calls, 25 concurrent raw POSTs).

**Bar met on every case**: never a 5xx, never a raw transport failure, never a leaked stack
trace/path/env-var name (`assertNoLeak`, same `LEAK_PATTERNS` as §2), never data outside a tool's
documented contract. A rejected input always comes back as a well-formed MCP `isError: true`
result or a structured JSON-RPC error.

**Found and fixed**: none — every case already passed against the current `app/api/mcp/route.ts`
and tool implementations; the suite exists to catch regressions, not to document open findings.

**Wired into CI**: runs as part of `pnpm test:mcp` (`vitest.mcp.config.ts`'s
`mcp-e2e/**/*.spec.ts` glob picks the file up automatically — no separate CI job needed), the
`mcp-integration` job in `.github/workflows/ci.yml`, a required check on every PR alongside
`protocol.spec.ts` (schema-conformance) and `rate-limit.spec.ts` (429 path).

**Re-run**: `pnpm test:mcp` from the repo root (boots a real `next start` server locally; no
external services needed).

## 4. Rate-limit re-verification

**Design** (pre-existing, from #39/#68/#69/#79 — this review verified it, did not reimplement it):
single per-caller-IP sliding-window limiter (`@upstash/ratelimit` + `@upstash/redis`), enforced in
`apps/web/lib/mcp/rate-limit/with-rate-limit.ts` **before** the MCP request handler runs, applied
uniformly to every tool call through `/api/mcp` (there is one route-level budget shared across
`tools/list` and every `tools/call`, not a separate quota per tool — the whole route is the unit of
enforcement, confirmed by reading `apps/web/app/api/mcp/route.ts`: `withRateLimit` wraps the single
`createMcpHandler` instance all six tools are registered on). Default: 60 requests / 60s / caller
IP, overridable via `RATELIMIT_MAX_REQUESTS`/`RATELIMIT_WINDOW_SECONDS`. Caller identity is the
Vercel-set `x-forwarded-for` (not spoofable on this deployment — Vercel's edge overwrites it),
falling back to `x-real-ip`, falling back to a single shared `"unknown"` bucket.

### Verified against the real production deployment

A bounded, budget-respecting probe (3 raw JSON-RPC `tools/list` POSTs — ~5% of the 60/min budget,
same size as the existing preview-e2e burst test below) against
`https://hire-me-mcp-web.vercel.app/api/mcp` on 2026-08-23:

| Request | `ratelimit-limit` | `ratelimit-remaining` |
| --- | --- | --- |
| 1 | 60 | 59 |
| 2 | 60 | 59 |
| 3 | 60 | 58 |

`remaining` decrementing below `limit` (not sitting fixed at `60` on every call) is the signature
of the **real Upstash-backed limiter actually counting requests in production** — a fail-open
limiter would return `remaining: limit` unconditionally forever. **Confirms production is not
running in the fail-open state.** (Request 2 showing the same `remaining` as request 1 with a
fresh, larger `reset` value is consistent with `@upstash/ratelimit`'s sliding-window bucketing
under sub-second request spacing, not a bug — request 3 shows the expected further decrement.)

This same check now runs on every PR, not just this one-time probe: `apps/web/e2e-preview/specs/mcp.spec.ts`'s
`"a small bounded burst shows RateLimit-Remaining decrementing…"` and
`"rate-limit headers are present and internally consistent…"` tests (pre-existing, part of the
`preview-e2e` required CI job) exercise the identical bounded-burst pattern against every PR's live
Vercel preview deployment — which shares the same production Upstash credentials (Vercel project
settings, Preview + Production both configured) — so this isn't a one-off manual check that goes
stale after this PR merges.

### Limiter-backing-store-unavailable behavior

**Decision (pre-existing, re-affirmed by this review): fails open, by explicit product decision.**
Two distinct unavailable states, both fail open:

1. **No credentials configured** (`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` unset) — CI,
   local dev, a forked PR's preview. `createFailOpenLimiter` (`limiter.ts`) always returns
   `success: true` and logs `console.warn` once per limiter instance.
2. **A configured limiter's call to Redis itself throws** (network blip, Upstash outage) —
   `withRateLimit` (`with-rate-limit.ts`) catches around `limiter.limit()` and lets the request
   through, logging `console.warn` **per request** (not once), rather than 500ing a request that
   has nothing to do with the limiter.

**Tested, in a controlled way, both paths — already covered before this review, re-verified here**:
- `apps/web/lib/mcp/rate-limit/limiter.test.ts` — `"always allows requests and never throws when
  Upstash credentials are absent"` (20 consecutive calls, `env: {}`), asserts `console.warn` fired.
- `apps/web/lib/mcp/rate-limit/with-rate-limit.test.ts` — `"fails open (passes through) if the
  limiter itself throws, and logs a warning"` — a fake limiter whose `.limit()` rejects with
  `Error("redis unreachable")`, asserting the wrapped handler still runs and the response is
  unaffected. This is the "fake failing store" the issue asks for — never exercised against the
  real live Upstash instance, exactly as instructed.

**Verdict: accepted, not changed.** Rationale:
- Every currently-registered MCP tool is **read-only** (`ping`, `get-profile`, `get-experience`,
  `search-projects`, `get-skill-evidence`, `search-career`) — there is no write/state-mutating tool
  deployed yet (`contact`/`book_call` from epic #8 is domain-modeled in
  `packages/core/src/contact/` but **not wired to a route**, see §2). Fail-open on a read-only,
  already-public, unauthenticated information surface degrades to "no rate limiting for a while,"
  not "an attacker can act as another user" or "an attacker can write/spend/spam via the API." The
  worst case is elevated hosting/Upstash cost and noisier logs during an outage, not a data or
  integrity breach.
- The failure is **never silent**: every fail-open path logs `console.warn` (once for missing
  creds, per-request for a throwing limiter), visible in Vercel's function logs, and the code
  comments/README ("Rate limiting" section) already document this as a deliberate, written
  decision predating this review — this review adds the production live-verification and the
  explicit written accept-rationale the issue's AC requires, rather than re-litigating a decision
  that already has the properties (documented, tested, logged) the AC asks for.
- **Owner action / re-trigger condition**: if/when a write tool (`contact`/`book_call`, epic #8)
  is actually wired to a route, **this fail-open posture must be re-assessed specifically for that
  endpoint** before it ships — a spam/abuse surface with no rate limiting during an Upstash outage
  is a materially different risk than a read-only one. Flagged here so the epic #8 implementation
  task inherits this as an explicit AC, not rediscovers it.

**Re-run**:
```bash
# Unit-level fail-open assertions (both paths), no network/credentials needed
pnpm --filter @hire-me-mcp/web test -- lib/mcp/rate-limit

# Bounded live production probe (respects the real budget — do not loop this)
curl -s -D - -o /dev/null -X POST https://hire-me-mcp-web.vercel.app/api/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | grep -i ratelimit

# Same check, permanently, on every PR's live preview
BASE_URL=https://<preview>.vercel.app pnpm test:e2e:preview -- mcp.spec.ts
```

## Commit-signing window (context, not a §1–4 area, recorded here per issue #57's tracking request)

The issue's comment thread documents two unsigned-commit windows during 1Password SSH-signing
outages, both explicitly authorized by the repo owner: PRs #152–#156, and 8 commits on the
`feat/41-retrieval-evals` branch behind PR #167 (`5357d94`, `65fd395`, `8da633c`, `ed954f3`,
`6c2e9df`, `e65c7e9`, `3680854`, `06f20c0`). Signing was switched from 1Password's `op-ssh-sign` to
a plain SSH signing key on 2026-08-22 (~20:55 local); commits before that point may carry the older
1Password-managed key's signature, commits after carry the new one — both are legitimate,
recorded here so a future audit doesn't flag the key change itself as suspicious.

**Verified**: every commit reachable from `origin/main`'s history has a `gpgsig` trailer — checked
by walking `git log --format=%H origin/main` and running `git cat-file -p <sha> | grep '^gpgsig'`
on each (this environment's `git log --pretty=%G?`/`git verify-commit` cannot check signature
*validity* — `gpg.ssh.allowedSignersFile` isn't configured in this worktree — but trailer
*presence* doesn't need that). **Zero commits on `main` lack a signature**, including the two
windows above: this repo merges every PR by **squash merge**, and GitHub's own squash-merge commit
is authored as `committer: GitHub <noreply@github.com>` with GitHub's own PGP signature — verified
directly on `4eb96c4` (the squash of PR #167). The individual unsigned commits from both windows
exist only on now-discarded feature branches, never on `main`. **No action needed**: the AC
("confirm no other unsigned commits exist outside that range") is satisfied more strongly than
asked — there are no unsigned commits on `main` at all, in or out of the documented windows.

This branch's own commits (`f8d22d7`, `8d8671e`, `54528c6`) are individually SSH-signed (verified
via `git cat-file -p <sha>`, present `gpgsig` block) using the current key.

## Summary

| Area | Status | Notes |
| --- | --- | --- |
| Dependency audit | ✅ Fixed + accepted + CI-gated | 35 → 1 advisory; 1 unfixable dev-only advisory accepted with expiry condition; `pnpm run audit` in `quality` CI job |
| Automated scanning | ✅ Enabled | Dependabot alerts + security PRs + secret scanning + push protection; weekly `dependabot.yml` |
| Git-history secret scan | ✅ Clean | Zero matches, full history, all refs; issue/PR text also clean (no Neon password leak found) |
| `.env.example` | ✅ Clean | Placeholders only |
| `NEXT_PUBLIC_*` audit | ✅ N/A | Zero variables defined |
| Error/log hygiene | ✅ Asserted by tests | MCP: `fuzz.spec.ts`; chat: `handler.test.ts` |
| MCP fuzz suite | ✅ Built + CI-gated | `fuzz.spec.ts`, required `mcp-integration` job |
| Rate limits — production | ✅ Re-verified live | Real limiter active in production, not fail-open; permanent regression check in `preview-e2e` |
| Rate limits — backing-store-unavailable | ✅ Tested + accepted, documented | Fails open by design; read-only surface today; re-assess required before any write tool ships |
| Dormant contact code | ⚠️ Accepted, standing note | Not routed; re-run §3/§4 bar when it is |
| Dependabot PR #183 | ℹ️ Owner action | Recommend closing — superseded by `f8d22d7` |
| Unsigned-commit windows | ✅ Confirmed contained | No unsigned commit reaches `main`; squash-merge is GitHub-signed |

# Usage analytics (#79)

An anonymized usage-analytics pipeline records every MCP tool call and every chat question so
Marcos can learn what visitors and agents actually ask — without ever storing anything that could
identify who asked it. This is the canonical documentation for the schema, the taxonomies, the
scrubbing guarantee, and the retention window; `packages/core/README.md`'s "Usage analytics"
section covers the module layout and links back here.

## What is stored — and what never is

**Stored:** a coarse, taxonomy-constrained label per event — which surface, which tool, what kind
of outcome, a latency bucket, a chat question's theme, whether retrieval was used. Nothing here can
be traced back to a specific visitor, session, or conversation.

**Never stored, anywhere in this pipeline:**

- Raw chat question text, or any excerpt of it.
- Raw contact-form/message content (out of scope for this pipeline entirely — see "Out of scope"
  in issue #79; no write tools exist in this product at all as of the #8 epic's owner-decided
  scope cut).
- Tool call arguments.
- IP addresses or user agents, in any form.
- Any per-session or per-caller identifier. There is no grouping key at all (see below) — not even
  a hashed one.

This isn't just a policy — it's structural. Every event field is a member of a small, fixed
taxonomy (`packages/core/src/analytics/taxonomy.ts`); `scrubber.ts` rejects (throws, never
silently drops-and-continues) anything that isn't, including a `toolName` that looks like an email
address or an IP address. A raw chat question cannot be smuggled into any field: it isn't a valid
`theme` (which must be one of six fixed strings) and it isn't a valid `toolName` (which must be a
short, label-shaped identifier — no spaces, no punctuation a sentence would have).

## No session/caller grouping key

The issue allowed either a rotating salted hash for a durable per-session grouping key, or omitting
grouping entirely. This pipeline **omits grouping entirely**: nothing it needs to answer (theme
distribution, tool outcome counts, latency trends) requires linking two events back to the same
visitor, so the simpler option was chosen — no salt, no rotation schedule, no hashed identifier
column at all.

## Event schema

### Tool events (`analytics_tool_events`)

One row per MCP tool call, or per tool the chat agent invokes mid-turn.

| Field | Type | Values |
| --- | --- | --- |
| `surface` | text | `mcp`, `chat` |
| `tool_name` | text | e.g. `ping`, `get-profile`, `search-career`; `mcp_request`/`chat` for a whole rejected request when the specific tool isn't knowable yet (see below) |
| `outcome` | text | `success`, `invalid_input`, `domain_error`, `internal_error`, `rate_limited` |
| `latency_bucket` | text | `under_100ms`, `under_500ms`, `under_2s`, `under_10s`, `over_10s` |
| `created_at` | timestamptz | server clock at write time |

**Outcome taxonomy note:** the issue's original outcome set included a `refused` outcome for the
write guard's refusals. All write tools (`contact`, `book_call`) and the write guard were cut
before this pipeline was built (owner decision, 2026-08-23, epic #8 comments) — there is nothing
left to refuse. The surviving taxonomy is `success` / `invalid_input` / `domain_error` /
`internal_error` (reusing the MCP adapter layer's own three error codes,
`apps/web/lib/mcp/errors.ts`) / `rate_limited`.

**Instrumentation points:**

- `apps/web/lib/mcp/define-tool.ts`'s `createToolExecutor` — the single path every MCP tool is
  registered and invoked through — records exactly one `surface: "mcp"` event per call, for every
  outcome including a thrown error.
- `apps/web/lib/mcp/rate-limit/with-rate-limit.ts` records a `surface: "mcp"`, `outcome:
  "rate_limited"` event (`toolName: "mcp_request"`) for a request blocked before the MCP body is
  even parsed — which specific tool the caller would have used isn't knowable at that layer, so
  the whole blocked request is recorded instead of a specific tool name.
- `apps/web/app/api/chat/handler.ts` records a `surface: "chat"`, `toolName: "chat"` event once
  per request that reaches (or is rejected before reaching) the agent, PLUS one `surface: "chat"`
  event per tool the agent itself invokes mid-turn (e.g. `search-career`, `get-profile`).

### Question events (`analytics_question_events`)

One row per chat question that reaches the agent (a request rejected by a guardrail before the
agent runs — rate limited, malformed body — produces a tool event but no question event, since no
question was actually processed).

| Field | Type | Values |
| --- | --- | --- |
| `theme` | text | `experience`, `skills`, `availability`, `rates`, `technology`, `other` |
| `latency_bucket` | text | same five buckets as above |
| `used_retrieval` | boolean | whether `search-career` (the one semantic-retrieval tool) was attempted this turn |
| `created_at` | timestamptz | server clock at write time |

`theme` comes from `classifyQuestionTheme` (`packages/core/src/analytics/theme-classifier.ts`): a
deterministic keyword/rules classifier over the fixed six-value taxonomy above, with `other` as the
required catch-all. It's cheap (no I/O, no LLM call) and pure — the same question always classifies
the same way. The raw question text is this function's *input* only; it is never returned, logged,
or persisted anywhere.

## Fire-and-forget writes

Every call site above calls a non-blocking recorder
(`apps/web/lib/analytics/record.ts` -> `@hire-me-mcp/core/analytics`'s `recordToolEvent`/
`recordQuestionEvent`) that starts the database write and returns immediately without awaiting it.
A rejected write, a thrown store, or `DATABASE_URL` not being configured at all is caught and
logged — never re-thrown, never delays or fails the tool call or chat answer it's attached to. This
is covered by a test with a store forced to throw
(`packages/core/src/analytics/store.test.ts`).

## Retention

`RETENTION_WINDOW_DAYS = 90` (`packages/core/src/analytics/retention.ts`) is the single exported
constant every reference to the retention window reads from — this doc, the code, and (once built)
the public-facing privacy note all cite the same number, so they cannot drift out of sync.

90 days: long enough to see monthly-ish usage trends across a full quarter, short enough that this
pipeline never becomes a long-term store of anything.

A daily Vercel cron job (`apps/web/vercel.json`'s `crons` entry, hitting `GET
/api/cron/analytics-retention` -> `apps/web/app/api/cron/analytics-retention/`) deletes every
event row older than the window, leaving newer rows untouched. The route authenticates the request
via `Authorization: Bearer $CRON_SECRET` (Vercel signs its own cron invocations with this header);
see `.env.example` and `docs/deployment.md`.

## Migration and indexes

Migration `003_add_analytics_events` (`packages/core/src/db/migrations.ts`) creates both tables
plus:

- `created_at` indexes on both tables — the retention job's "delete rows older than the cutoff"
  range scan, and any "events in the last N days" query.
- `(tool_name, created_at)` / `(theme, created_at)` composite indexes — group-by-then-filter-by-time
  queries ("tool_name counts over the last 90 days") without a full table scan.

## Testing

- Unit tests: `packages/core/src/analytics/*.test.ts` — taxonomy/bucketing, the classifier (one
  case per theme, including `other`), the scrubber (rejects raw text/IP-shaped/email-shaped
  values), the repository (fake-`sql` round trip), the fire-and-forget store (a forced-throw store
  doesn't propagate), retention (an injected clock proves only rows older than the window are
  deleted).
- Integration tests against a real, throwaway Neon branch:
  `packages/core/src/analytics/analytics.integration.test.ts` — mirrors
  `src/db/rag-store.integration.test.ts`'s pattern (`loadNeonBranchConfig`,
  `createNeonTestBranch`/`deleteNeonTestBranch`), reset via `resetAnalyticsEvents` in setup (test
  branches fork from the real, already-populated default branch). Wired into
  `.github/workflows/ci.yml`'s `db-integration` job.
- `apps/web` instrumentation: `define-tool.analytics.test.ts`,
  `with-rate-limit.analytics.test.ts`, `handler.analytics.test.ts` — assert exactly one tool event
  per tool call/blocked request and exactly one question event per chat question, over a mocked
  recorder.

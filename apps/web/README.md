# apps/web

Next.js 15 App Router site — the single user-facing app in this monorepo (site, chat, and later
the public MCP endpoint). See the repo root `README.md` for the overall architecture.

## Design system

Issue #15 builds the foundation every later page in Epic #4 (v0.4 Portfolio Site) is expected to
build on: tokens, typography, dark/light theming, layout/content primitives and a restrained
motion layer. This ships no career content — the home page below is styled scaffolding only.

### Identity

The angle is "senior engineer whose portfolio is an API" — technical, not decorative. The palette
and type pairing commit to that instead of a generic SaaS template:

- **Typefaces** (`app/fonts.ts`, self-hosted via `next/font/google`, `display: swap`, zero
  runtime network requests):
  - **Fraunces** — a characterful, slightly idiosyncratic display serif — for headings. It reads
    as considered rather than corporate, and contrasts deliberately with the quiet body face.
  - **IBM Plex Sans** — a quiet, engineered sans — for body copy. Plex was designed by/for IBM's
    own products; it reinforces the technical register without competing with Fraunces for
    attention.
  - **IBM Plex Mono** — for badges, code-adjacent and tabular content (`.tabular-nums` uses
    `font-variant-numeric: tabular-nums` so dates/durations/metrics align).
- **Accent** — a single confident color, not a gradient: a burnt-copper/amber
  (`#b5541f` light / `#e08a4f` dark) used sparingly (accent badge, links, focus ring, primary
  button). One accent, consistently applied, reads more deliberate than a multi-color palette.
- **Neutrals** — warm paper tones (`#f7f5f0` … `#1c1a17`) rather than pure white/black, so the
  page doesn't read as a stock design-system demo.
- **Whitespace** — generous section padding (`--space-7`) and a capped content measure
  (`Container` at `72rem`, `Prose` at `65ch`) instead of a dense dashboard layout.
- Explicitly avoided: Inter-by-default, gradient hero sections, and a blue "tech" accent.

### Tokens

All tokens are CSS custom properties defined once in `app/globals.css`, on `:root` (light,
default) and re-scoped under `:root[data-theme="dark"]`. Primitives consume `var(--token-name)` —
never a raw hex value — enforced by
`app/design-system/lib/no-hardcoded-hex.test.ts`, which scans every `*.module.css`/`*.ts(x)` file
under `app/design-system` (excluding `globals.css`, the one place token values are defined) for a
raw hex literal and fails the suite if it finds one.

| Group      | Tokens                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Color      | `--color-bg`, `--color-bg-subtle`, `--color-surface`, `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-accent`, `--color-accent-fg`, `--color-focus-ring` |
| Elevation  | `--shadow-sm`, `--shadow-md`                                                                     |
| Typography | `--font-display`, `--font-body`, `--font-mono`, `--text-{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl}`, `--leading-{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl}` |
| Space      | `--space-{1..8}` (4px base scale)                                                                 |
| Radii      | `--radius-{sm,md,lg,full}`                                                                        |
| Motion     | `--motion-duration-{fast,base,slow}`, `--motion-ease` — forced to `0ms` under `prefers-reduced-motion: reduce` |

### Theming

- Default resolution is `prefers-color-scheme`; an explicit user choice is persisted to
  `localStorage` (`theme` key, `"light" | "dark"`) and takes priority on every later visit.
  Resolution logic is a single pure function
  (`app/design-system/theme/resolve-theme.ts#resolveInitialTheme`) shared by the inline script and
  the client hook, so they can never disagree.
- **No flash of the wrong theme**: a small inline script
  (`buildThemeScript`) runs via `next/script` with `strategy="beforeInteractive"`, which Next.js
  hoists into `<head>` and executes before hydration — it sets `data-theme` and
  `color-scheme` on `<html>` synchronously, before first paint.
- `ThemeToggle` (`app/design-system/theme/theme-toggle.tsx`) is the only component in the theme
  layer that needs to be a Client Component. It's a real `<button>` with `aria-pressed`, keyboard
  operable, with the shared focus-visible ring.
- **Manual verification**: hard-reloaded the built app (`pnpm build && pnpm start`) with the OS
  set to light and then to dark, in both cases with no stored `localStorage` preference — no flash
  of the opposite theme in either case, and toggling + reloading correctly re-applies the stored
  choice.

### Primitives

All under `app/design-system/primitives/`, styled with co-located CSS Modules (no CSS-in-JS
runtime, so this stays cheap for Lighthouse). Server Components by default — the only two Client
Components in the whole design system are `ThemeToggle` and `CopyToClipboard`, because they are
the only two that need actual interactivity (state + browser APIs). `Button`, `Link`, etc. render
plain DOM elements and accept `onClick`/`href` from whichever component composes them; they don't
declare `"use client"` themselves.

| Primitive          | Notes                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `Container`        | Centers + caps content width; `as` prop for the rendered element.                        |
| `Section`          | `<section>` landmark with vertical rhythm.                                               |
| `Heading`           | Polymorphic `h1`-`h6`, `level` prop maps to the display type scale.                      |
| `Prose`            | Long-form copy wrapper — `65ch` measure, spaced children.                                |
| `Card`              | Bordered/elevated surface; `as` prop (`div`/`article`/…).                                |
| `Badge`             | Inline label, `neutral`/`accent` variants.                                               |
| `Link`              | `next/link` for internal hrefs; external hrefs get `target="_blank"`, `rel="noopener noreferrer"` and a screen-reader-only "(opens in a new tab)" hint. |
| `Button`            | Presentational; renders `<button>` or, given `href`, delegates to `Link`.                |
| `CopyToClipboard`   | Client component — writes to the clipboard, shows an `aria-live` "Copied!" success state that reverts after 2s. |

Layout primitives (`app/design-system/layout/`): `SkipLink` (visually hidden until focused, jumps
to `#main-content`), `SiteHeader` (banner landmark, nav, `ThemeToggle`), `SiteFooter` (contentinfo
landmark). `app/layout.tsx` composes skip link → header → `<main id="main-content">` → footer.

### Motion

`app/design-system/motion/`:

- `useReducedMotion` — tracks `prefers-reduced-motion: reduce` live.
- `RevealOnScroll` — fades/slides children in via `IntersectionObserver` once they enter the
  viewport. Under reduced motion it is a true no-op: it renders a plain wrapper with **no**
  animation class and **no** `data-reveal` attribute, rather than a zero-duration transition.
- All CSS transitions additionally read their durations from `--motion-duration-*`, which are
  forced to `0ms` under `@media (prefers-reduced-motion: reduce)` as a second line of defense.

### Screenshots

`apps/web/e2e/design-system.screenshot.spec.ts` captures the home page at 360px and 1440px, in
both themes, against the production build (`pnpm build && pnpm start`, same as the smoke e2e
suite). Run `pnpm test:e2e` from the repo root; PNGs land in
`apps/web/e2e/screenshots/` (git-ignored — not part of the deployed artifact). See the PR
description for the captured images.

## Rate limiting

The public MCP endpoint (`/api/mcp`) is public and anonymous — no auth, no OAuth (out of scope for
this epic) — so per-IP rate limiting, backed by Upstash Redis (free tier) via `@upstash/ratelimit`
+ `@upstash/redis`, is the only cost/abuse control (#39). This section is the canonical
documentation for the limit and the limit-exceeded behavior; the `/mcp` connection page's
troubleshooting section and other docs link back here rather than duplicating it.

- **Default limit**: 60 requests per caller IP per 60-second sliding window — generous for an
  interactive AI assistant making a handful of tool calls per turn, not for scripted abuse.
- **Override**: set `RATELIMIT_MAX_REQUESTS` and/or `RATELIMIT_WINDOW_SECONDS` (see
  `.env.example`). An unset, non-numeric, non-integer, or non-positive value silently falls back
  to the default rather than erroring.
- **Algorithm**: `Ratelimit.slidingWindow` (smoother enforcement than a fixed window), with
  Upstash's ephemeral in-memory cache enabled so a caller already known to be blocked is rejected
  locally on a warm serverless instance without spending a Redis command per retry.
- **Caller identity**: the caller's IP, extracted with a documented header precedence
  (`apps/web/lib/mcp/rate-limit/identify-caller.ts`): `x-forwarded-for` first (Vercel's edge
  overwrites this header with the true client IP and does not forward external IPs, so it isn't
  spoofable by the caller on this deployment), then `x-real-ip` as a fallback, then a single fixed
  `"unknown"` bucket if neither is present (e.g. local dev with no proxy in front). No other
  client-supplied header is trusted, since an arbitrary client-settable header would let a caller
  pick its own rate-limit bucket.
- **Fail-open, by explicit decision**: enforcement is wired into `apps/web/app/api/mcp/route.ts`
  BEFORE the MCP request handler runs, so it never turns into a truncated stream — but if
  `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` aren't set (CI, a forked PR's preview, local
  dev without the env vars) or a configured limiter's call to Redis itself fails, the endpoint
  still serves MCP traffic with no limiting rather than a 500, logging a loud `console.warn` each
  time. This keeps local development and the test suite from requiring Upstash credentials, at the
  cost of no protection in that (non-production) state.
- **Headers on an allowed request** (added for #69, whose preview smoke suite asserts this against
  a real deployment): every response — not only the 429 path — carries `RateLimit-Limit` /
  `RateLimit-Remaining` / `RateLimit-Reset` (IETF `RateLimit` header field draft), reflecting the
  outcome of that request's own limiter check, so a caller under the limit can see its remaining
  budget instead of only learning about the limit once already blocked. `Retry-After` is deliberately
  **not** added here — there is nothing to retry when the request already succeeded; it stays
  reserved for the 429 case below. See `attachRateLimitHeaders` in `apps/web/lib/mcp/rate-limit/response.ts`.
- **Limit-exceeded response**: `HTTP 429`, with the same `RateLimit-*` headers plus `Retry-After`
  (RFC 9110, seconds until the window resets), and a complete, parseable JSON body:
  ```json
  { "error": { "code": "rate_limited", "message": "Too many requests from this client — the limit is 60 requests per configured window. Retry after 42 second(s). See the \"Rate limiting\" section of the hire-me-mcp README for the current default limit and how it's configured." } }
  ```
  The message never includes a stack trace, an internal path, or credential material — see
  `apps/web/lib/mcp/rate-limit/response.ts`.
- **Implementation**: `apps/web/lib/mcp/rate-limit/` — `identify-caller.ts` (identifier
  extraction), `config.ts` (env parsing/defaults), `limiter.ts` (Upstash-backed and fail-open
  limiter construction), `response.ts` (429 builder + `attachRateLimitHeaders` for the allowed
  path), `with-rate-limit.ts` (the route wrapper, limiter injected for testability). Each has a
  co-located Vitest suite exercising header combinations (both the 429 and allowed paths), the
  fail-open path, under-limit passthrough, and a burst over a low configured limit — all without a
  network call, via an injectable in-memory fake limiter.
- **Upstash project config**: `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set in the
  Vercel project (Production + Preview, marked Sensitive) against a dedicated free-tier Upstash
  Redis database. No credential value is ever committed to the repo or pasted into an issue/PR —
  see `.env.example` at the repo root for the (empty) placeholder entries.

## Commands

```bash
pnpm --filter @hire-me-mcp/web dev      # dev server
pnpm --filter @hire-me-mcp/web build    # production build
pnpm --filter @hire-me-mcp/web test     # vitest
pnpm test:e2e                           # Playwright smoke + screenshot specs (repo root)
BASE_URL=<url> pnpm test:e2e:preview    # preview e2e gate — navigation/a11y/content-correctness/responsive/SEO (#58, repo root)
BASE_URL=<url> pnpm run lighthouse      # Lighthouse gate — performance/a11y/best-practices/SEO (#58, repo root)
```

See the root README's "Preview gates: e2e + Lighthouse against a deployed URL (#58)" section for the full mechanism (the Vercel Deployment Protection bypass, how routes/specs are organized, and the SEO assertion's `is-crawlable` caveat), including its "MCP endpoint smoke suite (#69)" paragraph describing `apps/web/e2e-preview/specs/mcp.spec.ts` — the same `test:e2e:preview` command above also runs it against `/api/mcp` on `BASE_URL`.

---
paths:
  - "packages/core/**"
  - "packages/career-data/**"
  - "apps/web/**"
---

# Architecture Boundaries

- **`packages/core` stays framework-free.** No React, no Next.js, no HTTP-framework
  dependencies. It's the domain layer that will back both `apps/web` and the future public MCP
  endpoint — anything that only makes sense inside a specific runtime (React components, Next.js
  route handlers) belongs in `apps/web`, not `packages/core`.
- **`packages/career-data`** holds the Zod-typed career content model — the single source of
  truth `apps/web` (site, chat, and later the MCP endpoint) all read from.
- **`apps/web` depends on both** via `workspace:*`, never via relative `../../packages/...`
  imports or `tsconfig` path hacks.
- If you're adding something to `packages/core` and find yourself importing `react`, `next`, or
  wiring up an HTTP handler, that code belongs in `apps/web` instead.

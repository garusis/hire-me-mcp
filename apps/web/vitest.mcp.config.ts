import { defineConfig } from "vitest/config";

/**
 * Vitest config for the protocol-level MCP integration suite (#49) —
 * deliberately separate from `vitest.config.ts` (the unit-test config
 * `pnpm turbo test` runs) so this suite:
 *
 * - never runs as part of `pnpm test`/`pnpm turbo test` (different include
 *   glob, `mcp-e2e/**\/*.spec.ts` vs. the base config's `*.test.{ts,tsx}`
 *   under `src`/`app`/`lib` — the same ".spec.ts vs .test.ts" convention
 *   `apps/web/e2e` already uses to keep Playwright specs out of Vitest's
 *   unit-test discovery);
 * - gets its own command (`pnpm test:mcp`) and is distinguishable as its
 *   own step/job in CI output;
 * - does NOT extend `vitest.config.base.ts` — this suite runs under plain
 *   Node against a real HTTP server, never a component/DOM environment, so
 *   the `happy-dom`/React setup `apps/web`'s unit config layers on top
 *   would be pure overhead here.
 *
 * `globalSetup` builds `apps/web` once for the whole run; each spec file's
 * own `beforeAll` starts its own `next start` process on its own ephemeral
 * port (see `mcp-e2e/support/`). `fileParallelism: false` runs spec files
 * one at a time — deliberate, since each spec boots a real Next.js server
 * process and `protocol.spec.ts` + `rate-limit.spec.ts` both bind to
 * `127.0.0.1` from the same machine; serial execution keeps startup/port
 * allocation deterministic instead of trading a few seconds of wall time
 * for flakiness.
 */
export default defineConfig({
  test: {
    include: ["mcp-e2e/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/.turbo/**"],
    environment: "node",
    globalSetup: ["./mcp-e2e/support/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    teardownTimeout: 15_000,
  },
});

/**
 * Vitest `globalSetup` for the protocol-level MCP integration suite (#49):
 * builds `apps/web` (and its `packages/core`/`packages/career-data`
 * workspace dependencies, via Turborepo's `^build` dependency) exactly
 * once for the whole run, the same production build every spec file's
 * `next start` process serves — mirroring the pattern `playwright.config.ts`
 * already uses for the e2e smoke suite, kept here as its own step because
 * this suite runs under its own command/CI job rather than Playwright's
 * `webServer`.
 *
 * Runs once total (not once per spec file) because Vitest invokes
 * `globalSetup` a single time for the whole test run, regardless of how
 * many spec files match `include`.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

export default function setup(): void {
  execFileSync("pnpm", ["turbo", "run", "build", "--filter=@hire-me-mcp/web"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

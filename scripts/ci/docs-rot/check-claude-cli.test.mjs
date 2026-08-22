/**
 * #59 — covers `lib/check-claude-cli.mjs`'s two paths:
 *   1. `claude` unavailable on PATH -> structural-only fallback (a `note`,
 *      never a `fail`) — the deviation the issue explicitly allows for CI
 *      containers that can't install the CLI headlessly.
 *   2. `claude` available -> a REAL `claude mcp add` / `mcp list` / `mcp
 *      remove` round trip against the real production MCP endpoint, in an
 *      isolated `CLAUDE_CONFIG_DIR` (never touches a real user config).
 *
 * Test 2 is network-bound and genuinely slow (a live health check), and
 * only meaningful when `claude` happens to be installed in the environment
 * running these tests — it self-skips otherwise rather than failing a CI
 * container that doesn't ship the CLI (same allowance `check-claude-cli.mjs`
 * documents). Run directly: `node --test scripts/ci/docs-rot/*.test.mjs`.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { checkClaudeCodeCli } from "./lib/check-claude-cli.mjs";

function claudeAvailable() {
  const result = spawnSync("claude", ["--version"], { timeout: 10_000, encoding: "utf-8" });
  return result.error === undefined && result.status === 0;
}

test("falls back to a structural note (never a failure) when claude is not on PATH", () => {
  const failures = [];
  const notes = [];
  const originalPath = process.env.PATH;
  process.env.PATH = ""; // guarantees `claude` cannot be found, regardless of the host machine
  try {
    checkClaudeCodeCli(
      { transport: "http", name: "hire-me-mcp", url: "https://hire-me-mcp-web.vercel.app/api/mcp" },
      {
        fail: (source, message) => failures.push(`${source}: ${message}`),
        note: (message) => notes.push(message),
      },
    );
  } finally {
    process.env.PATH = originalPath;
  }

  assert.deepEqual(failures, []);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /claude CLI not found on PATH/);
});

test("registers, lists and removes a real server against the live production endpoint (skipped if claude CLI unavailable)", {
  skip: !claudeAvailable(),
  timeout: 45_000,
}, () => {
  const failures = [];
  const notes = [];
  checkClaudeCodeCli(
    { transport: "http", name: "hire-me-mcp", url: "https://hire-me-mcp-web.vercel.app/api/mcp" },
    {
      fail: (source, message) => failures.push(`${source}: ${message}`),
      note: (message) => notes.push(message),
    },
  );

  assert.deepEqual(failures, [], `expected no failures, got:\n${failures.join("\n")}`);
  assert.ok(notes.some((note) => note.includes("registered and listed")));
});

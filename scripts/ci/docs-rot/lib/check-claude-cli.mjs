/**
 * #59 — executes the documented `claude mcp add --transport http ...`
 * snippet (README.md's `mcp-claude-code-snippet` region) against the real
 * Claude Code CLI, when one is available in the environment.
 *
 * Isolation: registration/list/remove all run against a throwaway
 * `CLAUDE_CONFIG_DIR` (a fresh temp directory per run) rather than whatever
 * config the invoking user/CI runner already has — this check must never
 * read or mutate a real `~/.claude.json`. The server name registered is
 * suffixed with a random id so repeated/parallel runs never collide.
 *
 * If the `claude` binary isn't on PATH (a CI container that doesn't ship
 * it, and couldn't install it headlessly), this falls back to structural
 * validation only — the caller has already checked the snippet's URL and
 * transport match the documented endpoint before this function runs, so
 * "no CLI available" degrades to "we validated everything about this
 * snippet except actually invoking the binary," and says so explicitly via
 * `note`, rather than silently skipping. See the issue's own allowance for
 * this: "if not installable headlessly, validate the command's structure +
 * registry equivalence and document the substitution honestly."
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function claudeAvailable() {
  const result = spawnSync("claude", ["--version"], { timeout: 10_000, encoding: "utf-8" });
  return result.error === undefined && result.status === 0;
}

/**
 * @param {{ transport: string, name: string, url: string }} parsedCli
 * @param {{ fail: (source: string, message: string) => void, note: (message: string) => void }} reporter
 */
export function checkClaudeCodeCli(parsedCli, { fail, note }) {
  const source = "README.md#mcp-claude-code-snippet (claude CLI)";

  if (!claudeAvailable()) {
    note(
      "claude CLI not found on PATH — skipped live registration; the snippet was still validated " +
        `structurally (transport="${parsedCli.transport}", url matches the documented endpoint). ` +
        "See the issue's documented deviation allowance for CI containers without the CLI installed.",
    );
    return;
  }

  const configDir = mkdtempSync(join(tmpdir(), "docs-rot-claude-config-"));
  const serverName = `${parsedCli.name}-docs-rot-check-${process.pid}-${Date.now()}`;
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };

  try {
    const add = spawnSync(
      "claude",
      ["mcp", "add", "--transport", parsedCli.transport, serverName, parsedCli.url],
      { env, timeout: 30_000, encoding: "utf-8" },
    );
    if (add.status !== 0) {
      fail(source, `"claude mcp add" exited ${add.status}: ${add.stderr || add.stdout}`);
      return;
    }

    const list = spawnSync("claude", ["mcp", "list"], { env, timeout: 30_000, encoding: "utf-8" });
    if (list.status !== 0) {
      fail(source, `"claude mcp list" exited ${list.status}: ${list.stderr || list.stdout}`);
      return;
    }
    if (!list.stdout.includes(serverName)) {
      fail(source, `registered server "${serverName}" did not appear in "claude mcp list" output`);
      return;
    }
    if (!list.stdout.includes(parsedCli.url)) {
      fail(source, `"claude mcp list" output did not show the registered URL ${parsedCli.url}`);
    }
    note(
      `claude CLI: registered and listed "${serverName}" against ${parsedCli.url} successfully.`,
    );
  } finally {
    spawnSync("claude", ["mcp", "remove", serverName], { env, timeout: 15_000, encoding: "utf-8" });
    rmSync(configDir, { recursive: true, force: true });
  }
}

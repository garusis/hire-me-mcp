#!/usr/bin/env node
/**
 * #23 AC: "every shell command documented in the local-development section
 * is executed in CI ... and succeeds on a clean checkout." Rather than
 * hand-maintaining a second copy of that command list (which would drift
 * from the README the moment either one changes), this script parses the
 * fenced ```bash code blocks under README.md's "## Local development"
 * heading and actually runs each `pnpm ...` command line it finds — so a
 * README edit that introduces a typo'd or broken command fails CI here,
 * not silently.
 *
 * Long-running or expensive commands are skipped by design (SKIP_TOKENS
 * below): `pnpm dev` never exits, and `test:e2e`/`test:mcp`/`eval:agent`/
 * `eval:retrieval` already have their own dedicated CI jobs (`e2e`,
 * `mcp-integration`, `agent-evals`, `retrieval-eval`) that do the real
 * work — re-running them here would just duplicate cost, not add coverage
 * (`eval:retrieval` also needs a populated Neon branch, which this
 * `quality` job never provisions). What's left (install, lint, typecheck,
 * test, build, generate:connect:check) is exactly the "typecheck-level"
 * verification the issue asks for, and by the time this step runs in the
 * `quality` job it replays from Turborepo's warm cache in well under a
 * second per command.
 *
 * Run from the repo root: `node scripts/ci/verify-readme-local-dev.mjs`.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const README_PATH = resolve(REPO_ROOT, "README.md");

const SKIP_TOKENS = ["dev", "test:e2e", "test:mcp", "eval:agent", "eval:retrieval", "lighthouse"];

function extractLocalDevSection(readme) {
  const match = readme.match(/## Local development\n([\s\S]*?)\n## /);
  if (!match) {
    throw new Error('README.md has no "## Local development" section to verify.');
  }
  return match[1];
}

function extractCommands(section) {
  const commands = [];
  const codeBlockPattern = /```bash\n([\s\S]*?)```/g;
  let blockMatch = codeBlockPattern.exec(section);
  while (blockMatch !== null) {
    for (const rawLine of blockMatch[1].split("\n")) {
      const line = rawLine.split("#")[0].trim();
      if (line.startsWith("pnpm ")) {
        commands.push(line);
      }
    }
    blockMatch = codeBlockPattern.exec(section);
  }
  return commands;
}

function shouldSkip(command) {
  return SKIP_TOKENS.some((token) => command.includes(token));
}

function main() {
  const readme = readFileSync(README_PATH, "utf-8");
  const section = extractLocalDevSection(readme);
  const commands = extractCommands(section);

  if (commands.length === 0) {
    throw new Error(
      'No `pnpm ...` commands found in README.md\'s "## Local development" section — expected at least one.',
    );
  }

  console.log(
    `Found ${commands.length} documented command(s) in README.md's "## Local development" section.`,
  );

  for (const command of commands) {
    if (shouldSkip(command)) {
      console.log(`  skip: ${command} (covered by its own dedicated CI job, or long-running)`);
      continue;
    }
    console.log(`  run:  ${command}`);
    execSync(command, { cwd: REPO_ROOT, stdio: "inherit" });
  }

  console.log("All verified README local-development commands succeeded.");
}

main();

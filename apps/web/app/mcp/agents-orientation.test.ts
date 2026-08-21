import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Drift guard for the visitor-facing orientation layer added to the repo
 * root's `AGENTS.md` (#25). `AGENTS.md` has two audiences: an agent
 * exploring the repo (orientation, this section) and an agent contributing
 * code (the pre-existing rules from #1/#22, which this task must leave
 * verbatim). These tests hold both halves to their contract:
 *
 * - the two sections exist, labelled, in order, separated by a divider;
 * - every path in the orientation's key-directories table actually exists;
 * - every relative link in the file resolves to a real file or a real
 *   heading anchor (self-links included);
 * - the file never repeats the MCP endpoint URL or a connection snippet —
 *   those live in exactly one place (`README.md` / `docs/mcp.md`, #17);
 * - the pre-existing contributor rules are byte-for-byte unchanged.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const AGENTS_MD_PATH = join(REPO_ROOT, "AGENTS.md");

function readAgentsMd(): string {
  return readFileSync(AGENTS_MD_PATH, "utf-8");
}

const EXPLORING_HEADING = "## If you are just exploring this repo";
const CONTRIBUTING_HEADING = "## If you are contributing code";

/** The pre-existing contributor-rules content (#1/#22), verbatim, that must survive this task untouched. */
const ORIGINAL_CONTRIBUTOR_RULES = `Instructions for Codex and any other coding agent working in this repo. Claude Code additionally
enforces the same rules mechanically via \`.claude/hooks\` — see "Three layers of enforcement"
below for why both exist and why bypassing one still fails at the next.

## Workspace

A pnpm + Turborepo monorepo. Node >= 20, pnpm 10 (pinned via \`packageManager\` in the root
\`package.json\`).

\`\`\`
apps/
  web/              Next.js 15 App Router app (site, chat, and — later — the MCP endpoint)
packages/
  core/             Framework-free domain layer, consumed by apps/web
  career-data/      Zod-typed career content
tooling/
  tdd-guard/        Source<->test path mapping + TDD allow/block decision logic (used by .claude/hooks)
\`\`\`

\`apps/web\` depends on \`packages/core\` and \`packages/career-data\` via the \`workspace:*\` protocol —
never relative \`../../packages/...\` imports or \`tsconfig\` path hacks.

## Canonical commands

Run from the repo root before considering any change done:

\`\`\`bash
pnpm turbo lint typecheck test build
\`\`\`

Per-package equivalents (\`pnpm --filter <package> <script>\`) exist for faster iteration; the
turbo pipeline is what CI and the Stop hook actually check.

## Test-first development

**Every enforced source file must have a co-located test that fails before you touch the
implementation.** "Enforced source file" means \`apps/*/src/**/*.ts(x)\`, \`apps/*/app/**/*.ts(x)\`,
and \`packages/*/src/**/*.ts(x)\` — not config files (\`*.config.ts\`, \`tsconfig.json\`), not \`*.d.ts\`,
not docs.

The test file convention (fixed in #13) is co-located and deterministic — no path translation, no
parallel \`tests/\` tree:

\`\`\`
src/foo.ts       -> src/foo.test.ts
app/page.tsx     -> app/page.test.tsx
\`\`\`

Workflow:

1. Before editing \`src/foo.ts\`, find or create \`src/foo.test.ts\`.
2. Read it (or write it) so it specifies the behavior you're about to build/change, and confirm it
   currently **fails**: \`pnpm --filter <package> test\`.
3. Only then edit the source file, iterating until the test is green.
4. Don't add behavior, error handling, or edge-case logic that no test demands.

Full detail: \`.claude/rules/tdd-source-files.md\`.

## Protected tests

Test files (\`**/*.test.ts\`, \`**/*.test.tsx\`) define the contract, not a rubber stamp on whatever
the implementation currently does. Don't:

- Delete a test file, or delete/comment-out individual assertions or cases, to make a suite go
  green.
- Add \`.skip(...)\` or \`.only(...)\` to a test in code you commit.
- Loosen an assertion (e.g. \`toBe(3)\` -> \`toBeGreaterThan(0)\`) just because the exact value
  changed and you didn't want to think about why.

If tests fail after an implementation change and your instinct is to edit the test: stop, and
check whether the *implementation* is wrong instead. Tests only change when the intended behavior
itself changes, and that's a decision to make explicitly. Full detail:
\`.claude/rules/tdd-test-files.md\`.

## Quality bar

- **Biome is the only linter/formatter** (\`pnpm lint\`, \`pnpm format\`) — no ESLint, no Prettier.
  \`noExplicitAny\`, unused imports/variables, and cognitive-complexity limits are \`error\`, not
  \`warn\`.
- **TypeScript \`strict: true\`** everywhere, via the shared \`tsconfig.base.json\`.
- **No default exports**, except Next.js App Router files that require them and config files
  (already carved out in \`biome.json\`).
- Small, focused commits with conventional messages referencing the issue they implement.

Full detail: \`.claude/rules/quality-bar.md\`.

## Architecture boundaries

\`packages/core\` stays framework-free — no React, no Next.js, no HTTP-framework dependencies. It's
the domain layer that will also back the future public MCP endpoint. Anything that only makes
sense inside a specific runtime belongs in \`apps/web\`. Full detail:
\`.claude/rules/architecture-boundaries.md\`.

## Three layers of enforcement

Don't confuse these — they overlap on purpose:

1. **\`.claude/hooks\` + \`.claude/rules\` (Claude Code only).** \`PreToolUse\` hooks block a
   non-test-first source edit or a test-weakening edit *before it's written*; a \`PostToolUse\` hook
   runs the nearest test after every edit for fast feedback; a \`Stop\` hook blocks ending a session
   with a red suite or dirty lint. This is real-time, in-editor enforcement, but only for Claude
   Code — it does not run for Codex or a human committing from the terminal.
2. **\`AGENTS.md\` (this file).** Instruction-level mirror of the same rules for Codex and any other
   agent that reads \`AGENTS.md\` natively. This is persuasion, not enforcement — nothing stops an
   agent (or a human) from ignoring it.
3. **lefthook pre-commit + CI (tool-agnostic, binds everyone).** A pre-commit hook (tracked in
   #18; not yet present in this repo — until it lands, this layer is CI-only) and CI both run
   \`pnpm turbo lint typecheck test build\` regardless of which agent, editor, or human produced the
   commit.

So: bypassing layer 1 (e.g. because you're Codex, or because \`TDD_SKIP_GUARD=1\` was set for a
documented exception) does not mean the change ships broken — layer 3 still runs the full
\`lint typecheck test build\` pipeline and fails the commit/PR if it's red. Layer 1 exists purely to
give fast, in-the-loop feedback so you don't get to layer 3 and discover the problem late.
`;

/** Turn heading text into a GitHub-style anchor slug. */
function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function headingSlugs(markdown: string): Set<string> {
  const slugs = new Set<string>();
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    slugs.add(githubSlug(match[1] as string));
  }
  return slugs;
}

/** Extract every `[text](target)` link, excluding external (http/https/mailto) links. */
function relativeLinks(markdown: string): string[] {
  const links: string[] = [];
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = (match[1] as string).trim();
    if (!/^(https?:|mailto:)/.test(target)) {
      links.push(target);
    }
  }
  return links;
}

/** Extract every backtick-wrapped path from the first column of the key-directories table. */
function keyDirectoryPaths(markdown: string): string[] {
  const tableStart = markdown.indexOf("### Key directories");
  expect(
    tableStart,
    "expected a '### Key directories' heading in the orientation section",
  ).toBeGreaterThanOrEqual(0);
  const afterHeading = markdown.slice(tableStart);
  const rows = afterHeading
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2); // drop the header row and the "| --- | --- |" separator row
  const paths: string[] = [];
  for (const row of rows) {
    const firstColumn = row.split("|")[1] ?? "";
    for (const match of firstColumn.matchAll(/`([^`]+)`/g)) {
      paths.push(match[1] as string);
    }
  }
  expect(paths.length).toBeGreaterThan(0);
  return paths;
}

describe("AGENTS.md orientation layer (#25)", () => {
  it("has both audience sections, explicitly labelled and in order, separated by a divider", () => {
    const doc = readAgentsMd();
    const exploringIndex = doc.indexOf(EXPLORING_HEADING);
    const dividerIndex = doc.indexOf("\n---\n");
    const contributingIndex = doc.indexOf(CONTRIBUTING_HEADING);

    expect(exploringIndex).toBeGreaterThanOrEqual(0);
    expect(dividerIndex).toBeGreaterThan(exploringIndex);
    expect(contributingIndex).toBeGreaterThan(dividerIndex);
  });

  it("names the directories holding career data, the domain layer, the MCP tools, the site app, and the tests", () => {
    const doc = readAgentsMd();
    const orientation = doc.slice(
      doc.indexOf(EXPLORING_HEADING),
      doc.indexOf(CONTRIBUTING_HEADING),
    );

    expect(orientation).toContain("packages/career-data");
    expect(orientation).toContain("packages/core");
    expect(orientation).toContain("apps/web/app/api/mcp");
    expect(orientation).toContain("apps/web/app/");
    expect(orientation).toMatch(/e2e|evals/);
  });

  it("every path in the key-directories table exists in the repository", () => {
    const doc = readAgentsMd();
    for (const path of keyDirectoryPaths(doc)) {
      const normalized = path.replace(/\/$/, "");
      expect(existsSync(join(REPO_ROOT, normalized)), `expected ${path} to exist`).toBe(true);
    }
  });

  it("every relative link resolves to an existing file or an existing heading anchor", () => {
    const doc = readAgentsMd();
    const slugs = headingSlugs(doc);

    for (const target of relativeLinks(doc)) {
      const [filePart, anchorPart] = target.split("#");

      if (filePart === "") {
        // Self-link, e.g. "#if-you-are-contributing-code".
        expect(
          slugs.has(anchorPart as string),
          `expected AGENTS.md to have a heading for #${anchorPart}`,
        ).toBe(true);
        continue;
      }

      const resolved = join(REPO_ROOT, filePart as string);
      expect(existsSync(resolved), `expected link target ${filePart} to exist`).toBe(true);

      if (anchorPart) {
        const targetSlugs = headingSlugs(readFileSync(resolved, "utf-8"));
        expect(
          targetSlugs.has(anchorPart),
          `expected ${filePart} to have a heading for #${anchorPart}`,
        ).toBe(true);
      }
    }
  });

  it("contains no MCP endpoint URL or connection snippet of its own — links to README/docs/mcp.md instead", () => {
    const doc = readAgentsMd();

    expect(doc).not.toMatch(/https?:\/\/\S*\/api\/mcp/);
    expect(doc).not.toContain("mcpServers");
    expect(doc).not.toContain("claude mcp add");
    expect(doc).not.toMatch(/curl\s+-s\s+https?:\/\//);

    expect(doc).toMatch(/\[`?README\.md`?\]\(README\.md\)/);
    expect(doc).toContain("[`docs/mcp.md`](docs/mcp.md)");
  });

  it("keeps the pre-existing contributor rules byte-for-byte intact", () => {
    const doc = readAgentsMd();
    expect(doc).toContain(ORIGINAL_CONTRIBUTOR_RULES);
  });

  it("keeps the contributing section's key phrases present (spot checks for #1/#22 rules)", () => {
    const doc = readAgentsMd();
    for (const phrase of [
      "pnpm turbo lint typecheck test build",
      "Every enforced source file must have a co-located test",
      "Biome is the only linter/formatter",
      "packages/core` stays framework-free",
      "Three layers of enforcement",
      "TDD_SKIP_GUARD=1",
    ]) {
      expect(doc).toContain(phrase);
    }
  });
});

/**
 * #207 — unit tests for the pure eval-relevance decision logic. Plain
 * `node --test`, same convention as `neon-branch-cleanup.test.mjs`.
 * Run: `pnpm ci:eval-relevance:test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { decideRelevance, parseAffectedPackages } from "./eval-relevance.mjs";

const AGENT = "@hire-me-mcp/agent";

function decide(overrides = {}) {
  return decideRelevance({
    eventName: "pull_request",
    labels: [],
    overrideLabel: "run-evals",
    targetPackage: AGENT,
    affectedPackages: [],
    changedFiles: [],
    extraPathRegex:
      "^(\\.github/workflows/agent-evals\\.yml|scripts/ci/eval-relevance|apps/web/app/api/chat/)",
    ...overrides,
  });
}

test("relevant when the target package is in the affected set", () => {
  const result = decide({ affectedPackages: ["//", AGENT] });
  assert.equal(result.relevant, true);
  assert.match(result.reason, /affected-package set/);
});

test("relevant when a dependency change puts the target in the affected set (graph, not globs)", () => {
  // A packages/core change: turbo lists core AND its dependents (agent).
  const result = decide({
    affectedPackages: ["@hire-me-mcp/core", AGENT, "@hire-me-mcp/web"],
    changedFiles: ["packages/core/src/repository.ts"],
  });
  assert.equal(result.relevant, true);
});

test("not relevant for a docs-only PR (root package affected, target not)", () => {
  const result = decide({
    affectedPackages: ["//"],
    changedFiles: ["docs/development.md"],
  });
  assert.equal(result.relevant, false);
});

test("not relevant when only an unrelated package is affected", () => {
  const result = decide({
    affectedPackages: ["@hire-me-mcp/web"],
    changedFiles: ["apps/web/app/page.tsx"],
  });
  assert.equal(result.relevant, false);
});

test("relevant when a changed file matches the explicit asset regex even with no affected package", () => {
  const result = decide({
    affectedPackages: ["//"],
    changedFiles: [".github/workflows/agent-evals.yml"],
  });
  assert.equal(result.relevant, true);
  assert.match(result.reason, /asset list/);
});

test("chat-route wiring matches the agent asset regex", () => {
  const result = decide({
    affectedPackages: ["@hire-me-mcp/web"],
    changedFiles: ["apps/web/app/api/chat/route.ts"],
  });
  assert.equal(result.relevant, true);
});

test("the run-evals override label forces relevance regardless of the diff", () => {
  const result = decide({
    labels: ["run-evals"],
    affectedPackages: ["//"],
    changedFiles: ["docs/development.md"],
  });
  assert.equal(result.relevant, true);
  assert.match(result.reason, /override label/);
});

test("other labels do not force relevance", () => {
  const result = decide({
    labels: ["bug", "documentation"],
    affectedPackages: ["//"],
  });
  assert.equal(result.relevant, false);
});

test("non-PR, non-push events (workflow_dispatch) are always relevant", () => {
  const result = decide({
    eventName: "workflow_dispatch",
    affectedPackages: [],
  });
  assert.equal(result.relevant, true);
});

test("push events go through the same graph decision", () => {
  const skip = decide({ eventName: "push", affectedPackages: ["//"] });
  assert.equal(skip.relevant, false);
  const run = decide({ eventName: "push", affectedPackages: [AGENT] });
  assert.equal(run.relevant, true);
});

test("an empty extra regex disables the glob signal without matching everything", () => {
  const result = decide({
    extraPathRegex: "",
    affectedPackages: ["//"],
    changedFiles: ["anything/at/all.ts"],
  });
  assert.equal(result.relevant, false);
});

test("a missing target package throws (caller fails open)", () => {
  assert.throws(() => decide({ targetPackage: "" }), /TARGET_PACKAGE/);
});

test("parseAffectedPackages extracts names from turbo query output", () => {
  const output = JSON.stringify({
    data: {
      affectedPackages: {
        items: [{ name: "//" }, { name: AGENT }],
      },
    },
  });
  assert.deepEqual(parseAffectedPackages(output), ["//", AGENT]);
});

test("parseAffectedPackages throws on malformed output (caller fails open)", () => {
  assert.throws(() => parseAffectedPackages("not json"));
  assert.throws(() => parseAffectedPackages('{"data":{}}'), /Unexpected/);
  assert.throws(
    () => parseAffectedPackages('{"data":{"affectedPackages":{"items":[{}]}}}'),
    /without a string name/,
  );
});

/**
 * #59 AC: "verified by a test that changing a documented endpoint to a
 * bogus URL makes the job fail." This file proves that end to end: it
 * spins up a tiny local HTTP server standing in for a live deployment
 * (serving a real MCP JSON-RPC responder plus `/.well-known/mcp.json` and
 * `/llms-full.txt`), builds README/docs-mcp.md fixture text pointing at
 * it, and runs the SAME `runSnippetChecks` orchestrator the CLI uses.
 *
 * Plain `node --test` (no Vitest/workspace wiring) — this script lives at
 * the repo root outside the pnpm workspace, same convention as
 * `scripts/ci/verify-readme-local-dev.mjs`. Run directly:
 *
 *   node --test scripts/ci/docs-rot/*.test.mjs
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  extractGeneratedRegion,
  parseClaudeCodeCommand,
  parseCurlCommand,
  parseMcpServersJson,
  parseToolTable,
  stripFence,
} from "./lib/extract-artifacts.mjs";
import { resolveToolsListUrl, runSnippetChecks } from "./lib/run-snippet-checks.mjs";

const TOOLS = [
  { name: "ping", description: "diagnostic", examplePrompt: "ping?" },
  { name: "get-profile", description: "profile", examplePrompt: "who?" },
];

// The real `claude` CLI check is exercised separately (and slowly, against
// a genuine deployment) — `check-claude-cli.test.mjs` covers it. These
// fixture tests stub it to a structural-only no-op so they stay fast and
// don't depend on `claude` being installed/reachable in this environment.
const skipClaudeCli = (_parsedCli, { note }) => {
  note("claude CLI check stubbed out in this fixture test — see check-claude-cli.test.mjs.");
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

function handleMcpRpc(rpc, res, tools) {
  const result = rpc.method === "initialize" ? { serverInfo: { name: "hire-me-mcp" } } : { tools };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
}

function handleMcpJson(res, origin, tools) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      serverName: "hire-me-mcp",
      transport: "streamable-http",
      auth: "none",
      endpointUrl: `${origin}/api/mcp`,
      tools,
    }),
  );
}

function handleLlmsFullTxt(res, tools) {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(tools.map((tool) => tool.name).join("\n"));
}

/**
 * A minimal fake MCP + connection-metadata server, standing in for a live
 * deployment. `tools` defaults to the module-level fixture set; the
 * preview-vs-production regression test below (#61/#174) passes a
 * DIFFERENT tool set per server instance, to simulate a PR preview whose
 * tool registry has already changed while the documented (production)
 * origin hasn't been deployed yet.
 */
function startFixtureServer({ tools = TOOLS } = {}) {
  return new Promise((resolvePromise) => {
    const server = createServer(async (req, res) => {
      if (req.url === "/api/mcp" && req.method === "POST") {
        handleMcpRpc(JSON.parse(await readBody(req)), res, tools);
        return;
      }
      if (req.url === "/.well-known/mcp.json") {
        handleMcpJson(res, `http://127.0.0.1:${server.address().port}`, tools);
        return;
      }
      if (req.url === "/llms-full.txt") {
        handleLlmsFullTxt(res, tools);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => resolvePromise(server));
  });
}

function buildDocs(origin) {
  const endpointUrl = `${origin}/api/mcp`;
  const readmeText = [
    "# fixture",
    "<!-- BEGIN GENERATED: mcp-endpoint-url -->",
    "```",
    endpointUrl,
    "```",
    "<!-- END GENERATED: mcp-endpoint-url -->",
    "<!-- BEGIN GENERATED: mcp-claude-code-snippet -->",
    "```bash",
    `claude mcp add --transport http hire-me-mcp ${endpointUrl}`,
    "```",
    "<!-- END GENERATED: mcp-claude-code-snippet -->",
    "<!-- BEGIN GENERATED: mcp-cursor-vscode-snippet -->",
    "```json",
    JSON.stringify({ mcpServers: { "hire-me-mcp": { url: endpointUrl } } }, null, 2),
    "```",
    "<!-- END GENERATED: mcp-cursor-vscode-snippet -->",
    "<!-- BEGIN GENERATED: mcp-tool-table -->",
    "| Tool | What it answers | Example question |",
    "| --- | --- | --- |",
    "| `get-profile` | profile | who? |",
    "<!-- END GENERATED: mcp-tool-table -->",
    "",
  ].join("\n");

  const docsMcpText = [
    "# fixture docs/mcp.md",
    ...readmeText.split("\n").slice(1),
    "<!-- BEGIN GENERATED: mcp-curl-jsonrpc-snippet -->",
    "```bash",
    `curl -s ${endpointUrl} \\`,
    '  -H "Content-Type: application/json" \\',
    '  -H "Accept: application/json, text/event-stream" \\',
    '  -d \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"healthcheck","version":"1.0"}}}\'',
    "```",
    "<!-- END GENERATED: mcp-curl-jsonrpc-snippet -->",
    "",
  ].join("\n");

  return { readmeText, docsMcpText };
}

test("extractGeneratedRegion round-trips a marked region", () => {
  const source = "before\n<!-- BEGIN GENERATED: x -->\nhello\n<!-- END GENERATED: x -->\nafter";
  assert.equal(extractGeneratedRegion(source, "x"), "hello");
});

test("extractGeneratedRegion throws a clear error when the marker is missing", () => {
  assert.throws(
    () => extractGeneratedRegion("no markers here", "x"),
    /No BEGIN\/END GENERATED marker pair/,
  );
});

test("stripFence strips a language-tagged fenced block", () => {
  assert.equal(stripFence("```bash\necho hi\n```", "bash"), "echo hi");
});

test("parseToolTable extracts tool names from the markdown table", () => {
  const table = [
    "| Tool | What |",
    "| --- | --- |",
    "| `get-profile` | x |",
    "| `ping` | y |",
  ].join("\n");
  assert.deepEqual(parseToolTable(table), ["get-profile", "ping"]);
});

test("parseCurlCommand extracts url, headers and body", () => {
  const curl = [
    "curl -s https://example.com/api/mcp \\",
    '  -H "Content-Type: application/json" \\',
    "  -d '{\"a\":1}'",
  ].join("\n");
  const parsed = parseCurlCommand(curl);
  assert.equal(parsed.url, "https://example.com/api/mcp");
  assert.equal(parsed.headers["Content-Type"], "application/json");
  assert.equal(parsed.body, '{"a":1}');
});

test("parseClaudeCodeCommand extracts transport/name/url", () => {
  const parsed = parseClaudeCodeCommand(
    "claude mcp add --transport http hire-me-mcp https://example.com/api/mcp",
  );
  assert.deepEqual(parsed, {
    transport: "http",
    name: "hire-me-mcp",
    url: "https://example.com/api/mcp",
  });
});

test("parseMcpServersJson extracts the first server's url/type", () => {
  const parsed = parseMcpServersJson(
    JSON.stringify({ mcpServers: { foo: { url: "https://x/api/mcp" } } }),
  );
  assert.equal(parsed.name, "foo");
  assert.equal(parsed.url, "https://x/api/mcp");
  assert.equal(parsed.type, undefined);
});

test("runSnippetChecks passes when every documented snippet matches a live fixture deployment", async () => {
  const server = await startFixtureServer();
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const { readmeText, docsMcpText } = buildDocs(origin);

    const result = await runSnippetChecks({
      targetUrl: origin,
      readmeText,
      docsMcpText,
      checkClaudeCli: skipClaudeCli,
    });

    assert.equal(result.ok, true, `expected no failures, got:\n${result.failures.join("\n")}`);
  } finally {
    server.close();
  }
});

// The AC this test exists for: "changing a documented endpoint to a bogus
// URL makes the job fail." README.md's mcp-endpoint-url region is mutated
// to an unreachable host — nothing else changes — and the SAME orchestrator
// the CLI runs must report failure, naming the stale snippet.
test("runSnippetChecks fails when the documented endpoint is bogus", async () => {
  const server = await startFixtureServer();
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const { readmeText, docsMcpText } = buildDocs(origin);

    const bogusEndpoint = "http://127.0.0.1:1/api/mcp"; // port 1: nothing listens there
    const bogusReadmeText = readmeText.replace(`${origin}/api/mcp`, bogusEndpoint);
    const bogusDocsMcpText = docsMcpText.replace(`${origin}/api/mcp`, bogusEndpoint);

    const result = await runSnippetChecks({
      targetUrl: origin,
      readmeText: bogusReadmeText,
      docsMcpText: bogusDocsMcpText,
      checkClaudeCli: skipClaudeCli,
    });

    assert.equal(result.ok, false, "expected the job to fail against a bogus documented endpoint");
    assert.ok(
      result.failures.some((failure) => failure.includes("mcp-curl-jsonrpc-snippet")),
      `expected a failure naming the stale curl snippet, got:\n${result.failures.join("\n")}`,
    );
  } finally {
    server.close();
  }
});

test("runSnippetChecks fails and names the file when a documented tool is missing from tools/list", async () => {
  const server = await startFixtureServer();
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const { readmeText, docsMcpText } = buildDocs(origin);
    const readmeWithGhostTool = readmeText.replace(
      "| `get-profile` | profile | who? |",
      "| `get-profile` | profile | who? |\n| `search-projects` | search | find? |",
    );

    const result = await runSnippetChecks({
      targetUrl: origin,
      readmeText: readmeWithGhostTool,
      docsMcpText,
      checkClaudeCli: skipClaudeCli,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.failures.some((failure) => failure.includes("README.md#mcp-tool-table")),
      `expected a failure naming README.md's tool table, got:\n${result.failures.join("\n")}`,
    );
  } finally {
    server.close();
  }
});

// #61/#174: the docs' hardcoded endpoint always points at PRODUCTION (see
// docs/mcp.md's "That URL is defined once..." note) — but on a `pull_request`
// run, `targetUrl` is the PR's own PREVIEW deployment, which is often
// *ahead* of production (a new tool landed on this PR's branch but hasn't
// been merged/deployed to prod yet). The tool-table check must validate
// the documented tool table against the DEPLOYMENT UNDER TEST (targetUrl),
// not against the doc's literal (production) endpoint, or every PR that
// adds a tool fails its own docs-rot check for a reason that has nothing
// to do with that PR's actual correctness.
test("runSnippetChecks checks the documented tool table against targetUrl, not the documented (production) endpoint — #61/#174", async () => {
  const previewOnlyTool = {
    name: "search-career",
    description: "search",
    examplePrompt: "search?",
  };
  const prodServer = await startFixtureServer({ tools: TOOLS }); // no search-career yet
  const previewServer = await startFixtureServer({ tools: [...TOOLS, previewOnlyTool] });
  try {
    const prodOrigin = `http://127.0.0.1:${prodServer.address().port}`;
    const previewOrigin = `http://127.0.0.1:${previewServer.address().port}`;

    // The docs (as generated on this PR's branch) document the new tool,
    // but their hardcoded endpoint literal still points at "production"
    // (prodServer), which doesn't have it yet.
    const { readmeText, docsMcpText } = buildDocs(prodOrigin);
    const readmeWithNewTool = readmeText.replace(
      "<!-- END GENERATED: mcp-tool-table -->",
      "| `search-career` | search | search? |\n<!-- END GENERATED: mcp-tool-table -->",
    );

    const result = await runSnippetChecks({
      targetUrl: previewOrigin, // this PR's preview — has the new tool
      readmeText: readmeWithNewTool,
      docsMcpText,
      checkClaudeCli: skipClaudeCli,
    });

    assert.equal(
      result.ok,
      true,
      `expected no failures (tool-table check should use targetUrl, not the documented production endpoint), got:\n${result.failures.join("\n")}`,
    );
  } finally {
    prodServer.close();
    previewServer.close();
  }
});

// #174's explicit acceptance criterion — "unit-test the target selection".
// The end-to-end fixture test above proves the PREVIEW direction; these
// pin the rule itself, including the production/cron direction, so a
// future refactor cannot quietly send the tool-table check back to
// production on PRs (or, just as bad, away from production on the cron).
const DOCUMENTED_ENDPOINT = "https://hire-me-mcp-web.vercel.app/api/mcp";

test("resolveToolsListUrl maps the documented path onto the PR preview's origin", () => {
  assert.equal(
    resolveToolsListUrl("https://hire-me-mcp-web-git-feat-x.vercel.app", DOCUMENTED_ENDPOINT),
    "https://hire-me-mcp-web-git-feat-x.vercel.app/api/mcp",
  );
});

test("resolveToolsListUrl is the identity on the cron/push run, where targetUrl IS production", () => {
  assert.equal(
    resolveToolsListUrl("https://hire-me-mcp-web.vercel.app", DOCUMENTED_ENDPOINT),
    DOCUMENTED_ENDPOINT,
  );
});

test("resolveToolsListUrl keeps the documented PATH, not a re-typed literal", () => {
  assert.equal(
    resolveToolsListUrl("https://preview.example.test", "https://prod.example.test/mcp/v2"),
    "https://preview.example.test/mcp/v2",
  );
});

test("resolveToolsListUrl tolerates a trailing slash and a port on the target", () => {
  assert.equal(
    resolveToolsListUrl("http://127.0.0.1:8123/", DOCUMENTED_ENDPOINT),
    "http://127.0.0.1:8123/api/mcp",
  );
});

// The other half of #174's acceptance criteria: "daily production cron
// behavior unchanged". Targeting the preview on PRs must NOT have turned
// the tool-table check into a tautology — when the run IS the production
// run, a tool documented but absent from production still has to fail.
test("on the production run, a documented tool missing from production still fails — #174", async () => {
  const prodServer = await startFixtureServer({ tools: TOOLS }); // no search-career
  try {
    const prodOrigin = `http://127.0.0.1:${prodServer.address().port}`;
    const { readmeText, docsMcpText } = buildDocs(prodOrigin);
    const readmeWithUndeployedTool = readmeText.replace(
      "<!-- END GENERATED: mcp-tool-table -->",
      "| `search-career` | search | search? |\n<!-- END GENERATED: mcp-tool-table -->",
    );

    const result = await runSnippetChecks({
      targetUrl: prodOrigin, // the daily cron / push-to-main target
      readmeText: readmeWithUndeployedTool,
      docsMcpText,
      checkClaudeCli: skipClaudeCli,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.failures.some(
        (failure) =>
          failure.includes("README.md#mcp-tool-table") && failure.includes("search-career"),
      ),
      `expected the tool-table check to still fail against production, got:\n${result.failures.join("\n")}`,
    );
  } finally {
    prodServer.close();
  }
});

test("the run reports which deployment the tool table was checked against — #174", async () => {
  const server = await startFixtureServer();
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const { readmeText, docsMcpText } = buildDocs(origin);

    const result = await runSnippetChecks({
      targetUrl: origin,
      readmeText,
      docsMcpText,
      checkClaudeCli: skipClaudeCli,
    });

    assert.ok(
      result.notes.some((note) => note.includes(`${origin}/api/mcp`)),
      `expected a note naming the tool-table target, got:\n${result.notes.join("\n")}`,
    );
  } finally {
    server.close();
  }
});

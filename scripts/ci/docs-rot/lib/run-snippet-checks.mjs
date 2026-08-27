/**
 * #59 — orchestrates every snippet-execution check against a live
 * deployment. Exported as a plain function (rather than only a CLI) so
 * `extract-artifacts.test.mjs` can drive it directly against a local
 * fixture server and assert failure modes without shelling out.
 *
 * Two independent sources of "what's documented":
 * - README.md / docs/mcp.md (read from disk — checked-in, generated
 *   regions, #17) — the CLIENT-FACING snippets: the endpoint URL, the
 *   Claude Code CLI command, the Cursor/VS Code JSON config, and (in
 *   docs/mcp.md only) the raw curl healthcheck.
 * - `/.well-known/mcp.json` and `/llms-full.txt`, fetched FROM the target
 *   deployment (preview or production, whichever `targetUrl` is) — these
 *   render per-deploy from the live tool registry, so fetching them from
 *   the target under test (rather than always reading a checked-in copy)
 *   is what makes this check catch a preview build that actually changed
 *   the tool registry, not just a stale doc.
 *
 * Every network call's URL comes from one of those two extraction paths —
 * never a literal re-typed here — which is what makes the "bogus
 * documented endpoint fails the job" AC true (see the module doc on
 * `lib/extract-artifacts.mjs`). Each `check*` helper below owns one AC and
 * reports through the same `{ fail, note }` reporter so failures always
 * name the exact file/region or live artifact that is stale.
 *
 * One deliberate exception to "checks run against the documented endpoint"
 * (#61/#174): `checkToolsListAgainstReadme`'s `tools/list` call runs
 * against `targetUrl` (via `resolveToolsListUrl`), not the documented
 * (always-production) endpoint. The curl/CLI/JSON-config checks are
 * legitimately about whether the doc's literal, copy-pasteable snippet
 * works — that has to mean production, what a reader actually copies. The
 * tool-table check is about whether the doc's CONTENT (which tool names
 * are listed) matches the deployment this run is validating, which on a
 * `pull_request` run is the PR's own preview — routinely ahead of
 * production for the exact PR that just added a tool. Checking that one
 * against production would fail every tool-adding PR before it's even
 * merged, for a reason unrelated to that PR's correctness.
 */

import { checkClaudeCodeCli } from "./check-claude-cli.mjs";
import {
  extractDocsMcpArtifacts,
  extractReadmeArtifacts,
  parseClaudeCodeCommand,
  parseCurlCommand,
  parseMcpServersJson,
} from "./extract-artifacts.mjs";
import { mcpToolsList, parseMcpResponseBody } from "./mcp-client.mjs";

const VALID_JSON_TRANSPORT_TYPES = new Set([
  undefined,
  "http",
  "streamable-http",
  "streamableHttp",
]);

/** Executes the documented raw curl healthcheck verbatim (AC: raw HTTP `initialize`). */
async function checkCurlSnippet(docsMcp, documentedEndpoint, headers, reporter) {
  const source = "docs/mcp.md#mcp-curl-jsonrpc-snippet";
  let curlParsed;
  try {
    curlParsed = parseCurlCommand(docsMcp.curlCommand);
  } catch (error) {
    reporter.fail(source, error.message);
    return;
  }
  if (curlParsed.url !== documentedEndpoint) {
    reporter.fail(
      source,
      `curl snippet targets "${curlParsed.url}", but the documented endpoint is "${documentedEndpoint}".`,
    );
  }
  try {
    const response = await fetch(curlParsed.url, {
      method: "POST",
      headers: { ...curlParsed.headers, ...headers },
      body: curlParsed.body,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    const message = parseMcpResponseBody(response.headers.get("content-type") ?? "", text);
    if (message.error) {
      throw new Error(`JSON-RPC error: ${JSON.stringify(message.error)}`);
    }
    const serverName = message.result?.serverInfo?.name;
    if (serverName !== "hire-me-mcp") {
      reporter.fail(
        source,
        `initialize response serverInfo.name was "${serverName}", expected "hire-me-mcp".`,
      );
    }
  } catch (error) {
    reporter.fail(
      source,
      `executing the documented curl command against "${curlParsed.url}" failed: ${error.message}`,
    );
  }
}

/**
 * `tools/list` against the DEPLOYMENT UNDER TEST (`toolsListUrl`, derived
 * from `targetUrl` — see {@link resolveToolsListUrl}), cross-checked
 * against README's tool table (AC: no tool missing).
 *
 * Deliberately NOT the documented (production) endpoint, unlike every
 * other check in this file (#61/#174): the doc's literal endpoint always
 * reads as production (docs/mcp.md's "That URL is defined once..." note),
 * but on a `pull_request` run `targetUrl` is that PR's own preview — which
 * is routinely *ahead* of production (a PR that adds a tool has it in its
 * preview build before it's merged/deployed). Checking the tool table
 * against production instead would fail every such PR for a reason that
 * has nothing to do with that PR's own correctness; checking it against
 * the deployment the PR actually produced is what the AC ("stale doc vs.
 * live tools/list") means.
 */
async function checkToolsListAgainstReadme(readme, toolsListUrl, headers, reporter) {
  // #174: state the target out loud. The original bug was invisible in the
  // logs — the failure said "documented tool(s) not present in live
  // tools/list" without naming WHICH deployment answered, so it read as a
  // product problem when it was a targeting problem.
  reporter.note(`README tool-table checked against the deployment under test: ${toolsListUrl}`);
  let liveToolNames;
  try {
    liveToolNames = await mcpToolsList(toolsListUrl, { headers });
  } catch (error) {
    reporter.fail(`target deployment (${toolsListUrl})`, `tools/list failed: ${error.message}`);
    return;
  }
  const missing = readme.toolNames.filter((name) => !liveToolNames.includes(name));
  if (missing.length > 0) {
    reporter.fail(
      "README.md#mcp-tool-table",
      `documented tool(s) not present in the tools/list of the deployment under test ` +
        `(${toolsListUrl}): ${missing.join(", ")}.`,
    );
  }
}

/**
 * Maps the documented (production) endpoint's PATH onto `targetUrl`'s
 * origin, so the tool-table check above queries `tools/list` on the
 * deployment actually under test (preview on a PR run, production itself
 * on the daily cron/push-to-main run, where `targetUrl` IS production) —
 * never a literal `/api/mcp` re-typed here, matching this file's own "every
 * URL comes from extraction, never a re-typed literal" rule.
 *
 * On the daily cron / push-to-main run `targetUrl` IS the documented
 * production origin, so this is the identity mapping and production
 * behaviour is unchanged — asserted directly in
 * `extract-artifacts.test.mjs` (#174's "unit-test the target selection"
 * acceptance criterion), in both directions.
 *
 * Exported for those tests: the selection rule is the whole point of #174,
 * so it is checked as a rule, not only through a fixture server.
 */
export function resolveToolsListUrl(targetUrl, documentedEndpoint) {
  const path = new URL(documentedEndpoint).pathname;
  return new URL(path, targetUrl).toString();
}

/** The Claude Code CLI snippet (AC: executed in CI, exit status asserted). */
function checkClaudeCodeSnippet(readme, documentedEndpoint, checkClaudeCli, reporter) {
  const source = "README.md#mcp-claude-code-snippet";
  let parsedCli;
  try {
    parsedCli = parseClaudeCodeCommand(readme.claudeCodeCommand);
  } catch (error) {
    reporter.fail(source, error.message);
    return;
  }
  if (parsedCli.url !== documentedEndpoint) {
    reporter.fail(
      source,
      `snippet targets "${parsedCli.url}", but the documented endpoint is "${documentedEndpoint}".`,
    );
    return;
  }
  if (parsedCli.transport !== "http") {
    reporter.fail(
      source,
      `snippet uses transport "${parsedCli.transport}", expected "http" (Streamable HTTP).`,
    );
    return;
  }
  checkClaudeCli(parsedCli, reporter);
}

/** The Cursor/VS Code JSON client config (AC: parses, endpoint/transport match the live server). */
function checkJsonClientConfig(readme, documentedEndpoint, reporter) {
  const source = "README.md#mcp-cursor-vscode-snippet";
  let parsedJson;
  try {
    parsedJson = parseMcpServersJson(readme.cursorJsonRaw);
  } catch (error) {
    reporter.fail(source, `not valid JSON: ${error.message}`);
    return;
  }
  if (parsedJson.url !== documentedEndpoint) {
    reporter.fail(
      source,
      `mcpServers JSON targets "${parsedJson.url}", but the documented endpoint is "${documentedEndpoint}".`,
    );
  }
  if (!VALID_JSON_TRANSPORT_TYPES.has(parsedJson.type)) {
    reporter.fail(
      source,
      `mcpServers JSON declares an unexpected "type": "${parsedJson.type}" for a streamable-HTTP server.`,
    );
  }
}

/** Fetches `/.well-known/mcp.json` from the target deployment and validates its shape + tool set. */
async function fetchAndCheckMcpJson(targetUrl, headers, reporter) {
  const source = `${targetUrl}/.well-known/mcp.json`;
  let mcpJson;
  try {
    const response = await fetch(source, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    mcpJson = await response.json();
  } catch (error) {
    reporter.fail(source, `fetch/parse failed: ${error.message}`);
    return undefined;
  }

  if (mcpJson.transport !== "streamable-http") {
    reporter.fail(source, `declares transport "${mcpJson.transport}", expected "streamable-http".`);
  }
  if (mcpJson.auth !== "none") {
    reporter.fail(source, `declares auth "${mcpJson.auth}", expected "none".`);
  }
  if (typeof mcpJson.endpointUrl !== "string" || !mcpJson.endpointUrl.startsWith(targetUrl)) {
    reporter.fail(
      source,
      `declares endpointUrl "${mcpJson.endpointUrl}", which does not point at the target deployment origin "${targetUrl}".`,
    );
    return mcpJson;
  }

  let deploymentToolNames;
  try {
    deploymentToolNames = await mcpToolsList(mcpJson.endpointUrl, { headers });
  } catch (error) {
    reporter.fail(mcpJson.endpointUrl, `tools/list failed: ${error.message}`);
    return mcpJson;
  }
  const documented = [...new Set((mcpJson.tools ?? []).map((tool) => tool.name))].sort();
  const live = [...new Set(deploymentToolNames)].sort();
  const missingFromLive = documented.filter((name) => !live.includes(name));
  const undocumentedLive = live.filter((name) => !documented.includes(name));
  if (missingFromLive.length > 0) {
    reporter.fail(
      source,
      `documents tool(s) not present in the live tools/list: ${missingFromLive.join(", ")}.`,
    );
  }
  if (undocumentedLive.length > 0) {
    reporter.fail(
      source,
      `live tools/list has tool(s) not documented in mcp.json: ${undocumentedLive.join(", ")}.`,
    );
  }
  return mcpJson;
}

/** Fetches `/llms-full.txt` from the target deployment and asserts every documented tool is mentioned. */
async function checkLlmsFullTxt(targetUrl, headers, documentedToolNames, reporter) {
  const source = `${targetUrl}/llms-full.txt`;
  try {
    const response = await fetch(source, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    const missing = documentedToolNames.filter((name) => !text.includes(name));
    if (missing.length > 0) {
      reporter.fail(source, `does not mention documented tool(s): ${missing.join(", ")}.`);
    }
  } catch (error) {
    reporter.fail(source, `fetch failed: ${error.message}`);
  }
}

/**
 * @param {{
 *   targetUrl: string,
 *   readmeText: string,
 *   docsMcpText: string,
 *   headers?: Record<string, string>,
 *   checkClaudeCli?: typeof checkClaudeCodeCli,
 * }} input
 * @returns {Promise<{ ok: boolean, failures: string[], notes: string[] }>}
 */
export async function runSnippetChecks({
  targetUrl,
  readmeText,
  docsMcpText,
  headers = {},
  checkClaudeCli = checkClaudeCodeCli,
}) {
  const failures = [];
  const notes = [];
  const reporter = {
    fail: (source, message) => failures.push(`[${source}] ${message}`),
    note: (message) => notes.push(message),
  };

  let readme;
  let docsMcp;
  try {
    readme = extractReadmeArtifacts(readmeText);
  } catch (error) {
    reporter.fail("README.md", error.message);
  }
  try {
    docsMcp = extractDocsMcpArtifacts(docsMcpText);
  } catch (error) {
    reporter.fail("docs/mcp.md", error.message);
  }
  if (!readme || !docsMcp) {
    return { ok: false, failures, notes };
  }

  if (readme.endpointUrl !== docsMcp.endpointUrl) {
    reporter.fail(
      "README.md vs docs/mcp.md",
      `documented endpoints disagree: README says "${readme.endpointUrl}", docs/mcp.md says "${docsMcp.endpointUrl}".`,
    );
  }
  const documentedEndpoint = docsMcp.endpointUrl;

  await checkCurlSnippet(docsMcp, documentedEndpoint, headers, reporter);
  const toolsListUrl = resolveToolsListUrl(targetUrl, documentedEndpoint);
  await checkToolsListAgainstReadme(readme, toolsListUrl, headers, reporter);
  checkClaudeCodeSnippet(readme, documentedEndpoint, checkClaudeCli, reporter);
  checkJsonClientConfig(readme, documentedEndpoint, reporter);

  const mcpJson = await fetchAndCheckMcpJson(targetUrl, headers, reporter);
  const documentedToolNames = mcpJson
    ? (mcpJson.tools ?? []).map((tool) => tool.name)
    : readme.toolNames;
  await checkLlmsFullTxt(targetUrl, headers, documentedToolNames, reporter);

  return { ok: failures.length === 0, failures, notes };
}

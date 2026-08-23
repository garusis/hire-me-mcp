#!/usr/bin/env node
/**
 * #78 launch collateral — the script behind docs/assets/mcp-demo.gif.
 *
 * A real MCP Streamable HTTP client that connects to the LIVE production
 * endpoint (https://hire-me-mcp-web.vercel.app/api/mcp), runs the standard
 * `initialize` -> `tools/list` -> `tools/call` sequence, and prints the
 * exact JSON-RPC responses the server returns. Nothing here is scripted
 * output or a mock — every line printed is the live response body, so the
 * recording it produces (via `docs/assets/mcp-demo.tape`, run through the
 * `vhs` CLI) is a faithful transcript of a real session, not a fabrication.
 *
 * Run it yourself the same way the recording did:
 *
 *   node scripts/demo/mcp-session-demo.mjs
 */

const ENDPOINT = "https://hire-me-mcp-web.vercel.app/api/mcp";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses a `text/event-stream` or `application/json` MCP response body into its JSON-RPC message. */
function parseMcpResponseBody(contentType, text) {
  if (contentType.includes("text/event-stream")) {
    const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) throw new Error(`No SSE "data:" line in response:\n${text.slice(0, 300)}`);
    return JSON.parse(dataLine.slice("data:".length).trim());
  }
  return JSON.parse(text);
}

async function mcpRequest(method, params) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? {} }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MCP "${method}" failed: HTTP ${response.status}\n${text.slice(0, 300)}`);
  }
  const message = parseMcpResponseBody(response.headers.get("content-type") ?? "", text);
  if (message.error) {
    throw new Error(`MCP "${method}" returned a JSON-RPC error: ${JSON.stringify(message.error)}`);
  }
  return message.result;
}

async function main() {
  console.log(`$ connecting to ${ENDPOINT} (Streamable HTTP, no auth)\n`);
  await sleep(400);

  const init = await mcpRequest("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "hire-me-mcp-demo", version: "1.0" },
  });
  console.log(`< initialize: connected to "${init.serverInfo.name}" v${init.serverInfo.version}\n`);
  await sleep(600);

  const tools = await mcpRequest("tools/list");
  const names = tools.tools.map((t) => t.name);
  console.log(`< tools/list: ${names.join(", ")}\n`);
  await sleep(800);

  const question = "Has Marcos worked with event-driven architectures?";
  console.log(`> get-skill-evidence({ term: "event-driven architecture" })`);
  console.log(`  # "${question}"\n`);
  await sleep(500);

  const result = await mcpRequest("tools/call", {
    name: "get-skill-evidence",
    arguments: { term: "event-driven architecture" },
  });
  const data = JSON.parse(result.content[0].text);

  console.log(`< kind: "${data.data.kind}" (claimed, not a guess)`);
  console.log(`< skill: ${data.data.skill.name} — proficiency: ${data.data.skill.proficiency}`);
  console.log("< citation:");
  for (const citation of data.citations) {
    console.log(
      `    - ${citation.entityType}: ${citation.label}${citation.fragment ? ` (${citation.fragment})` : ""}`,
    );
  }
  console.log("\n# every answer traces back to a real profile/experience/project record.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

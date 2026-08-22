/**
 * #59 docs-rot guard — extraction layer.
 *
 * Everything here READS the already-published artifacts (README.md,
 * docs/mcp.md, the JSON `mcpServers` snippet, the Claude Code CLI snippet,
 * the markdown tool table) and turns them into plain data the checkers can
 * execute against a live endpoint. Nothing here re-declares a URL, a tool
 * name, or a command — every value returned by these functions is read out
 * of the document text passed in, using the SAME `<!-- BEGIN GENERATED: id
 * --> ... <!-- END GENERATED: id -->` marker convention
 * `packages/connect-metadata/src/injector.ts` writes (read-only mirror of
 * that convention — this module never writes docs, only reads them).
 *
 * This is what makes the "bogus documented endpoint fails the job" AC true:
 * if a generated region in README.md/docs/mcp.md is edited (by hand, or by
 * a drifted generator) to a wrong URL, `extractReadmeArtifacts`/
 * `extractDocsMcpArtifacts` return THAT wrong URL, and every check built on
 * top of it (curl execution, tools/list, CLI registration, JSON config
 * cross-check) then fails against the real network — see
 * `extract-artifacts.test.mjs` for the fixture proving this end to end.
 */

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extracts the raw text between a `<!-- BEGIN GENERATED: id -->` /
 * `<!-- END GENERATED: id -->` marker pair — mirrors
 * `packages/connect-metadata/src/injector.ts`'s marker format exactly, but
 * read-only (no generation logic is duplicated here).
 */
export function extractGeneratedRegion(source, id) {
  const begin = `<!-- BEGIN GENERATED: ${id} -->`;
  const end = `<!-- END GENERATED: ${id} -->`;
  const re = new RegExp(`${escapeRegExp(begin)}\\n([\\s\\S]*?)\\n${escapeRegExp(end)}`);
  const match = source.match(re);
  if (!match) {
    throw new Error(`No BEGIN/END GENERATED marker pair found for region "${id}".`);
  }
  return match[1];
}

/** Strips a fenced code block (```` ```lang\n...\n``` ````) down to its inner text. */
export function stripFence(block, lang = "") {
  const trimmed = block.trim();
  const re = new RegExp(`^\`\`\`${lang}\\n([\\s\\S]*?)\\n\`\`\`$`);
  const match = trimmed.match(re);
  if (!match) {
    throw new Error(
      `Expected a fenced code block${lang ? ` (\`\`\`${lang} ... \`\`\`)` : ""}, got:\n${trimmed}`,
    );
  }
  return match[1];
}

/** Parses the `| \`tool-name\` | ... | ... |` markdown table into an ordered list of tool names. */
export function parseToolTable(tableMarkdown) {
  const lines = tableMarkdown
    .trim()
    .split("\n")
    .filter((line) => line.trim().length > 0);
  // Row 0 is the header, row 1 the `---` separator — real data starts at row 2.
  const dataRows = lines.slice(2);
  return dataRows.map((line) => {
    const firstCell = line.split("|")[1]?.trim() ?? "";
    const name = firstCell.replace(/`/g, "").trim();
    if (!name) {
      throw new Error(`Could not parse a tool name out of tool-table row: ${line}`);
    }
    return name;
  });
}

/** A minimal POSIX-ish shell tokenizer — just enough for the one documented `curl ... \` snippet. */
function tokenizeShell(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "\\" && command[i + 1] === "\n") {
      i++; // documented snippet uses trailing `\` line continuations
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function parseHeaderFlag(raw) {
  const separatorIndex = raw.indexOf(":");
  if (separatorIndex === -1) {
    throw new Error(`Malformed -H header in curl snippet: ${raw}`);
  }
  return [raw.slice(0, separatorIndex).trim(), raw.slice(separatorIndex + 1).trim()];
}

const NO_OP_CURL_FLAGS = new Set(["-s", "--silent"]);
const HEADER_FLAGS = new Set(["-H", "--header"]);
const DATA_FLAGS = new Set(["-d", "--data"]);

/** Applies one curl token to the in-progress parse result; returns how many extra tokens it consumed. */
function applyCurlToken(tokens, index, result) {
  const token = tokens[index];
  if (HEADER_FLAGS.has(token)) {
    const [key, value] = parseHeaderFlag(tokens[index + 1]);
    result.headers[key] = value;
    return 1;
  }
  if (DATA_FLAGS.has(token)) {
    result.body = tokens[index + 1];
    return 1;
  }
  if (NO_OP_CURL_FLAGS.has(token)) {
    return 0;
  }
  if (!token.startsWith("-")) {
    result.url = token;
  }
  return 0;
}

/** Parses the documented `curl <url> -H "..." -d '...'` healthcheck snippet into its parts. */
export function parseCurlCommand(curlScript) {
  const tokens = tokenizeShell(curlScript);
  if (tokens[0] !== "curl") {
    throw new Error(`Expected the snippet to start with "curl", got: ${tokens[0]}`);
  }
  const result = { headers: {}, url: undefined, body: undefined };
  for (let i = 1; i < tokens.length; i++) {
    i += applyCurlToken(tokens, i, result);
  }
  if (!result.url) {
    throw new Error(`Could not find a target URL in curl snippet:\n${curlScript}`);
  }
  return result;
}

/** Parses the documented `claude mcp add --transport <t> <name> <url>` snippet. */
export function parseClaudeCodeCommand(command) {
  const tokens = command.trim().split(/\s+/);
  if (tokens[0] !== "claude" || tokens[1] !== "mcp" || tokens[2] !== "add") {
    throw new Error(`Expected "claude mcp add ...", got: ${command}`);
  }
  const transportFlagIndex = tokens.indexOf("--transport");
  if (transportFlagIndex === -1) {
    throw new Error(`Expected a --transport flag in claude mcp add snippet: ${command}`);
  }
  const transport = tokens[transportFlagIndex + 1];
  const positionals = tokens
    .slice(transportFlagIndex + 2)
    .filter((token) => !token.startsWith("-"));
  const [name, url] = positionals;
  if (!name || !url) {
    throw new Error(`Expected a server name and URL after --transport ${transport}: ${command}`);
  }
  return { transport, name, url };
}

/** Parses the `{ "mcpServers": { "<name>": { "url": "...", "type"?: "..." } } }` config snippet. */
export function parseMcpServersJson(jsonRaw) {
  const parsed = JSON.parse(jsonRaw);
  const entries = Object.entries(parsed.mcpServers ?? {});
  if (entries.length === 0) {
    throw new Error(`Expected at least one entry under "mcpServers" in:\n${jsonRaw}`);
  }
  const [name, config] = entries[0];
  return { name, url: config.url, type: config.type };
}

/**
 * Extracts every region shared by README.md and docs/mcp.md (both are
 * rendered from `packages/connect-metadata` per #17, so they use the same
 * region ids).
 */
export function extractSharedRegions(markdownText) {
  const endpointUrl = stripFence(extractGeneratedRegion(markdownText, "mcp-endpoint-url")).trim();
  const claudeCodeCommand = stripFence(
    extractGeneratedRegion(markdownText, "mcp-claude-code-snippet"),
    "bash",
  ).trim();
  const cursorJsonRaw = stripFence(
    extractGeneratedRegion(markdownText, "mcp-cursor-vscode-snippet"),
    "json",
  ).trim();
  const toolTableRegion = extractGeneratedRegion(markdownText, "mcp-tool-table");
  const toolNames = parseToolTable(toolTableRegion);
  return { endpointUrl, claudeCodeCommand, cursorJsonRaw, toolNames };
}

/** README.md's generated regions — no curl snippet (that one only lives in docs/mcp.md). */
export function extractReadmeArtifacts(readmeText) {
  return extractSharedRegions(readmeText);
}

/** docs/mcp.md's generated regions, plus the raw JSON-RPC healthcheck curl snippet. */
export function extractDocsMcpArtifacts(docsMcpText) {
  const shared = extractSharedRegions(docsMcpText);
  const curlBlock = extractGeneratedRegion(docsMcpText, "mcp-curl-jsonrpc-snippet");
  const curlCommand = stripFence(curlBlock, "bash").trim();
  return { ...shared, curlCommand };
}

/**
 * The full, exact set of tool names this server registers — the v0.3
 * toolset (#32): the diagnostic `ping` plus the four career tools. Exported
 * as a single source of truth so `tools/list` contract tests (this file's
 * own consumer and `app/api/mcp/route.test.ts`) assert against one explicit
 * list rather than each hard-coding its own copy.
 */
export const EXPECTED_TOOL_NAMES = [
  "ping",
  "get-profile",
  "get-experience",
  "search-projects",
  "get-skill-evidence",
] as const;

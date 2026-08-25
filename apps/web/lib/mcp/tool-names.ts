/**
 * The full, exact set of tool names this server registers — the v0.3
 * toolset (#32) plus `search-career` (#61), the semantic-retrieval tool:
 * the diagnostic `ping`, the four deterministic career tools, and
 * `search-career`. Exported as a single source of truth so `tools/list`
 * contract tests (this file's own consumer and `app/api/mcp/route.test.ts`)
 * assert against one explicit list rather than each hard-coding its own
 * copy.
 */
export const EXPECTED_TOOL_NAMES = [
  "ping",
  "get-profile",
  "get-experience",
  "search-projects",
  "get-skill-evidence",
  "search-career",
  "list-recommendations",
] as const;

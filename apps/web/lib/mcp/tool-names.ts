/**
 * The full, exact set of tool names this server registers — the v0.3
 * toolset (#32), `search-career` (#61, the semantic-retrieval tool), and
 * the five deterministic list tools from the #188 tool-coverage audit
 * (#211–#215). Exported as a single source of truth so `tools/list`
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
  "list-education",
  "list-skills",
  "list-gaps",
  "list-projects",
  "list-writing",
  "list-recommendations",
] as const;

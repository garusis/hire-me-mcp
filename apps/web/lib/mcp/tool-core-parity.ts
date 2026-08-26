/**
 * This server's tool-name -> executor mapping, reused (not re-derived) by
 * `tool-core-parity.test.ts` — the drift-detecting test asserting the MCP
 * server and the interview agent (`@hire-me-mcp/agent`) resolve every
 * shared tool name to the exact same `@hire-me-mcp/core` domain function
 * (#64, part of epic #5's one-source-of-truth architecture test).
 *
 * `createToolExecutor` (`define-tool.ts`) already exists precisely so a
 * tool's full validate/handle pipeline can be driven without a live
 * `McpServer` — this file's only job is to point it at the four
 * career-domain tools (`ping` is excluded: it wraps no core service, so it
 * has nothing to compare against).
 */

import { createToolExecutor } from "./define-tool";
import { getExperienceTool } from "./tools/get-experience";
import { getProfileTool } from "./tools/get-profile";
import { getSkillEvidenceTool } from "./tools/get-skill-evidence";
import { listRecommendationsTool } from "./tools/list-recommendations";
import { searchProjectsTool } from "./tools/search-projects";

/** The MCP server's own tool-name -> executor mapping for every core-backed tool. */
export const MCP_TOOL_EXECUTORS = {
  "get-profile": createToolExecutor(getProfileTool),
  "get-experience": createToolExecutor(getExperienceTool),
  "search-projects": createToolExecutor(searchProjectsTool),
  "get-skill-evidence": createToolExecutor(getSkillEvidenceTool),
  "list-recommendations": createToolExecutor(listRecommendationsTool),
} as const;

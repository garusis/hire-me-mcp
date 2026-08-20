/**
 * The diagnostic `ping` tool, re-registered through `defineTool` (#19) so
 * there is exactly one tool-registration path in this server — replacing
 * the ad hoc `server.registerTool(...)` call #11 wired directly into
 * `apps/web/app/api/mcp/route.ts`.
 */

import { z } from "zod";
import type { ToolDefinition } from "../define-tool";

const inputSchema = z.object({});

/** `ping` — registered against a live `McpServer` by `app/api/mcp/route.ts` via `defineTool`. */
export const pingTool: ToolDefinition<typeof inputSchema, string> = {
  name: "ping",
  description:
    "Diagnostic tool that returns 'pong'. Use it to verify the MCP connection is working " +
    "before calling any other tool. Do not use it to check the health or freshness of any " +
    "career-data source — it has no dependency on career data and always succeeds.",
  inputSchema,
  handler: () => ({ data: "pong", citations: [] }),
};

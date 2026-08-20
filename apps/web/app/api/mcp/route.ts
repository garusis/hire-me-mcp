import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import packageJson from "../../../package.json" with { type: "json" };

// This route runs as a Node.js serverless function (the Next.js App Router
// default for a route handler that doesn't opt into `runtime = "edge"`).
// mcp-handler / @modelcontextprotocol/server need full Node APIs (streams,
// crypto) that the Edge runtime doesn't provide, so the runtime is pinned
// explicitly rather than left implicit.
export const runtime = "nodejs";

// mcp-handler 2.x dropped its own `maxDuration` handler option — the
// underlying protocol (MCP spec 2026-07-28, served by mcp-handler >=2.0) is
// stateless and answers per request instead of holding an SSE connection
// open, so there's no handler-level timeout to configure. `maxDuration` here
// is the standard Next.js/Vercel route-segment export
// (https://vercel.com/docs/functions/configuring-functions/duration) that
// caps this function's execution time. 60s is the maximum allowed on the
// Hobby plan this project deploys to (Pro/Enterprise allow more); a
// diagnostic `ping` and the career-data reads planned for later tasks in
// this epic complete in well under a second, so 60s is a generous ceiling
// chosen for headroom, not because it's needed today.
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "ping",
      {
        title: "Ping",
        description:
          "Diagnostic tool that returns 'pong'. Use it to verify the MCP connection is working before calling any other tool.",
        inputSchema: z.object({}),
      },
      async () => ({
        content: [{ type: "text", text: "pong" }],
      }),
    );
  },
  {
    serverInfo: {
      name: "hire-me-mcp",
      version: packageJson.version,
    },
    instructions:
      "This server answers questions about Marcos Alvarez's professional career: work " +
      "experience, projects, and skills, grounded in his real career history. It is public " +
      "and read-only — no authentication is required. Career-data tools are not registered " +
      "yet; only the diagnostic `ping` tool is currently available.",
  },
);

export { handler as GET, handler as POST };

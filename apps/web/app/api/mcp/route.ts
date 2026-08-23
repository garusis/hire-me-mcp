import { createMcpHandler } from "mcp-handler";
import { defineTool } from "../../../lib/mcp/define-tool";
import { readRateLimitConfig } from "../../../lib/mcp/rate-limit/config";
import { selectRateLimiter } from "../../../lib/mcp/rate-limit/select-limiter";
import { withRateLimit } from "../../../lib/mcp/rate-limit/with-rate-limit";
import { getExperienceTool } from "../../../lib/mcp/tools/get-experience";
import { getProfileTool } from "../../../lib/mcp/tools/get-profile";
import { getSkillEvidenceTool } from "../../../lib/mcp/tools/get-skill-evidence";
import { pingTool } from "../../../lib/mcp/tools/ping";
import { searchCareerTool } from "../../../lib/mcp/tools/search-career";
import { searchProjectsTool } from "../../../lib/mcp/tools/search-projects";
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
    // Every tool is registered through `defineTool` — the single registration path
    // documented in `lib/mcp/CONVENTIONS.md` — so citation passthrough and error mapping
    // are uniform across tools instead of hand-rolled per call site.
    defineTool(server, pingTool);
    defineTool(server, getProfileTool);
    defineTool(server, getExperienceTool);
    defineTool(server, searchProjectsTool);
    defineTool(server, getSkillEvidenceTool);
    defineTool(server, searchCareerTool);
  },
  {
    serverInfo: {
      name: "hire-me-mcp",
      version: packageJson.version,
    },
    instructions:
      "This server answers questions about Marcos Alvarez's professional career: work " +
      "experience, projects, and skills, grounded in his real career history. It is public " +
      "and read-only — no authentication is required. Use `get-profile` for who he is, " +
      "`get-experience` for his work history, `search-projects` for keyword/tag search over " +
      "his project portfolio, and `get-skill-evidence` to check whether a specific skill or " +
      "technology is claimed. For open-ended or cross-cutting questions those structured " +
      "tools can't answer directly, use `search-career`, a semantic search over the full " +
      "career text. Every tool call is recorded as an anonymized, aggregate-only usage " +
      "event (which tool, which surface, the outcome) — never the raw arguments, your IP, " +
      "or any identifying information. See the privacy note at /privacy for the full, " +
      "auditable list of what is and isn't collected.",
  },
);

// Rate limiting (#39) is enforced BEFORE `handler` (and therefore before mcp-handler /
// the MCP server) ever sees the request, so an over-limit caller gets a clean HTTP 429
// with RateLimit/Retry-After headers and a parseable JSON body instead of a half-open
// stream. `selectRateLimiter` normally builds the real limiter, which fails open —
// logging loudly, never throwing — when UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN
// aren't set (CI, forked PR previews, local dev without the env vars), so the endpoint
// works without Upstash credentials. `MCP_TEST_RATE_LIMITER=1` swaps in a deterministic
// in-memory limiter instead — used exclusively by the protocol-level MCP integration
// suite (#49) to exercise the real 429 path in CI, where fail-open would otherwise make
// it unobservable. See lib/mcp/rate-limit/select-limiter.ts and the README "Rate
// limiting" section.
const rateLimiter = selectRateLimiter(readRateLimitConfig());
const rateLimitedGet = withRateLimit(rateLimiter, handler);
const rateLimitedPost = withRateLimit(rateLimiter, handler);

export { rateLimitedGet as GET, rateLimitedPost as POST };

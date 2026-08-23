/**
 * The interview agent's domain-grounded tool set: one Mastra `Tool` per
 * `packages/core` domain service, registered here and nowhere else.
 *
 * `AGENT_TOOL_CORE_FUNCTIONS` exists purely to make the one-source-of-truth
 * claim mechanically checkable: it maps each registered tool's name to the
 * exact `@hire-me-mcp/core` function it delegates to, imported directly from
 * `@hire-me-mcp/core` rather than re-derived or reimplemented. A test that
 * also builds the MCP server's own tool-name -> core-function mapping and
 * asserts function identity against this one is a drift detector — it fails
 * the moment either surface stops calling the shared domain layer. See
 * `apps/web/lib/mcp/tool-core-parity.test.ts`.
 *
 * `search-career` (#75, epic #6) is the one exception to the "reads through
 * `CareerDataRepository`" half of that claim — it wraps
 * `createSearchCareer` from the separate `@hire-me-mcp/core/search-career`
 * subpath (a live DB + embedding query, not repository-backed content), so
 * it's mapped to that factory here for the same "delegates to a real core
 * export" property, even though `apps/web`'s MCP server doesn't (yet, #61)
 * share this exact tool.
 */

import { getExperience, getProfile, getSkillEvidence, searchProjects } from "@hire-me-mcp/core";
import { createSearchCareer } from "@hire-me-mcp/core/search-career";
import type { Tool } from "@mastra/core/tools";
import { getExperienceTool } from "./get-experience.js";
import { getProfileTool } from "./get-profile.js";
import { getSkillEvidenceTool } from "./get-skill-evidence.js";
import { searchCareerTool } from "./search-career.js";
import { searchProjectsTool } from "./search-projects.js";

/**
 * Registered on the interview agent, keyed by tool name — the shape
 * `@mastra/core`'s `Agent` constructor's `tools` option expects.
 */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous Tool generics collapse to a single record only under `any` — each tool keeps its own precise type at its own definition site.
export const AGENT_TOOLS: Record<string, Tool<any, any>> = {
  "get-profile": getProfileTool,
  "get-experience": getExperienceTool,
  "search-projects": searchProjectsTool,
  "get-skill-evidence": getSkillEvidenceTool,
  "search-career": searchCareerTool,
};

/** The registered tool set's names, in registration order. */
export const AGENT_TOOL_NAMES: string[] = Object.keys(AGENT_TOOLS);

/**
 * Canonical tool-name -> core-service-function mapping for this surface.
 * Every value here is the literal function imported from `@hire-me-mcp/core`
 * (or, for `search-career`, its `@hire-me-mcp/core/search-career` subpath —
 * see module docs) that each tool's `execute` delegates to — never a
 * wrapper, never a reimplementation.
 */
export const AGENT_TOOL_CORE_FUNCTIONS: Record<string, (...args: never[]) => unknown> = {
  "get-profile": getProfile,
  "get-experience": getExperience,
  "search-projects": searchProjects,
  "get-skill-evidence": getSkillEvidence,
  "search-career": createSearchCareer,
};

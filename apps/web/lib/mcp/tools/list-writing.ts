/**
 * `list-writing` — thin adapter over `packages/core`'s `listWriting()`
 * (#215). The writing corpus is currently empty, so today this tool's
 * honest answer is an empty list — that is data, never converted to an
 * error (gap-honesty, same principle as `get-skill-evidence`'s 'unknown'
 * outcome).
 */

import { listWriting } from "@hire-me-mcp/core";
import { z } from "zod";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import type { ToolDefinition } from "../define-tool";

const inputSchema = z.object({});

/**
 * Derived from `listWriting`'s own return type rather than importing
 * `WritingEntry` from `@hire-me-mcp/career-data` directly — apps/web reads
 * career content only through `src/lib/content/` (issue #16, enforced by
 * biome).
 */
type WritingEntry = ReturnType<typeof listWriting>["data"][number];

/** `list-writing` — registered against a live `McpServer` via `defineTool`. */
export const listWritingTool: ToolDefinition<typeof inputSchema, WritingEntry[]> = {
  name: "list-writing",
  description:
    "Returns every published writing entry — title, published date, summary, optional " +
    "canonical URL, and the full body — as a list ordered most recent first, each with a " +
    "citation. Use this to enumerate his articles or publications, e.g. for a CV " +
    "publications section. Do not use it for relevance search over writing excerpts (use " +
    "search-career with sourceTypes ['writing']) or for project write-ups (use " +
    "list-projects or search-projects). Takes no input. An empty list is the honest, " +
    "successful 'nothing published yet' answer — the corpus currently has no entries — so " +
    "relay it as such rather than treating it as a failed call.",
  inputSchema,
  handler: () => listWriting(getCareerDataRepository()),
};

/**
 * Description-quality contract shared by every career tool registered in
 * this server (#31, extended by #32 to cover all four). `tools/list` is the
 * only thing a model sees before choosing a tool — `name` and `description`
 * — so this test enforces the house style documented in `CONVENTIONS.md`:
 * every description covers purpose/when-to-use/when-not-to-use at a minimum
 * length, and every input property carries its own non-empty `.describe()`.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ToolDefinition } from "./define-tool.js";
import { EXPECTED_TOOL_NAMES } from "./tool-names.js";
import { getExperienceTool } from "./tools/get-experience.js";
import { getProfileTool } from "./tools/get-profile.js";
import { getSkillEvidenceTool } from "./tools/get-skill-evidence.js";
import { pingTool } from "./tools/ping.js";
import { searchProjectsTool } from "./tools/search-projects.js";

/** Documented minimum: enough room for purpose + when-to-use + when-not-to-use in one paragraph. */
const MIN_DESCRIPTION_LENGTH = 120;

// biome-ignore lint/suspicious/noExplicitAny: tool definitions here are only ever inspected generically.
const toolsUnderTest: ToolDefinition<z.ZodTypeAny, any>[] = [
  getProfileTool,
  getExperienceTool,
  searchProjectsTool,
  getSkillEvidenceTool,
];

function schemaProperties(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  const jsonSchema = z.toJSONSchema(schema) as { properties?: Record<string, unknown> };
  return (jsonSchema.properties ?? {}) as Record<string, z.ZodTypeAny>;
}

describe("career tool description quality", () => {
  it.each(toolsUnderTest.map((tool) => [tool.name, tool] as const))(
    "%s has a description at or above the documented minimum length",
    (_name, tool) => {
      expect(tool.description.length).toBeGreaterThanOrEqual(MIN_DESCRIPTION_LENGTH);
    },
  );

  it.each(toolsUnderTest.map((tool) => [tool.name, tool] as const))(
    "%s's description states what it returns, when to use it, and when not to",
    (_name, tool) => {
      // "when not" guidance is required by CONVENTIONS.md for every tool in this server.
      expect(tool.description.toLowerCase()).toMatch(/not use|do not use/);
      // Purpose ("returns"/"looks up") and when-to-use ("use this") language.
      expect(tool.description.toLowerCase()).toMatch(/returns|looks up/);
      expect(tool.description.toLowerCase()).toMatch(/use this|use it/);
    },
  );

  it.each(toolsUnderTest.map((tool) => [tool.name, tool] as const))(
    "%s cross-references at least one sibling tool by name in its when-not-to-use guidance",
    (_name, tool) => {
      const siblingNames = toolsUnderTest
        .map((sibling) => sibling.name)
        .filter((name) => name !== tool.name);
      const mentionsAnySibling = siblingNames.some((name) => tool.description.includes(name));
      expect(mentionsAnySibling).toBe(true);
    },
  );

  it.each(toolsUnderTest.map((tool) => [tool.name, tool] as const))(
    "%s's every input schema property has a non-empty description",
    (_name, tool) => {
      const properties = schemaProperties(tool.inputSchema);
      for (const [propertyName, propertySchema] of Object.entries(properties)) {
        const description = (propertySchema as { description?: string }).description;
        expect(description, `property "${propertyName}" has no .describe()`).toBeTruthy();
        expect(description?.length ?? 0).toBeGreaterThan(0);
      }
    },
  );

  it("search-projects's description states matching is keyword/tag-based", () => {
    expect(searchProjectsTool.description.toLowerCase()).toMatch(/keyword|tag-based/);
  });

  it("EXPECTED_TOOL_NAMES matches exactly this server's registered tool set (ping + all four career tools)", () => {
    const registeredTools = [pingTool, ...toolsUnderTest];
    const registeredNames = registeredTools.map((tool) => tool.name).sort();

    expect(registeredNames).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });
});

import { describe, expect, it } from "vitest";
import { CITABLE_ENTITY_TYPES } from "../citations.js";
import { AGENT_TOOL_NAMES } from "../tools/index.js";
import { PROMPT_SECTION_ORDER, PROMPT_SECTIONS } from "./sections.js";

const REQUIRED_SECTION_IDS = [
  "identity",
  "voice",
  "groundingRules",
  "retrievalPolicy",
  "gapDiscipline",
  "citationFormat",
  "redirectPolicy",
] as const;

describe("PROMPT_SECTIONS", () => {
  it("contains exactly the required named sections, in PROMPT_SECTION_ORDER", () => {
    expect(PROMPT_SECTIONS.map((section) => section.id)).toEqual([...PROMPT_SECTION_ORDER]);
    expect([...PROMPT_SECTION_ORDER].sort()).toEqual([...REQUIRED_SECTION_IDS].sort());
  });

  it("gives every section a non-empty title and body", () => {
    for (const section of PROMPT_SECTIONS) {
      expect(section.title.trim().length).toBeGreaterThan(0);
      expect(section.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("states the grounding contract: claims must come only from tool results", () => {
    const grounding = PROMPT_SECTIONS.find((section) => section.id === "groundingRules");
    expect(grounding?.body).toMatch(/tool/i);
    expect(grounding?.body).toMatch(/no tool.*(support|evidence)|not.*(state|make).*claim/i);
  });

  it("states the gap-discipline response shape: hasn't done X, closest evidence is Y", () => {
    const gapDiscipline = PROMPT_SECTIONS.find((section) => section.id === "gapDiscipline");
    expect(gapDiscipline?.body).toMatch(/hasn't done x/i);
    expect(gapDiscipline?.body).toMatch(/closest evidence is y/i);
  });

  it("never primes the model with a vendor-cost or production-pipeline claim in its worked example (#300)", () => {
    const citationFormat = PROMPT_SECTIONS.find((section) => section.id === "citationFormat");
    expect(citationFormat?.body).not.toMatch(/incumbent OCR|vendor'?s? cost|fraction of .*cost/i);
  });

  it("documents the citation marker format", () => {
    const citationFormat = PROMPT_SECTIONS.find((section) => section.id === "citationFormat");
    expect(citationFormat?.body).toContain("[cite:");
  });

  it("restricts a citable id to a tool result's own citations list, not any id found elsewhere in its data (#143)", () => {
    const citationFormat = PROMPT_SECTIONS.find((section) => section.id === "citationFormat");
    expect(citationFormat?.body).toMatch(/citations (list|array|field)/i);
    expect(citationFormat?.body).toMatch(/not.*(merely|just).*(appear|present).*(elsewhere|data)/i);
  });

  it("tells the model to copy the citation's ready-made marker rather than compose one (#270)", () => {
    const citationFormat = PROMPT_SECTIONS.find((section) => section.id === "citationFormat");
    expect(citationFormat?.body).toMatch(/marker/i);
    expect(citationFormat?.body).toMatch(/copy .*verbatim|verbatim/i);
  });

  it("names every legal entityType and rules out a tool name in that slot (#270)", () => {
    const citationFormat = PROMPT_SECTIONS.find((section) => section.id === "citationFormat");
    for (const entityType of CITABLE_ENTITY_TYPES) {
      expect(citationFormat?.body).toContain(entityType);
    }
    expect(citationFormat?.body).toContain("get-skill-evidence");
    expect(citationFormat?.body).toContain("list-career-stories");
    expect(citationFormat?.body).toMatch(/tool'?s? (own )?name is never|never one of them/i);
  });

  it("tells the model a gap answer is cited like any other (#270)", () => {
    const gapDiscipline = PROMPT_SECTIONS.find((section) => section.id === "gapDiscipline");
    expect(gapDiscipline?.body).toContain("[cite:gap:");
  });

  it("tells the model not to claim a fact it has no tool citation for this turn (#143)", () => {
    const grounding = PROMPT_SECTIONS.find((section) => section.id === "groundingRules");
    expect(grounding?.body).toMatch(/this conversation|this turn/i);
    expect(grounding?.body).toMatch(/call (the tool|it)|do not (make|state) (that )?claim/i);
  });

  it("states the hybrid retrieval routing policy — deterministic tools first, semantic search for fuzzy/cross-cutting questions (#75)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/search-career/i);
    expect(retrievalPolicy?.body).toMatch(/fuzzy|cross-cutting/i);
    expect(retrievalPolicy?.body).toMatch(/get-experience|search-projects|get-skill-evidence/i);
  });

  it("names every registered tool and the exact registered count — mechanically prevents tool-count/list drift (#294)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    for (const toolName of AGENT_TOOL_NAMES) {
      expect(retrievalPolicy?.body, `missing tool name "${toolName}"`).toContain(toolName);
    }
    expect(retrievalPolicy?.body).toContain(`${AGENT_TOOL_NAMES.length} tools`);
  });

  it("routes a known behavioral competency to list-career-stories first, ahead of search-career (#294)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/list-career-stories/);
    expect(retrievalPolicy?.body).toMatch(/tell me about a time|behavioral/i);
    const listCareerStoriesIndex = retrievalPolicy?.body.indexOf("list-career-stories") ?? -1;
    const searchCareerIndex = retrievalPolicy?.body.indexOf("search-career") ?? -1;
    expect(listCareerStoriesIndex).toBeGreaterThanOrEqual(0);
    expect(searchCareerIndex).toBeGreaterThan(listCareerStoriesIndex);
  });

  it("routes fuzzy behavioral wording to search-career scoped to story sources before falling back (#294)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/sourceTypes.*story|story.*sourceTypes/s);
    expect(retrievalPolicy?.body).toMatch(/does not (map|match)|does not confidently map|fuzzy/i);
  });

  it("tells the model get-experience and get-skill-evidence are not substitutes for a complete behavioral story (#294)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/not a substitute|never a substitute/i);
  });

  it("tells the model recommendation praise is supporting evidence, not a replacement for a behavioral story (#294)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/list-recommendations/);
    expect(retrievalPolicy?.body).toMatch(/supporting evidence/i);
    expect(retrievalPolicy?.body).toMatch(/not a replacement|never (a )?replace/i);
  });

  it("tells the model experiences and recommendations must never displace an available story, and labels fallback broader evidence as related, not a behavioral event (#294)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/never displace/i);
    expect(retrievalPolicy?.body).toMatch(/related evidence/i);
    expect(retrievalPolicy?.body).toMatch(/not.*behavioral event|never.*behavioral event/i);
  });

  it("distinguishes the primary experience from a related experience — actions and outcomes never transfer (#294)", () => {
    // The rule may live in any section — assert it exists somewhere in the composed prompt.
    const allBodies = PROMPT_SECTIONS.map((section) => section.body).join("\n");
    expect(allBodies).toMatch(/related experience/i);
    expect(allBodies).toMatch(/never transfer|does not (inherit|transfer)/i);
  });

  it("requires citing retrieved excerpts using the returned chunk citation (#75)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/cite/i);
  });

  it("tells the model a weak/absent retrieval result is evidence of a gap, not something to stretch into a claim (#75)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/low score|weak|nothing.*(relevant|strong)|absence/i);
    expect(retrievalPolicy?.body).toMatch(/honestly|gap/i);
  });

  it("states an off-topic/adversarial redirect policy", () => {
    const redirectPolicy = PROMPT_SECTIONS.find((section) => section.id === "redirectPolicy");
    expect(redirectPolicy?.body).toMatch(/redirect|decline/i);
    expect(redirectPolicy?.body).toMatch(/instructions|override/i);
  });

  it("gives every section a distinct id", () => {
    const ids = PROMPT_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { describe, expect, it } from "vitest";
import { PROMPT_SECTION_ORDER, PROMPT_SECTIONS } from "./sections.js";

const REQUIRED_SECTION_IDS = [
  "identity",
  "voice",
  "groundingRules",
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

  it("documents the citation marker format", () => {
    const citationFormat = PROMPT_SECTIONS.find((section) => section.id === "citationFormat");
    expect(citationFormat?.body).toContain("[cite:");
  });

  it("restricts a citable id to a tool result's own citations list, not any id found elsewhere in its data (#143)", () => {
    const citationFormat = PROMPT_SECTIONS.find((section) => section.id === "citationFormat");
    expect(citationFormat?.body).toMatch(/citations (list|array|field)/i);
    expect(citationFormat?.body).toMatch(/not.*(merely|just).*(appear|present).*(elsewhere|data)/i);
  });

  it("tells the model not to claim a fact it has no tool citation for this turn (#143)", () => {
    const grounding = PROMPT_SECTIONS.find((section) => section.id === "groundingRules");
    expect(grounding?.body).toMatch(/this conversation|this turn/i);
    expect(grounding?.body).toMatch(/call (the tool|it)|do not (make|state) (that )?claim/i);
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

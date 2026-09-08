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

  /**
   * #307 owner-approved decision 2: "Before claiming no evidence or no
   * matching story, the chat must run search-career with sourceTypes
   * including story. A non-empty scoped result must be followed by fetching
   * the full story before broadening to projects or experiences." The prior
   * prompt only told the model to try the story-scoped search when the
   * behavioral wording was "fuzzy" — it never said this applies even to a
   * confident-competency question once list-career-stories comes back
   * empty, nor did it say the model must not conclude absence from an
   * unscoped search-career call or a projects/experience lookup alone.
   */
  it("requires a story-scoped search-career call before concluding no evidence or no matching story supports a behavioral question (#307 decision 2)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/before (?:concluding|claiming)/i);
    expect(retrievalPolicy?.body).toMatch(/no evidence|no (?:direct|matching) story/i);
    expect(retrievalPolicy?.body).toMatch(/sourceTypes.*story|story.*sourceTypes/is);
  });

  it("requires fetching the complete story before broadening to projects or experiences once a story-scoped search returns a non-empty result (#307 decision 2)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/non-empty|returns? (a|any) result/i);
    expect(retrievalPolicy?.body).toMatch(/before broadening/i);
  });

  /**
   * #307 owner-approved decision 5: "Product-name questions such as Mutual
   * must route to story-scoped search when deterministic company filtering
   * cannot represent the product name." list-career-stories filters by
   * company/competency, not product name, so a question naming a product
   * (not a company) must not be treated as coverage-absent just because
   * that deterministic filter came back empty.
   */
  it("routes a product-name question to story-scoped search when list-career-stories' company/competency filter cannot represent it (#307 decision 5)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/product/i);
    expect(retrievalPolicy?.body).toMatch(/company/i);
  });

  /**
   * #307 owner decision (issuecomment-5571657504, diagnosis 1a): a behavioral
   * answer must relay the story's situation, actions, and results, even when
   * the question asks about only one of them — the prior prompt only said
   * how to *fetch* a complete story, never that the answer must *relay* all
   * three STAR parts. Scoped to behavioral answers only, not every answer.
   */
  it("requires a behavioral answer to relay the story's situation, actions, and results concisely, even when the question asks about only one part (#307 decision 1a)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/situation/i);
    expect(retrievalPolicy?.body).toMatch(/actions?/i);
    expect(retrievalPolicy?.body).toMatch(/results?/i);
    expect(retrievalPolicy?.body).toMatch(
      /even\s+when\s+the\s+question\s+asks\s+about\s+only\s+one/i,
    );
  });

  it("carves a behavioral-story exception into the voice section's 'stop once answered' rule so a complete story can still be relayed (#307 decision 1a)", () => {
    const voice = PROMPT_SECTIONS.find((section) => section.id === "voice");
    expect(voice?.body).toMatch(/stop\s+once\s+the\s+question\s+is\s+answered/i);
    expect(voice?.body).toMatch(/behavioral\s+story\s+answer/i);
  });

  /**
   * #307 owner decision (issuecomment-5571657504, diagnosis 2): the
   * never-displace rule named only "experiences and recommendations" —
   * projects were missing, so a mixed-sourceTypes search-career call whose
   * top rank was a project (with a story lower in the same result) got
   * treated as a project answer instead of a story hit.
   */
  it("adds projects to the never-displace rule and treats any story present in a mixed-sourceTypes search as a story hit (#307 decision 2)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(
      /experiences?,?\s*(recommendations?,?\s*)?(and\s*)?projects.*never displace|projects.*never displace/is,
    );
    expect(retrievalPolicy?.body).toMatch(/mixed[- ]sourceTypes/i);
    expect(retrievalPolicy?.body).toMatch(/counts as a story hit|counts? as a (?:story )?hit/i);
  });

  /**
   * #307 owner decision (issuecomment-5571657504, diagnosis 3, f01): a story
   * must be relayed as it records its results — a later observed outcome
   * (e.g. a client commissioning more work after the fact) must not be
   * presented as caused by his actions unless the story itself says so.
   */
  it("requires relaying a story's results as recorded, without presenting a later observed outcome as caused by his actions unless the story says so (#307 decision 3)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/as (?:the story )?records?|as (?:the story )?states?/i);
    expect(retrievalPolicy?.body).toMatch(/later observed outcome/i);
    expect(retrievalPolicy?.body).toMatch(/unless the story (?:itself )?(?:says|states)/i);
  });

  /**
   * #307 Codex independent review of 3a02a25 (bounded correction): a04
   * remained a functional failure — a question about a practice or tool he
   * introduced that other engineers adopted was classified as a plain
   * project lookup, so the model never ran the story-scoped path at all.
   * The fix must use general intent criteria (actions taken, adoption or
   * response by others, outcome), not eval question strings or story ids,
   * and must not force every project question toward stories.
   */
  it("treats a question about something he introduced or changed, and whether others adopted or responded to it, as behavioral by general intent — not fixed trigger words — while leaving a pure lookup as an ordinary project/experience lookup (#307 bounded correction)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(
      /does\s+not\s+need\s+to\s+(?:name\s+a\s+competency|use\s+the\s+words)/i,
    );
    expect(retrievalPolicy?.body).toMatch(/adopt\w*/i);
    expect(retrievalPolicy?.body).toMatch(/describ\w*\s+an\s+event/i);
    expect(retrievalPolicy?.body).toMatch(
      /stays?\s+an\s+ordinary\s+project\s+or\s+experience\s+lookup|stays?\s+a\s+(?:plain|pure|ordinary)\s+(?:project|lookup)/i,
    );
  });

  /**
   * #307 owner decision (issuecomment-5571657504, next bounded task): a04
   * answered "an internal engineering practice ... he introduced" by citing
   * two separate stories in short form instead of one complete example; x05
   * cited the right story but dropped its result. The prior prompt said how
   * to relay a found story's STAR parts, but never said how many stories to
   * answer from when the question asks for a single example. General intent
   * criteria only — no hardcoded a04/x05/story ids or evaluator phrasing.
   */
  it("requires choosing one relevant complete story for a single-example question, surfacing more than one only when the visitor asks for multiple (#307 next bounded task)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/one\s+example|a\s+single\s+example|one\s+time/i);
    expect(retrievalPolicy?.body).toMatch(
      /one\s+relevant\s+complete\s+story|a\s+single\s+.*story/i,
    );
    expect(retrievalPolicy?.body).toMatch(
      /only\s+when\s+the\s+visitor.*asks?\s+for\s+(?:more than one|multiple)/is,
    );
  });

  /**
   * #307 issuecomment-5591843129 assignment B / diagnosis 5591743584 (b),
   * X05: the answer relayed the situation and the investigation, then
   * stopped — the story's recorded results never appeared, even though the
   * prior prompt already said a behavioral answer must relay all three STAR
   * parts. The rule must say the relay is STRUCTURAL — situation, then
   * actions, then results, in that order — and that the answer must close
   * with the story's own results sentence even when the question named only
   * an earlier part, not just that all three "get relayed" somewhere.
   */
  it("requires closing a behavioral answer with the story's own recorded results as its own sentence, even when the question named only an earlier part (#307 diagnosis 5591743584 b)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/situation.*then.*actions.*then.*results?/is);
    expect(retrievalPolicy?.body).toMatch(
      /close\w*\s+(?:the\s+answer\s+)?with\s+the\s+story'?s?\s+(?:own\s+)?(?:recorded\s+)?results?/i,
    );
  });

  /**
   * #307 issuecomment-5591843129 assignment B / diagnosis 5591743584 (b),
   * A04: a question phrased with "a practice" or "a tool ... introduced" is
   * grammatically singular but didn't trip the one-story rule, which only
   * named "one example, one time, or one instance" — so the model answered
   * with two stories in short form. General intent (singular phrasing), no
   * fixed case strings or eval question text.
   */
  it("extends the one-story rule to singular phrasing like 'a practice' or 'a tool he introduced', cross-referenced with the behavioral-routing rule above (#307 diagnosis 5591743584 b)", () => {
    const retrievalPolicy = PROMPT_SECTIONS.find((section) => section.id === "retrievalPolicy");
    expect(retrievalPolicy?.body).toMatch(/a\s+practice/i);
    expect(retrievalPolicy?.body).toMatch(/a\s+tool\s+(?:he\s+)?introduced/i);
    // Cross-reference: the singular-phrasing rule must point back at (or be
    // pointed at by) the same "what tool/practice ... adopted" sentence the
    // behavioral-routing paragraph above already uses (#307 bounded
    // correction), so the two rules read the question's grammatical number
    // the same way rather than drifting independently.
    expect(retrievalPolicy?.body).toMatch(/what\s+tool\/practice/i);
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

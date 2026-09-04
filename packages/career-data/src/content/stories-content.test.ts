import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isCompetency } from "../schemas/competency.js";
import { loadContentDir, validateContentDir } from "./loader.js";

/**
 * Invariant tests over the real, authored `content/stories/*.json` entries
 * (#289) — the behavioral-story corpus authored in #290 from the sixteen
 * owner-approved story comments on that issue. These assert the corpus facts
 * and factual boundaries (#300, #305) without overfitting full prose.
 */
const contentDir = fileURLToPath(new URL("../../content/", import.meta.url));
const storiesDir = path.join(contentDir, "stories");

function readStoryFiles(): Record<string, unknown>[] {
  return fs
    .readdirSync(storiesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(storiesDir, file), "utf-8")));
}

describe("real content: stories/*.json", () => {
  it("has a stories/ collection directory", () => {
    expect(fs.existsSync(storiesDir)).toBe(true);
  });

  it("validates every story file against the CareerStory schema", () => {
    const errors = validateContentDir(contentDir).filter((error) =>
      error.file.startsWith("stories/"),
    );
    expect(errors).toEqual([]);
  });

  it("loads stories through the single career-data loader", () => {
    const dataset = loadContentDir(contentDir);
    expect(dataset.stories).toHaveLength(readStoryFiles().length);
  });

  it("never persists retrievalQuestions in a story file", () => {
    for (const story of readStoryFiles()) {
      expect(story).not.toHaveProperty("retrievalQuestions");
    }
  });
});

/** The sixteen owner-approved story ids from #290, in approval order. */
const APPROVED_STORY_IDS = [
  "xogito-client-account-recovery",
  "mutual-informal-leadership",
  "cross-team-onboarding-framework",
  "house-numbers-communication-service-ownership",
  "house-numbers-deterministic-document-checks",
  "fullstack-labs-sap-migration",
  "house-numbers-prompt-platform-migration",
  "house-numbers-secure-public-document-upload",
  "house-numbers-zod-production-incident",
  "house-numbers-vendor-extraction-contract",
  "house-numbers-loan-analysis-pipeline-decomposition",
  "mutual-sustainable-ownership-failure",
  "rokk3r-sustainable-performance-feedback",
  "belatrix-destructive-deployment-accountability",
  "house-numbers-cross-service-debugging-skill",
  "house-numbers-ai-pivot-after-paternity-leave",
];

/** Every string field of a story joined, for boundary regexes that must hold anywhere in the story. */
function storyText(story: Record<string, unknown>): string {
  return JSON.stringify(story);
}

describe("real content: the #290 story corpus", () => {
  const dataset = loadContentDir(contentDir);
  const byId = new Map(dataset.stories.map((story) => [story.id, story]));
  const story = (id: string) => {
    const found = byId.get(id);
    if (found === undefined) throw new Error(`story ${id} missing`);
    return found;
  };

  it("contains exactly the sixteen owner-approved stories, one file per story id", () => {
    expect([...byId.keys()].sort()).toEqual([...APPROVED_STORY_IDS].sort());
    const files = fs.readdirSync(storiesDir).filter((file) => file.endsWith(".json"));
    expect(files.sort()).toEqual(APPROVED_STORY_IDS.map((id) => `${id}.json`).sort());
  });

  it("uses only controlled competencies, and never spells a competency as a retrieval tag", () => {
    for (const entry of dataset.stories) {
      expect(isCompetency(entry.primaryCompetency)).toBe(true);
      for (const competency of entry.supportingCompetencies) {
        expect(isCompetency(competency)).toBe(true);
      }
      for (const tag of entry.retrievalTags) {
        expect(isCompetency(tag), `${entry.id} tag ${tag}`).toBe(false);
      }
    }
  });

  it("carries the owner-reviewed minimized tag sets locked in #305 decision 3 (176 assignments, 166 distinct)", () => {
    const tags = dataset.stories.flatMap((entry) => entry.retrievalTags);
    // #307 owner-authorized correction: to resolve the story-scoped preference collisions the
    // real-run diagnosis found, one retrieval tag was REPLACED (not appended) in each of two
    // stories — mutual-informal-leadership swapped "personal-sacrifice" for
    // "mission-over-personal-gain" (X02, preferred over mutual-sustainable-ownership-failure);
    // house-numbers-deterministic-document-checks swapped the redundant "nondeterminism" for
    // "challenged-preferred-direction" (A01, preferred over
    // house-numbers-prompt-platform-migration). Net assignment/distinct counts are unchanged —
    // a swap, not an addition — which also keeps every chunk-size boundary unchanged (#296's
    // locked 90-story-chunk count in `packages/core/src/chunking/index.test.ts` is unaffected).
    // Both new tags are accurate paraphrases of facts already stated in each story's own text,
    // never a narrative or fact change.
    expect(tags).toHaveLength(176);
    expect(new Set(tags).size).toBe(166);
    for (const entry of dataset.stories) {
      expect(entry.retrievalTags.length).toBeGreaterThanOrEqual(6);
      expect(entry.retrievalTags.length).toBeLessThanOrEqual(15);
    }
  });

  describe("#307 story-scoped preference-collision retrieval tags", () => {
    function storyById(id: string) {
      const entry = dataset.stories.find((story) => story.id === id);
      expect(entry, `expected a story with id "${id}"`).toBeDefined();
      return entry as (typeof dataset.stories)[number];
    }

    it("X02: the preferred story (mutual-informal-leadership) carries mission-over-personal-gain, and its competing alternative (mutual-sustainable-ownership-failure) does not", () => {
      expect(storyById("mutual-informal-leadership").retrievalTags).toContain(
        "mission-over-personal-gain",
      );
      expect(storyById("mutual-sustainable-ownership-failure").retrievalTags).not.toContain(
        "mission-over-personal-gain",
      );
    });

    it("A01: the preferred story (house-numbers-deterministic-document-checks) carries challenged-preferred-direction, and its competing alternative (house-numbers-prompt-platform-migration) does not", () => {
      expect(storyById("house-numbers-deterministic-document-checks").retrievalTags).toContain(
        "challenged-preferred-direction",
      );
      expect(storyById("house-numbers-prompt-platform-migration").retrievalTags).not.toContain(
        "challenged-preferred-direction",
      );
    });

    it("preserves the global 001 > 002 leadership priority: mutual-informal-leadership's new tag does not touch xogito-client-account-recovery", () => {
      expect(storyById("xogito-client-account-recovery").retrievalTags).not.toContain(
        "mission-over-personal-gain",
      );
    });
  });

  it("covers a useful spread of behavioral competencies as primaries", () => {
    const primaries = new Set(dataset.stories.map((entry) => entry.primaryCompetency));
    expect([...primaries].sort()).toEqual(
      [
        "adaptability",
        "influence",
        "leadership",
        "learning-from-failure",
        "mentoring",
        "ownership",
        "personal-accountability",
        "problem-solving",
        "process-improvement",
        "receptiveness-to-feedback",
        "risk-management",
        "technical-judgment",
      ].sort(),
    );
  });

  it("persists related experiences only where the approved comments declare them", () => {
    const related = dataset.stories
      .filter((entry) => entry.relatedExperienceIds !== undefined)
      .map((entry) => [entry.id, entry.relatedExperienceIds]);
    expect(related.sort()).toEqual(
      [
        ["cross-team-onboarding-framework", ["house-numbers-2022-senior-full-stack-engineer"]],
        [
          "rokk3r-sustainable-performance-feedback",
          ["kubesoft-2015-senior-full-stack-and-mobile-developer"],
        ],
      ].sort(),
    );
  });

  it("keeps every story linked to a real primary experience (six of seven roles; Jarvi Games has none by decision)", () => {
    const experienceIds = new Set(dataset.experience.map((entry) => entry.id));
    const parents = new Set<string>();
    for (const entry of dataset.stories) {
      expect(experienceIds.has(entry.experienceId), entry.id).toBe(true);
      parents.add(entry.experienceId);
    }
    expect(parents.size).toBe(6);
    expect(parents.has("jarvi-games-2013-full-stack-developer-and-devops")).toBe(false);
  });

  describe("the Xogito seed story (#290 required story)", () => {
    const xogito = () => story("xogito-client-account-recovery");

    it("is a leadership story on the Xogito role with the approved supporting signals", () => {
      expect(xogito().experienceId).toBe("xogito-group-2020-senior-software-development-engineer");
      expect(xogito().relatedExperienceIds).toBeUndefined();
      expect(xogito().primaryCompetency).toBe("leadership");
      expect([...xogito().supportingCompetencies].sort()).toEqual(
        [
          "stakeholder-management",
          "influence",
          "prioritization",
          "navigating-ambiguity",
          "communication",
        ].sort(),
      );
    });

    it("preserves the situation: the project manager left and the client was frustrated", () => {
      expect(xogito().situation).toMatch(/project manager resigned/i);
      expect(xogito().situation).toMatch(/frustrated/i);
    });

    it("preserves the actions: frontend and QA involved, quick wins alongside core repairs, client-approved sprint plans", () => {
      const actions = xogito().actions.join(" ");
      expect(actions).toMatch(/frontend developer and QA/i);
      expect(actions).toMatch(/quick wins/i);
      expect(actions).toMatch(/client approved each sprint plan/i);
    });

    it("preserves the results: trust rebuilt over a few sprints and the account recovered", () => {
      const results = xogito().results.join(" ");
      expect(results).toMatch(/two or three sprints/i);
      expect(results).toMatch(/accepted the corrected workflows/i);
    });

    it("reports the client's later commissioned work only as a later observed outcome, never as caused or won (#305 point 9)", () => {
      const text = storyText(xogito());
      expect(text).toMatch(/I learned that the same client had commissioned additional projects/);
      expect(text).not.toMatch(/\bwon\b/i);
      expect(text).not.toMatch(/\bcaused\b/i);
      expect(text).not.toMatch(/further work/i);
    });

    it("never claims formal authority", () => {
      expect(xogito().task).toMatch(/no formal product-management authority/);
    });
  });

  describe("factual boundaries carried into #295 (#305 point 9)", () => {
    it("story 008 states the two-out-of-three figure as an operational estimate", () => {
      expect(story("house-numbers-secure-public-document-upload").situation).toMatch(
        /we estimated that roughly two out of every three/,
      );
    });

    it("story 010 keeps the original documents available and only the historical extraction unavailable", () => {
      const text = story("house-numbers-vendor-extraction-contract").results.join(" ");
      expect(text).toMatch(/original documents remained/);
      expect(text).toMatch(/extraction history as unavailable/);
    });

    it("story 014 confines the destructive deployment to a shared development environment", () => {
      const text = storyText(story("belatrix-destructive-deployment-accountability"));
      expect(text).toMatch(/shared development environment/);
      expect(text).toMatch(/No production or customer data was affected/);
    });

    it("story 004 labels its triage figure as an observed outcome, not LLM accuracy", () => {
      expect(story("house-numbers-communication-service-ownership").results.join(" ")).toMatch(
        /not LLM accuracy/,
      );
    });

    it("no story frames the document-extraction PoC as shipped or as a vendor replacement (#300)", () => {
      for (const entry of dataset.stories) {
        expect(storyText(entry)).not.toMatch(/Ocrolus/);
        expect(storyText(entry)).not.toMatch(/30%\s*(?:→|->|to)\s*87%/);
      }
    });
  });
});

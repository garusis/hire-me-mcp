import { createContentCareerDataRepository } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import {
  getExperienceListView,
  getProjectsListView,
  getSkillsListView,
} from "../../src/lib/content";
import { buildDemoTranscript, DEMO_SKILL_TERM } from "./demo-transcript-data";

// #296 — the locked visibility boundary (#288): every sentence (>= 8 words,
// same normalisation as the career-data `no-story-detail-in-experience`
// lint rule) of every real authored story's situation/task/actions/
// results/reflection, plus every story's title. The transcript is built
// from real data (see `realLabels()` below), so these are real needles
// against real output — not a fixture that could trivially pass.
const MIN_STORY_SENTENCE_WORDS = 8;

function normalizeStoryProse(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function storySentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function realStorySentences(): string[] {
  const dataset = createContentCareerDataRepository().getDataset();
  const sentences: string[] = [];
  for (const story of dataset.stories) {
    const units = [
      story.situation,
      story.task,
      ...story.actions,
      ...story.results,
      ...(story.reflection === undefined ? [] : [story.reflection]),
    ];
    for (const unit of units) {
      for (const sentence of storySentencesOf(unit)) {
        const normalized = normalizeStoryProse(sentence);
        if (normalized.split(" ").length >= MIN_STORY_SENTENCE_WORDS) {
          sentences.push(normalized);
        }
      }
    }
  }
  return sentences;
}

function realStoryTitles(): string[] {
  return createContentCareerDataRepository()
    .getDataset()
    .stories.map((story) => normalizeStoryProse(story.title));
}

/**
 * Docs-rot guard for the /mcp "See it in action" transcript (#225). The
 * previous, hand-written transcript named a role ("mcp-gateway-service") and
 * a project ("Order Events Pipeline") that existed nowhere in the career
 * data. The transcript is now generated from the real dataset; these tests
 * pin that property so a future edit can't reintroduce invented entities.
 */
describe("buildDemoTranscript (#225)", () => {
  /** Every label a citation in the real dataset could legitimately carry. */
  function realLabels(): Set<string> {
    const labels = new Set<string>();
    for (const skill of getSkillsListView().items) {
      labels.add(skill.name);
    }
    for (const item of getExperienceListView().items) {
      labels.add(item.citation.label);
    }
    for (const item of getProjectsListView().items) {
      labels.add(item.citation.label);
    }
    return labels;
  }

  it("produces a two-turn transcript whose question names the demo term", () => {
    const { turns } = buildDemoTranscript();
    expect(turns).toHaveLength(2);
    expect(turns[0]?.speaker).toBe("You");
    expect(turns[1]?.speaker).toBe("Claude");
    expect(turns[1]?.text).toContain(DEMO_SKILL_TERM);
  });

  it("every entity the transcript cites is a real record in the career dataset — no invented roles or projects", () => {
    const { turns, citedLabels } = buildDemoTranscript();
    const labels = realLabels();

    expect(citedLabels.length).toBeGreaterThan(0);
    for (const label of citedLabels) {
      expect(labels, `transcript cites "${label}", which is not a dataset record`).toContain(label);
      expect(turns[1]?.text).toContain(label);
    }
  });

  it("never mentions the previously fabricated entities", () => {
    const text = buildDemoTranscript()
      .turns.map((turn) => turn.text)
      .join("\n");
    expect(text).not.toMatch(/mcp-gateway-service/i);
    expect(text).not.toMatch(/order events pipeline/i);
  });

  it("the demo term still resolves to a claimed skill — building never falls back to a fabricated answer", () => {
    // buildDemoTranscript throws for a non-claimed outcome; not throwing IS the assertion.
    expect(() => buildDemoTranscript()).not.toThrow();
  });

  // #296 — the locked visibility boundary (#288): this static demo
  // transcript must never contain a real authored story's narrative or
  // title, even though it's built from the same real dataset stories live
  // in.
  it("contains none of the real dataset's story sentences or titles (#296)", () => {
    const text = normalizeStoryProse(
      buildDemoTranscript()
        .turns.map((turn) => turn.text)
        .join(" "),
    );
    const normalizedText = ` ${text} `;
    const needles = [...realStorySentences(), ...realStoryTitles()];
    expect(needles.length).toBeGreaterThan(0);

    for (const needle of needles) {
      expect(normalizedText).not.toContain(` ${needle} `);
    }
  });
});

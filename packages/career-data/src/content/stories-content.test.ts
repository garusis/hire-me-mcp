import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentDir, validateContentDir } from "./loader.js";

/**
 * Invariant tests over the real, authored `content/stories/*.json` entries
 * (#289) — the behavioral-story corpus authored in #290. The collection is
 * intentionally empty-but-valid until that corpus lands, so the per-story
 * assertions are vacuous today and become the corpus's first line of
 * defence the moment a story file is added.
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
  it("has a stories/ collection directory (empty-but-valid until #290)", () => {
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

import type { CareerDataset } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { chunkCareerData } from "../chunking/index.js";
import type { Chunk } from "../chunking/types.js";
import type { ChunkFingerprint } from "../db/chunks-repository.js";
import { computeIngestDiff } from "./diff.js";

function makeChunk(id: string, contentHash: string): Chunk {
  return {
    id,
    sourceType: "project",
    sourceId: id,
    chunkIndex: 0,
    text: `text-${id}`,
    contentHash,
    tokenCount: 4,
    citation: { entityType: "project", entityId: id, label: id },
    metadata: {},
  };
}

function fingerprint(id: string, contentHash: string, embeddingModel: string): ChunkFingerprint {
  return { id, contentHash, embeddingModel };
}

const MODEL_ID = "gemini-embedding-001";

describe("computeIngestDiff", () => {
  it("puts every fresh chunk in toInsert when the store is empty", () => {
    const chunks = [makeChunk("a", "hash-a"), makeChunk("b", "hash-b")];
    const diff = computeIngestDiff(chunks, [], { modelId: MODEL_ID });

    expect(diff.toInsert.map((c) => c.id)).toEqual(["a", "b"]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("treats a chunk with a matching hash and model as unchanged", () => {
    const chunks = [makeChunk("a", "hash-a")];
    const existing = [fingerprint("a", "hash-a", MODEL_ID)];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.unchanged.map((c) => c.id)).toEqual(["a"]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it("treats a chunk with a changed contentHash as toUpdate, not toInsert", () => {
    const chunks = [makeChunk("a", "hash-a-v2")];
    const existing = [fingerprint("a", "hash-a-v1", MODEL_ID)];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.toUpdate.map((c) => c.id)).toEqual(["a"]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("puts an existing id absent from the fresh chunks into toDelete", () => {
    const chunks = [makeChunk("a", "hash-a")];
    const existing = [
      fingerprint("a", "hash-a", MODEL_ID),
      fingerprint("orphan", "hash-x", MODEL_ID),
    ];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.toDelete).toEqual(["orphan"]);
  });

  it("editing a single record only re-embeds that record's chunks; siblings stay unchanged", () => {
    const chunks = [
      makeChunk("a", "hash-a"),
      makeChunk("b", "hash-b-v2"),
      makeChunk("c", "hash-c"),
    ];
    const existing = [
      fingerprint("a", "hash-a", MODEL_ID),
      fingerprint("b", "hash-b-v1", MODEL_ID),
      fingerprint("c", "hash-c", MODEL_ID),
    ];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.toUpdate.map((c) => c.id)).toEqual(["b"]);
    expect(diff.unchanged.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("a model id mismatch treats an otherwise-unchanged chunk as toUpdate (full re-embed)", () => {
    const chunks = [makeChunk("a", "hash-a"), makeChunk("b", "hash-b")];
    const existing = [
      fingerprint("a", "hash-a", "old-model"),
      fingerprint("b", "hash-b", "old-model"),
    ];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.toUpdate.map((c) => c.id)).toEqual(["a", "b"]);
    expect(diff.unchanged).toEqual([]);
  });

  it("--full forces every chunk into toUpdate/toInsert regardless of hash or model match", () => {
    const chunks = [makeChunk("a", "hash-a"), makeChunk("new", "hash-new")];
    const existing = [fingerprint("a", "hash-a", MODEL_ID)];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID, full: true });

    expect(diff.toInsert.map((c) => c.id)).toEqual(["new"]);
    expect(diff.toUpdate.map((c) => c.id)).toEqual(["a"]);
    expect(diff.unchanged).toEqual([]);
  });

  it("--full still deletes orphans", () => {
    const chunks = [makeChunk("a", "hash-a")];
    const existing = [
      fingerprint("a", "hash-a", MODEL_ID),
      fingerprint("orphan", "hash-x", MODEL_ID),
    ];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID, full: true });

    expect(diff.toDelete).toEqual(["orphan"]);
  });

  it("computes toEmbed as the concatenation of toInsert and toUpdate, in that order", () => {
    const chunks = [makeChunk("a", "hash-a-v2"), makeChunk("new", "hash-new")];
    const existing = [fingerprint("a", "hash-a-v1", MODEL_ID)];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.toEmbed.map((c) => c.id)).toEqual(["a", "new"]);
  });
});

/**
 * Two independent stories on two independent experiences, chunked through
 * the real `chunkCareerData` (#296 P5) — proves diff isolation at the
 * chunking+diff boundary, not just with hand-built `Chunk` fixtures: editing
 * or removing one story's content must never be classified as an
 * insert/update/delete for the other story's chunks, or for either
 * experience's chunk.
 */
function twoStoryDataset(overrides: Partial<CareerDataset> = {}): CareerDataset {
  return {
    profile: undefined,
    experience: [
      {
        id: "acme-role",
        company: "Acme",
        role: "Engineer",
        startDate: "2020-01",
        endDate: "2021-01",
        summary: "Did engineering work at Acme.",
        highlights: ["Shipped feature X"],
        tech: ["typescript"],
      },
      {
        id: "globex-role",
        company: "Globex",
        role: "Senior Engineer",
        startDate: "2021-02",
        endDate: undefined,
        summary: "Leads the platform team at Globex.",
        highlights: ["Rebuilt the deploy pipeline"],
        tech: ["nodejs"],
      },
    ],
    projects: [],
    skills: [],
    gaps: [],
    education: [],
    writing: [],
    recommendations: [],
    stories: [
      {
        id: "acme-quick-fix-story",
        experienceId: "acme-role",
        title: "Fixing a flaky deploy check",
        primaryCompetency: "problem-solving",
        supportingCompetencies: [],
        situation: "A flaky deploy check was blocking releases.",
        task: "I owned tracking down the flakiness.",
        actions: ["I added retry logging and found a race condition."],
        results: ["The check became reliable."],
        retrievalTags: ["ci-flakiness"],
      },
      {
        id: "globex-migration-story",
        experienceId: "globex-role",
        title: "Leading a zero-downtime platform migration",
        primaryCompetency: "technical-leadership",
        supportingCompetencies: [],
        situation: "The platform needed a zero-downtime migration.",
        task: "I led the migration end to end.",
        actions: ["I staged the cutover across independent phases."],
        results: ["The migration completed with zero downtime."],
        retrievalTags: ["zero-downtime"],
      },
    ],
    ...overrides,
  };
}

function fingerprintsOf(chunks: readonly Chunk[]): ChunkFingerprint[] {
  return chunks.map((chunk) => ({
    id: chunk.id,
    contentHash: chunk.contentHash,
    embeddingModel: MODEL_ID,
  }));
}

function idsOf(chunks: readonly Chunk[], sourceId: string): string[] {
  return chunks.filter((chunk) => chunk.sourceId === sourceId).map((chunk) => chunk.id);
}

describe("computeIngestDiff — story-scoped isolation, via the real chunkCareerData path (#296)", () => {
  it("editing one story's content classifies only that story's chunks as toUpdate, leaving the other story and both experiences unchanged", () => {
    const original = twoStoryDataset();
    const originalChunks = chunkCareerData(original);
    const existing = fingerprintsOf(originalChunks);

    const edited = twoStoryDataset({
      stories: original.stories.map((story) =>
        story.id === "acme-quick-fix-story"
          ? { ...story, situation: "A flaky deploy check was blocking every release for a week." }
          : story,
      ),
    });
    const editedChunks = chunkCareerData(edited);

    const diff = computeIngestDiff(editedChunks, existing, { modelId: MODEL_ID });

    expect(diff.toUpdate.map((c) => c.id).sort()).toEqual(
      idsOf(editedChunks, "acme-quick-fix-story").sort(),
    );
    expect(diff.toInsert).toEqual([]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.unchanged.map((c) => c.id).sort()).toEqual(
      [
        ...idsOf(editedChunks, "globex-migration-story"),
        ...idsOf(editedChunks, "acme-role"),
        ...idsOf(editedChunks, "globex-role"),
      ].sort(),
    );
  });

  it("removing one story classifies only that story's chunks as toDelete, leaving the other story and both experiences unchanged", () => {
    const withBothStories = twoStoryDataset();
    const chunksWithBothStories = chunkCareerData(withBothStories);
    const existing = fingerprintsOf(chunksWithBothStories);

    const withoutAcmeStory = twoStoryDataset({
      stories: withBothStories.stories.filter((story) => story.id !== "acme-quick-fix-story"),
    });
    const remainingChunks = chunkCareerData(withoutAcmeStory);

    const diff = computeIngestDiff(remainingChunks, existing, { modelId: MODEL_ID });

    expect(diff.toDelete.sort()).toEqual(
      idsOf(chunksWithBothStories, "acme-quick-fix-story").sort(),
    );
    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.unchanged.map((c) => c.id).sort()).toEqual(
      [
        ...idsOf(remainingChunks, "globex-migration-story"),
        ...idsOf(remainingChunks, "acme-role"),
        ...idsOf(remainingChunks, "globex-role"),
      ].sort(),
    );
  });

  it("adding a new story classifies only its own chunks as toInsert, leaving the existing story and both experiences unchanged", () => {
    const withOneStory = twoStoryDataset({
      stories: [
        {
          id: "acme-quick-fix-story",
          experienceId: "acme-role",
          title: "Fixing a flaky deploy check",
          primaryCompetency: "problem-solving",
          supportingCompetencies: [],
          situation: "A flaky deploy check was blocking releases.",
          task: "I owned tracking down the flakiness.",
          actions: ["I added retry logging and found a race condition."],
          results: ["The check became reliable."],
          retrievalTags: ["ci-flakiness"],
        },
      ],
    });
    const originalChunks = chunkCareerData(withOneStory);
    const existing = fingerprintsOf(originalChunks);

    const withBothStories = twoStoryDataset();
    const editedChunks = chunkCareerData(withBothStories);

    const diff = computeIngestDiff(editedChunks, existing, { modelId: MODEL_ID });

    expect(diff.toInsert.map((c) => c.id).sort()).toEqual(
      idsOf(editedChunks, "globex-migration-story").sort(),
    );
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.unchanged.map((c) => c.id).sort()).toEqual(
      [
        ...idsOf(editedChunks, "acme-quick-fix-story"),
        ...idsOf(editedChunks, "acme-role"),
        ...idsOf(editedChunks, "globex-role"),
      ].sort(),
    );
  });
});

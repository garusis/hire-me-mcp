import { describe, expect, it, vi } from "vitest";
import { chunkCareerData } from "../chunking/index.js";
import type { Chunk } from "../chunking/types.js";
import type { CareerDataset } from "../repository.js";
import { createInMemoryCareerDataRepository } from "../repository.js";
import { runIngest } from "./run.js";
import type { IngestStore } from "./store.js";

const MODEL_ID = "gemini-embedding-001";

function fakeDataset(ids: string[]): CareerDataset {
  return {
    profile: undefined,
    experience: [],
    projects: ids.map((id) => ({
      id,
      title: `Project ${id}`,
      body: `Body for ${id}`,
      summary: `Summary ${id}`,
      links: [],
      tags: [],
    })) as unknown as CareerDataset["projects"],
    skills: [],
    gaps: [],
    education: [],
    writing: [],
    recommendations: [],
    stories: [],
  };
}

function fakeChunker(dataset: CareerDataset): Chunk[] {
  return (dataset.projects as unknown as { id: string; body: string }[]).map((project) => ({
    id: `chunk-${project.id}`,
    sourceType: "project" as const,
    sourceId: project.id,
    chunkIndex: 0,
    text: project.body,
    contentHash: `hash-${project.body}`,
    tokenCount: 4,
    citation: { entityType: "project" as const, entityId: project.id, label: project.id },
    metadata: {},
  }));
}

function fakeStore(
  initial: { id: string; contentHash: string; embeddingModel: string }[] = [],
): IngestStore & {
  rows: Map<string, { contentHash: string; embeddingModel: string; embedding: number[] }>;
  upsertCalls: number;
  deleteCalls: string[][];
} {
  const rows = new Map<
    string,
    { contentHash: string; embeddingModel: string; embedding: number[] }
  >(
    initial.map((fp) => [
      fp.id,
      { contentHash: fp.contentHash, embeddingModel: fp.embeddingModel, embedding: [] as number[] },
    ]),
  );
  const deleteCalls: string[][] = [];
  return {
    rows,
    upsertCalls: 0,
    deleteCalls,
    async listFingerprints() {
      return [...rows.entries()].map(([id, row]) => ({
        id,
        contentHash: row.contentHash,
        embeddingModel: row.embeddingModel,
      }));
    },
    async upsertMany(chunks) {
      this.upsertCalls += chunks.length;
      for (const chunk of chunks) {
        rows.set(chunk.id, {
          contentHash: chunk.contentHash,
          embeddingModel: chunk.embeddingModel,
          embedding: chunk.embedding,
        });
      }
    },
    async deleteMany(ids) {
      deleteCalls.push([...ids]);
      for (const id of ids) rows.delete(id);
    },
  };
}

function fakeEmbedder(embedCalls: string[][] = []) {
  return {
    embedCalls,
    async embed(texts: readonly string[]) {
      embedCalls.push([...texts]);
      return texts.map((_, i) => [i]);
    },
  };
}

/**
 * A minimal dataset with one `CareerStory` plus its primary `ExperienceEntry`,
 * chunked through the real `chunkCareerData` (not `fakeChunker` — #292 review
 * finding: incremental ingestion had no coverage of the real story chunking
 * path).
 */
function storyDataset(overrides: Partial<CareerDataset> = {}): CareerDataset {
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
    ],
    ...overrides,
  };
}

/** Ids of the story-sourced chunks (as opposed to the dataset's one experience chunk) among `chunks`. */
function storyChunkIds(chunks: Chunk[]): string[] {
  return chunks.filter((chunk) => chunk.sourceType === "story").map((chunk) => chunk.id);
}

describe("runIngest — story incremental ingestion, via the real chunkCareerData path", () => {
  it("inserts a story's chunk(s), alongside its primary experience's, into an empty store", async () => {
    const repository = createInMemoryCareerDataRepository(storyDataset());
    const expectedChunks = chunkCareerData(repository.getDataset());
    const store = fakeStore();
    const embedder = fakeEmbedder();

    const summary = await runIngest({
      repository,
      chunker: chunkCareerData,
      embedder,
      store,
      modelId: MODEL_ID,
    });

    expect(summary.inserted).toBe(expectedChunks.length);
    for (const id of storyChunkIds(expectedChunks)) {
      expect(store.rows.has(id)).toBe(true);
    }
  });

  it("leaves an unchanged story alone: zero embedding calls, zero writes on re-run", async () => {
    const repository = createInMemoryCareerDataRepository(storyDataset());
    const chunks = chunkCareerData(repository.getDataset());
    const store = fakeStore(
      chunks.map((c) => ({ id: c.id, contentHash: c.contentHash, embeddingModel: MODEL_ID })),
    );
    const embedder = fakeEmbedder();
    const embedSpy = vi.spyOn(embedder, "embed");
    const upsertSpy = vi.spyOn(store, "upsertMany");
    const deleteSpy = vi.spyOn(store, "deleteMany");

    const summary = await runIngest({
      repository,
      chunker: chunkCareerData,
      embedder,
      store,
      modelId: MODEL_ID,
    });

    expect(summary.unchanged).toBe(chunks.length);
    expect(summary.inserted).toBe(0);
    expect(summary.updated).toBe(0);
    expect(embedSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("editing a story's content re-embeds and updates only its own chunk(s), leaving its unrelated experience chunk unchanged", async () => {
    const original = storyDataset();
    const originalChunks = chunkCareerData(original);
    const store = fakeStore(
      originalChunks.map((c) => ({
        id: c.id,
        contentHash: c.contentHash,
        embeddingModel: MODEL_ID,
      })),
    );

    const edited = storyDataset({
      stories: original.stories.map((story) =>
        story.id === "acme-quick-fix-story"
          ? { ...story, situation: "A flaky deploy check was blocking every release for a week." }
          : story,
      ),
    });
    const editedRepository = createInMemoryCareerDataRepository(edited);
    const editedChunks = chunkCareerData(editedRepository.getDataset());
    const embedder = fakeEmbedder();

    const summary = await runIngest({
      repository: editedRepository,
      chunker: chunkCareerData,
      embedder,
      store,
      modelId: MODEL_ID,
    });

    const expectedUpdated = storyChunkIds(editedChunks).length;
    expect(summary.updated).toBe(expectedUpdated);
    expect(summary.unchanged).toBe(editedChunks.length - expectedUpdated);
    expect(store.upsertCalls).toBe(expectedUpdated);
  });

  it("removing a story deletes its chunk(s) and leaves no orphans, without touching its unrelated experience chunk", async () => {
    const withStory = storyDataset();
    const chunksWithStory = chunkCareerData(withStory);
    const store = fakeStore(
      chunksWithStory.map((c) => ({
        id: c.id,
        contentHash: c.contentHash,
        embeddingModel: MODEL_ID,
      })),
    );

    const withoutStory = storyDataset({ stories: [] });
    const repository = createInMemoryCareerDataRepository(withoutStory);
    const embedder = fakeEmbedder();

    const removedStoryChunkIds = storyChunkIds(chunksWithStory);
    const summary = await runIngest({
      repository,
      chunker: chunkCareerData,
      embedder,
      store,
      modelId: MODEL_ID,
    });

    expect(summary.deleted).toBe(removedStoryChunkIds.length);
    for (const id of removedStoryChunkIds) {
      expect(store.rows.has(id)).toBe(false);
    }
    expect(store.rows.size).toBe(chunksWithStory.length - removedStoryChunkIds.length);
  });
});

describe("runIngest", () => {
  it("populates an empty store: every chunk inserted, exits with a non-zero insert count", async () => {
    const repository = createInMemoryCareerDataRepository(fakeDataset(["a", "b"]));
    const store = fakeStore();
    const embedCalls: string[][] = [];
    const embedder = fakeEmbedder(embedCalls);

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder,
      store,
      modelId: MODEL_ID,
    });

    expect(summary.inserted).toBe(2);
    expect(summary.updated).toBe(0);
    expect(summary.deleted).toBe(0);
    expect(summary.unchanged).toBe(0);
    expect(summary.embeddingCalls).toBeGreaterThan(0);
    expect(store.rows.size).toBe(2);
  });

  it("re-running immediately makes zero embedding calls and zero writes", async () => {
    const repository = createInMemoryCareerDataRepository(fakeDataset(["a", "b"]));
    const chunks = fakeChunker(repository.getDataset());
    const store = fakeStore(
      chunks.map((c) => ({ id: c.id, contentHash: c.contentHash, embeddingModel: MODEL_ID })),
    );
    const embedder = fakeEmbedder();
    const embedSpy = vi.spyOn(embedder, "embed");
    const upsertSpy = vi.spyOn(store, "upsertMany");
    const deleteSpy = vi.spyOn(store, "deleteMany");

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder,
      store,
      modelId: MODEL_ID,
    });

    expect(summary.unchanged).toBe(2);
    expect(summary.inserted).toBe(0);
    expect(summary.updated).toBe(0);
    expect(embedSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("editing one record re-embeds and updates only its chunk", async () => {
    const repository = createInMemoryCareerDataRepository(fakeDataset(["a", "b"]));
    const originalChunks = fakeChunker(repository.getDataset());
    const store = fakeStore(
      originalChunks.map((c) => ({
        id: c.id,
        contentHash: c.contentHash,
        embeddingModel: MODEL_ID,
      })),
    );

    // Simulate an edit to project "a" by chunking a dataset where only "a" differs.
    const editedRepository = createInMemoryCareerDataRepository(fakeDataset(["a", "b"]));
    const editedProjects = editedRepository.getDataset().projects as unknown as {
      id: string;
      body: string;
    }[];
    const editedProjectA = editedProjects[0];
    if (editedProjectA === undefined)
      throw new Error("expected fakeDataset to produce a first project");
    editedProjectA.body = "edited body";

    const embedder = fakeEmbedder();
    const summary = await runIngest({
      repository: editedRepository,
      chunker: fakeChunker,
      embedder,
      store,
      modelId: MODEL_ID,
    });

    expect(summary.updated).toBe(1);
    expect(summary.unchanged).toBe(1);
    expect(store.upsertCalls).toBe(1);
  });

  it("removing a source record deletes its chunk and leaves no orphans", async () => {
    const store = fakeStore([
      { id: "chunk-a", contentHash: "hash-Body for a", embeddingModel: MODEL_ID },
      { id: "chunk-b", contentHash: "hash-Body for b", embeddingModel: MODEL_ID },
    ]);
    const repository = createInMemoryCareerDataRepository(fakeDataset(["a"]));
    const embedder = fakeEmbedder();

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder,
      store,
      modelId: MODEL_ID,
    });

    expect(summary.deleted).toBe(1);
    expect(store.rows.has("chunk-b")).toBe(false);
    expect(store.rows.has("chunk-a")).toBe(true);
  });

  it("--dry-run reports the same diff summary but makes no embedding calls or writes", async () => {
    const repository = createInMemoryCareerDataRepository(fakeDataset(["a", "b"]));
    const store = fakeStore();
    const embedder = fakeEmbedder();
    const embedSpy = vi.spyOn(embedder, "embed");
    const upsertSpy = vi.spyOn(store, "upsertMany");

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder,
      store,
      modelId: MODEL_ID,
      dryRun: true,
    });

    expect(summary.inserted).toBe(2);
    expect(embedSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(store.rows.size).toBe(0);
  });

  it("--full re-embeds every chunk regardless of hash match", async () => {
    const repository = createInMemoryCareerDataRepository(fakeDataset(["a", "b"]));
    const chunks = fakeChunker(repository.getDataset());
    const store = fakeStore(
      chunks.map((c) => ({ id: c.id, contentHash: c.contentHash, embeddingModel: MODEL_ID })),
    );
    const embedder = fakeEmbedder();

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder,
      store,
      modelId: MODEL_ID,
      full: true,
    });

    expect(summary.updated).toBe(2);
    expect(summary.unchanged).toBe(0);
  });

  it("a configured model-id change triggers a full re-embed of previously unchanged chunks", async () => {
    const repository = createInMemoryCareerDataRepository(fakeDataset(["a", "b"]));
    const chunks = fakeChunker(repository.getDataset());
    const store = fakeStore(
      chunks.map((c) => ({ id: c.id, contentHash: c.contentHash, embeddingModel: "old-model-id" })),
    );
    const embedder = fakeEmbedder();

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder,
      store,
      modelId: MODEL_ID,
    });

    expect(summary.updated).toBe(2);
    expect(summary.unchanged).toBe(0);
  });

  it("aborts with a non-zero-exit-signaling error and performs no writes when embedding permanently fails", async () => {
    const repository = createInMemoryCareerDataRepository(fakeDataset(["a", "b"]));
    const store = fakeStore();
    const upsertSpy = vi.spyOn(store, "upsertMany");
    const deleteSpy = vi.spyOn(store, "deleteMany");
    const embedder = {
      async embed(): Promise<number[][]> {
        throw new Error("permanent embedding failure");
      },
    };

    await expect(
      runIngest({ repository, chunker: fakeChunker, embedder, store, modelId: MODEL_ID }),
    ).rejects.toThrow("permanent embedding failure");
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(store.rows.size).toBe(0);
  });
});

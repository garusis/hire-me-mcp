import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Chunk } from "../chunking/types.js";
import { runMigrations } from "../db/migrate.js";
import type { NeonBranchConfig } from "../db/neon-branch.js";
import {
  createNeonTestBranch,
  deleteNeonTestBranch,
  loadNeonBranchConfig,
} from "../db/neon-branch.js";
import type { CareerDataset } from "../repository.js";
import { createInMemoryCareerDataRepository, emptyCareerDataset } from "../repository.js";
import { runIngest } from "./run.js";
import { createDbIngestStore } from "./store.js";

/**
 * Real-Neon integration suite for #24's acceptance criteria that need an
 * actual database round-trip (the diff/orchestration logic itself is
 * covered network-free in `diff.test.ts`/`run.test.ts`). Creates a
 * throwaway branch, runs migrations, then exercises the full
 * insert -> zero-call re-run -> edit -> delete -> --full -> model-change
 * cycle with a faked (spy-asserted, no real network) embedder — deleting
 * the branch on teardown, including on failure.
 *
 * Skips cleanly when NEON_API_KEY/NEON_PROJECT_ID aren't set — see
 * README.md "Running the DB integration suite locally".
 */
const neonConfig: NeonBranchConfig | undefined = loadNeonBranchConfig();
const MODEL_ID = "gemini-embedding-001";

type TestSql = ReturnType<typeof postgres>;

function project(id: string, body: string) {
  return {
    id,
    title: `Project ${id}`,
    body,
    summary: `Summary ${id}`,
    links: [],
    tags: [],
  };
}

function datasetOf(projects: { id: string; body: string }[]): CareerDataset {
  return {
    ...emptyCareerDataset(),
    projects: projects.map((p) => project(p.id, p.body)) as unknown as CareerDataset["projects"],
  };
}

function fakeChunker(dataset: CareerDataset): Chunk[] {
  return (dataset.projects as unknown as { id: string; body: string }[]).map((p) => ({
    id: `chunk-${p.id}`,
    sourceType: "project" as const,
    sourceId: p.id,
    chunkIndex: 0,
    text: p.body,
    contentHash: `hash-${p.body}`,
    tokenCount: 4,
    citation: { entityType: "project" as const, entityId: p.id, label: p.id },
    metadata: {},
  }));
}

function fakeEmbedder() {
  return {
    async embed(texts: readonly string[]): Promise<number[][]> {
      return texts.map((text) => {
        const vector = new Array(768).fill(0);
        // Deterministic per-text vector so re-runs are reproducible.
        vector[0] = text.length % 97;
        return vector;
      });
    },
  };
}

describe.runIf(neonConfig !== undefined)("ingest pipeline (real Neon branch)", () => {
  let branchId: string | undefined;
  let sql: TestSql | undefined;

  beforeAll(async () => {
    if (neonConfig === undefined) return;
    const branch = await createNeonTestBranch(neonConfig, "hire-me-mcp-core-ingest-it");
    branchId = branch.branchId;
    sql = postgres(branch.connectionUri, { max: 1, ssl: "require", connect_timeout: 30 });

    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        await sql`SELECT 1`;
        break;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    await runMigrations(sql);
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    if (neonConfig !== undefined && branchId !== undefined) {
      await deleteNeonTestBranch(neonConfig, branchId);
    }
  }, 30_000);

  it("populates an empty database with every chunk, embeddings, and citations", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const repository = createInMemoryCareerDataRepository(
      datasetOf([
        { id: "alpha", body: "Alpha body." },
        { id: "beta", body: "Beta body." },
      ]),
    );

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder: fakeEmbedder(),
      store: createDbIngestStore(sql),
      modelId: MODEL_ID,
    });

    expect(summary.inserted).toBe(2);
    expect(summary.updated).toBe(0);
    expect(summary.deleted).toBe(0);

    const rows = await sql<{ id: string; embedding_model: string }[]>`
      SELECT id, embedding_model FROM career_chunks ORDER BY id
    `;
    expect(rows.map((r) => r.id)).toEqual(["chunk-alpha", "chunk-beta"]);
    expect(rows.every((r) => r.embedding_model === MODEL_ID)).toBe(true);
  }, 30_000);

  it("re-running immediately reports all-unchanged and makes zero embedding calls or writes", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const repository = createInMemoryCareerDataRepository(
      datasetOf([
        { id: "alpha", body: "Alpha body." },
        { id: "beta", body: "Beta body." },
      ]),
    );
    const embedder = fakeEmbedder();
    const embedSpy = vi.spyOn(embedder, "embed");

    const before = await sql<
      { id: string; updated_at: Date }[]
    >`SELECT id, updated_at FROM career_chunks`;

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder,
      store: createDbIngestStore(sql),
      modelId: MODEL_ID,
    });

    expect(summary.unchanged).toBe(2);
    expect(summary.inserted).toBe(0);
    expect(summary.updated).toBe(0);
    expect(embedSpy).not.toHaveBeenCalled();

    const after = await sql<
      { id: string; updated_at: Date }[]
    >`SELECT id, updated_at FROM career_chunks`;
    for (const row of before) {
      const match = after.find((r) => r.id === row.id);
      expect(match?.updated_at.getTime()).toBe(row.updated_at.getTime());
    }
  }, 30_000);

  it("editing one record re-embeds and updates only its chunk; the other keeps its updated_at", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const beforeRows = await sql<{ id: string; updated_at: Date }[]>`
      SELECT id, updated_at FROM career_chunks ORDER BY id
    `;
    const betaBefore = beforeRows.find((r) => r.id === "chunk-beta");

    const repository = createInMemoryCareerDataRepository(
      datasetOf([
        { id: "alpha", body: "Alpha body EDITED." },
        { id: "beta", body: "Beta body." },
      ]),
    );

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder: fakeEmbedder(),
      store: createDbIngestStore(sql),
      modelId: MODEL_ID,
    });

    expect(summary.updated).toBe(1);
    expect(summary.unchanged).toBe(1);

    const afterRows = await sql<{ id: string; content: string; updated_at: Date }[]>`
      SELECT id, content, updated_at FROM career_chunks ORDER BY id
    `;
    const alphaAfter = afterRows.find((r) => r.id === "chunk-alpha");
    const betaAfter = afterRows.find((r) => r.id === "chunk-beta");
    expect(alphaAfter?.content).toBe("Alpha body EDITED.");
    expect(betaAfter?.updated_at.getTime()).toBe(betaBefore?.updated_at.getTime());
  }, 30_000);

  it("removing a source record deletes its chunk and leaves no orphans", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const repository = createInMemoryCareerDataRepository(
      datasetOf([{ id: "alpha", body: "Alpha body EDITED." }]),
    );

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder: fakeEmbedder(),
      store: createDbIngestStore(sql),
      modelId: MODEL_ID,
    });

    expect(summary.deleted).toBe(1);
    const rows = await sql`SELECT id FROM career_chunks`;
    expect(rows.map((r) => (r as { id: string }).id)).toEqual(["chunk-alpha"]);
  }, 30_000);

  it("--dry-run makes no embedding calls or writes", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const repository = createInMemoryCareerDataRepository(
      datasetOf([
        { id: "alpha", body: "Alpha body EDITED." },
        { id: "gamma", body: "Gamma body." },
      ]),
    );
    const embedder = fakeEmbedder();
    const embedSpy = vi.spyOn(embedder, "embed");

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder,
      store: createDbIngestStore(sql),
      modelId: MODEL_ID,
      dryRun: true,
    });

    expect(summary.inserted).toBe(1);
    expect(embedSpy).not.toHaveBeenCalled();
    const rows = await sql`SELECT id FROM career_chunks`;
    expect(rows.map((r) => (r as { id: string }).id)).toEqual(["chunk-alpha"]);
  }, 30_000);

  it("--full re-embeds every chunk regardless of hash match", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const repository = createInMemoryCareerDataRepository(
      datasetOf([{ id: "alpha", body: "Alpha body EDITED." }]),
    );

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder: fakeEmbedder(),
      store: createDbIngestStore(sql),
      modelId: MODEL_ID,
      full: true,
    });

    expect(summary.updated).toBe(1);
    expect(summary.unchanged).toBe(0);
  }, 30_000);

  it("a configured model-id change triggers a full re-embed", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const repository = createInMemoryCareerDataRepository(
      datasetOf([{ id: "alpha", body: "Alpha body EDITED." }]),
    );

    const summary = await runIngest({
      repository,
      chunker: fakeChunker,
      embedder: fakeEmbedder(),
      store: createDbIngestStore(sql),
      modelId: "a-different-embedding-model",
    });

    expect(summary.updated).toBe(1);
    expect(summary.unchanged).toBe(0);

    const rows = await sql<
      { embedding_model: string }[]
    >`SELECT embedding_model FROM career_chunks`;
    expect(rows.every((r) => r.embedding_model === "a-different-embedding-model")).toBe(true);
  }, 30_000);

  it("a permanent embedding failure aborts with no partial commit", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const before = await sql`SELECT id FROM career_chunks`;

    const repository = createInMemoryCareerDataRepository(
      datasetOf([
        { id: "alpha", body: "Alpha body FAILS." },
        { id: "delta", body: "Delta body." },
      ]),
    );
    const failingEmbedder = {
      async embed(): Promise<number[][]> {
        throw new Error("simulated permanent embedding failure");
      },
    };

    await expect(
      runIngest({
        repository,
        chunker: fakeChunker,
        embedder: failingEmbedder,
        store: createDbIngestStore(sql),
        modelId: MODEL_ID,
      }),
    ).rejects.toThrow(/simulated permanent embedding failure/);

    const after = await sql`SELECT id FROM career_chunks`;
    expect(after.map((r) => (r as { id: string }).id).sort()).toEqual(
      before.map((r) => (r as { id: string }).id).sort(),
    );
  }, 30_000);
});

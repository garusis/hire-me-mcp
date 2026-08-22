import { describe, expect, it } from "vitest";
import {
  createDbClient,
  createNeonTestBranch,
  deleteChunksByIds,
  deleteNeonTestBranch,
  findSimilarChunks,
  getChunkById,
  listChunkFingerprints,
  loadDbConfig,
  loadNeonBranchConfig,
  MissingDatabaseUrlError,
  migrations,
  runMigrations,
  UNSET_EMBEDDING_MODEL,
  upsertChunk,
} from "./index.js";

describe("db module entry point", () => {
  it("re-exports the config, client, migration and repository surface together", () => {
    expect(typeof loadDbConfig).toBe("function");
    expect(typeof createDbClient).toBe("function");
    expect(typeof runMigrations).toBe("function");
    expect(Array.isArray(migrations)).toBe(true);
    expect(typeof upsertChunk).toBe("function");
    expect(typeof getChunkById).toBe("function");
    expect(typeof findSimilarChunks).toBe("function");
    expect(typeof listChunkFingerprints).toBe("function");
    expect(typeof deleteChunksByIds).toBe("function");
    expect(UNSET_EMBEDDING_MODEL).toBe("");
    expect(typeof loadNeonBranchConfig).toBe("function");
    expect(typeof createNeonTestBranch).toBe("function");
    expect(typeof deleteNeonTestBranch).toBe("function");
    expect(new MissingDatabaseUrlError()).toBeInstanceOf(Error);
  });
});

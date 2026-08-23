import type { DbClient } from "@hire-me-mcp/core/db";
import * as db from "@hire-me-mcp/core/db";
import * as embedding from "@hire-me-mcp/core/embedding";
import * as searchCareerModule from "@hire-me-mcp/core/search-career";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getSearchCareer()` (search-career-instance.ts) is the module-level
 * singleton the `search-career` MCP tool (#61) reads its live `SearchCareer`
 * function from — the same lazy-memoization pattern
 * `src/lib/content/repository.ts`'s `getCareerDataRepository()` established,
 * applied to the db + embedding clients (`packages/core/README.md`'s
 * "Database (Neon pgvector store)" section: `postgres` is already designed
 * to be constructed once and reused across a serverless function's warm
 * invocations, not reconnected per request).
 */

vi.mock("@hire-me-mcp/core/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core/db")>();
  return { ...actual, createDbClient: vi.fn(), loadDbConfig: vi.fn() };
});
vi.mock("@hire-me-mcp/core/embedding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core/embedding")>();
  return { ...actual, createGoogleEmbeddingClient: vi.fn(), loadEmbeddingApiKey: vi.fn() };
});
vi.mock("@hire-me-mcp/core/search-career", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core/search-career")>();
  return { ...actual, createSearchCareer: vi.fn() };
});

function fakeDbClient(): DbClient {
  return { sql: {} as DbClient["sql"], close: vi.fn().mockResolvedValue(undefined) };
}

describe("getSearchCareer", () => {
  beforeEach(() => {
    vi.mocked(db.loadDbConfig).mockReturnValue({ connectionString: "postgres://fixture/db" });
    vi.mocked(db.createDbClient).mockReturnValue(fakeDbClient());
    vi.mocked(embedding.loadEmbeddingApiKey).mockReturnValue("fixture-api-key");
    vi.mocked(embedding.createGoogleEmbeddingClient).mockReturnValue({
      embed: vi.fn().mockResolvedValue([]),
    });
    // A fresh function per call (not `mockReturnValue`, which would return the SAME
    // reference every time) so identity comparisons below the reset case can tell
    // "rebuilt" apart from "still memoized".
    vi.mocked(searchCareerModule.createSearchCareer).mockImplementation(
      () => vi.fn() as unknown as ReturnType<typeof searchCareerModule.createSearchCareer>,
    );
  });

  afterEach(async () => {
    vi.clearAllMocks();
    const instanceModule = await import("./search-career-instance.js");
    await instanceModule.resetSearchCareerForTests();
  });

  it("builds a SearchCareer instance from the real db + embedding config", async () => {
    const { getSearchCareer } = await import("./search-career-instance.js");

    getSearchCareer();

    expect(db.loadDbConfig).toHaveBeenCalledTimes(1);
    expect(embedding.loadEmbeddingApiKey).toHaveBeenCalledTimes(1);
    expect(db.createDbClient).toHaveBeenCalledWith({ connectionString: "postgres://fixture/db" });
    expect(embedding.createGoogleEmbeddingClient).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "fixture-api-key", taskType: "RETRIEVAL_QUERY" }),
    );
    expect(searchCareerModule.createSearchCareer).toHaveBeenCalledTimes(1);
  });

  it("memoizes the instance: a second call reuses it without reconnecting", async () => {
    const { getSearchCareer } = await import("./search-career-instance.js");

    const first = getSearchCareer();
    const second = getSearchCareer();

    expect(second).toBe(first);
    expect(db.createDbClient).toHaveBeenCalledTimes(1);
    expect(embedding.createGoogleEmbeddingClient).toHaveBeenCalledTimes(1);
    expect(searchCareerModule.createSearchCareer).toHaveBeenCalledTimes(1);
  });

  it("propagates loadDbConfig's MissingDatabaseUrlError without constructing a client (graceful degradation, #61)", async () => {
    const { MissingDatabaseUrlError } =
      await vi.importActual<typeof import("@hire-me-mcp/core/db")>("@hire-me-mcp/core/db");
    vi.mocked(db.loadDbConfig).mockImplementation(() => {
      throw new MissingDatabaseUrlError();
    });
    const { getSearchCareer } = await import("./search-career-instance.js");

    expect(() => getSearchCareer()).toThrow(MissingDatabaseUrlError);
    expect(db.createDbClient).not.toHaveBeenCalled();
    expect(embedding.createGoogleEmbeddingClient).not.toHaveBeenCalled();
  });

  it("propagates loadEmbeddingApiKey's MissingEmbeddingApiKeyError without constructing a db client (graceful degradation, #61)", async () => {
    const { MissingEmbeddingApiKeyError } = await vi.importActual<
      typeof import("@hire-me-mcp/core/embedding")
    >("@hire-me-mcp/core/embedding");
    vi.mocked(embedding.loadEmbeddingApiKey).mockImplementation(() => {
      throw new MissingEmbeddingApiKeyError();
    });
    const { getSearchCareer } = await import("./search-career-instance.js");

    expect(() => getSearchCareer()).toThrow(MissingEmbeddingApiKeyError);
    expect(db.createDbClient).not.toHaveBeenCalled();
  });

  it("resetSearchCareerForTests closes the pooled connection and clears the memoized instance", async () => {
    const client = fakeDbClient();
    vi.mocked(db.createDbClient).mockReturnValue(client);
    const { getSearchCareer, resetSearchCareerForTests } = await import(
      "./search-career-instance.js"
    );

    const before = getSearchCareer();
    await resetSearchCareerForTests();
    expect(client.close).toHaveBeenCalledTimes(1);

    const after = getSearchCareer();
    expect(after).not.toBe(before);
    expect(db.createDbClient).toHaveBeenCalledTimes(2);
  });
});

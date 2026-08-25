import type { WritingEntry } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { listWriting } from "./list-writing.js";
import { createInMemoryCareerDataRepository, emptyCareerDataset } from "./repository.js";

function entry(
  overrides: Partial<WritingEntry> & Pick<WritingEntry, "id" | "title">,
): WritingEntry {
  return {
    publishedDate: "2024-01-15",
    summary: "Fixture summary.",
    body: "Fixture body prose.",
    ...overrides,
  };
}

const older = entry({ id: "older-piece", title: "Older Piece", publishedDate: "2023-06-01" });
const newer = entry({
  id: "newer-piece",
  title: "Newer Piece",
  publishedDate: "2024-02-01",
  url: "https://example.test/newer-piece",
});

function fixtureRepository(writing: WritingEntry[] = [older, newer]) {
  return createInMemoryCareerDataRepository({ ...emptyCareerDataset(), writing });
}

describe("listWriting", () => {
  it("returns every entry most recent first, full records including body and optional url", () => {
    const result = listWriting(fixtureRepository());

    expect(result.data.map((item) => item.id)).toEqual(["newer-piece", "older-piece"]);
    expect(result.data[0]?.url).toBe("https://example.test/newer-piece");
    expect(result.data[1]?.url).toBeUndefined();
    expect(result.data[0]?.body).toBe("Fixture body prose.");
  });

  it("breaks publishedDate ties by id ascending, deterministically", () => {
    const tieA = entry({ id: "tie-b", title: "Tie B", publishedDate: "2024-03-01" });
    const tieB = entry({ id: "tie-a", title: "Tie A", publishedDate: "2024-03-01" });
    const result = listWriting(fixtureRepository([tieA, tieB]));

    expect(result.data.map((item) => item.id)).toEqual(["tie-a", "tie-b"]);
  });

  it("returns citations[i] resolving to data[i], labeled with the title", () => {
    const result = listWriting(fixtureRepository());

    expect(result.citations).toHaveLength(result.data.length);
    result.data.forEach((item, index) => {
      expect(result.citations[index]).toEqual({
        entityType: "writing",
        entityId: item.id,
        label: item.title,
      });
    });
  });

  it("returns an honest empty list for the (current, real) empty corpus — data, not an error", () => {
    const result = listWriting(fixtureRepository([]));

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });
});

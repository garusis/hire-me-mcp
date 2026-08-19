import { describe, expect, it } from "vitest";
import { writingEntrySchema } from "./writing.js";

const validWriting = {
  id: "why-typed-content-models-matter",
  title: "Why typed content models matter",
  publishedDate: "2024-05-10",
  summary: "On modeling structured content with Zod instead of loose markdown.",
  url: "https://example.test/blog/typed-content-models",
  body: "## Intro\n\nA long-form article body.",
};

describe("writingEntrySchema", () => {
  it("accepts a complete valid entry", () => {
    expect(writingEntrySchema.safeParse(validWriting).success).toBe(true);
  });

  it("accepts an entry with no external url (published only in this portfolio)", () => {
    const { url: _url, ...withoutUrl } = validWriting;
    expect(writingEntrySchema.safeParse(withoutUrl).success).toBe(true);
  });

  it("rejects a publishedDate not in YYYY-MM-DD form", () => {
    const result = writingEntrySchema.safeParse({ ...validWriting, publishedDate: "May 2024" });
    expect(result.success).toBe(false);
  });

  it("rejects an entry with an empty body", () => {
    const result = writingEntrySchema.safeParse({ ...validWriting, body: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an entry missing a title", () => {
    const { title: _title, ...withoutTitle } = validWriting;
    expect(writingEntrySchema.safeParse(withoutTitle).success).toBe(false);
  });
});

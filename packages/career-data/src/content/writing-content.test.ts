import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { idSchema } from "../schemas/index.js";
import { validateContentDir } from "./loader.js";

/**
 * Invariant tests over the real, authored `content/writing/*.mdx` (#48).
 *
 * As of #48 there is no published writing/talks content to link, so this is
 * an intentionally empty-but-valid collection (see content/README.md) — the
 * directory exists and the validate script treats zero entries as success,
 * not an error.
 */
const contentDir = fileURLToPath(new URL("../../content/", import.meta.url));
const writingDir = path.join(contentDir, "writing");

function readWritingIds(): string[] {
  if (!fs.existsSync(writingDir)) {
    return [];
  }
  return fs
    .readdirSync(writingDir)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(writingDir, file), "utf-8");
      const match = raw.match(/^id:\s*(\S+)\s*$/m);
      const id = match?.[1];
      if (id === undefined) {
        throw new Error(`no id frontmatter field found in writing/${file}`);
      }
      return id;
    });
}

describe("real content: writing/*.mdx", () => {
  it("validates against the WritingEntry schema (empty collection is valid)", () => {
    const errors = validateContentDir(contentDir).filter((error) =>
      error.file.startsWith("writing/"),
    );
    expect(errors).toEqual([]);
  });

  it("is currently an empty-but-valid collection", () => {
    expect(readWritingIds()).toEqual([]);
  });

  it("would have unique, slug-pattern ids if any entries were added", () => {
    const ids = readWritingIds();
    for (const id of ids) {
      expect(idSchema.safeParse(id).success).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

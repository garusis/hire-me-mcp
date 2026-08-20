import { describe, expect, it } from "vitest";
import { buildAliasIndex } from "./alias-resolver.js";

describe("buildAliasIndex", () => {
  const index = buildAliasIndex([
    { canonical: "typescript", aliases: ["ts"] },
    { canonical: "postgresql", aliases: ["postgres", "psql"] },
    { canonical: "aws", aliases: ["amazon web services"] },
  ]);

  it("resolves a canonical name to itself", () => {
    expect(index.resolve("typescript")).toBe("typescript");
  });

  it("resolves a single-word alias to its canonical entry", () => {
    expect(index.resolve("ts")).toBe("typescript");
  });

  it("resolves any alias in a multi-alias entry to the same canonical entry", () => {
    expect(index.resolve("postgres")).toBe("postgresql");
    expect(index.resolve("psql")).toBe("postgresql");
  });

  it("resolves a multi-word alias phrase to its canonical entry", () => {
    expect(index.resolve("amazon web services")).toBe("aws");
  });

  it("resolution is case-insensitive, punctuation-insensitive and diacritic-insensitive", () => {
    expect(index.resolve(" TS! ")).toBe("typescript");
    expect(index.resolve("Postgres,")).toBe("postgresql");
  });

  it("returns undefined for a term that matches nothing in the index", () => {
    expect(index.resolve("cobol")).toBeUndefined();
  });

  it("returns undefined for an empty or whitespace-only term", () => {
    expect(index.resolve("")).toBeUndefined();
    expect(index.resolve("   ")).toBeUndefined();
  });

  it("is not hardcoded to any particular domain shape — works for arbitrary {canonical, aliases} collections", () => {
    const gapIndex = buildAliasIndex([
      { canonical: "kubernetes-operators", aliases: ["k8s operators"] },
    ]);

    expect(gapIndex.resolve("k8s operators")).toBe("kubernetes-operators");
  });

  it("an entry with no aliases still resolves by its canonical name", () => {
    const noAliasIndex = buildAliasIndex([{ canonical: "docker", aliases: [] }]);

    expect(noAliasIndex.resolve("docker")).toBe("docker");
    expect(noAliasIndex.resolve("Docker!")).toBe("docker");
  });
});

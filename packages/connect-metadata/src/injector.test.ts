import { describe, expect, it } from "vitest";
import { checkGeneratedRegions, injectGeneratedRegions, MalformedMarkerError } from "./injector";

const TEMPLATE = [
  "# Doc",
  "",
  "<!-- BEGIN GENERATED: endpoint -->",
  "old endpoint content",
  "<!-- END GENERATED: endpoint -->",
  "",
  "Some hand-written prose that must survive untouched.",
  "",
  "<!-- BEGIN GENERATED: tools -->",
  "old tools content",
  "<!-- END GENERATED: tools -->",
].join("\n");

describe("injectGeneratedRegions", () => {
  it("replaces the content between a BEGIN/END marker pair with the given content", () => {
    const result = injectGeneratedRegions(TEMPLATE, [
      { id: "endpoint", content: "new endpoint content" },
    ]);
    expect(result).toContain("new endpoint content");
    expect(result).not.toContain("old endpoint content");
  });

  it("leaves hand-written content outside any marked region untouched", () => {
    const result = injectGeneratedRegions(TEMPLATE, [
      { id: "endpoint", content: "new endpoint content" },
    ]);
    expect(result).toContain("Some hand-written prose that must survive untouched.");
  });

  it("injects multiple regions independently", () => {
    const result = injectGeneratedRegions(TEMPLATE, [
      { id: "endpoint", content: "new endpoint content" },
      { id: "tools", content: "new tools content" },
    ]);
    expect(result).toContain("new endpoint content");
    expect(result).toContain("new tools content");
  });

  it("is idempotent — injecting the same regions twice produces the same output as injecting once", () => {
    const once = injectGeneratedRegions(TEMPLATE, [
      { id: "endpoint", content: "new endpoint content" },
      { id: "tools", content: "new tools content" },
    ]);
    const twice = injectGeneratedRegions(once, [
      { id: "endpoint", content: "new endpoint content" },
      { id: "tools", content: "new tools content" },
    ]);
    expect(twice).toBe(once);
  });

  it("throws when a region id has no marker pair in the source at all", () => {
    expect(() =>
      injectGeneratedRegions(TEMPLATE, [{ id: "does-not-exist", content: "x" }]),
    ).toThrow();
  });

  it("throws MalformedMarkerError when only the BEGIN marker is present (missing END)", () => {
    const broken = "<!-- BEGIN GENERATED: endpoint -->\ncontent";
    expect(() => injectGeneratedRegions(broken, [{ id: "endpoint", content: "x" }])).toThrow(
      MalformedMarkerError,
    );
  });

  it("throws MalformedMarkerError when the END marker appears before the BEGIN marker", () => {
    const broken = "<!-- END GENERATED: endpoint -->\ncontent\n<!-- BEGIN GENERATED: endpoint -->";
    expect(() => injectGeneratedRegions(broken, [{ id: "endpoint", content: "x" }])).toThrow(
      MalformedMarkerError,
    );
  });
});

describe("checkGeneratedRegions", () => {
  it("reports no drift when every region already matches the rendered content", () => {
    const injected = injectGeneratedRegions(TEMPLATE, [
      { id: "endpoint", content: "new endpoint content" },
      { id: "tools", content: "new tools content" },
    ]);
    const result = checkGeneratedRegions(injected, [
      { id: "endpoint", content: "new endpoint content" },
      { id: "tools", content: "new tools content" },
    ]);
    expect(result.drifted).toEqual([]);
  });

  it("reports drift when a generated region was hand-edited after generation", () => {
    const injected = injectGeneratedRegions(TEMPLATE, [
      { id: "endpoint", content: "new endpoint content" },
      { id: "tools", content: "new tools content" },
    ]);
    const handEdited = injected.replace("new endpoint content", "someone typed this by hand");
    const result = checkGeneratedRegions(handEdited, [
      { id: "endpoint", content: "new endpoint content" },
      { id: "tools", content: "new tools content" },
    ]);
    expect(result.drifted).toEqual(["endpoint"]);
  });
});

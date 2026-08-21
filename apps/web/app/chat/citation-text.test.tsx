import { readFileSync } from "node:fs";
import path from "node:path";
import * as citationsModule from "@hire-me-mcp/agent/citations";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WritingEntry } from "../../src/lib/content";
import { CitationText } from "./citation-text";

const SOURCE_PATH = path.join(process.cwd(), "app", "chat", "citation-text.tsx");

const NO_WRITING: readonly WritingEntry[] = [];

describe("CitationText", () => {
  afterEach(() => {
    cleanup();
  });

  it("imports the shared parser from @hire-me-mcp/agent/citations rather than re-implementing the marker format", () => {
    // Guards against a regex-guessed reimplementation of the `[cite:...]`
    // format (issue #70's explicit requirement): asserts the real,
    // unmocked module actually exports the functions this component must
    // import and use. The `/citations` subpath (not the package's default
    // `.` export) is deliberate: the default export barrel re-exports the
    // full embedded Mastra agent runtime (Node-only — `@mastra/core`,
    // model providers), which fails a Next.js client-component build if
    // reached from this client-rendered component; `citations.ts` itself
    // is framework-free and hermetic (see its own module doc), so the
    // package exposes it as its own subpath for exactly this kind of
    // client-safe reuse.
    expect(typeof citationsModule.parseCitations).toBe("function");
    expect(typeof citationsModule.serializeCitation).toBe("function");

    // Belt-and-braces: the component's own source must literally import
    // `parseCitations`/`serializeCitation` from
    // `@hire-me-mcp/agent/citations`, not just have that module available
    // in the graph.
    const source = readFileSync(SOURCE_PATH, "utf-8");
    expect(source).toMatch(/from\s+"@hire-me-mcp\/agent\/citations"/);
    expect(source).toContain("parseCitations");
    expect(source).toContain("serializeCitation");
  });

  it("renders plain text untouched when it has no citation markers", () => {
    render(<CitationText text="Just plain prose." writingEntries={NO_WRITING} />);
    expect(screen.getByText("Just plain prose.")).toBeDefined();
  });

  it("renders a resolvable citation marker as an inline, keyboard-focusable link to the matching site section", () => {
    render(
      <CitationText
        text="He built the platform at House Numbers. [cite:experience:house-numbers]"
        writingEntries={NO_WRITING}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/experience#house-numbers");
    expect(link.tagName).toBe("A");
  });

  it("splits surrounding text around the citation link correctly", () => {
    render(
      <CitationText text="Before. [cite:project:cowork] After." writingEntries={NO_WRITING} />,
    );
    expect(screen.getByText(/Before\./)).toBeDefined();
    expect(screen.getByText(/After\./)).toBeDefined();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/projects/cowork");
  });

  it("renders a citation that resolves to no known section as plain text with no broken link", () => {
    render(
      <CitationText
        text="A claim about identity. [cite:profile:marcos]"
        writingEntries={NO_WRITING}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/A claim about identity\./)).toBeDefined();
  });

  it("renders multiple citation markers as separate links", () => {
    render(
      <CitationText
        text="[cite:experience:house-numbers] and [cite:skill:golang]"
        writingEntries={NO_WRITING}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/experience#house-numbers");
    expect(links[1]).toHaveAttribute("href", "/skills#golang");
  });
});

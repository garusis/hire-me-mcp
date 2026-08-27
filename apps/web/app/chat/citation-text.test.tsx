import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WritingEntry } from "../../src/lib/content";
import { CitationSources, CitationText } from "./citation-text";

const NO_WRITING: readonly WritingEntry[] = [];

describe("CitationText", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders plain text untouched when it has no citation markers", () => {
    render(<CitationText text="Just plain prose." writingEntries={NO_WRITING} />);
    expect(screen.getByText("Just plain prose.")).toBeDefined();
  });

  it("renders a citation as a numbered superscript link to the matching site section, not as raw marker syntax", () => {
    const { container } = render(
      <CitationText
        text="He built the platform at House Numbers. [cite:experience:house-numbers]"
        writingEntries={NO_WRITING}
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/experience#house-numbers");
    expect(link.tagName).toBe("A");
    // Reference number, not `[cite:experience:house-numbers]` — machine
    // syntax must never reach a reader's sentence (issue 227).
    expect(link).toHaveTextContent("1");
    expect(container.textContent).not.toContain("[cite:");
    expect(container.querySelector("sup")).not.toBeNull();
  });

  it("keeps the original marker text in data-citation, so the DOM stays self-describing for the e2e specs", () => {
    const { container } = render(
      <CitationText text="Claim. [cite:project:cowork]" writingEntries={NO_WRITING} />,
    );
    expect(container.querySelector("[data-citation]")).toHaveAttribute(
      "data-citation",
      "[cite:project:cowork]",
    );
  });

  it("names the source in the reference's accessible name, so it isn't announced as a bare number", () => {
    render(<CitationText text="Claim. [cite:project:cowork]" writingEntries={NO_WRITING} />);
    expect(screen.getByRole("link", { name: /source 1: project · cowork/i })).toBeDefined();
  });

  it("splits surrounding text around the citation link correctly", () => {
    render(
      <CitationText text="Before. [cite:project:cowork] After." writingEntries={NO_WRITING} />,
    );
    expect(screen.getByText(/Before\./)).toBeDefined();
    expect(screen.getByText(/After\./)).toBeDefined();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/projects/cowork");
  });

  // The exact defect issue 227 reported from the live widget: "…open to new
  // opportunities ." with the citation deleted and its space left behind.
  it("leaves no stray space where the marker was", () => {
    const { container } = render(
      <CitationText
        text="Marcos is open to new opportunities [cite:profile:marcos-alvarez]."
        writingEntries={NO_WRITING}
      />,
    );
    expect(container.textContent).toBe("Marcos is open to new opportunities1.");
    expect(container.textContent).not.toContain(" .");
  });

  it("renders a profile citation as a real link rather than dropping it (issue 227)", () => {
    render(
      <CitationText
        text="A claim about identity. [cite:profile:marcos]"
        writingEntries={NO_WRITING}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/#profile");
  });

  it("renders multiple citation markers as separate numbered links", () => {
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
    expect(links[0]).toHaveTextContent("1");
    expect(links[1]).toHaveTextContent("2");
  });
});

describe("CitationSources", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when the answer cited nothing, so no empty heading appears", () => {
    const { container } = render(
      <CitationSources text="I don't have that in the data." writingEntries={NO_WRITING} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists each cited record once, in reference order, with a link matching the inline superscript", () => {
    render(
      <CitationSources
        text="He built it [cite:experience:house-numbers] using [cite:skill:typescript], and again [cite:experience:house-numbers]"
        writingEntries={NO_WRITING}
      />,
    );

    expect(screen.getByText("Sources")).toBeDefined();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/experience#house-numbers",
      "/skills#typescript",
    ]);
    expect(links[0]).toHaveTextContent("Experience · House Numbers");
    expect(links[1]).toHaveTextContent("Skill · Typescript");
  });
});

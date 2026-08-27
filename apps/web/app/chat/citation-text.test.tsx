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

  // Issue 270: the model wrote `[cite:get-skill-evidence:rust]` — the TOOL's
  // name in the entity-type slot — and a recruiter read the raw syntax.
  it("never renders a tool-name-shaped marker as text", () => {
    const { container } = render(
      <CitationText
        text="He doesn't have production Rust experience [cite:get-skill-evidence:rust]."
        writingEntries={NO_WRITING}
      />,
    );

    expect(container.textContent).toBe("He doesn't have production Rust experience.");
    expect(container.textContent).not.toContain("[cite:");
    expect(container.textContent).not.toContain("get-skill-evidence");
  });

  it("keeps an unresolved marker findable in the DOM, hidden from the reader", () => {
    const { container } = render(
      <CitationText text="A claim [cite:get-skill-evidence:rust]." writingEntries={NO_WRITING} />,
    );

    const trace = container.querySelector("[data-unresolved-citation]");
    expect(trace).toHaveAttribute("data-unresolved-citation", "[cite:get-skill-evidence:rust]");
    // Not a silent deletion, but not something a reader can see either.
    expect(trace).toHaveAttribute("hidden");
  });

  // Issue 277: a superscript reference must splice into the sentence, not
  // push its punctuation away — "…costs 1 . He also built…".
  it("leaves no space between the reference and the punctuation that follows it", () => {
    const { container } = render(
      <CitationText
        text="OCR costs [cite:project:cowork] . He also built [cite:skill:golang] , twice."
        writingEntries={NO_WRITING}
      />,
    );
    expect(container.textContent).toBe("OCR costs1. He also built2, twice.");
  });

  it("renders Markdown bullets as a real list, never as literal asterisks (issue 272)", () => {
    const { container } = render(
      <CitationText
        text={
          "Roles:\n" +
          "* **Senior Engineer at House Numbers** (2022): built it [cite:experience:house-numbers].\n" +
          "* **Senior Engineer at FullStack Labs** (2018 to 2020): shipped it."
        }
        writingEntries={NO_WRITING}
      />,
    );

    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("strong")).toHaveLength(2);
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toMatch(/^\s*\*/m);
    // The citation inside a list item still renders as a numbered link.
    expect(screen.getByRole("link")).toHaveAttribute("href", "/experience#house-numbers");
  });

  it("renders a numbered Markdown list as an ordered list", () => {
    const { container } = render(
      <CitationText text={"1. First\n2. Second"} writingEntries={NO_WRITING} />,
    );
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("renders emphasis and inline code without emitting any HTML the answer contained", () => {
    const { container } = render(
      <CitationText
        text={"Uses *pgvector* and `pnpm test`, and <script>alert(1)</script> is just text."}
        writingEntries={NO_WRITING}
      />,
    );

    expect(container.querySelector("em")).toHaveTextContent("pgvector");
    expect(container.querySelector("code")).toHaveTextContent("pnpm test");
    // The one that matters: Markdown rendering must not become an HTML sink.
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("never renders an anchor whose href came from the answer text", () => {
    const { container } = render(
      <CitationText
        text={"See [my site](javascript:alert(1)) and ![x](javascript:alert(2))."}
        writingEntries={NO_WRITING}
      />,
    );

    // Link and image syntax is deliberately not parsed — the only anchors the
    // chat renders are citations, whose hrefs the app itself builds.
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(0);
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

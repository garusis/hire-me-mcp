import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GapsListView, Skill, SkillsListView, WritingListView } from "../../src/lib/content";

const { getSkillsListView, getGapsListView, getWritingListView } = vi.hoisted(() => ({
  getSkillsListView: vi.fn(),
  getGapsListView: vi.fn(),
  getWritingListView: vi.fn(),
}));

vi.mock("../../src/lib/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/content")>();
  return {
    ...actual,
    getSkillsListView,
    getGapsListView,
    getWritingListView,
  };
});

const strongSkill: Skill = {
  id: "typescript",
  name: "TypeScript",
  aliases: ["ts"],
  category: "language",
  proficiency: "expert",
  evidence: [
    { entityType: "experience", entityId: "role-one", label: "Engineer, Role One Co" },
    { entityType: "project", entityId: "cowork", label: "cowork" },
  ],
};

const singleSourceSkill: Skill = {
  id: "python",
  name: "Python",
  aliases: [],
  category: "language",
  proficiency: "familiar",
  evidence: [{ entityType: "experience", entityId: "role-one", label: "Engineer, Role One Co" }],
};

// Not real content shape — `Skill.evidence` requires `.min(1)` at the schema
// level, but that constraint doesn't survive to the TS type, so the type
// checker allows this stub. Exercises the AC: a no-evidence skill must not
// silently render as fully claimed.
const noEvidenceSkill: Skill = {
  id: "unsubstantiated",
  name: "Unsubstantiated Skill",
  aliases: [],
  category: "language",
  proficiency: "proficient",
  evidence: [],
};

const writingEvidenceSkill: Skill = {
  id: "technical-writing",
  name: "Technical Writing",
  aliases: [],
  category: "craft",
  proficiency: "proficient",
  evidence: [{ entityType: "writing", entityId: "external-post", label: "An External Post" }],
};

function skillsView(items: Skill[]): SkillsListView {
  return { items };
}

function gapsView(): GapsListView {
  return {
    items: [
      {
        gap: {
          id: "golang",
          name: "Go (Golang)",
          aliases: ["go"],
          statement: "No production Go experience — this exact sentence is asserted below.",
          relatedSkills: ["typescript"],
        },
        citation: { entityType: "gap", entityId: "golang", label: "Go (Golang)" },
        relatedSkills: [strongSkill],
      },
    ],
  };
}

function writingView(): WritingListView {
  return {
    citations: [],
    items: [
      {
        slug: "external-post",
        entry: {
          id: "external-post",
          title: "An External Post",
          publishedDate: "2024-01-01",
          summary: "summary",
          body: "body",
          url: "https://blog.example.com/external-post",
        },
        citation: { entityType: "writing", entityId: "external-post", label: "An External Post" },
      },
    ],
  };
}

describe("Skills page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders every skill from the stubbed content layer with at least one evidence citation link", async () => {
    getSkillsListView.mockReturnValue(skillsView([strongSkill, singleSourceSkill]));
    getGapsListView.mockReturnValue({ items: [] });
    getWritingListView.mockReturnValue({ items: [], citations: [] });
    const { default: SkillsPage } = await import("./page.js");

    render(await SkillsPage());

    const tsHeading = screen.getByRole("heading", { name: "TypeScript" });
    const tsCard = tsHeading.closest("article");
    if (tsCard === null) {
      throw new Error("expected TypeScript skill card to render as an article");
    }
    expect(within(tsCard).getByRole("link", { name: /Engineer, Role One Co/ })).toHaveAttribute(
      "href",
      "/experience#role-one",
    );
    expect(within(tsCard).getByRole("link", { name: "cowork" })).toHaveAttribute(
      "href",
      "/projects/cowork",
    );

    const pyHeading = screen.getByRole("heading", { name: "Python" });
    const pyCard = pyHeading.closest("article");
    if (pyCard === null) {
      throw new Error("expected Python skill card to render as an article");
    }
    expect(within(pyCard).getAllByRole("link")).toHaveLength(1);
  });

  it("renders a visible failure state for a skill with no evidence, instead of silently rendering it as fully claimed", async () => {
    getSkillsListView.mockReturnValue(skillsView([noEvidenceSkill]));
    getGapsListView.mockReturnValue({ items: [] });
    getWritingListView.mockReturnValue({ items: [], citations: [] });
    const { default: SkillsPage } = await import("./page.js");

    render(await SkillsPage());

    const heading = screen.getByRole("heading", { name: "Unsubstantiated Skill" });
    const card = heading.closest("article");
    if (card === null) {
      throw new Error("expected the no-evidence skill card to render as an article");
    }
    expect(within(card).queryAllByRole("link")).toHaveLength(0);
    expect(within(card).getByRole("alert")).toHaveTextContent(/no evidence/i);
  });

  it("gives a skill with multiple evidence citations a visually distinct strong-evidence marker from a single-source skill", async () => {
    getSkillsListView.mockReturnValue(skillsView([strongSkill, singleSourceSkill]));
    getGapsListView.mockReturnValue({ items: [] });
    getWritingListView.mockReturnValue({ items: [], citations: [] });
    const { default: SkillsPage } = await import("./page.js");

    render(await SkillsPage());

    const tsCard = screen.getByRole("heading", { name: "TypeScript" }).closest("article");
    const pyCard = screen.getByRole("heading", { name: "Python" }).closest("article");
    if (tsCard === null || pyCard === null) {
      throw new Error("expected both skill cards to render");
    }
    const tsBadge = within(tsCard).getByText(/2 sources/i);
    const pyBadge = within(pyCard).getByText(/single source/i);
    expect(tsBadge.className).not.toBe(pyBadge.className);
  });

  it("resolves a skill's writing-entry evidence citation to that entry's external URL", async () => {
    getSkillsListView.mockReturnValue(skillsView([writingEvidenceSkill]));
    getGapsListView.mockReturnValue({ items: [] });
    getWritingListView.mockReturnValue(writingView());
    const { default: SkillsPage } = await import("./page.js");

    render(await SkillsPage());

    const link = screen.getByRole("link", { name: /An External Post/ });
    expect(link).toHaveAttribute("href", "https://blog.example.com/external-post");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(within(link).getByText(/opens in a new tab/i)).toBeDefined();
  });

  it("renders gap entries from the stub, with the honest statement text taken from the stub", async () => {
    getSkillsListView.mockReturnValue(skillsView([strongSkill]));
    getGapsListView.mockReturnValue(gapsView());
    getWritingListView.mockReturnValue({ items: [], citations: [] });
    const { default: SkillsPage } = await import("./page.js");

    render(await SkillsPage());

    expect(
      screen.getByText("No production Go experience — this exact sentence is asserted below."),
    ).toBeDefined();
  });

  it("changing the gap stub's statement changes the rendered output", async () => {
    getSkillsListView.mockReturnValue(skillsView([strongSkill]));
    const customGaps = gapsView();
    const gapItem = customGaps.items[0];
    if (gapItem === undefined) {
      throw new Error("test fixture missing gap item");
    }
    gapItem.gap.statement = "A completely different honest statement from the stub.";
    getGapsListView.mockReturnValue(customGaps);
    getWritingListView.mockReturnValue({ items: [], citations: [] });
    const { default: SkillsPage } = await import("./page.js");

    render(await SkillsPage());

    expect(
      screen.getByText("A completely different honest statement from the stub."),
    ).toBeDefined();
  });

  it("links a gap's related skill back to that skill's anchor on /skills", async () => {
    getSkillsListView.mockReturnValue(skillsView([strongSkill]));
    getGapsListView.mockReturnValue(gapsView());
    getWritingListView.mockReturnValue({ items: [], citations: [] });
    const { default: SkillsPage } = await import("./page.js");

    render(await SkillsPage());

    const heading = screen.getByRole("heading", { name: "What I don't claim" });
    const section = heading.closest("section") ?? heading.parentElement;
    if (section === null) {
      throw new Error("expected the gap section to render");
    }
    expect(within(section).getByRole("link", { name: "TypeScript" })).toHaveAttribute(
      "href",
      "/skills#typescript",
    );
  });
});

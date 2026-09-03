import { CITABLE_ENTITY_TYPES } from "@hire-me-mcp/agent/citations";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GapsListView,
  ProfileView,
  Skill,
  SkillsListView,
  StoryParentRef,
  WritingListView,
} from "../../src/lib/content";

const { getSkillsListView, getGapsListView, getWritingListView, getProfileView, listStoryParents } =
  vi.hoisted(() => ({
    getSkillsListView: vi.fn(),
    getGapsListView: vi.fn(),
    getWritingListView: vi.fn(),
    getProfileView: vi.fn(),
    listStoryParents: vi.fn((): StoryParentRef[] => []),
  }));

vi.mock("../../src/lib/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/content")>();
  return {
    ...actual,
    getSkillsListView,
    getGapsListView,
    getWritingListView,
    getProfileView,
    listStoryParents,
  };
});

function profileView(): ProfileView {
  return {
    citations: [],
    profile: {
      id: "profile",
      name: "Ada Fixture",
      headline: "Fixture Engineer",
      location: "Remote",
      availability: "open",
      summary: "A fixture summary of Ada.",
      contacts: [{ label: "GitHub", url: "https://github.com/ada-fixture" }],
    },
  };
}

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

const storyEvidenceSkill: Skill = {
  id: "leadership",
  name: "Leadership",
  aliases: [],
  category: "craft",
  proficiency: "proficient",
  evidence: [
    {
      entityType: "story",
      entityId: "mutual-informal-leadership",
      label: "Creating momentum when a mission-driven project stalled",
    },
  ],
};

describe("Skills page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    listStoryParents.mockReturnValue([]);
  });

  // #296 (P2): before this, `/skills` called `resolveCitationHref` with no
  // `storyParents` argument at all — the one consumer not taught about the
  // `story` entity type — so a story citation there would fall back to the
  // bare `/experience` page regardless of a real parent existing.
  it("resolves a skill's story evidence citation to its PRIMARY parent experience anchor, via the site's shared listStoryParents lookup", async () => {
    getSkillsListView.mockReturnValue(skillsView([storyEvidenceSkill]));
    getGapsListView.mockReturnValue({ items: [] });
    getWritingListView.mockReturnValue({ items: [], citations: [] });
    listStoryParents.mockReturnValue([
      { storyId: "mutual-informal-leadership", experienceId: "mutual" },
    ]);
    const { default: SkillsPage } = await import("./page.js");

    render(await SkillsPage());

    const link = screen.getByRole("link", {
      name: "Creating momentum when a mission-driven project stalled",
    });
    expect(link).toHaveAttribute("href", "/experience#mutual");
  });

  it("resolves every citable entity type's evidence citation to a real surface, never the bare home-page fallback", async () => {
    const evidence = CITABLE_ENTITY_TYPES.map((entityType) => ({
      entityType,
      entityId: `${entityType}-fixture`,
      label: `${entityType} fixture label`,
    }));
    const skill: Skill = {
      id: "exhaustive",
      name: "Exhaustive Skill",
      aliases: [],
      category: "craft",
      proficiency: "proficient",
      evidence,
    };
    getSkillsListView.mockReturnValue(skillsView([skill]));
    getGapsListView.mockReturnValue({ items: [] });
    getWritingListView.mockReturnValue({ items: [], citations: [] });
    listStoryParents.mockReturnValue([
      { storyId: "story-fixture", experienceId: "some-experience" },
    ]);
    const { default: SkillsPage } = await import("./page.js");

    render(await SkillsPage());

    const heading = screen.getByRole("heading", { name: "Exhaustive Skill" });
    const card = heading.closest("article");
    if (card === null) {
      throw new Error("expected the exhaustive skill card to render as an article");
    }
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(evidence.length);
    for (const [index, link] of links.entries()) {
      const entityType = evidence[index]?.entityType;
      expect(link, `"${entityType}" citation falls back to the home page`).not.toHaveAttribute(
        "href",
        "/",
      );
    }
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

describe("Skills page metadata", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a non-empty title and a description built from the stubbed content layer", async () => {
    getProfileView.mockReturnValue(profileView());
    getSkillsListView.mockReturnValue(skillsView([strongSkill, singleSourceSkill]));
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toContain("TypeScript");
    expect(metadata.description).toContain("Python");
  });

  it("changing the stub's data changes the description", async () => {
    getProfileView.mockReturnValue(profileView());
    getSkillsListView.mockReturnValue(skillsView([{ ...strongSkill, name: "Renamed Skill" }]));
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.description).toContain("Renamed Skill");
  });

  it("sets a canonical URL for this route", async () => {
    getProfileView.mockReturnValue(profileView());
    getSkillsListView.mockReturnValue(skillsView([strongSkill]));
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.alternates?.canonical).toBe("/skills");
  });

  it("sets Open Graph and Twitter card fields matching this route's own title/description, not the site-wide default (#38)", async () => {
    getProfileView.mockReturnValue(profileView());
    getSkillsListView.mockReturnValue(skillsView([strongSkill]));
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.openGraph?.title).toBe(metadata.title);
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.openGraph?.url).toContain("/skills");
    expect(metadata.openGraph).toMatchObject({ type: "website" });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: metadata.title,
      description: metadata.description,
    });
  });
});

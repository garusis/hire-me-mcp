import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExperienceListItemView,
  ProfileView,
  ProjectListItemView,
  Skill,
} from "../src/lib/content";
import Home from "./page.js";

/**
 * Stubs the entire content-layer barrel `Home` imports from. Every value
 * asserted below flows through these stubs — proving the page has no
 * hardcoded career content (the point of #28's ACs) — rather than against
 * the real `packages/career-data` content. `vi.hoisted` is required here
 * because `vi.mock` factories are hoisted above ordinary `const`
 * declarations, so the mock functions themselves must be created inside a
 * hoisted block to be safely referenced from the factory below.
 */
const { getProfileView, getExperienceListView, getProjectsListView, getSkillsListView } =
  vi.hoisted(() => ({
    getProfileView: vi.fn<() => ProfileView>(),
    getExperienceListView: vi.fn<() => { items: ExperienceListItemView[] }>(),
    getProjectsListView: vi.fn<() => { items: ProjectListItemView[] }>(),
    getSkillsListView: vi.fn<() => { items: Skill[] }>(),
  }));

vi.mock("../src/lib/content", () => ({
  getProfileView,
  getExperienceListView,
  getProjectsListView,
  getSkillsListView,
}));

function buildProfile(overrides: Partial<ProfileView["profile"]> = {}): ProfileView {
  return {
    profile: {
      id: "stub-profile",
      name: "Ada Stubwell",
      headline: "Staff Engineer, Distributed Systems",
      location: "Remote",
      availability: "open",
      summary:
        "Ada builds resilient distributed systems. She has shipped payments infrastructure at global scale and mentors engineers on reliability practice.",
      contacts: [
        { label: "Email", url: "mailto:ada@example.com" },
        { label: "GitHub", url: "https://github.com/ada-stubwell" },
      ],
      ...overrides,
    },
    citations: [],
  };
}

function buildExperienceItem(
  id: string,
  overrides: Partial<ExperienceListItemView["entry"]> = {},
): ExperienceListItemView {
  return {
    slug: id,
    entry: {
      id,
      company: `${id}-co`,
      role: `${id}-role`,
      startDate: "2020-01",
      endDate: "2021-01",
      summary: `${id} summary text`,
      highlights: [`${id} highlight`],
      tech: ["TypeScript"],
      ...overrides,
    },
    citation: { entityType: "experience", entityId: id, label: `${id} citation` },
  };
}

function buildProjectItem(
  id: string,
  overrides: Partial<ProjectListItemView["project"]> = {},
): ProjectListItemView {
  return {
    slug: id,
    project: {
      id,
      name: `${id}-name`,
      summary: `${id} project summary`,
      role: "Lead engineer",
      tech: ["TypeScript"],
      links: [],
      body: `${id} body`,
      ...overrides,
    },
    citation: { entityType: "project", entityId: id, label: `${id} citation` },
  };
}

function buildSkill(id: string, proficiency: Skill["proficiency"] = "expert"): Skill {
  return {
    id,
    name: `${id}-name`,
    aliases: [],
    category: "language",
    proficiency,
    evidence: [{ entityType: "experience", entityId: "some-role", label: "some-role" }],
  };
}

function stubBaseContent(): void {
  getProfileView.mockReturnValue(buildProfile());
  getExperienceListView.mockReturnValue({
    items: [
      buildExperienceItem("recent-role"),
      buildExperienceItem("older-role"),
      buildExperienceItem("oldest-role"),
    ],
  });
  getProjectsListView.mockReturnValue({
    items: [
      buildProjectItem("first-project"),
      buildProjectItem("second-project"),
      buildProjectItem("third-project"),
    ],
  });
  getSkillsListView.mockReturnValue({
    items: [
      buildSkill("skill-one", "expert"),
      buildSkill("skill-two", "expert"),
      buildSkill("skill-three", "proficient"),
    ],
  });
}

describe("Home", () => {
  beforeEach(() => {
    stubBaseContent();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("hero", () => {
    it("renders the profile name from the content layer as the single page h1", () => {
      render(<Home />);

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).toBe("Ada Stubwell");
    });

    it("renders the profile headline from the content layer", () => {
      render(<Home />);

      expect(screen.getByText("Staff Engineer, Distributed Systems")).toBeDefined();
    });

    it("renders a one-line positioning statement derived from the profile summary", () => {
      render(<Home />);

      const heroRegion = screen.getByRole("region", { name: "Ada Stubwell" });
      expect(
        within(heroRegion).getByText(/Ada builds resilient distributed systems\./),
      ).toBeDefined();
    });

    it("renders a call to action built from the profile's first contact", () => {
      render(<Home />);

      const cta = screen.getByRole("link", { name: /email/i });
      expect(cta.getAttribute("href")).toBe("mailto:ada@example.com");
    });

    it("changes the rendered hero when the stubbed profile changes", () => {
      getProfileView.mockReturnValue(
        buildProfile({ name: "Different Name", headline: "A totally different headline" }),
      );

      render(<Home />);

      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Different Name");
      expect(screen.getByText("A totally different headline")).toBeDefined();
      expect(screen.queryByText("Ada Stubwell")).toBeNull();
    });
  });

  describe("bio", () => {
    it("renders the full profile summary from the content layer", () => {
      render(<Home />);

      const bioRegion = screen.getByRole("region", { name: "About" });
      expect(
        within(bioRegion).getByText(/mentors engineers on reliability practice\./),
      ).toBeDefined();
    });

    it("changes the rendered bio when the stubbed summary changes", () => {
      getProfileView.mockReturnValue(buildProfile({ summary: "A brand new summary sentence." }));

      render(<Home />);

      const bioRegion = screen.getByRole("region", { name: "About" });
      expect(within(bioRegion).getByText("A brand new summary sentence.")).toBeDefined();
    });
  });

  describe("highlights — experience", () => {
    it("renders experience highlights in the order the content layer returns them", () => {
      render(<Home />);

      const summaries = screen.getAllByText(/summary text$/).map((node) => node.textContent);
      expect(summaries).toEqual([
        "recent-role summary text",
        "older-role summary text",
        "oldest-role summary text",
      ]);
    });

    it("follows the content layer's ordering, not a hardcoded id list — reordering the stub reorders the output", () => {
      getExperienceListView.mockReturnValue({
        items: [
          buildExperienceItem("oldest-role"),
          buildExperienceItem("recent-role"),
          buildExperienceItem("older-role"),
        ],
      });

      render(<Home />);

      const summaries = screen.getAllByText(/summary text$/).map((node) => node.textContent);
      expect(summaries).toEqual([
        "oldest-role summary text",
        "recent-role summary text",
        "older-role summary text",
      ]);
    });

    it("surfaces a brand-new entry placed first in the stub, proving selection isn't a literal id list", () => {
      getExperienceListView.mockReturnValue({
        items: [
          buildExperienceItem("never-seen-before-role"),
          buildExperienceItem("recent-role"),
          buildExperienceItem("older-role"),
        ],
      });

      render(<Home />);

      const summaries = screen.getAllByText(/summary text$/).map((node) => node.textContent);
      expect(summaries[0]).toBe("never-seen-before-role summary text");
    });
  });

  describe("highlights — projects", () => {
    it("renders project highlights in the order the content layer returns them", () => {
      render(<Home />);

      const names = screen
        .getAllByText(/-name$/)
        .map((node) => node.textContent)
        .filter((text) => text?.includes("-project-name"));
      expect(names).toEqual(["first-project-name", "second-project-name", "third-project-name"]);
    });

    it("follows the content layer's ordering, not a hardcoded id list — reordering the stub reorders the output", () => {
      getProjectsListView.mockReturnValue({
        items: [
          buildProjectItem("third-project"),
          buildProjectItem("first-project"),
          buildProjectItem("second-project"),
        ],
      });

      render(<Home />);

      const names = screen
        .getAllByText(/-name$/)
        .map((node) => node.textContent)
        .filter((text) => text?.includes("-project-name"));
      expect(names).toEqual(["third-project-name", "first-project-name", "second-project-name"]);
    });
  });

  describe("highlights — skills", () => {
    it("renders skill highlights in the order the content layer returns them", () => {
      render(<Home />);

      const skillNames = screen
        .getAllByText(/-name$/)
        .map((node) => node.textContent)
        .filter((text) => text?.startsWith("skill-"));
      expect(skillNames).toEqual(["skill-one-name", "skill-two-name", "skill-three-name"]);
    });

    it("follows the content layer's ordering, not a hardcoded id list — reordering the stub reorders the output", () => {
      getSkillsListView.mockReturnValue({
        items: [
          buildSkill("skill-three", "proficient"),
          buildSkill("skill-one", "expert"),
          buildSkill("skill-two", "expert"),
        ],
      });

      render(<Home />);

      const skillNames = screen
        .getAllByText(/-name$/)
        .map((node) => node.textContent)
        .filter((text) => text?.startsWith("skill-"));
      expect(skillNames).toEqual(["skill-three-name", "skill-one-name", "skill-two-name"]);
    });
  });

  describe("MCP teaser", () => {
    it("renders a teaser heading and description", () => {
      render(<Home />);

      expect(screen.getByRole("heading", { name: /add me to your ai/i })).toBeDefined();
    });

    it("links to the /mcp section", () => {
      render(<Home />);

      const links = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href") === "/mcp");
      expect(links.length).toBeGreaterThan(0);
    });
  });

  describe("connect panel (#45)", () => {
    it("renders a client tablist with a copy-ready snippet for the selected client", () => {
      render(<Home />);

      const tablist = screen.getByRole("tablist");
      expect(within(tablist).getAllByRole("tab").length).toBeGreaterThan(0);
    });

    it("renders an endpoint URL copy button", () => {
      render(<Home />);

      expect(screen.getByRole("button", { name: /copy.*endpoint|copy.*url/i })).toBeInTheDocument();
    });

    it("shows at least 3 example prompts sourced from the connection metadata module", () => {
      render(<Home />);

      const heading = screen.getByRole("heading", { name: /try asking/i });
      const promptsList = heading.nextElementSibling;
      if (promptsList === null) {
        throw new Error("expected an example-prompts list after the 'Try asking' heading");
      }
      expect(
        within(promptsList as HTMLElement).getAllByRole("listitem").length,
      ).toBeGreaterThanOrEqual(3);
    });

    it("links to /mcp for the full setup, tools, and demo", () => {
      render(<Home />);

      expect(screen.getByRole("link", { name: /full setup/i })).toHaveAttribute("href", "/mcp");
    });
  });

  describe("heading structure", () => {
    it("renders exactly one h1", () => {
      render(<Home />);

      const h1s = screen.getAllByRole("heading", { level: 1 });
      expect(h1s).toHaveLength(1);
    });

    it("never skips a heading level going deeper (no h1 -> h3 jump)", () => {
      render(<Home />);

      const headings = screen.getAllByRole("heading");
      const levels = headings.map((heading) => Number(heading.tagName.slice(1)));

      let maxSeen = 0;
      for (const level of levels) {
        if (level > maxSeen) {
          expect(level - maxSeen).toBeLessThanOrEqual(1);
        }
        maxSeen = Math.max(maxSeen, level);
      }
    });

    it("starts the document outline with the h1", () => {
      render(<Home />);

      const headings = screen.getAllByRole("heading");
      expect(Number(headings[0]?.tagName.slice(1))).toBe(1);
    });
  });

  describe("images", () => {
    it("renders no images, since the stubbed/real content layer exposes no imagery yet", () => {
      render(<Home />);

      expect(screen.queryAllByRole("img")).toEqual([]);
    });
  });

  describe("server component boundary", () => {
    it('does not declare "use client" in the page module', () => {
      const filePath = join(dirname(fileURLToPath(import.meta.url)), "page.tsx");
      const source = readFileSync(filePath, "utf8");

      expect(source.includes('"use client"')).toBe(false);
    });
  });

  describe("structured data", () => {
    it("renders a Person JSON-LD script built from the stubbed profile", () => {
      const { container } = render(<Home />);

      const script = container.querySelector('script[type="application/ld+json"]');
      expect(script).not.toBeNull();
      const jsonLd = JSON.parse(script?.textContent ?? "{}");
      expect(jsonLd["@type"]).toBe("Person");
      expect(jsonLd.name).toBe("Ada Stubwell");
      expect(jsonLd.jobTitle).toBe("Staff Engineer, Distributed Systems");
    });

    it("changes the JSON-LD when the stubbed profile changes", () => {
      getProfileView.mockReturnValue(buildProfile({ name: "Different Name" }));

      const { container } = render(<Home />);

      const script = container.querySelector('script[type="application/ld+json"]');
      const jsonLd = JSON.parse(script?.textContent ?? "{}");
      expect(jsonLd.name).toBe("Different Name");
    });

    it("renders exactly one JSON-LD script, with knowsAbout listing every authored skill (not just the highlighted subset)", () => {
      const { container } = render(<Home />);

      const scripts = container.querySelectorAll('script[type="application/ld+json"]');
      expect(scripts).toHaveLength(1);
      const jsonLd = JSON.parse(scripts[0]?.textContent ?? "{}");
      expect(jsonLd.knowsAbout).toEqual(["skill-one-name", "skill-two-name", "skill-three-name"]);
    });
  });
});

describe("Home page metadata", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sets a canonical URL for the home route", async () => {
    stubBaseContent();
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.alternates?.canonical).toBe("/");
  });
});

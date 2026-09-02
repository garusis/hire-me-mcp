import { describe, expect, it, vi } from "vitest";
import type {
  CvView,
  ExperienceListView,
  GapsListView,
  ProfileView,
  ProjectListView,
  SkillsListView,
} from "../../src/lib/content";
import { EXPECTED_TOOL_NAMES } from "../mcp/tool-names";

const {
  getProfileView,
  getExperienceListView,
  getProjectsListView,
  getSkillsListView,
  getGapsListView,
  getCvView,
  getWritingListView,
} = vi.hoisted(() => ({
  getProfileView: vi.fn(),
  getExperienceListView: vi.fn(),
  getProjectsListView: vi.fn(),
  getSkillsListView: vi.fn(),
  getGapsListView: vi.fn(),
  getCvView: vi.fn(),
  getWritingListView: vi.fn(),
}));

vi.mock("../../src/lib/content", () => ({
  getProfileView,
  getExperienceListView,
  getProjectsListView,
  getSkillsListView,
  getGapsListView,
  getCvView,
  getWritingListView,
}));

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

function experienceView(): ExperienceListView {
  return {
    citations: [],
    items: [
      {
        slug: "fixture-role",
        entry: {
          id: "fixture-role",
          company: "Fixture Co",
          role: "Fixture Engineer",
          startDate: "2022-01",
          summary: "Did fixture things at Fixture Co.",
          highlights: ["Shipped a fixture."],
          tech: ["TypeScript"],
        },
        citation: { entityType: "experience", entityId: "fixture-role", label: "Fixture Co" },
      },
    ],
  };
}

function projectsView(): ProjectListView {
  return {
    citations: [],
    items: [
      {
        slug: "fixture-project",
        project: {
          id: "fixture-project",
          name: "Fixture Project",
          summary: "A fixture project summary.",
          role: "Author",
          tech: ["TypeScript"],
          links: [],
          body: "Body.",
        },
        citation: { entityType: "project", entityId: "fixture-project", label: "Fixture Project" },
      },
    ],
  };
}

function skillsView(): SkillsListView {
  return {
    items: [
      {
        id: "fixture-skill",
        name: "Fixture Skill",
        aliases: [],
        category: "Languages",
        proficiency: "expert",
        evidence: [
          { entityType: "project", entityId: "fixture-project", label: "Fixture Project" },
        ],
      },
    ],
  };
}

function gapsView(): GapsListView {
  return {
    items: [
      {
        gap: {
          id: "fixture-gap",
          name: "Fixture Gap",
          aliases: [],
          statement: "He has not worked with Fixture Gap professionally.",
          relatedSkills: [],
        },
        citation: { entityType: "gap", entityId: "fixture-gap", label: "Fixture Gap" },
        relatedSkills: [],
      },
    ],
  };
}

function cvView(): CvView {
  return {
    profile: profileView().profile,
    experience: [],
    projects: [],
    skillsByProficiency: [],
    education: [],
    filename: "fixture-cv.pdf",
  };
}

function mockContentLayer(): void {
  getProfileView.mockReturnValue(profileView());
  getExperienceListView.mockReturnValue(experienceView());
  getProjectsListView.mockReturnValue(projectsView());
  getSkillsListView.mockReturnValue(skillsView());
  getGapsListView.mockReturnValue(gapsView());
  getCvView.mockReturnValue(cvView());
  getWritingListView.mockReturnValue({ citations: [], items: [] });
}

/** Every markdown link target `[label](url)` found in `text`. */
function extractLinkUrls(text: string): string[] {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1] as string);
}

describe("renderLlmsTxt", () => {
  it("starts with a single H1 naming the project", async () => {
    mockContentLayer();
    const { renderLlmsTxt } = await import("./generate-llms.js");

    const text = renderLlmsTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    const lines = text.split("\n");
    expect(lines[0]).toBe("# hire-me-mcp");
    expect(lines.filter((line) => line.startsWith("# ")).length).toBe(1);
  });

  it("follows the H1 with a blockquote one-liner", async () => {
    mockContentLayer();
    const { renderLlmsTxt } = await import("./generate-llms.js");

    const text = renderLlmsTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    const blockquoteLine = text.split("\n").find((line) => line.startsWith(">"));
    expect(blockquoteLine).toBeDefined();
    expect(blockquoteLine?.startsWith("> ")).toBe(true);
  });

  it("renders only `##` link sections whose items are `[name](url): description`", async () => {
    mockContentLayer();
    const { renderLlmsTxt } = await import("./generate-llms.js");

    const text = renderLlmsTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    const headings = text.split("\n").filter((line) => line.startsWith("#"));
    expect(headings.every((line) => line.startsWith("# ") || line.startsWith("## "))).toBe(true);
    expect(headings.some((line) => line.startsWith("## "))).toBe(true);

    const listItems = text.split("\n").filter((line) => line.startsWith("- "));
    expect(listItems.length).toBeGreaterThan(0);
    for (const item of listItems) {
      expect(item).toMatch(/^- \[[^\]]+\]\([^)]+\): .+$/);
    }
  });

  it("includes the given MCP endpoint URL and a pointer to llms-full.txt", async () => {
    mockContentLayer();
    const { renderLlmsTxt } = await import("./generate-llms.js");

    const text = renderLlmsTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    expect(text).toContain("https://stub-deploy.example.com/api/mcp");
    expect(text).toContain("https://stub-deploy.example.com/llms-full.txt");
  });

  it("emits only absolute URLs", async () => {
    mockContentLayer();
    const { renderLlmsTxt } = await import("./generate-llms.js");

    const text = renderLlmsTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    const urls = extractLinkUrls(text);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^https?:\/\//);
    }
  });

  it("stays within the documented size budget", async () => {
    mockContentLayer();
    const { renderLlmsTxt, LLMS_TXT_SIZE_BUDGET_BYTES } = await import("./generate-llms.js");

    const text = renderLlmsTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    expect(Buffer.byteLength(text, "utf-8")).toBeLessThanOrEqual(LLMS_TXT_SIZE_BUDGET_BYTES);
  });

  it("changes its content when given a different site URL", async () => {
    mockContentLayer();
    const { renderLlmsTxt } = await import("./generate-llms.js");

    const stub = renderLlmsTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });
    const preview = renderLlmsTxt({
      siteUrl: "https://preview-abc.example.com",
      endpointUrl: "https://preview-abc.example.com/api/mcp",
    });

    expect(stub).not.toBe(preview);
    expect(preview).toContain("https://preview-abc.example.com/experience");
  });

  it("links to the downloadable CV at its deterministic-filename URL, absolute against the given site URL (#35)", async () => {
    mockContentLayer();
    const { renderLlmsTxt } = await import("./generate-llms.js");

    const text = renderLlmsTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    expect(text).toContain("https://stub-deploy.example.com/cv/fixture-cv.pdf");
  });
});

describe("renderLlmsFullTxt", () => {
  it("contains the given MCP endpoint URL", async () => {
    mockContentLayer();
    const { renderLlmsFullTxt } = await import("./generate-llms.js");

    const text = renderLlmsFullTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    expect(text).toContain("https://stub-deploy.example.com/api/mcp");
  });

  it("names every tool in the live MCP tool registry", async () => {
    mockContentLayer();
    const { renderLlmsFullTxt } = await import("./generate-llms.js");

    const text = renderLlmsFullTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    for (const toolName of EXPECTED_TOOL_NAMES) {
      expect(text).toContain(toolName);
    }
  });

  it("renders search-career's real parameter names (#61) rather than falling back to 'none'", async () => {
    mockContentLayer();
    const { renderLlmsFullTxt } = await import("./generate-llms.js");

    const text = renderLlmsFullTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    // Bound the slice at the next tool heading — sections after search-career
    // (the no-parameter list tools, #211-#215) legitimately say "Parameters: none".
    const sectionStart = text.indexOf("### search-career");
    const nextHeading = text.indexOf("\n### ", sectionStart + 1);
    const searchCareerSection = text.slice(
      sectionStart,
      nextHeading === -1 ? undefined : nextHeading,
    );
    expect(searchCareerSection).toContain("Parameters: query");
    expect(searchCareerSection).toContain("topK");
    expect(searchCareerSection).not.toContain("Parameters: none");
  });

  it("includes at least 3 example prompts", async () => {
    mockContentLayer();
    const { renderLlmsFullTxt } = await import("./generate-llms.js");

    const text = renderLlmsFullTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    const promptLines = text
      .split("\n")
      .filter((line) => line.startsWith("- ") && text.includes(line))
      .join("\n");
    // Every tool's example prompt (from the live catalogue) must appear verbatim.
    expect(promptLines.length).toBeGreaterThan(0);
    expect(text).toContain("Ping the hire-me-mcp server");
    expect(text).toContain("Who is Marcos Alvarez");
    expect(text).toContain("Show me projects where Marcos used TypeScript");
  });

  it("renders the career summary from the content layer, including gap honesty", async () => {
    mockContentLayer();
    const { renderLlmsFullTxt } = await import("./generate-llms.js");

    const text = renderLlmsFullTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    expect(text).toContain("Ada Fixture");
    expect(text).toContain("Fixture Engineer");
    expect(text).toContain("Fixture Co");
    expect(text).toContain("Fixture Project");
    expect(text).toContain("Fixture Skill");
    expect(text).toContain("He has not worked with Fixture Gap professionally.");
  });

  it("labels a project's lifecycle stage in llms-full.txt when the record declares one (#300)", async () => {
    mockContentLayer();
    const view = projectsView();
    const first = view.items[0];
    if (first) {
      first.project.stage = "proof-of-concept";
    }
    getProjectsListView.mockReturnValue(view);
    const { renderLlmsFullTxt } = await import("./generate-llms.js");

    const text = renderLlmsFullTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    expect(text).toContain(
      "[Fixture Project](https://stub-deploy.example.com/projects/fixture-project) " +
        "[stage: proof-of-concept — not deployed to production]: A fixture project summary.",
    );
  });

  it("emits only absolute URLs", async () => {
    mockContentLayer();
    const { renderLlmsFullTxt } = await import("./generate-llms.js");

    const text = renderLlmsFullTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    const urls = extractLinkUrls(text);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^https?:\/\//);
    }
  });

  it("changes its content when the content layer's data changes", async () => {
    mockContentLayer();
    const { renderLlmsFullTxt } = await import("./generate-llms.js");
    const baseline = renderLlmsFullTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    const changedProfile = profileView();
    changedProfile.profile.name = "Changed Fixture Name";
    getProfileView.mockReturnValue(changedProfile);

    const changed = renderLlmsFullTxt({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });

    expect(changed).not.toBe(baseline);
    expect(changed).toContain("Changed Fixture Name");
  });
});

describe("renderLlmsTxt Writing visibility (#233)", () => {
  it("omits the Writing link while nothing is published, and includes it once something is", async () => {
    mockContentLayer();
    const { renderLlmsTxt } = await import("./generate-llms.js");
    const input = {
      siteUrl: "https://site.example.com",
      endpointUrl: "https://site.example.com/api/mcp",
    };

    expect(renderLlmsTxt(input)).not.toContain("/writing");

    getWritingListView.mockReturnValue({
      citations: [],
      items: [
        {
          slug: "fixture-note",
          entry: {
            id: "fixture-note",
            title: "Fixture Note",
            publishedDate: "2024-01-15",
            summary: "s",
            body: "b",
          },
          citation: { entityType: "writing", entityId: "fixture-note", label: "Fixture Note" },
        },
      ],
    });
    expect(renderLlmsTxt(input)).toContain("https://site.example.com/writing");
  });
});

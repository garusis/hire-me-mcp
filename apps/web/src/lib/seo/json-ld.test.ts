import { describe, expect, it } from "vitest";
import type { ProfileView, ProjectListItemView, WritingListItemView } from "../content";
import { buildArticleJsonLd, buildPersonJsonLd, buildProjectJsonLd } from "./json-ld";

const SITE_URL = "https://stub-deploy.example.com";

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
      contacts: [
        { label: "GitHub", url: "https://github.com/ada-fixture" },
        { label: "Email", url: "https://mailto.example.com/ada" },
      ],
    },
  };
}

function projectItem(): ProjectListItemView {
  return {
    slug: "alpha-project",
    project: {
      id: "alpha-project",
      name: "Alpha Project",
      summary: "The alpha summary.",
      role: "Owner",
      tech: ["react", "typescript"],
      links: [{ label: "Source", url: "https://github.com/ada-fixture/alpha" }],
      body: "body",
    },
    citation: { entityType: "project", entityId: "alpha-project", label: "Alpha Project" },
  };
}

function writingItem(): WritingListItemView {
  return {
    slug: "fixture-writing-entry",
    entry: {
      id: "fixture-writing-entry",
      title: "Fixture Writing Entry",
      publishedDate: "2024-01-15",
      summary: "A fixture summary.",
      body: "Fixture body prose.",
    },
    citation: {
      entityType: "writing",
      entityId: "fixture-writing-entry",
      label: "Fixture Writing Entry",
    },
  };
}

describe("buildPersonJsonLd", () => {
  it("builds a schema.org Person from the profile view, with every value sourced from it", () => {
    const jsonLd = buildPersonJsonLd(profileView(), SITE_URL);

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Person");
    expect(jsonLd.name).toBe("Ada Fixture");
    expect(jsonLd.jobTitle).toBe("Fixture Engineer");
    expect(jsonLd.description).toBe("A fixture summary of Ada.");
    expect(jsonLd.url).toBe(SITE_URL);
    expect(jsonLd.sameAs).toEqual([
      "https://github.com/ada-fixture",
      "https://mailto.example.com/ada",
    ]);
  });

  it("changing the stub profile changes the emitted values", () => {
    const view = profileView();
    view.profile.name = "Changed Name";
    const jsonLd = buildPersonJsonLd(view, SITE_URL);
    expect(jsonLd.name).toBe("Changed Name");
  });

  it("parses as valid JSON via JSON.stringify/JSON.parse round trip", () => {
    const jsonLd = buildPersonJsonLd(profileView(), SITE_URL);
    expect(() => JSON.parse(JSON.stringify(jsonLd))).not.toThrow();
  });
});

describe("buildProjectJsonLd", () => {
  it("builds a schema.org SoftwareSourceCode entry from the project view", () => {
    const jsonLd = buildProjectJsonLd(projectItem(), "Ada Fixture", SITE_URL);

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("SoftwareSourceCode");
    expect(jsonLd.name).toBe("Alpha Project");
    expect(jsonLd.description).toBe("The alpha summary.");
    expect(jsonLd.url).toBe(`${SITE_URL}/projects/alpha-project`);
    expect(jsonLd.programmingLanguage).toEqual(["react", "typescript"]);
    expect(jsonLd.codeRepository).toBe("https://github.com/ada-fixture/alpha");
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Ada Fixture" });
  });

  it("changing the stub project changes the emitted values", () => {
    const item = projectItem();
    item.project.name = "Renamed Project";
    const jsonLd = buildProjectJsonLd(item, "Ada Fixture", SITE_URL);
    expect(jsonLd.name).toBe("Renamed Project");
  });
});

describe("buildArticleJsonLd", () => {
  it("builds a schema.org Article entry from the writing view", () => {
    const jsonLd = buildArticleJsonLd(writingItem(), "Ada Fixture", SITE_URL);

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Article");
    expect(jsonLd.headline).toBe("Fixture Writing Entry");
    expect(jsonLd.datePublished).toBe("2024-01-15");
    expect(jsonLd.description).toBe("A fixture summary.");
    expect(jsonLd.url).toBe(`${SITE_URL}/writing/fixture-writing-entry`);
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Ada Fixture" });
  });

  it("changing the stub writing entry changes the emitted values", () => {
    const item = writingItem();
    item.entry.title = "Renamed Article";
    const jsonLd = buildArticleJsonLd(item, "Ada Fixture", SITE_URL);
    expect(jsonLd.headline).toBe("Renamed Article");
  });
});

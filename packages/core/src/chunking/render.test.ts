import type {
  EducationEntry,
  ExperienceEntry,
  Gap,
  Profile,
  Project,
  Recommendation,
  Skill,
  WritingEntry,
} from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import {
  renderEducation,
  renderExperience,
  renderGap,
  renderProfile,
  renderProject,
  renderRecommendation,
  renderSkill,
  renderWriting,
} from "./render.js";

describe("renderProfile", () => {
  const profile: Profile = {
    id: "jane-doe",
    name: "Jane Doe",
    headline: "Senior Engineer",
    location: "Remote",
    availability: "open",
    summary: "Builds things.",
    contacts: [{ label: "Email", url: "mailto:jane@example.com" }],
  };

  it("renders header, body, label, and metadata", () => {
    const rendered = renderProfile(profile);
    expect(rendered.header).toContain("Jane Doe — Senior Engineer");
    expect(rendered.header).toContain("Remote");
    expect(rendered.body).toContain("Builds things.");
    expect(rendered.body).toContain("Email: mailto:jane@example.com");
    expect(rendered.label).toBe("Jane Doe");
    expect(rendered.metadata).toEqual({});
  });
});

describe("renderExperience", () => {
  const entry: ExperienceEntry = {
    id: "acme-role",
    company: "Acme",
    role: "Engineer",
    startDate: "2020-01",
    endDate: "2021-01",
    summary: "Did engineering work.",
    highlights: ["Shipped feature X"],
    tech: ["typescript"],
  };

  it("renders a self-contained header with role/company/dates", () => {
    const rendered = renderExperience(entry);
    expect(rendered.header).toContain("Engineer, Acme");
    expect(rendered.header).toContain("2020-01 – 2021-01");
    expect(rendered.body).toContain("Did engineering work.");
    expect(rendered.body).toContain("- Shipped feature X");
    expect(rendered.body).toContain("Tech: typescript");
    expect(rendered.label).toBe("Engineer, Acme");
    expect(rendered.metadata).toEqual({
      company: "Acme",
      tags: ["typescript"],
      dateFrom: "2020-01",
      dateTo: "2021-01",
    });
  });

  it("renders an open-ended (current) role as 'Present'", () => {
    const current: ExperienceEntry = { ...entry, endDate: undefined };
    const rendered = renderExperience(current);
    expect(rendered.header).toContain("2020-01 – Present");
    expect(rendered.metadata.dateTo).toBeUndefined();
  });
});

describe("renderProject", () => {
  const project: Project = {
    id: "cool-project",
    name: "Cool Project",
    summary: "A cool project.",
    role: "Creator",
    tech: ["python"],
    links: [{ label: "GitHub", url: "https://github.com/example/cool" }],
    body: "## What it is\n\nA long write-up.",
  };

  it("renders header + body and a url from the first link", () => {
    const rendered = renderProject(project);
    expect(rendered.header).toContain("Cool Project — Creator");
    expect(rendered.header).toContain("Tech: python");
    expect(rendered.body).toBe(project.body);
    expect(rendered.label).toBe("Cool Project");
    expect(rendered.url).toBe("https://github.com/example/cool");
    expect(rendered.metadata).toEqual({ tags: ["python"] });
  });

  it("leaves url undefined when the project has no links", () => {
    const noLinks: Project = { ...project, links: [] };
    expect(renderProject(noLinks).url).toBeUndefined();
  });

  it("renders an explicit lifecycle stage line when the project declares one (#300)", () => {
    const poc: Project = { ...project, stage: "proof-of-concept" };
    expect(renderProject(poc).header).toContain(
      "Stage: proof-of-concept (not deployed to production)",
    );
    expect(renderProject({ ...project, stage: "production" }).header).toContain(
      "Stage: production",
    );
  });

  it("renders no stage line when the project declares none", () => {
    expect(renderProject(project).header).not.toContain("Stage:");
  });
});

describe("renderSkill", () => {
  const skill: Skill = {
    id: "typescript",
    name: "TypeScript",
    aliases: ["ts"],
    category: "language",
    proficiency: "expert",
    evidence: [{ entityType: "experience", entityId: "acme-role", label: "Engineer, Acme" }],
  };

  it("renders header/body with category, proficiency, aliases, and evidence", () => {
    const rendered = renderSkill(skill);
    expect(rendered.header).toContain("TypeScript (language, expert)");
    expect(rendered.header).toContain("Also known as: ts");
    expect(rendered.body).toContain("- Engineer, Acme");
    expect(rendered.label).toBe("TypeScript");
    expect(rendered.metadata).toEqual({ tags: ["language", "expert"] });
  });
});

describe("renderGap", () => {
  const gap: Gap = {
    id: "rust",
    name: "Rust",
    aliases: ["rustlang"],
    statement: "No production Rust experience.",
    relatedSkills: ["typescript"],
  };

  it("renders header/body naming what is not claimed", () => {
    const rendered = renderGap(gap);
    expect(rendered.header).toBe("Rust — not claimed");
    expect(rendered.body).toContain("No production Rust experience.");
    expect(rendered.body).toContain("Related skills: typescript");
    expect(rendered.label).toBe("Rust");
    expect(rendered.metadata).toEqual({ tags: ["typescript"] });
  });
});

describe("renderEducation", () => {
  const entry: EducationEntry = {
    id: "some-degree",
    institution: "Some University",
    credential: "B.S. Engineering",
    startDate: "2015-01",
    endDate: "2019-01",
  };

  it("renders header with credential/institution/dates", () => {
    const rendered = renderEducation(entry);
    expect(rendered.header).toContain("B.S. Engineering, Some University");
    expect(rendered.header).toContain("2015-01 – 2019-01");
    expect(rendered.label).toBe("B.S. Engineering, Some University");
    expect(rendered.metadata).toEqual({
      company: "Some University",
      dateFrom: "2015-01",
      dateTo: "2019-01",
    });
  });

  it("omits the date line entirely when neither date is present", () => {
    const noDates: EducationEntry = { ...entry, startDate: undefined, endDate: undefined };
    const rendered = renderEducation(noDates);
    expect(rendered.header).toBe("B.S. Engineering, Some University");
  });
});

describe("renderWriting", () => {
  const entry: WritingEntry = {
    id: "some-article",
    title: "Some Article",
    publishedDate: "2023-05-01",
    summary: "A short summary.",
    url: "https://example.com/article",
    body: "The full article body.",
  };

  it("renders header + body and passes through the canonical url", () => {
    const rendered = renderWriting(entry);
    expect(rendered.header).toContain("Some Article");
    expect(rendered.header).toContain("Published: 2023-05-01");
    expect(rendered.body).toBe(entry.body);
    expect(rendered.label).toBe("Some Article");
    expect(rendered.url).toBe("https://example.com/article");
    expect(rendered.metadata).toEqual({ dateFrom: "2023-05-01" });
  });
});

describe("renderRecommendation", () => {
  const entry: Recommendation = {
    id: "recommendation-john-smith-2024",
    recommenderName: "John Smith",
    recommenderTitle: "VP of Engineering at Example Corp",
    relationship: "John was Jane's direct manager",
    date: "2024-06-15",
    text: "Jane is a fantastic engineer.",
    recommenderProfileUrl: "https://www.linkedin.com/in/john-smith/",
    sourceUrl: "https://www.linkedin.com/in/jane-doe/details/recommendations/",
  };

  it("renders recommender, relationship and date in the header, verbatim text plus the source link in the body", () => {
    const rendered = renderRecommendation(entry);
    expect(rendered.header).toContain(
      "Recommendation from John Smith — VP of Engineering at Example Corp",
    );
    expect(rendered.header).toContain("Relationship: John was Jane's direct manager");
    expect(rendered.header).toContain("Date: 2024-06-15");
    expect(rendered.body).toContain("Jane is a fantastic engineer.");
    expect(rendered.body).toContain(
      "Verify on LinkedIn: https://www.linkedin.com/in/jane-doe/details/recommendations/",
    );
    expect(rendered.label).toBe("Recommendation from John Smith");
    expect(rendered.url).toBe("https://www.linkedin.com/in/jane-doe/details/recommendations/");
    expect(rendered.metadata).toEqual({ dateFrom: "2024-06-15", dateTo: "2024-06-15" });
  });
});

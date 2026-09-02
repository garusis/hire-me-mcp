import type {
  CareerStory,
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
  renderStory,
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

describe("renderStory", () => {
  const primaryExperience: ExperienceEntry = {
    id: "acme-role",
    company: "Acme",
    role: "Engineer",
    startDate: "2020-01",
    endDate: "2021-01",
    summary: "Did engineering work.",
    highlights: ["Shipped feature X"],
    tech: ["typescript"],
  };
  const relatedExperience: ExperienceEntry = {
    id: "globex-role",
    company: "Globex",
    role: "Senior Engineer",
    startDate: "2021-02",
    endDate: undefined,
    summary: "Leads the platform team.",
    highlights: ["Rebuilt the deploy pipeline"],
    tech: ["nodejs"],
  };
  const story: CareerStory = {
    id: "acme-outage-story",
    experienceId: "acme-role",
    title: "Tracing an outage back to a schema migration",
    primaryCompetency: "problem-solving",
    supportingCompetencies: ["ownership", "technical-judgment"],
    situation: "A production service crash-looped after a dependency upgrade.",
    task: "I owned the incident and traced it from the symptoms backward.",
    actions: ["I contained the cascade first.", "I then reproduced and fixed the root cause."],
    results: ["The service stabilized with no permanent data loss."],
    reflection: "I now pin dependency versions in every deploy pipeline.",
    retrievalTags: ["production-incident", "schema-validation"],
  };

  it("renders title, primary company/role/dates, competencies, retrieval tags, and labeled STAR sections", () => {
    const rendered = renderStory(story, primaryExperience, []);
    expect(rendered.header).toContain("Tracing an outage back to a schema migration");
    expect(rendered.header).toContain("Engineer, Acme");
    expect(rendered.header).toContain("2020-01 – 2021-01");
    expect(rendered.header).toContain("problem solving");
    expect(rendered.header).toContain("ownership, technical judgment");
    expect(rendered.header).toContain("production incident, schema validation");
    expect(rendered.body).toContain(
      "Situation: A production service crash-looped after a dependency upgrade.",
    );
    expect(rendered.body).toContain(
      "Task: I owned the incident and traced it from the symptoms backward.",
    );
    expect(rendered.body).toContain("Actions:");
    expect(rendered.body).toContain("- I contained the cascade first.");
    expect(rendered.body).toContain("- I then reproduced and fixed the root cause.");
    expect(rendered.body).toContain("Results:");
    expect(rendered.body).toContain("- The service stabilized with no permanent data loss.");
    expect(rendered.body).toContain(
      "Reflection: I now pin dependency versions in every deploy pipeline.",
    );
    expect(rendered.label).toBe("Tracing an outage back to a schema migration");
    expect(rendered.metadata).toEqual({
      company: "Acme",
      tags: ["production-incident", "schema-validation"],
      dateFrom: "2020-01",
      dateTo: "2021-01",
    });
  });

  it("omits the reflection line entirely when the story has none", () => {
    const rendered = renderStory({ ...story, reflection: undefined }, primaryExperience, []);
    expect(rendered.body).not.toContain("Reflection:");
  });

  it("renders each retrieval tag human-readably exactly once, distinct from competencies", () => {
    const rendered = renderStory(story, primaryExperience, []);
    const tagOccurrences =
      rendered.header.split("production incident, schema validation").length - 1;
    expect(tagOccurrences).toBe(1);
    expect(rendered.header).not.toContain("production-incident");
  });

  it("labels related experience context distinctly, without relocating the event to that role", () => {
    const withRelated: CareerStory = { ...story, relatedExperienceIds: ["globex-role"] };
    const rendered = renderStory(withRelated, primaryExperience, [relatedExperience]);
    expect(rendered.header).toContain("Engineer, Acme");
    expect(rendered.header).toContain("Related context");
    expect(rendered.header).toContain("Senior Engineer, Globex");
    expect(rendered.header).toMatch(/related context.*not where this event occurred/i);
    // The primary role/company still appears exactly where a reader expects "the role this happened in".
    const primaryIndex = rendered.header.indexOf("Engineer, Acme");
    const relatedLabelIndex = rendered.header.indexOf("Related context");
    expect(primaryIndex).toBeGreaterThanOrEqual(0);
    expect(relatedLabelIndex).toBeGreaterThan(primaryIndex);
  });

  it("never renders eval-only retrieval questions, even if present on the entity at runtime", () => {
    const withQuestions = {
      ...story,
      retrievalQuestions: ["Has he ever traced a production incident to a schema migration?"],
    } as CareerStory;
    const rendered = renderStory(withQuestions, primaryExperience, []);
    expect(rendered.header).not.toContain("Has he ever traced");
    expect(rendered.body).not.toContain("Has he ever traced");
  });
});

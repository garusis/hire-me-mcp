import { describe, expect, it } from "vitest";
import type { CvView } from "../../src/lib/content/cv";
import { renderCvHtml } from "./render-cv-html";

const FIXTURE_VIEW: CvView = {
  profile: {
    id: "fixture-profile",
    name: "Fixture Person",
    headline: "Fixture Headline Role",
    location: "Fixture City, Nowhere",
    availability: "open",
    summary: "Fixture summary paragraph describing the fixture person.",
    contacts: [
      { label: "Email", url: "mailto:fixture@example.com" },
      { label: "GitHub", url: "https://github.com/fixture-person" },
    ],
  },
  experience: [
    {
      company: "Fixture Employer Inc",
      role: "Fixture Senior Role",
      startDate: "2020-01",
      endDate: undefined,
      highlights: ["Fixture highlight about shipping fixture things."],
    },
  ],
  skillsByProficiency: [
    { proficiency: "expert", names: ["Fixture Expert Skill"] },
    { proficiency: "familiar", names: ["Fixture Familiar Skill"] },
  ],
  education: [
    {
      id: "fixture-education",
      institution: "Fixture University",
      credential: "Fixture Degree",
      startDate: "2010-01",
      endDate: "2014-01",
    },
  ],
  filename: "fixture-person-cv.pdf",
};

// Distinctive real career-data strings — must never leak into a render that
// was only ever handed fixture data. If any of these show up, the template
// hardcodes career content instead of reading it from the passed-in view.
const REAL_CAREER_STRINGS = [
  "House Numbers",
  "garusis@gmail.com",
  "Cucuta",
  "Marcos Javier Alvarez",
];

describe("renderCvHtml", () => {
  it("renders a full, self-contained HTML document", () => {
    const html = renderCvHtml(FIXTURE_VIEW, { siteUrl: "https://example.test" });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("includes print CSS: @page, page-break control and print-color-adjust", () => {
    const html = renderCvHtml(FIXTURE_VIEW, { siteUrl: "https://example.test" });
    expect(html).toContain("@page");
    expect(html).toMatch(/break-inside:\s*avoid/);
    expect(html).toMatch(/print-color-adjust:\s*exact/);
  });

  it("renders every field of the passed-in view — profile, experience, skills, education", () => {
    const html = renderCvHtml(FIXTURE_VIEW, { siteUrl: "https://example.test" });
    expect(html).toContain("Fixture Person");
    expect(html).toContain("Fixture Headline Role");
    expect(html).toContain("Fixture City, Nowhere");
    expect(html).toContain("Fixture summary paragraph describing the fixture person.");
    expect(html).toContain("Fixture Employer Inc");
    expect(html).toContain("Fixture Senior Role");
    expect(html).toContain("Fixture highlight about shipping fixture things.");
    expect(html).toContain("Fixture Expert Skill");
    expect(html).toContain("Fixture Familiar Skill");
    expect(html).toContain("Fixture University");
    expect(html).toContain("Fixture Degree");
  });

  it("renders contact hyperlinks with clickable hrefs and visible, selectable URL text", () => {
    const html = renderCvHtml(FIXTURE_VIEW, { siteUrl: "https://example.test" });
    expect(html).toContain('href="mailto:fixture@example.com"');
    expect(html).toContain("fixture@example.com");
    expect(html).toContain('href="https://github.com/fixture-person"');
    expect(html).toContain("github.com/fixture-person");
  });

  it("never emits any real career-data string — every fact comes from the passed-in view, never a hardcoded literal", () => {
    const html = renderCvHtml(FIXTURE_VIEW, { siteUrl: "https://example.test" });
    for (const realString of REAL_CAREER_STRINGS) {
      expect(html).not.toContain(realString);
    }
  });

  it("renders an open-ended role as Present", () => {
    const html = renderCvHtml(FIXTURE_VIEW, { siteUrl: "https://example.test" });
    expect(html).toContain("Present");
  });
});

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
  projects: [
    {
      name: "Fixture Flagship Project",
      role: "Fixture Creator",
      summary: "Fixture flagship summary describing the fixture project.",
      links: [
        { label: "GitHub", url: "https://github.com/fixture-person/fixture-flagship" },
        { label: "MCP endpoint", url: "https://fixture-flagship.example.test/api/mcp" },
      ],
    },
    {
      name: "Fixture Side Project",
      role: "Fixture Maintainer",
      summary: "Fixture side-project summary.",
      links: [],
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

const FIXTURE_OPTIONS = {
  siteUrl: "https://example.test",
  mcpUrl: "https://example.test/api/mcp",
};

// Distinctive real career-data strings — must never leak into a render that
// was only ever handed fixture data. If any of these show up, the template
// hardcodes career content instead of reading it from the passed-in view.
const REAL_CAREER_STRINGS = [
  "House Numbers",
  "garusis@gmail.com",
  "Cúcuta",
  "Marcos Javier Alvarez",
];

describe("renderCvHtml", () => {
  it("renders a full, self-contained HTML document", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("includes print CSS: @page, page-break control and print-color-adjust", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("@page");
    expect(html).toMatch(/break-inside:\s*avoid/);
    expect(html).toMatch(/print-color-adjust:\s*exact/);
  });

  it("renders every field of the passed-in view — profile, experience, skills, education", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
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
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain('href="mailto:fixture@example.com"');
    expect(html).toContain("fixture@example.com");
    expect(html).toContain('href="https://github.com/fixture-person"');
    expect(html).toContain("github.com/fixture-person");
  });

  it("never emits any real career-data string — every fact comes from the passed-in view, never a hardcoded literal", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    for (const realString of REAL_CAREER_STRINGS) {
      expect(html).not.toContain(realString);
    }
  });

  it("renders a Selected Projects section from the view — name, role, summary, and links as visible URLs (#232)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("Selected Projects");
    expect(html).toContain("Fixture Flagship Project");
    expect(html).toContain("Fixture Creator");
    expect(html).toContain("Fixture flagship summary describing the fixture project.");
    expect(html).toContain("Fixture Side Project");
    expect(html).toContain("Fixture Maintainer");
    expect(html).toContain('href="https://github.com/fixture-person/fixture-flagship"');
    // The link URL is the visible text too, so it survives PDF text extraction.
    expect(html).toContain(">https://fixture-flagship.example.test/api/mcp</a>");
  });

  it("omits the Selected Projects section entirely when the view has no projects", () => {
    const html = renderCvHtml({ ...FIXTURE_VIEW, projects: [] }, FIXTURE_OPTIONS);
    expect(html).not.toContain("Selected Projects");
  });

  it("footer calls out the MCP endpoint URL passed in options (#232)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("https://example.test/api/mcp");
    expect(html).toMatch(/MCP client/);
  });

  it("does not force whole sections onto one page — no section-level avoid-page rule (#230)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).not.toMatch(/section\s*\{[^}]*break-inside:\s*avoid-page/);
  });

  it("renders an open-ended role as Present", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("Present");
  });

  it("stamps the CSP nonce on the inline <style> when one is provided (#76 — production /cv/print CSP violation)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, {
      ...FIXTURE_OPTIONS,
      nonce: "fixture-nonce-value",
    });
    expect(html).toContain('<style nonce="fixture-nonce-value">');
  });

  it("emits a bare <style> when no nonce is provided (headless PDF render has no CSP)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("<style>");
    expect(html).not.toContain("<style nonce=");
  });

  it("declares a viewport meta and an icon link so the browsable /cv/print view has no favicon 404 (#76)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    );
    expect(html).toContain('<link rel="icon" href="/icon" />');
  });
});

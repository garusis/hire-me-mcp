import { createContentCareerDataRepository } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import type { CvView } from "../../src/lib/content/cv";
import { getCvView } from "../../src/lib/content/cv";
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
      { label: "LinkedIn", url: "https://www.linkedin.example/in/fixture-person/" },
    ],
  },
  variant: "general",
  headline: "Fixture Headline Role",
  summary: "Fixture summary paragraph describing the fixture person.",
  timezoneLine: "Remote (Fixture-5)",
  experience: [
    {
      company: "Fixture Employer Inc",
      role: "Fixture Senior Role",
      startDate: "2020-01",
      endDate: undefined,
      highlights: ["Fixture highlight about shipping fixture things."],
      tech: ["Fixture TypeScript", "Fixture React"],
    },
    {
      company: "Fixture Older Employer",
      role: "Fixture Older Role",
      startDate: "2015-06",
      endDate: "2016-06",
      highlights: ["Fixture highlight about the older fixture role."],
      tech: [],
    },
    {
      company: "Fixture Earliest Employer",
      role: "Fixture Earliest Role",
      startDate: "2013-02",
      endDate: "2015-01",
      highlights: [],
      tech: [],
      compactLine: "fixture compact-line summary.",
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
  skillGroups: [
    { category: "language", label: "Fixture Languages", names: ["Fixture Expert Skill"] },
    { category: "tool", label: "Fixture Tools", names: ["Fixture Familiar Skill"] },
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

  it("includes print CSS: @page at Letter size, page-break control and print-color-adjust", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("@page");
    expect(html).toMatch(/@page\s*\{[^}]*size:\s*Letter/);
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

  it("renders a Selected Projects section from the view — name, role, summary, and links as bare-domain text with the full href (#232, #299)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("Selected Projects");
    expect(html).toContain("Fixture Flagship Project");
    expect(html).toContain("Fixture Creator");
    expect(html).toContain("Fixture flagship summary describing the fixture project.");
    expect(html).toContain("Fixture Side Project");
    expect(html).toContain("Fixture Maintainer");
    expect(html).toContain(
      'href="https://github.com/fixture-person/fixture-flagship">github.com/fixture-person/fixture-flagship</a>',
    );
    // The href keeps the full URL even though the visible text is the bare domain.
    expect(html).toContain(
      'href="https://fixture-flagship.example.test/api/mcp">fixture-flagship.example.test/api/mcp</a>',
    );
  });

  it("omits the Selected Projects section entirely when the view has no projects", () => {
    const html = renderCvHtml({ ...FIXTURE_VIEW, projects: [] }, FIXTURE_OPTIONS);
    expect(html).not.toContain("Selected Projects");
  });

  it("the header (not a footer) calls out the MCP endpoint URL passed in options for the ai variant (#232, #309 stage 3 action 12) — no footer is emitted", () => {
    // The general variant collapses the portfolio line to one URL
    // (#309 stage 3 action 12); the MCP endpoint callout is an ai-variant
    // header feature now, exercised here with variant: "ai".
    const html = renderCvHtml({ ...FIXTURE_VIEW, variant: "ai" }, FIXTURE_OPTIONS);
    expect(html).toContain("https://example.test/api/mcp");
    expect(html).toMatch(/MCP client/);
    expect(html).not.toContain("<footer");
    expect(html).not.toContain("</footer>");
    // The callout lives in the header's contact block, before any section heading.
    const headerEnd = html.indexOf("<h2>");
    const mcpIndex = html.indexOf("https://example.test/api/mcp");
    expect(headerEnd).toBeGreaterThan(-1);
    expect(mcpIndex).toBeGreaterThan(-1);
    expect(mcpIndex).toBeLessThan(headerEnd);
  });

  it("does not force whole sections onto one page — no section-level avoid-page rule (#230)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).not.toMatch(/section\s*\{[^}]*break-inside:\s*avoid-page/);
  });

  it("does not force a whole role entry onto one page — a long role's bullets may split across the page boundary, only a single bullet line and the role header stay atomic (#309 stage 3, two-page budget)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).not.toMatch(/\.entry\s*\{[^}]*break-inside:\s*avoid/);
    // The role header itself still can't be orphaned from its first bullet.
    expect(html).toMatch(/\.role\s*\{[^}]*(page-break-after|break-after):\s*avoid/);
    // Individual bullets still never split mid-sentence.
    expect(html).toMatch(/li\s*\{[^}]*orphans/);
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

  it("formats YYYY-MM dates as month names, collapses a same-month start/end, and keeps Present for an open end (#299)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    // Open-ended role: "Jan 2020" onward, rendered "Jan 2020 – Present".
    expect(html).toContain("Jan 2020 – Present");
    // Closed role spanning two different months.
    expect(html).toContain("Jun 2015 – Jun 2016");
    // Education entry whose start and end fall in the same month collapses
    // to a single "Mon YYYY", not "Jan 2010 – Jan 2010".
    const sameMonthView: CvView = {
      ...FIXTURE_VIEW,
      education: [
        {
          id: "fixture-education-same-month",
          institution: "Fixture Institute",
          credential: "Fixture Certificate",
          startDate: "2020-01",
          endDate: "2020-01",
        },
      ],
    };
    const sameMonthHtml = renderCvHtml(sameMonthView, FIXTURE_OPTIONS);
    expect(sameMonthHtml).toContain("(Jan 2020)");
    expect(sameMonthHtml).not.toContain("Jan 2020 – Jan 2020");
  });

  it("renders contact and portfolio links as a bare domain while keeping the full URL as the href (#299)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    // mailto: shows the bare address.
    expect(html).toContain('href="mailto:fixture@example.com">fixture@example.com</a>');
    // https:// without www shows scheme-stripped text.
    expect(html).toContain(
      'href="https://github.com/fixture-person">github.com/fixture-person</a>',
    );
    // https:// with a leading www. and a trailing slash strips both.
    expect(html).toContain(
      'href="https://www.linkedin.example/in/fixture-person/">linkedin.example/in/fixture-person</a>',
    );
    // The general-variant portfolio siteUrl link is shown the same way.
    expect(html).toContain('href="https://example.test">example.test</a>');
    // The ai variant additionally shows the MCP endpoint, displayed like
    // every other URL on the page (scheme stripped, full href kept) so the
    // header reads consistently (#309 round 3 grading, nit 6).
    const aiHtml = renderCvHtml({ ...FIXTURE_VIEW, variant: "ai" }, FIXTURE_OPTIONS);
    expect(aiHtml).toContain('href="https://example.test/api/mcp">example.test/api/mcp</a>');
  });

  it("renders a Tech line under a role from the view's tech field, omitted when it is empty (#299)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain('<p class="tech">Tech: Fixture TypeScript, Fixture React.</p>');
    // The second fixture role has an empty tech array — no stray "Tech:" line for it.
    const html2 = renderCvHtml(
      { ...FIXTURE_VIEW, experience: [FIXTURE_VIEW.experience[1] as CvView["experience"][0]] },
      FIXTURE_OPTIONS,
    );
    expect(html2).not.toContain('class="tech"');
  });

  it("renders the timezoneLine after location when present, and skips it when absent (#309 stage 3, action 12)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("Remote (Fixture-5)");
    const htmlNoTimezone = renderCvHtml(
      { ...FIXTURE_VIEW, timezoneLine: undefined },
      FIXTURE_OPTIONS,
    );
    expect(htmlNoTimezone).not.toContain("Remote (Fixture-5)");
  });

  it("collapses the portfolio line to the site URL alone for the general variant, and includes the MCP URL for the ai variant (#309 stage 3, action 12)", () => {
    const generalHtml = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    const headerEndGeneral = generalHtml.indexOf("<h2>");
    expect(generalHtml.slice(0, headerEndGeneral)).not.toContain(FIXTURE_OPTIONS.mcpUrl);

    const aiHtml = renderCvHtml({ ...FIXTURE_VIEW, variant: "ai" }, FIXTURE_OPTIONS);
    const headerEndAi = aiHtml.indexOf("<h2>");
    expect(aiHtml.slice(0, headerEndAi)).toContain(FIXTURE_OPTIONS.mcpUrl);
  });

  it("renders a role with compactLine as a structured entry under an Earlier Experience heading — bold company, role, full date range, one description line (#309 stage 3 second review, item 7)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("Earlier Experience");
    // Same DOM shape as a full entry: bold company, role, formatted period, a single description bullet.
    expect(html).toContain("<strong>Fixture Earliest Employer</strong>");
    expect(html).toContain("Fixture Earliest Role");
    expect(html).toContain("Feb 2013 – Jan 2015");
    expect(html).toContain("<li>fixture compact-line summary.</li>");
    // The compact entry appears after the "Earlier Experience" heading, not mixed into the main Experience list.
    const earlierIndex = html.indexOf("Earlier Experience");
    const compactIndex = html.indexOf("Fixture Earliest Employer");
    expect(compactIndex).toBeGreaterThan(earlierIndex);
  });

  it("renders each Earlier Experience entry with the same .entry/.role/<ul><li> DOM shape as a full Experience entry, so ATS parsers count it as a position (#309 stage 3 second review, item 7)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    const earlierIndex = html.indexOf("<h2>Earlier Experience</h2>");
    expect(earlierIndex).toBeGreaterThan(-1);
    const earlierSection = html.slice(earlierIndex);
    expect(earlierSection).toMatch(/<div class="entry">\s*<p class="role"><strong>/);
    expect(earlierSection).toContain("<ul><li>");
  });

  it("does not force a compact entry's .entry block onto one page unless the view sets keepTogether (#309 stage 3 second review, item 5)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    const earlierIndex = html.indexOf("<h2>Earlier Experience</h2>");
    const earlierSection = html.slice(earlierIndex);
    expect(earlierSection).not.toContain('class="entry keep-together"');
    const keepTogetherView: CvView = {
      ...FIXTURE_VIEW,
      experience: FIXTURE_VIEW.experience.map((item) =>
        item.company === "Fixture Older Employer" ? { ...item, keepTogether: true } : item,
      ),
    };
    const keepTogetherHtml = renderCvHtml(keepTogetherView, FIXTURE_OPTIONS);
    expect(keepTogetherHtml).toContain('class="entry keep-together"');
    expect(keepTogetherHtml).toMatch(/\.entry\.keep-together\s*\{[^}]*break-inside:\s*avoid/);
  });

  it("keeps a Tech: line from starting a new page (#309 stage 3 second review, item 5)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toMatch(/\.tech\s*\{[^}]*break-before:\s*avoid/);
  });

  it("renders each skill group under its own label, from skillGroups rather than proficiency tiers (#309 stage 3, action 5)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("Fixture Languages");
    expect(html).toContain("Fixture Tools");
    expect(html).toContain("Fixture Expert Skill");
    expect(html).toContain("Fixture Familiar Skill");
  });
});

// #296 — the locked visibility boundary (#288): every sentence (>= 8
// words, same normalisation as the career-data `no-story-detail-in-
// experience` lint rule) of every real authored story's situation/task/
// actions/results/reflection, plus every story's title. Rendered against
// the real CV view (real repository), not fixture data.
const MIN_STORY_SENTENCE_WORDS = 8;

function normalizeStoryProse(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function storySentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function realStorySentences(): string[] {
  const dataset = createContentCareerDataRepository().getDataset();
  const sentences: string[] = [];
  for (const story of dataset.stories) {
    const units = [
      story.situation,
      story.task,
      ...story.actions,
      ...story.results,
      ...(story.reflection === undefined ? [] : [story.reflection]),
    ];
    for (const unit of units) {
      for (const sentence of storySentencesOf(unit)) {
        const normalized = normalizeStoryProse(sentence);
        if (normalized.split(" ").length >= MIN_STORY_SENTENCE_WORDS) {
          sentences.push(normalized);
        }
      }
    }
  }
  return sentences;
}

function realStoryTitles(): string[] {
  return createContentCareerDataRepository()
    .getDataset()
    .stories.map((story) => normalizeStoryProse(story.title));
}

describe("renderCvHtml never leaks real story content (#296)", () => {
  it("the real CV, rendered to HTML, contains no story sentence or title from the real dataset", () => {
    const realView = getCvView(createContentCareerDataRepository());
    const html = renderCvHtml(realView, FIXTURE_OPTIONS);
    const normalized = ` ${normalizeStoryProse(html)} `;
    const needles = [...realStorySentences(), ...realStoryTitles()];
    expect(needles.length).toBeGreaterThan(0);

    for (const needle of needles) {
      expect(normalized).not.toContain(` ${needle} `);
    }
  });
});

// #309 stage 3, action 19: a phrasing guard, not a content guard — the
// Stage 2 review's #1 finding was that the non-shipped PoC's "stayed
// experimental" framing, as the CV's very first bullet, was the single
// most damaging line on the document (section 1, point 3). This never
// asserts *what* the lead bullet says, only that it can never open with
// language admitting the work was never deployed — regardless of future
// wording changes to that bullet or the overlay.
const NEVER_DEPLOYED_PHRASES = [
  "never deployed",
  "stayed experimental",
  "left as a later team decision",
];

describe("renderCvHtml never leads with non-shipped-work framing (#309 stage 3, action 19)", () => {
  it("the real CV's lead bullet, for every variant, never contains 'never deployed', 'stayed experimental', or 'left as a later team decision'", () => {
    for (const variant of ["general", "ai"] as const) {
      const view = getCvView(createContentCareerDataRepository(), { variant });
      for (const item of view.experience) {
        const leadBullet = item.highlights[0];
        if (leadBullet === undefined) {
          continue;
        }
        const normalizedLead = leadBullet.toLowerCase();
        for (const phrase of NEVER_DEPLOYED_PHRASES) {
          expect(
            normalizedLead,
            `variant "${variant}", ${item.company} lead bullet: "${leadBullet}"`,
          ).not.toContain(phrase);
        }
      }
    }
  });

  it("the rendered HTML for both variants carries none of the banned phrases anywhere in the Experience section's lead bullets", () => {
    for (const variant of ["general", "ai"] as const) {
      const view = getCvView(createContentCareerDataRepository(), { variant });
      const html = renderCvHtml(view, FIXTURE_OPTIONS).toLowerCase();
      // A coarse whole-document check backs up the per-bullet one above:
      // none of these phrases should appear anywhere at all in the
      // optimized CV — they are interview material, not CV material.
      for (const phrase of NEVER_DEPLOYED_PHRASES) {
        expect(html, `variant "${variant}"`).not.toContain(phrase);
      }
    }
  });
});

// #309 stage 1 — the "everything on the table" full projection intentionally
// carries per-role summaries and every attached story. This is the parallel
// case the #296 guard test above calls for: the guard stays scoped to the
// default (web) projection (`getCvView()` with no options, asserted above,
// unchanged), while this describe block proves the opt-in `includeSummary`/
// `includeStories` full mode DOES surface that same content when the view
// model is built to carry it.
const FULL_MODE_FIXTURE_VIEW: CvView = {
  ...FIXTURE_VIEW,
  experience: [
    {
      company: "Fixture Employer Inc",
      role: "Fixture Senior Role",
      startDate: "2020-01",
      endDate: undefined,
      highlights: ["Fixture highlight about shipping fixture things."],
      tech: [],
      summary: "Fixture full-mode role summary paragraph.",
      stories: [
        {
          title: "Fixture Full-Mode Story Title",
          situation: "Fixture full-mode story situation prose.",
          task: "Fixture full-mode story task prose.",
          actions: ["Fixture full-mode story action one.", "Fixture full-mode story action two."],
          results: ["Fixture full-mode story result one."],
        },
      ],
    },
  ],
};

/**
 * Reverses `escapeHtml` so a quote-heavy sentence (rendered as `&quot;`)
 * still matches its plain source text when normalized, instead of picking
 * up a spurious "quot" token from the untouched entity.
 */
function decodeEscapedHtml(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Every real story's title/situation/task/actions/results needle, same
 * shape as {@link realStorySentences}/{@link realStoryTitles} but excluding
 * `reflection` — `CvStoryView` deliberately has no reflection field, so a
 * full-mode-renders-everything assertion must not expect it either.
 */
function realStoryNeedlesExcludingReflection(): string[] {
  const dataset = createContentCareerDataRepository().getDataset();
  const needles: string[] = [];
  for (const story of dataset.stories) {
    needles.push(normalizeStoryProse(story.title));
    const units = [story.situation, story.task, ...story.actions, ...story.results];
    for (const unit of units) {
      for (const sentence of storySentencesOf(unit)) {
        const normalizedSentence = normalizeStoryProse(sentence);
        if (normalizedSentence.split(" ").length >= MIN_STORY_SENTENCE_WORDS) {
          needles.push(normalizedSentence);
        }
      }
    }
  }
  return needles;
}

describe("renderCvHtml full mode (#309 stage 1)", () => {
  it("renders each role's summary and every attached story's full title/situation/task/actions/results", () => {
    const html = renderCvHtml(FULL_MODE_FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).toContain("Fixture full-mode role summary paragraph.");
    expect(html).toContain("Fixture Full-Mode Story Title");
    expect(html).toContain("Fixture full-mode story situation prose.");
    expect(html).toContain("Fixture full-mode story task prose.");
    expect(html).toContain("Fixture full-mode story action one.");
    expect(html).toContain("Fixture full-mode story action two.");
    expect(html).toContain("Fixture full-mode story result one.");
  });

  it("renders the real CV view built with includeSummary/includeStories: every real story's title/situation/task/actions/results appears (reflection is deliberately not part of CvStoryView, so it's excluded here too)", () => {
    // #309 stage 1's "everything on the table" full projection also
    // disables the CV-only overlay (overrides: undefined): a compact-line
    // role would otherwise collapse out of the "Experience" section and
    // take its attached stories with it, defeating the whole point of the
    // unfiltered dump this stage produces for the Stage 2 reviewer.
    const fullView = getCvView(createContentCareerDataRepository(), {
      maxHighlightsPerRole: Number.POSITIVE_INFINITY,
      includeSummary: true,
      includeStories: true,
      overrides: undefined,
    });
    const html = renderCvHtml(fullView, FIXTURE_OPTIONS);
    const normalized = ` ${normalizeStoryProse(decodeEscapedHtml(html))} `;
    const needles = realStoryNeedlesExcludingReflection();
    expect(needles.length).toBeGreaterThan(0);

    for (const needle of needles) {
      expect(normalized).toContain(` ${needle} `);
    }
  });

  it("omits summary/stories elements when a role has neither (default projection still renders cleanly)", () => {
    const html = renderCvHtml(FIXTURE_VIEW, FIXTURE_OPTIONS);
    expect(html).not.toContain('<p class="role-summary">');
    expect(html).not.toContain('<div class="role-stories">');
    expect(html).not.toContain("Situation:");
    expect(html).not.toContain("Actions:");
  });
});

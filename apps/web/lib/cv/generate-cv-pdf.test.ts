import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInMemoryCareerDataRepository, emptyCareerDataset } from "@hire-me-mcp/core";
import { PDFParse } from "pdf-parse";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCvView } from "../../src/lib/content/cv";
import { generateCvPdf } from "./generate-cv-pdf";
import { renderCvHtml } from "./render-cv-html";

/**
 * Integration coverage for #35's AC: the generated PDF exists, is
 * non-empty, is within the agreed 1–2 page bound, and its extracted text
 * contains key values pulled straight from a career-data fixture — so a
 * content change (a different fixture here) is reflected in the artifact,
 * not just in the HTML that feeds it. Runs real headless Chromium
 * (Playwright, already a repo dependency) and a real PDF text extractor
 * (`pdf-parse`) rather than mocking either — this is the one place in the
 * suite that has to prove the whole HTML->PDF pipeline actually works.
 */
describe("generateCvPdf", () => {
  let outputDir: string;
  let outputPath: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), "cv-pdf-test-"));
    outputPath = join(outputDir, "fixture-cv.pdf");
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it("writes a non-empty PDF, within the 1-2 page bound, whose extracted text contains key career-data values", async () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      profile: {
        id: "pdf-fixture-profile",
        name: "PDF Fixture Person",
        headline: "PDF Fixture Headline",
        location: "PDF Fixture City",
        availability: "open",
        summary: "PDF fixture summary paragraph.",
        contacts: [{ label: "Email", url: "mailto:pdf-fixture@example.com" }],
      },
      experience: [
        {
          id: "pdf-fixture-role",
          company: "PDF Fixture Employer",
          role: "PDF Fixture Role",
          startDate: "2021-01",
          summary: "summary",
          highlights: ["PDF fixture highlight one"],
          tech: [],
        },
      ],
      skills: [
        {
          id: "pdf-fixture-skill",
          name: "PDF Fixture Skill",
          aliases: [],
          category: "language",
          proficiency: "expert",
          evidence: [],
        },
      ],
    });
    const view = getCvView(repository);
    const html = renderCvHtml(view, {
      siteUrl: "https://example.test",
      mcpUrl: "https://example.test/api/mcp",
    });

    await generateCvPdf(html, outputPath);

    const stats = statSync(outputPath);
    expect(stats.size).toBeGreaterThan(0);

    const buffer = readFileSync(outputPath);
    const parser = new PDFParse({ data: buffer });
    const info = await parser.getInfo();
    const text = await parser.getText();
    await parser.destroy();

    expect(info.total).toBeGreaterThanOrEqual(1);
    expect(info.total).toBeLessThanOrEqual(2);

    expect(text.text).toContain("PDF Fixture Person");
    expect(text.text).toContain("PDF Fixture Employer");
    expect(text.text).toContain("PDF Fixture Skill");
    expect(text.text).toContain("pdf-fixture@example.com");
  }, 60_000);
});

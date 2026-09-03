import { createContentCareerDataRepository } from "@hire-me-mcp/core";
import { describe, expect, it, vi } from "vitest";

const { renderLlmsFullTxt } = vi.hoisted(() => ({ renderLlmsFullTxt: vi.fn() }));
vi.mock("../../lib/llms/generate-llms", () => ({ renderLlmsFullTxt }));

const { getSiteUrl, getMcpEndpointUrl } = vi.hoisted(() => ({
  getSiteUrl: vi.fn(),
  getMcpEndpointUrl: vi.fn(),
}));
vi.mock("../../src/lib/config/site-url", () => ({ getSiteUrl, getMcpEndpointUrl }));

describe("GET /llms-full.txt", () => {
  it("returns 200 with a text/plain; charset=utf-8 content type", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    renderLlmsFullTxt.mockReturnValue("# hire-me-mcp\n");
    const { GET } = await import("./route.js");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  it("serves the body rendered from the runtime site URL and MCP endpoint URL", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    renderLlmsFullTxt.mockReturnValue("# hire-me-mcp\n\n## Tools\n");
    const { GET } = await import("./route.js");

    const response = await GET();
    const body = await response.text();

    expect(body).toBe("# hire-me-mcp\n\n## Tools\n");
    expect(renderLlmsFullTxt).toHaveBeenCalledWith({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });
  });

  // #296 — the locked visibility boundary (#288). The two tests above stub
  // `renderLlmsFullTxt` entirely (already covered against real story
  // content by `lib/llms/generate-llms.test.ts`), so this route's own guard
  // exercises the real `renderLlmsFullTxt` here, wired through the real
  // GET() handler, proving the route itself introduces no leak of its own.
  it("serves the real renderLlmsFullTxt output, which contains no story sentence or title (#296)", async () => {
    const real = await vi.importActual<typeof import("../../lib/llms/generate-llms")>(
      "../../lib/llms/generate-llms",
    );
    renderLlmsFullTxt.mockImplementation(real.renderLlmsFullTxt);
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    const { GET } = await import("./route.js");

    const response = await GET();
    const body = await response.text();

    const dataset = createContentCareerDataRepository().getDataset();
    const needles = [
      ...dataset.stories.flatMap((story) =>
        [story.situation, story.task, ...story.actions, ...story.results].flatMap(storySentencesOf),
      ),
      ...dataset.stories.map((story) => story.title),
    ]
      .map(normalizeStoryProse)
      .filter((sentence) => sentence.split(" ").length >= MIN_STORY_SENTENCE_WORDS);
    expect(needles.length).toBeGreaterThan(0);

    const normalizedBody = ` ${normalizeStoryProse(body)} `;
    for (const needle of needles) {
      expect(normalizedBody).not.toContain(` ${needle} `);
    }
  });
});

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

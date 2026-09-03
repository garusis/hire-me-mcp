import { createContentCareerDataRepository } from "@hire-me-mcp/core";
import { describe, expect, it, vi } from "vitest";
import type { ProfileView } from "../src/lib/content";

const { getProfileView } = vi.hoisted(() => ({ getProfileView: vi.fn() }));
vi.mock("../src/lib/content", () => ({ getProfileView }));

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

describe("default opengraph image", () => {
  it("declares the standard 1200x630 Open Graph size", async () => {
    const { size } = await import("./opengraph-image.js");
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it("renders a 200 PNG image response built from the profile view", async () => {
    getProfileView.mockReturnValue(profileView());
    const { default: OpengraphImage } = await import("./opengraph-image.js");

    const response = await OpengraphImage();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  // #296 — the locked visibility boundary (#288). `OpengraphImage` only
  // ever reads `profile.name`/`profile.headline`/`profile.summary` (never
  // story data — see the module doc); this pins that structurally, with
  // the real profile, rather than trying to OCR a rendered PNG. `OgCard`
  // is spied on (fresh module registry, restored after) so its props are
  // inspectable without needing to decode the image it produces.
  it("passes only the real profile's name/headline/summary to OgCard — never any story data (#296)", async () => {
    const real = await vi.importActual<typeof import("../src/lib/content")>("../src/lib/content");
    const realProfile = real.getProfileView().profile;
    getProfileView.mockReturnValue({ profile: realProfile, citations: [] });

    const realOgCard =
      await vi.importActual<typeof import("../src/lib/seo/og-card")>("../src/lib/seo/og-card");

    vi.resetModules();
    const ogCardSpy = vi.fn(realOgCard.OgCard);
    vi.doMock("../src/lib/seo/og-card", () => ({ OgCard: ogCardSpy }));
    const { default: FreshOpengraphImage } = await import("./opengraph-image.js");

    const response = await FreshOpengraphImage();
    const reader = response.body?.getReader();
    if (reader !== undefined) {
      for (let result = await reader.read(); !result.done; result = await reader.read()) {
        // draining the ReadableStream forces satori to actually render OgCard
      }
    }

    expect(ogCardSpy).toHaveBeenCalledWith({
      kicker: realProfile.name,
      title: realProfile.headline,
      description: realProfile.summary,
    });

    const normalized = ` ${normalizeStoryProse(
      [realProfile.name, realProfile.headline, realProfile.summary].join(" "),
    )} `;
    const needles = [...realStorySentences(), ...realStoryTitles()];
    expect(needles.length).toBeGreaterThan(0);
    for (const needle of needles) {
      expect(normalized).not.toContain(` ${needle} `);
    }

    vi.doUnmock("../src/lib/seo/og-card");
    vi.resetModules();
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

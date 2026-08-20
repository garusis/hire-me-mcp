import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileView, WritingEntryView } from "../../../src/lib/content";

const { getWritingEntryView, listWritingSlugs, getProfileView } = vi.hoisted(() => ({
  getWritingEntryView: vi.fn(),
  listWritingSlugs: vi.fn(),
  getProfileView: vi.fn(),
}));

vi.mock("../../../src/lib/content", () => ({
  getWritingEntryView,
  listWritingSlugs,
  getProfileView,
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

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));

function foundView(): WritingEntryView {
  return {
    found: true,
    slug: "local-post",
    value: {
      entry: {
        id: "local-post",
        title: "Local Post",
        publishedDate: "2024-03-10",
        summary: "The local post's summary.",
        body: "## Section heading\n\nLocal post body copy.",
      },
      citation: { entityType: "writing", entityId: "local-post", label: "Local Post" },
    },
  };
}

describe("Writing detail page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("generateStaticParams returns exactly the slugs the content layer exposes — locally-hosted entries only", async () => {
    listWritingSlugs.mockReturnValue(["local-post", "another-local-post"]);
    const { generateStaticParams } = await import("./page.js");

    const params = await generateStaticParams();

    expect(params).toEqual([{ slug: "local-post" }, { slug: "another-local-post" }]);
  });

  it("renders the title, date and summary for a known slug", async () => {
    getWritingEntryView.mockReturnValue(foundView());
    getProfileView.mockReturnValue(profileView());
    const { default: WritingDetailPage } = await import("./page.js");

    render(await WritingDetailPage({ params: Promise.resolve({ slug: "local-post" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Local Post" })).toBeDefined();
    expect(screen.getByText(/2024-03-10/)).toBeDefined();
    expect(screen.getByText("The local post's summary.")).toBeDefined();
  });

  it("renders the MDX body content", async () => {
    getWritingEntryView.mockReturnValue(foundView());
    getProfileView.mockReturnValue(profileView());
    const { default: WritingDetailPage } = await import("./page.js");

    render(await WritingDetailPage({ params: Promise.resolve({ slug: "local-post" }) }));

    expect(await screen.findByRole("heading", { level: 2, name: "Section heading" })).toBeDefined();
    expect(await screen.findByText("Local post body copy.")).toBeDefined();
  });

  it("triggers the not-found path for an unknown slug, rather than rendering a broken page", async () => {
    getWritingEntryView.mockReturnValue({ found: false, slug: "unknown-post" });
    const { default: WritingDetailPage } = await import("./page.js");

    await expect(
      WritingDetailPage({ params: Promise.resolve({ slug: "unknown-post" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("renders an Article JSON-LD script built from the writing entry view", async () => {
    getWritingEntryView.mockReturnValue(foundView());
    getProfileView.mockReturnValue(profileView());
    const { default: WritingDetailPage } = await import("./page.js");

    const { container } = render(
      await WritingDetailPage({ params: Promise.resolve({ slug: "local-post" }) }),
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const jsonLd = JSON.parse(script?.textContent ?? "{}");
    expect(jsonLd["@type"]).toBe("Article");
    expect(jsonLd.headline).toBe("Local Post");
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Ada Fixture" });
  });
});

describe("Writing detail page metadata", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a non-empty title and description sourced from the stubbed content layer, with a canonical URL", async () => {
    getWritingEntryView.mockReturnValue(foundView());
    getProfileView.mockReturnValue(profileView());
    const { generateMetadata } = await import("./page.js");

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "local-post" }) });

    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBe("The local post's summary.");
    expect(metadata.alternates?.canonical).toBe("/writing/local-post");
  });

  it("changing the stub entry changes the metadata", async () => {
    const view = foundView();
    if (!view.found) {
      throw new Error("test fixture expected to be found");
    }
    view.value.entry.title = "Renamed Post";
    view.value.entry.summary = "A brand new summary.";
    getWritingEntryView.mockReturnValue(view);
    getProfileView.mockReturnValue(profileView());
    const { generateMetadata } = await import("./page.js");

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "local-post" }) });

    expect(metadata.title).toContain("Renamed Post");
    expect(metadata.description).toBe("A brand new summary.");
  });

  it("returns empty metadata for an unknown slug rather than throwing", async () => {
    getWritingEntryView.mockReturnValue({ found: false, slug: "unknown-post" });
    getProfileView.mockReturnValue(profileView());
    const { generateMetadata } = await import("./page.js");

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "unknown-post" }) });

    expect(metadata).toEqual({});
  });
});

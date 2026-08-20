import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WritingEntryView } from "../../../src/lib/content";

const { getWritingEntryView, listWritingSlugs } = vi.hoisted(() => ({
  getWritingEntryView: vi.fn(),
  listWritingSlugs: vi.fn(),
}));

vi.mock("../../../src/lib/content", () => ({ getWritingEntryView, listWritingSlugs }));

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
    const { default: WritingDetailPage } = await import("./page.js");

    render(await WritingDetailPage({ params: Promise.resolve({ slug: "local-post" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Local Post" })).toBeDefined();
    expect(screen.getByText(/2024-03-10/)).toBeDefined();
    expect(screen.getByText("The local post's summary.")).toBeDefined();
  });

  it("renders the MDX body content", async () => {
    getWritingEntryView.mockReturnValue(foundView());
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
});

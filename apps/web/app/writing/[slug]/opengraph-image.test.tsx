import { describe, expect, it, vi } from "vitest";
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
        body: "body",
      },
      citation: { entityType: "writing", entityId: "local-post", label: "Local Post" },
    },
  };
}

describe("writing opengraph image", () => {
  it("generateStaticParams returns exactly the slugs the content layer exposes — #119, so the route prerenders (●) instead of running as a request-time Lambda (ƒ)", async () => {
    listWritingSlugs.mockReturnValue(["local-post", "another-local-post"]);
    const { generateStaticParams } = await import("./opengraph-image.js");

    const params = await generateStaticParams();

    expect(params).toEqual([{ slug: "local-post" }, { slug: "another-local-post" }]);
  });

  it("declares the standard 1200x630 Open Graph size", async () => {
    const { size } = await import("./opengraph-image.js");
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it("renders a 200 PNG image response for a known slug", async () => {
    getWritingEntryView.mockReturnValue(foundView());
    const { default: WritingOpengraphImage } = await import("./opengraph-image.js");

    const response = await WritingOpengraphImage({
      params: Promise.resolve({ slug: "local-post" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("triggers the not-found path for an unknown slug", async () => {
    getWritingEntryView.mockReturnValue({ found: false, slug: "unknown-post" });
    const { default: WritingOpengraphImage } = await import("./opengraph-image.js");

    await expect(
      WritingOpengraphImage({ params: Promise.resolve({ slug: "unknown-post" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});

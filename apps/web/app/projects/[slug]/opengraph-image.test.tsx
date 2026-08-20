import { describe, expect, it, vi } from "vitest";
import type { ProjectDetailView } from "../../../src/lib/content";

const { getProjectDetailView, listProjectSlugs } = vi.hoisted(() => ({
  getProjectDetailView: vi.fn(),
  listProjectSlugs: vi.fn(),
}));
vi.mock("../../../src/lib/content", () => ({ getProjectDetailView, listProjectSlugs }));

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));

function foundView(): ProjectDetailView {
  return {
    found: true,
    slug: "alpha-project",
    value: {
      project: {
        id: "alpha-project",
        name: "Alpha Project",
        summary: "The alpha summary.",
        role: "Sole engineer",
        tech: ["react", "typescript"],
        links: [],
        body: "body",
      },
      citation: { entityType: "project", entityId: "alpha-project", label: "Alpha Project" },
    },
  };
}

describe("project opengraph image", () => {
  it("generateStaticParams returns exactly the slugs the content layer exposes — #119, so the route prerenders (●) instead of running as a request-time Lambda (ƒ)", async () => {
    listProjectSlugs.mockReturnValue(["alpha-project", "beta-project"]);
    const { generateStaticParams } = await import("./opengraph-image.js");

    const params = await generateStaticParams();

    expect(params).toEqual([{ slug: "alpha-project" }, { slug: "beta-project" }]);
  });

  it("declares the standard 1200x630 Open Graph size", async () => {
    const { size } = await import("./opengraph-image.js");
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it("renders a 200 PNG image response for a known slug", async () => {
    getProjectDetailView.mockReturnValue(foundView());
    const { default: ProjectOpengraphImage } = await import("./opengraph-image.js");

    const response = await ProjectOpengraphImage({
      params: Promise.resolve({ slug: "alpha-project" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("triggers the not-found path for an unknown slug", async () => {
    getProjectDetailView.mockReturnValue({ found: false, slug: "unknown-project" });
    const { default: ProjectOpengraphImage } = await import("./opengraph-image.js");

    await expect(
      ProjectOpengraphImage({ params: Promise.resolve({ slug: "unknown-project" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});

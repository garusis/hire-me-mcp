import { describe, expect, it, vi } from "vitest";
import type { ProjectDetailView } from "../../../src/lib/content";

const { getProjectDetailView } = vi.hoisted(() => ({ getProjectDetailView: vi.fn() }));
vi.mock("../../../src/lib/content", () => ({ getProjectDetailView }));

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

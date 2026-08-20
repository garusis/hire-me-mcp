import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
        links: [{ label: "GitHub", url: "https://github.com/example/alpha" }],
        body: "## What it is\n\nAlpha project body copy.",
      },
      citation: { entityType: "project", entityId: "alpha-project", label: "Alpha Project" },
    },
  };
}

describe("Project detail page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("generateStaticParams returns exactly the slugs the content layer exposes", async () => {
    listProjectSlugs.mockReturnValue(["alpha-project", "beta-project"]);
    const { generateStaticParams } = await import("./page.js");

    const params = await generateStaticParams();

    expect(params).toEqual([{ slug: "alpha-project" }, { slug: "beta-project" }]);
  });

  it("renders the full detail — name, role, summary, tech and outbound links — for a known slug", async () => {
    getProjectDetailView.mockReturnValue(foundView());
    const { default: ProjectDetailPage } = await import("./page.js");

    render(await ProjectDetailPage({ params: Promise.resolve({ slug: "alpha-project" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Alpha Project" })).toBeDefined();
    expect(screen.getByText("Sole engineer")).toBeDefined();
    expect(screen.getByText("The alpha summary.")).toBeDefined();
    expect(screen.getByText("react")).toBeDefined();
    expect(screen.getByText("typescript")).toBeDefined();
    const outboundLink = screen.getByRole("link", { name: /GitHub/i });
    expect(outboundLink).toHaveAttribute("href", "https://github.com/example/alpha");
  });

  it("renders the MDX body content", async () => {
    getProjectDetailView.mockReturnValue(foundView());
    const { default: ProjectDetailPage } = await import("./page.js");

    render(await ProjectDetailPage({ params: Promise.resolve({ slug: "alpha-project" }) }));

    expect(await screen.findByRole("heading", { level: 2, name: "What it is" })).toBeDefined();
    expect(await screen.findByText("Alpha project body copy.")).toBeDefined();
  });

  it("triggers the not-found path for an unknown slug", async () => {
    getProjectDetailView.mockReturnValue({ found: false, slug: "unknown-project" });
    const { default: ProjectDetailPage } = await import("./page.js");

    await expect(
      ProjectDetailPage({ params: Promise.resolve({ slug: "unknown-project" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});

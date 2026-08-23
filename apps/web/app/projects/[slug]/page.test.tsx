import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileView, ProjectDetailView } from "../../../src/lib/content";

const { getProjectDetailView, listProjectSlugs, getProfileView } = vi.hoisted(() => ({
  getProjectDetailView: vi.fn(),
  listProjectSlugs: vi.fn(),
  getProfileView: vi.fn(),
}));

vi.mock("../../../src/lib/content", () => ({
  getProjectDetailView,
  listProjectSlugs,
  getProfileView,
}));

const { getRequestNonce } = vi.hoisted(() => ({
  getRequestNonce: vi.fn(async () => "test-nonce-value"),
}));
vi.mock("../../../src/lib/security/get-request-nonce", () => ({ getRequestNonce }));

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
    getProfileView.mockReturnValue(profileView());
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
    getProfileView.mockReturnValue(profileView());
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

  it("renders a SoftwareSourceCode JSON-LD script built from the project view", async () => {
    getProjectDetailView.mockReturnValue(foundView());
    getProfileView.mockReturnValue(profileView());
    const { default: ProjectDetailPage } = await import("./page.js");

    const { container } = render(
      await ProjectDetailPage({ params: Promise.resolve({ slug: "alpha-project" }) }),
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const jsonLd = JSON.parse(script?.textContent ?? "{}");
    expect(jsonLd["@type"]).toBe("SoftwareSourceCode");
    expect(jsonLd.name).toBe("Alpha Project");
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Ada Fixture" });
  });

  it("carries the request's CSP nonce (#42) on the JSON-LD script tag", async () => {
    getProjectDetailView.mockReturnValue(foundView());
    getProfileView.mockReturnValue(profileView());
    const { default: ProjectDetailPage } = await import("./page.js");

    const { container } = render(
      await ProjectDetailPage({ params: Promise.resolve({ slug: "alpha-project" }) }),
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toHaveAttribute("nonce", "test-nonce-value");
  });
});

describe("Project detail page metadata", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a non-empty title and description sourced from the stubbed content layer, with a canonical URL", async () => {
    getProjectDetailView.mockReturnValue(foundView());
    getProfileView.mockReturnValue(profileView());
    const { generateMetadata } = await import("./page.js");

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "alpha-project" }),
    });

    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBe("The alpha summary.");
    expect(metadata.alternates?.canonical).toBe("/projects/alpha-project");
  });

  it("changing the stub project changes the metadata", async () => {
    const view = foundView();
    if (!view.found) {
      throw new Error("test fixture expected to be found");
    }
    view.value.project.name = "Renamed Project";
    view.value.project.summary = "A brand new summary.";
    getProjectDetailView.mockReturnValue(view);
    getProfileView.mockReturnValue(profileView());
    const { generateMetadata } = await import("./page.js");

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "alpha-project" }),
    });

    expect(metadata.title).toContain("Renamed Project");
    expect(metadata.description).toBe("A brand new summary.");
  });

  it("sets Open Graph and Twitter card fields matching this route's own title/description, with og:type article (#38)", async () => {
    getProjectDetailView.mockReturnValue(foundView());
    getProfileView.mockReturnValue(profileView());
    const { generateMetadata } = await import("./page.js");

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "alpha-project" }),
    });

    expect(metadata.openGraph?.title).toBe(metadata.title);
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.openGraph?.url).toContain("/projects/alpha-project");
    expect(metadata.openGraph).toMatchObject({ type: "article" });
  });

  it("points og:image/twitter:image at this project's own opengraph-image route, not the site default (regression: setting an explicit openGraph object used to silently drop the image)", async () => {
    getProjectDetailView.mockReturnValue(foundView());
    getProfileView.mockReturnValue(profileView());
    const { generateMetadata } = await import("./page.js");

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "alpha-project" }),
    });

    expect(metadata.openGraph?.images).toEqual([
      expect.stringContaining("/projects/alpha-project/opengraph-image"),
    ]);
    expect(metadata.twitter?.images).toEqual([
      expect.stringContaining("/projects/alpha-project/opengraph-image"),
    ]);
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: metadata.title,
      description: metadata.description,
    });
  });

  it("returns empty metadata for an unknown slug rather than throwing", async () => {
    getProjectDetailView.mockReturnValue({ found: false, slug: "unknown-project" });
    getProfileView.mockReturnValue(profileView());
    const { generateMetadata } = await import("./page.js");

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "unknown-project" }),
    });

    expect(metadata).toEqual({});
  });
});

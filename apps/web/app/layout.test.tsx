import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileView } from "../src/lib/content";
import RootLayout from "./layout.js";

const { getProfileView, getWritingListView, getCvView } = vi.hoisted(() => ({
  getProfileView: vi.fn(),
  getWritingListView: vi.fn(() => ({ items: [], citations: [] })),
  // Stubbed with a fixed default so every existing test (which only sets
  // up `getProfileView`) doesn't need touching — `SiteHeader`'s "Download
  // CV" link (#35) reads this the same way it reads the profile.
  getCvView: vi.fn(() => ({ filename: "fixture-cv.pdf" })),
}));
vi.mock("../src/lib/content", () => ({ getProfileView, getWritingListView, getCvView }));

const { getSiteUrl, getRobotsIndexable } = vi.hoisted(() => ({
  getSiteUrl: vi.fn(),
  getRobotsIndexable: vi.fn(),
}));
vi.mock("../src/lib/config/site-url", () => ({ getSiteUrl, getRobotsIndexable }));

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

describe("generateMetadata", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("builds the default title and description from the profile view", async () => {
    getProfileView.mockReturnValue(profileView());
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getRobotsIndexable.mockReturnValue(true);
    const { generateMetadata } = await import("./layout.js");

    const metadata = generateMetadata();

    expect(metadata.title).toEqual({
      default: "Ada Fixture — Fixture Engineer",
      template: "%s | Ada Fixture",
    });
    expect(metadata.description).toBe("A fixture summary of Ada.");
  });

  it("sets metadataBase from the configured site URL, so relative canonical/OG URLs resolve against it", async () => {
    getProfileView.mockReturnValue(profileView());
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getRobotsIndexable.mockReturnValue(true);
    const { generateMetadata } = await import("./layout.js");

    const metadata = generateMetadata();

    expect(metadata.metadataBase?.toString()).toBe("https://stub-deploy.example.com/");
  });

  it("emits an indexable robots directive on a production deploy", async () => {
    getProfileView.mockReturnValue(profileView());
    getSiteUrl.mockReturnValue("https://hire-me-mcp-web.vercel.app");
    getRobotsIndexable.mockReturnValue(true);
    const { generateMetadata } = await import("./layout.js");

    const metadata = generateMetadata();

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it("emits a noindex robots directive on a non-production deploy", async () => {
    getProfileView.mockReturnValue(profileView());
    getSiteUrl.mockReturnValue("https://preview-abc.vercel.app");
    getRobotsIndexable.mockReturnValue(false);
    const { generateMetadata } = await import("./layout.js");

    const metadata = generateMetadata();

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("changing the stub profile changes the emitted title, description and OG site name", async () => {
    const view = profileView();
    view.profile.name = "Changed Name";
    view.profile.headline = "Changed Headline";
    view.profile.summary = "Changed summary.";
    getProfileView.mockReturnValue(view);
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getRobotsIndexable.mockReturnValue(true);
    const { generateMetadata } = await import("./layout.js");

    const metadata = generateMetadata();

    expect(metadata.title).toEqual({
      default: "Changed Name — Changed Headline",
      template: "%s | Changed Name",
    });
    expect(metadata.description).toBe("Changed summary.");
    expect(metadata.openGraph?.siteName).toBe("Changed Name");
  });
});

describe("RootLayout", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a skip link as the first focusable element", () => {
    render(<RootLayout>{<p>page content</p>}</RootLayout>);
    const skipLink = screen.getByRole("link", { name: /skip to main content/i });
    expect(skipLink).toBeDefined();
  });

  it("renders header, main and footer landmarks", () => {
    render(<RootLayout>{<p>page content</p>}</RootLayout>);
    expect(screen.getByRole("banner")).toBeDefined();
    expect(screen.getByRole("main")).toBeDefined();
    expect(screen.getByRole("contentinfo")).toBeDefined();
  });

  it("renders children inside the main landmark, associated with the skip link target", () => {
    render(<RootLayout>{<p>page content</p>}</RootLayout>);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(screen.getByText("page content").closest("main")).toBe(main);
  });

  it("renders the theme toggle in the header", () => {
    render(<RootLayout>{<p>page content</p>}</RootLayout>);
    expect(screen.getByRole("button", { name: /theme/i })).toBeDefined();
  });

  it("renders the chat widget launcher, reachable from every page", () => {
    render(<RootLayout>{<p>page content</p>}</RootLayout>);
    expect(screen.getByRole("button", { name: /ask about marcos/i })).toBeDefined();
  });

  it("links to /llms.txt as an alternate text/markdown representation, on every page (#37)", () => {
    render(<RootLayout>{<p>page content</p>}</RootLayout>);
    const link = document.querySelector('link[rel="alternate"][type="text/markdown"]');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "/llms.txt");
  });

  it("mounts SiteAnalytics on every page (#81), which loads Vercel Analytics only on a genuine production deploy", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();
    const analyticsSpy = vi.fn(() => null);
    vi.doMock("@vercel/analytics/next", () => ({ Analytics: analyticsSpy }));
    const { default: FreshRootLayout } = await import("./layout.js");

    render(<FreshRootLayout>{<p>page content</p>}</FreshRootLayout>);

    expect(analyticsSpy).toHaveBeenCalledTimes(1);

    vi.doUnmock("@vercel/analytics/next");
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

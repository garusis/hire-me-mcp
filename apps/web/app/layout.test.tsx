import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileView } from "../src/lib/content";
import RootLayout from "./layout.js";

const { getProfileView, getWritingListView, getCvView, listStoryParents } = vi.hoisted(() => ({
  getProfileView: vi.fn(),
  getWritingListView: vi.fn(() => ({ items: [], citations: [] })),
  // Stubbed with a fixed default so every existing test (which only sets
  // up `getProfileView`) doesn't need touching — `SiteHeader`'s "Download
  // CV" link (#35) reads this the same way it reads the profile.
  getCvView: vi.fn(() => ({ filename: "fixture-cv.pdf" })),
  // #295, epic #288: the story -> primary-experience lookup ChatWidget needs
  // to resolve a story citation's href to something other than the generic
  // `/experience` fallback.
  listStoryParents: vi.fn(() => [{ storyId: "fixture-story", experienceId: "fixture-role" }]),
}));
vi.mock("../src/lib/content", () => ({
  getProfileView,
  getWritingListView,
  getCvView,
  listStoryParents,
}));

const { getSiteUrl, getRobotsIndexable } = vi.hoisted(() => ({
  getSiteUrl: vi.fn(),
  getRobotsIndexable: vi.fn(),
}));
vi.mock("../src/lib/config/site-url", () => ({ getSiteUrl, getRobotsIndexable }));

const { getRequestNonce } = vi.hoisted(() => ({
  getRequestNonce: vi.fn(async () => "test-nonce-value"),
}));
vi.mock("../src/lib/security/get-request-nonce", () => ({ getRequestNonce }));

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

  it("prefers the profile's purpose-written shortSummary for description and social cards (issue 236)", async () => {
    const view = profileView();
    view.profile.shortSummary = "A short, share-sized fixture summary.";
    getProfileView.mockReturnValue(view);
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getRobotsIndexable.mockReturnValue(true);
    const { generateMetadata } = await import("./layout.js");

    const metadata = generateMetadata();

    expect(metadata.description).toBe("A short, share-sized fixture summary.");
    expect(metadata.openGraph?.description).toBe("A short, share-sized fixture summary.");
    expect(metadata.twitter?.description).toBe("A short, share-sized fixture summary.");
  });

  it("carries the headline into og:title/twitter:title — a share preview titled with more than a bare name (issue 236)", async () => {
    getProfileView.mockReturnValue(profileView());
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getRobotsIndexable.mockReturnValue(true);
    const { generateMetadata } = await import("./layout.js");

    const metadata = generateMetadata();

    expect(metadata.openGraph?.title).toBe("Ada Fixture — Fixture Engineer");
    expect(metadata.twitter?.title).toBe("Ada Fixture — Fixture Engineer");
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

  it("renders a skip link as the first focusable element", async () => {
    render(await RootLayout({ children: <p>page content</p> }));
    const skipLink = screen.getByRole("link", { name: /skip to main content/i });
    expect(skipLink).toBeDefined();
  });

  it("renders header, main and footer landmarks", async () => {
    render(await RootLayout({ children: <p>page content</p> }));
    expect(screen.getByRole("banner")).toBeDefined();
    expect(screen.getByRole("main")).toBeDefined();
    expect(screen.getByRole("contentinfo")).toBeDefined();
  });

  it("renders children inside the main landmark, associated with the skip link target", async () => {
    render(await RootLayout({ children: <p>page content</p> }));
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(screen.getByText("page content").closest("main")).toBe(main);
  });

  it("renders the theme toggle in the header", async () => {
    render(await RootLayout({ children: <p>page content</p> }));
    expect(screen.getByRole("button", { name: /theme/i })).toBeDefined();
  });

  it("renders the chat widget launcher, reachable from every page", async () => {
    render(await RootLayout({ children: <p>page content</p> }));
    expect(screen.getByRole("button", { name: /ask about marcos/i })).toBeDefined();
  });

  // #295, epic #288: the site has no story page, so a story citation's
  // clickable URL depends on this parent lookup reaching ChatWidget — a
  // regression here would silently degrade every story citation back to the
  // generic `/experience` fallback.
  it("reads listStoryParents and passes it through to the chat widget (#295)", async () => {
    vi.resetModules();
    const chatWidgetSpy = vi.fn(() => null);
    vi.doMock("./chat/chat-widget", () => ({ ChatWidget: chatWidgetSpy }));
    const { default: FreshRootLayout } = await import("./layout.js");

    render(await FreshRootLayout({ children: <p>page content</p> }));

    expect(listStoryParents).toHaveBeenCalled();
    expect(chatWidgetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        storyParents: [{ storyId: "fixture-story", experienceId: "fixture-role" }],
      }),
      undefined,
    );

    vi.doUnmock("./chat/chat-widget");
    vi.resetModules();
  });

  it("links to /llms.txt as an alternate text/markdown representation, on every page (#37)", async () => {
    render(await RootLayout({ children: <p>page content</p> }));
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

    render(await FreshRootLayout({ children: <p>page content</p> }));

    expect(analyticsSpy).toHaveBeenCalledTimes(1);

    vi.doUnmock("@vercel/analytics/next");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("passes the request's CSP nonce (#42) to the inline theme script, so it's permitted under the nonce-scoped policy", async () => {
    // `next/script`'s `beforeInteractive` strategy renders nothing under a
    // plain client render (it relies on Next's own document-build pipeline
    // to have already inserted the tag) — stubbed here with a plain
    // `<script>` so the `nonce` prop RootLayout passes through is
    // inspectable, the same `vi.doMock` + fresh-import pattern the
    // SiteAnalytics test above uses.
    vi.resetModules();
    vi.doMock("next/script", () => ({
      default: (props: Record<string, unknown>) => <script {...props} />,
    }));
    const { default: FreshRootLayout } = await import("./layout.js");

    render(await FreshRootLayout({ children: <p>page content</p> }));

    const themeScript = document.getElementById("theme-script");
    expect(themeScript).toHaveAttribute("nonce", "test-nonce-value");

    vi.doUnmock("next/script");
    vi.resetModules();
  });
});

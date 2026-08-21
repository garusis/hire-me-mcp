import { describe, expect, it } from "vitest";
import { buildPageMetadata } from "./page-metadata";

const SITE_URL = "https://stub-deploy.example.com";

describe("buildPageMetadata", () => {
  it("sets title, description and canonical from the given input", () => {
    const metadata = buildPageMetadata(
      { title: "Experience", description: "A stub description.", path: "/experience" },
      SITE_URL,
    );

    expect(metadata.title).toBe("Experience");
    expect(metadata.description).toBe("A stub description.");
    expect(metadata.alternates).toEqual({ canonical: "/experience" });
  });

  it("sets a matching Open Graph title/description/url/type, defaulting type to website", () => {
    const metadata = buildPageMetadata(
      { title: "Experience", description: "A stub description.", path: "/experience" },
      SITE_URL,
    );

    expect(metadata.openGraph).toMatchObject({
      title: "Experience",
      description: "A stub description.",
      url: `${SITE_URL}/experience`,
      type: "website",
    });
  });

  it("allows overriding og:type, e.g. to article for a detail page", () => {
    const metadata = buildPageMetadata(
      {
        title: "Some Article",
        description: "A stub description.",
        path: "/writing/some-article",
        type: "article",
      },
      SITE_URL,
    );

    expect(metadata.openGraph).toMatchObject({ type: "article" });
  });

  it("sets a summary_large_image Twitter card with the same title/description", () => {
    const metadata = buildPageMetadata(
      { title: "Experience", description: "A stub description.", path: "/experience" },
      SITE_URL,
    );

    expect(metadata.twitter).toEqual({
      card: "summary_large_image",
      title: "Experience",
      description: "A stub description.",
    });
  });

  it("defaults siteUrl to getSiteUrl() when not given explicitly", () => {
    const metadata = buildPageMetadata({
      title: "Experience",
      description: "A stub description.",
      path: "/experience",
    });

    expect(metadata.openGraph?.url).toMatch(/^https?:\/\/.*\/experience$/);
  });
});

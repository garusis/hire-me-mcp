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

  it("sets a summary_large_image Twitter card with the same title/description/image", () => {
    const metadata = buildPageMetadata(
      { title: "Experience", description: "A stub description.", path: "/experience" },
      SITE_URL,
    );

    expect(metadata.twitter).toEqual({
      card: "summary_large_image",
      title: "Experience",
      description: "A stub description.",
      images: [`${SITE_URL}/opengraph-image`],
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

  it("defaults og:image to the site's default OG image endpoint, so a route without its own opengraph-image.tsx still carries an image (regression: #38's per-route openGraph object silently dropped the image Next would otherwise inherit from app/opengraph-image.tsx)", () => {
    const metadata = buildPageMetadata(
      { title: "Experience", description: "A stub description.", path: "/experience" },
      SITE_URL,
    );

    expect(metadata.openGraph).toMatchObject({
      images: [`${SITE_URL}/opengraph-image`],
    });
  });

  it("allows overriding the OG image, e.g. to a route's own per-entity opengraph-image.tsx URL", () => {
    const metadata = buildPageMetadata(
      {
        title: "Some Article",
        description: "A stub description.",
        path: "/writing/some-article",
        type: "article",
        image: "/writing/some-article/opengraph-image",
      },
      SITE_URL,
    );

    expect(metadata.openGraph).toMatchObject({
      images: [`${SITE_URL}/writing/some-article/opengraph-image`],
    });
  });
});

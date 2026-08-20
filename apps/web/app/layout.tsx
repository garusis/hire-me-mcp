import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { getRobotsIndexable, getSiteUrl } from "../src/lib/config/site-url";
import { getProfileView } from "../src/lib/content";
import { COLOR_BG_DARK, COLOR_BG_LIGHT } from "../src/lib/seo/site-colors";
import { SiteFooter } from "./design-system/layout/site-footer";
import { SiteHeader } from "./design-system/layout/site-header";
import { MAIN_CONTENT_ID, SkipLink } from "./design-system/layout/skip-link";
import { buildThemeScript } from "./design-system/theme/resolve-theme";
import { bodyFont, displayFont, monoFont } from "./fonts";
import "./globals.css";

/**
 * Site-wide metadata defaults (#44): site name, title template, description
 * and Open Graph `siteName` all come from the profile view — the content
 * layer's own "who is this" record — rather than a hand-written string, so
 * they can't drift from `packages/career-data`. Every route below overrides
 * `title`/`description` with its own `generateMetadata`; anything it
 * doesn't override (icons, `themeColor`, `metadataBase`, the default
 * `robots` directive) falls back to what's set here.
 *
 * `robots` reflects `getRobotsIndexable()` — production deploys are
 * indexable, every preview deploy and local dev emit `noindex, nofollow` so
 * a preview can never be indexed alongside (or instead of) production.
 */
export function generateMetadata(): Metadata {
  const { profile } = getProfileView();
  const siteUrl = getSiteUrl();
  const indexable = getRobotsIndexable();

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: `${profile.name} — ${profile.headline}`,
      template: `%s | ${profile.name}`,
    },
    description: profile.summary,
    applicationName: profile.name,
    icons: {
      icon: "/icon",
      apple: "/apple-icon",
    },
    manifest: "/manifest.webmanifest",
    robots: {
      index: indexable,
      follow: indexable,
    },
    openGraph: {
      type: "website",
      siteName: profile.name,
      title: profile.name,
      description: profile.summary,
      locale: "en_US",
      url: siteUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: profile.name,
      description: profile.summary,
    },
  };
}

/** `themeColor` per the App Router's `generateViewport` convention (Metadata's own `themeColor` field is deprecated). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: COLOR_BG_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: COLOR_BG_DARK },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
      <body className={bodyFont.className}>
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static, build-authored script (buildThemeScript) with no user input — required for the beforeInteractive theme-flash guard.
          dangerouslySetInnerHTML={{ __html: buildThemeScript() }}
        />
        <SkipLink />
        <SiteHeader />
        <main id={MAIN_CONTENT_ID}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

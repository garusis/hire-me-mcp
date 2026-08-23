import type { Metadata } from "next";
import { getProfileView } from "../../src/lib/content";
import { buildPageMetadata } from "../../src/lib/seo/page-metadata";
import { Container } from "../design-system/primitives/container";
import { Heading } from "../design-system/primitives/heading";
import { Link } from "../design-system/primitives/link";
import { Prose } from "../design-system/primitives/prose";
import { Section } from "../design-system/primitives/section";
import { buildPrivacyContent } from "./privacy-content";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: "Privacy",
    description:
      "What usage data this site collects, what it never collects, how long it's kept, and the third-party services involved.",
    path: "/privacy",
  });
}

/**
 * The public privacy note (#81) — a stable, indexable URL (unlike the
 * private `/api/stats` route, which is `noindex` and gated) describing the
 * anonymized usage-analytics pipeline (#79) and Vercel Analytics
 * honestly: what's collected, what never is, the retention window, and
 * the third-party services involved. Every number and list here comes
 * from `buildPrivacyContent()` (`privacy-content.ts`), which in turn reads
 * directly from `@hire-me-mcp/core/analytics`'s exported metadata — see
 * `privacy-content.test.ts` for the drift test binding the two together.
 *
 * The site has no contact/write tools (all cut per epic #8's scope) — "how
 * to reach Marcos" below reuses the same public contact links the rest of
 * the site already surfaces (`profile.contacts`, e.g. the JSON-LD
 * `sameAs` list), not a new mechanism.
 */
export default function PrivacyPage() {
  const { profile } = getProfileView();
  const content = buildPrivacyContent();

  return (
    <Section aria-labelledby="privacy-heading">
      <Container>
        <Heading level={1} id="privacy-heading">
          Privacy
        </Heading>
        <Prose>
          <p>
            This page describes, honestly and completely, the usage data this site collects: an
            anonymized, aggregate-only pipeline for tool calls and chat questions, and page-level
            analytics for the site itself. Nothing here is public — see the sections below for
            exactly what is and isn't stored.
          </p>

          <h2>What's collected</h2>
          <ul>
            {content.collected.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2>What's never collected</h2>
          <ul>
            {content.neverCollected.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2>Retention</h2>
          <p>
            Every usage event is deleted after {content.retentionDays} days. Nothing is kept longer.
          </p>

          <h2>Tracking cookies</h2>
          <p>{content.noTrackingCookiesStatement}</p>

          <h2>Third-party services</h2>
          <ul>
            {content.thirdPartyServices.map((service) => (
              <li key={service.name}>
                <strong>{service.name}</strong> — {service.purpose}
              </li>
            ))}
          </ul>

          <h2>Questions</h2>
          <p>
            This site has no contact form or write tools — reach {profile.name} through the same
            public links used elsewhere on the site:
          </p>
          <ul>
            {profile.contacts.map((contact) => (
              <li key={contact.url}>
                <Link href={contact.url}>{contact.label}</Link>
              </li>
            ))}
          </ul>
        </Prose>
      </Container>
    </Section>
  );
}

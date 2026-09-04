import { getCvView, getWritingListView } from "../../../src/lib/content";
import { Container } from "../primitives/container";
import { Link } from "../primitives/link";
import { ThemeToggle } from "../theme/theme-toggle";
import styles from "./site-header.module.css";
import { SiteNavLink } from "./site-nav-link";

/**
 * Site-wide header landmark: brand link, primary navigation and the theme
 * toggle. Compact (<=64px), single row at every width — nav becomes a
 * horizontally scrollable row on narrow viewports rather than wrapping
 * (issue 308) — with a quiet nav that marks the active route via
 * `SiteNavLink`.
 *
 * The "Download CV" link (#35) points at `/cv/<filename>.pdf` where
 * `<filename>` is `getCvView()`'s own deterministic, profile-name-derived
 * filename — never a literal here, so it can't drift from what `pnpm
 * generate:cv` actually writes to `public/cv/`.
 */
export function SiteHeader() {
  const { filename } = getCvView();
  // issue 233 — Writing is promoted in the primary nav only once something is
  // actually published there. The route itself stays live (its honest
  // empty state remains reachable by URL); what's removed is the promise.
  const hasWriting = getWritingListView().items.length > 0;

  return (
    <header className={styles.header}>
      <Container as="div" className={styles.inner}>
        <Link href="/" className={styles.brand} variant="quiet">
          hire-me-mcp
        </Link>
        <nav aria-label="Primary" className={styles.nav}>
          <SiteNavLink href="/">Home</SiteNavLink>
          <SiteNavLink href="/experience">Experience</SiteNavLink>
          <SiteNavLink href="/projects">Projects</SiteNavLink>
          <SiteNavLink href="/skills">Skills</SiteNavLink>
          {hasWriting ? <SiteNavLink href="/writing">Writing</SiteNavLink> : null}
          <SiteNavLink href="/recommendations">Recommendations</SiteNavLink>
          <Link href={`/cv/${filename}`} variant="quiet" className={styles.navLink}>
            Download CV
          </Link>
        </nav>
        <ThemeToggle />
      </Container>
    </header>
  );
}

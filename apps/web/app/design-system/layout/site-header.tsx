import { getCvView } from "../../../src/lib/content";
import { Container } from "../primitives/container";
import { Link } from "../primitives/link";
import { ThemeToggle } from "../theme/theme-toggle";
import styles from "./site-header.module.css";

/**
 * Site-wide header landmark: brand link, primary navigation and the theme
 * toggle. Real navigation entries (project/case-study pages) land with the
 * page tasks in this epic — this scaffolds the structure only.
 *
 * The "Download CV" link (#35) points at `/cv/<filename>.pdf` where
 * `<filename>` is `getCvView()`'s own deterministic, profile-name-derived
 * filename — never a literal here, so it can't drift from what `pnpm
 * generate:cv` actually writes to `public/cv/`.
 */
export function SiteHeader() {
  const { filename } = getCvView();

  return (
    <header className={styles.header}>
      <Container as="div" className={styles.inner}>
        <Link href="/" className={styles.brand}>
          hire-me-mcp
        </Link>
        <nav aria-label="Primary" className={styles.nav}>
          <Link href="/">Home</Link>
          <Link href="/experience">Experience</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/skills">Skills</Link>
          <Link href="/writing">Writing</Link>
          <Link href="/recommendations">Recommendations</Link>
          <Link href={`/cv/${filename}`}>Download CV</Link>
        </nav>
        <ThemeToggle />
      </Container>
    </header>
  );
}

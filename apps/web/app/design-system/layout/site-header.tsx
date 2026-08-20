import { Container } from "../primitives/container";
import { Link } from "../primitives/link";
import { ThemeToggle } from "../theme/theme-toggle";
import styles from "./site-header.module.css";

/**
 * Site-wide header landmark: brand link, primary navigation and the theme
 * toggle. Real navigation entries (project/case-study pages) land with the
 * page tasks in this epic — this scaffolds the structure only.
 */
export function SiteHeader() {
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
        </nav>
        <ThemeToggle />
      </Container>
    </header>
  );
}

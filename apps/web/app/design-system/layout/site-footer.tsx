import { Container } from "../primitives/container";
import { Link } from "../primitives/link";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <Container as="div" className={styles.inner}>
        <p className="tabular-nums">© {year} hire-me-mcp</p>
        {/*
          Curated MCP-agent entry point (#37) — see also the head's
          `<link rel="alternate">`. Muted-ink treatment, not the default
          accent link color: see site-footer.module.css's `.mutedLink` for
          the contrast rationale.
        */}
        <Link href="/llms.txt" className={styles.mutedLink}>
          llms.txt
        </Link>
        {/* The public privacy note (#81) — what usage data this site collects, what it never does, and for how long. */}
        <Link href="/privacy" className={styles.mutedLink}>
          Privacy
        </Link>
      </Container>
    </footer>
  );
}

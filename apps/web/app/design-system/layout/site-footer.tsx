import { Container } from "../primitives/container";
import { Link } from "../primitives/link";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <Container as="div" className={styles.inner}>
        <p className="tabular-nums">© {year} hire-me-mcp</p>
        {/* Curated MCP-agent entry point (#37) — see also the head's `<link rel="alternate">`. */}
        <Link href="/llms.txt">llms.txt</Link>
      </Container>
    </footer>
  );
}

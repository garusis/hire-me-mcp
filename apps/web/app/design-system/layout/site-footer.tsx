import { Container } from "../primitives/container";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <Container as="div" className={styles.inner}>
        <p className="tabular-nums">© {year} hire-me-mcp</p>
      </Container>
    </footer>
  );
}

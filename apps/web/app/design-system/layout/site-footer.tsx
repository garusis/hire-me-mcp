import { getProfileView } from "../../../src/lib/content";
import { Container } from "../primitives/container";
import { Link } from "../primitives/link";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  const year = new Date().getFullYear();
  // issue 228 — the profile's public contact surface (Email / GitHub / LinkedIn),
  // straight from the content layer, so a recruiter reaches them from any
  // page instead of only from /privacy. Same list `get-profile` and the CV
  // PDF already publish — nothing new is exposed here.
  const { profile } = getProfileView();

  return (
    <footer className={styles.footer}>
      <Container as="div" className={styles.inner}>
        <p className="tabular-nums">© {year} hire-me-mcp</p>
        <nav aria-label="Contact and profiles" className={styles.linkRow}>
          {profile.contacts.map((contact) => (
            <Link key={contact.url} href={contact.url} className={styles.mutedLink}>
              {contact.label}
            </Link>
          ))}
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
        </nav>
      </Container>
    </footer>
  );
}

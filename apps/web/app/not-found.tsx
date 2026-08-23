import { Button } from "./design-system/primitives/button";
import { Container } from "./design-system/primitives/container";
import { Heading } from "./design-system/primitives/heading";
import { Prose } from "./design-system/primitives/prose";
import { Section } from "./design-system/primitives/section";
import styles from "./not-found.module.css";

/**
 * App Router's `not-found` convention — rendered for any unmatched route
 * (a bad `/projects/[slug]`, `/writing/[slug]`, or any other unknown path)
 * and for an explicit `notFound()` call from within a page.
 *
 * A custom page, not Next's built-in default 404 (#42): the default page
 * styles itself with inline `style` attributes and a `<style>` tag, both
 * blocked outright by this app's nonce-scoped CSP (no `unsafe-inline` in
 * `style-src`) — confirmed via `apps/web/e2e/security-headers.smoke.spec.ts`'s
 * page walk, which is what surfaced this. Building this app's own 404 with
 * the same CSS-Modules-based design-system primitives every other page
 * uses removes the violation at the source (the fix the issue asks for)
 * and, as a side effect, replaces Next's generic unstyled page with one
 * that matches the rest of the site.
 */
export default function NotFoundPage() {
  return (
    <Section aria-labelledby="not-found-heading">
      <Container className={styles.wrapper}>
        <p className={styles.eyebrow}>404</p>
        <Heading level={1} id="not-found-heading">
          Page not found
        </Heading>
        <Prose>
          <p>That page doesn&apos;t exist, or it moved. Everything else is still here.</p>
        </Prose>
        <div className={styles.actions}>
          <Button href="/">Home</Button>
        </div>
      </Container>
    </Section>
  );
}

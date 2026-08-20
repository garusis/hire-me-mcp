import styles from "./skip-link.module.css";

export const MAIN_CONTENT_ID = "main-content";

/**
 * Visually hidden until focused — the first focusable element on the page,
 * so keyboard users can jump past the header navigation into `<main>`.
 */
export function SkipLink() {
  return (
    <a href={`#${MAIN_CONTENT_ID}`} className={styles.skipLink}>
      Skip to main content
    </a>
  );
}

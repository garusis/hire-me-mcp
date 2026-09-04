import NextLink from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./link.module.css";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
  /**
   * `default` — underlined, accent-colored prose link. `quiet` — no default
   * underline, `fg-muted` at rest and `fg` on hover; used by nav links,
   * which show the active route with an underline of their own instead
   * (issue 308).
   */
  variant?: "default" | "quiet";
}

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

/**
 * Matches a same-origin href that points at a static file (a downloadable
 * asset like the CV PDF, #35) rather than a Next.js page. Prefetching one
 * of these with `next/link`'s default behavior requests its RSC payload,
 * which 404s — a real console error caught by the preview e2e navigation
 * spec after the CV download link shipped in the site header.
 */
function isStaticFile(href: string): boolean {
  return /\.[a-z0-9]{2,5}$/i.test(href);
}

/**
 * A single link primitive for both internal (uses `next/link` for
 * client-side navigation) and external (plain `<a>`, opened in a new tab
 * with `rel="noopener noreferrer"` and a screen-reader-only hint) hrefs.
 */
export function Link({ href, className, children, variant = "default", ...rest }: LinkProps) {
  const external = isExternal(href);
  const classes = cx(styles.link, variant === "quiet" && styles.quiet, className);

  if (external) {
    return (
      <a href={href} className={classes} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    );
  }

  return (
    <NextLink
      href={href}
      className={classes}
      prefetch={isStaticFile(href) ? false : undefined}
      {...rest}
    >
      {children}
    </NextLink>
  );
}

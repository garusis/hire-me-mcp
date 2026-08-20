import NextLink from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./link.module.css";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

/**
 * A single link primitive for both internal (uses `next/link` for
 * client-side navigation) and external (plain `<a>`, opened in a new tab
 * with `rel="noopener noreferrer"` and a screen-reader-only hint) hrefs.
 */
export function Link({ href, className, children, ...rest }: LinkProps) {
  const external = isExternal(href);
  const classes = cx(styles.link, className);

  if (external) {
    return (
      <a href={href} className={classes} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    );
  }

  return (
    <NextLink href={href} className={classes} {...rest}>
      {children}
    </NextLink>
  );
}

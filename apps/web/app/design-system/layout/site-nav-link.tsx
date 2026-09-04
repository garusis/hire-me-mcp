"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Link } from "../primitives/link";
import styles from "./site-header.module.css";

export interface SiteNavLinkProps {
  href: string;
  children: ReactNode;
}

/**
 * A primary-nav entry: quiet (no default underline) like every nav link,
 * with a 2px accent underline on the active route (issue 308). "Active"
 * requires an exact pathname match for "/" (otherwise every route would
 * mark Home active) and a prefix match for everything else, so a nested
 * route (e.g. a project detail page under /projects) still marks its
 * section's nav entry.
 */
export function SiteNavLink({ href, children }: SiteNavLinkProps) {
  const pathname = usePathname();
  const isActive =
    href === "/" ? pathname === "/" : pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      variant="quiet"
      className={styles.navLink}
      aria-current={isActive ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

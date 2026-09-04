import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./badge.module.css";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * `neutral` — muted, sentence-case tag for metadata/filters (skills,
   * project tags, location). `status` — amber, reserved for status and the
   * flagship badge so it stays rare (issue 308).
   */
  variant?: "neutral" | "status";
  children: ReactNode;
}

/** Small inline label — tags, roles, status. */
export function Badge({ variant = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(styles.badge, variant === "status" ? styles.status : styles.neutral, className)}
      {...rest}
    >
      {children}
    </span>
  );
}

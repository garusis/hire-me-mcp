import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./badge.module.css";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "accent";
  children: ReactNode;
}

/** Small inline label — tags, roles, status. */
export function Badge({ variant = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(styles.badge, variant === "accent" ? styles.accent : styles.neutral, className)}
      {...rest}
    >
      {children}
    </span>
  );
}

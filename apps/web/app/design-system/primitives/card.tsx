import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./card.module.css";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** Tighter padding for dense, single-line entries (e.g. a Skills row). */
  compact?: boolean;
  children: ReactNode;
}

/** Elevated surface for grouping related content — e.g. a project or role. */
export function Card({
  as: Element = "div",
  compact = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Element className={cx(styles.card, compact && styles.compact, className)} {...rest}>
      {children}
    </Element>
  );
}

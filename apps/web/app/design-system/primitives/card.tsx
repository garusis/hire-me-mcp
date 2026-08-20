import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./card.module.css";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children: ReactNode;
}

/** Bordered, elevated surface for grouping related content — e.g. a project or role. */
export function Card({ as: Element = "div", className, children, ...rest }: CardProps) {
  return (
    <Element className={cx(styles.card, className)} {...rest}>
      {children}
    </Element>
  );
}

import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./container.module.css";

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children: ReactNode;
}

/**
 * Centers content and caps its width to a comfortable reading measure.
 * Server-component-friendly — no interactivity, purely structural.
 */
export function Container({ as: Element = "div", className, children, ...rest }: ContainerProps) {
  return (
    <Element className={cx(styles.container, className)} {...rest}>
      {children}
    </Element>
  );
}

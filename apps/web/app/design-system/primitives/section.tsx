import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./section.module.css";

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/** A `<section>` landmark with consistent vertical rhythm between page sections. */
export function Section({ className, children, ...rest }: SectionProps) {
  return (
    <section className={cx(styles.section, className)} {...rest}>
      {children}
    </section>
  );
}

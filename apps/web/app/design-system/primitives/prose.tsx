import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./prose.module.css";

export interface ProseProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Vertical rhythm and a comfortable measure for long-form body copy. */
export function Prose({ className, children, ...rest }: ProseProps) {
  return (
    <div className={cx(styles.prose, className)} {...rest}>
      {children}
    </div>
  );
}

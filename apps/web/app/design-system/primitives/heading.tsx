import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./heading.module.css";

type Level = 1 | 2 | 3 | 4 | 5 | 6;

const TAGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;
const SCALE = {
  1: styles.level1,
  2: styles.level2,
  3: styles.level3,
  4: styles.level4,
  5: styles.level5,
  6: styles.level6,
} as const;

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: Level;
  children: ReactNode;
}

/** Semantic heading (`h1`-`h6`) styled from the display type scale. */
export function Heading({ level = 2, className, children, ...rest }: HeadingProps) {
  const Tag = TAGS[level];
  return (
    <Tag className={cx(SCALE[level], className)} {...rest}>
      {children}
    </Tag>
  );
}

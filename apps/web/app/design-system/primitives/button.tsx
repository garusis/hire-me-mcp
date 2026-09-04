import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./button.module.css";
import { Link } from "./link";

type Variant = "solid" | "outline" | "ghost";

interface SharedProps {
  variant?: Variant;
  children: ReactNode;
}

export type ButtonProps =
  | (SharedProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
  | (SharedProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string });

/**
 * Presentational button/link primitive — no interactivity of its own, so it
 * stays server-component-friendly. Genuine event handlers (`onClick`) may
 * still be passed by a client-component caller (e.g. `CopyToClipboard`).
 */
export function Button({ variant = "solid", className, children, ...rest }: ButtonProps) {
  const classes = cx(
    styles.button,
    variant === "outline" ? styles.outline : variant === "ghost" ? styles.ghost : styles.solid,
    className,
  );

  if ("href" in rest && rest.href) {
    return (
      <Link
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string })}
        className={classes}
      >
        {children}
      </Link>
    );
  }

  const { type = "button", ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={classes} {...buttonRest}>
      {children}
    </button>
  );
}

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Link } from "./link.js";

describe("Link", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an internal link without target=_blank", () => {
    render(<Link href="/about">About</Link>);
    const anchor = screen.getByRole("link", { name: "About" });
    expect(anchor).toHaveAttribute("href", "/about");
    expect(anchor).not.toHaveAttribute("target");
  });

  it("marks an external link with rel=noopener, target=_blank and a screen-reader hint", () => {
    render(<Link href="https://example.com">Example</Link>);
    const anchor = screen.getByRole("link", { name: /Example/ });
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(/opens in a new tab/i)).toBeDefined();
  });

  it("has a visible focus style class for keyboard users", () => {
    render(<Link href="/about">About</Link>);
    expect(screen.getByRole("link", { name: "About" }).className).toMatch(/link/);
  });
});

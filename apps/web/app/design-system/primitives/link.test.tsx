import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Spies on the exact `prefetch` prop apps/web's <Link> passes through to
// next/link, without needing a real Next.js router context. Next's <Link>
// prefetches an internal href's RSC payload by default — which 404s for a
// plain public/ static asset like a PDF (confirmed on the #35 preview
// deploy: every page's site header logged that 404 as a console error).
const { NextLinkSpy } = vi.hoisted(() => ({ NextLinkSpy: vi.fn() }));
vi.mock("next/link", () => ({
  default: (props: { href: string; prefetch?: boolean; className?: string; children: unknown }) => {
    NextLinkSpy(props);
    return (
      <a href={props.href} className={props.className}>
        {props.children as never}
      </a>
    );
  },
}));

const { Link } = await import("./link.js");

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

  it("disables next/link prefetching for a same-origin static file href, e.g. a downloadable PDF (#35)", () => {
    render(<Link href="/cv/example-cv.pdf">Download CV</Link>);
    expect(NextLinkSpy).toHaveBeenCalledWith(
      expect.objectContaining({ href: "/cv/example-cv.pdf", prefetch: false }),
    );
  });

  it("still prefetches an ordinary internal page link normally", () => {
    render(<Link href="/about">About</Link>);
    const call = NextLinkSpy.mock.calls.at(-1)?.[0];
    expect(call?.prefetch).not.toBe(false);
  });
});

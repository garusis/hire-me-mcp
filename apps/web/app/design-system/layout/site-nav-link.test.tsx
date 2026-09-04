import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { SiteNavLink } = await import("./site-nav-link.js");

describe("SiteNavLink", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a quiet nav link with no aria-current when the route is not active", () => {
    usePathnameMock.mockReturnValue("/experience");
    render(<SiteNavLink href="/projects">Projects</SiteNavLink>);
    expect(screen.getByRole("link", { name: "Projects" })).not.toHaveAttribute("aria-current");
  });

  it("marks the current route active with aria-current=page", () => {
    usePathnameMock.mockReturnValue("/experience");
    render(<SiteNavLink href="/experience">Experience</SiteNavLink>);
    expect(screen.getByRole("link", { name: "Experience" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks the home route active only on an exact match, not for every route", () => {
    usePathnameMock.mockReturnValue("/experience");
    render(<SiteNavLink href="/">Home</SiteNavLink>);
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });
});

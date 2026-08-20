import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteHeader } from "./site-header.js";

describe("SiteHeader", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a header landmark containing navigation", () => {
    render(<SiteHeader />);
    const header = screen.getByRole("banner");
    expect(header.querySelector("nav")).not.toBeNull();
  });

  it("renders the theme toggle", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("button", { name: /theme/i })).toBeDefined();
  });

  it("labels the navigation for assistive tech", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeDefined();
  });

  it("adds Experience and Projects links to the primary navigation alongside Home", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav.querySelector('a[href="/"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/experience"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/projects"]')).not.toBeNull();
  });

  it("adds Skills and Writing links to the primary navigation alongside the rest", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav.querySelector('a[href="/skills"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/writing"]')).not.toBeNull();
  });
});

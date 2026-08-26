import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getWritingListView } from "../../../src/lib/content/index.js";
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

  it("adds a Skills link to the primary navigation alongside the rest", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav.querySelector('a[href="/skills"]')).not.toBeNull();
  });

  it("promotes Writing in the primary navigation only when something is published there (issue 233)", () => {
    // SiteHeader reads the real content layer; the nav entry must mirror
    // whether the writing dataset actually has entries, in either state.
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    const hasWriting = getWritingListView().items.length > 0;
    if (hasWriting) {
      expect(nav.querySelector('a[href="/writing"]')).not.toBeNull();
    } else {
      expect(nav.querySelector('a[href="/writing"]')).toBeNull();
    }
  });

  it("adds a Recommendations link to the primary navigation (#190)", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav.querySelector('a[href="/recommendations"]')).not.toBeNull();
  });

  it("adds a visible Download CV link pointing at the CV's stable, deterministic-filename URL (#35)", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    const cvLink = nav.querySelector('a[href^="/cv/"][href$=".pdf"]');
    expect(cvLink).not.toBeNull();
    expect(cvLink?.textContent).toMatch(/download cv/i);
  });
});

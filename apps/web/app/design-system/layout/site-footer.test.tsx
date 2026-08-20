import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer.js";

describe("SiteFooter", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a footer landmark", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toBeDefined();
  });

  it("shows the current year with tabular numerals", () => {
    render(<SiteFooter />);
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeDefined();
  });
});

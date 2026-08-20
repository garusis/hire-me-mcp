import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RootLayout from "./layout.js";

describe("RootLayout", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a skip link as the first focusable element", () => {
    render(<RootLayout>{<p>page content</p>}</RootLayout>);
    const skipLink = screen.getByRole("link", { name: /skip to main content/i });
    expect(skipLink).toBeDefined();
  });

  it("renders header, main and footer landmarks", () => {
    render(<RootLayout>{<p>page content</p>}</RootLayout>);
    expect(screen.getByRole("banner")).toBeDefined();
    expect(screen.getByRole("main")).toBeDefined();
    expect(screen.getByRole("contentinfo")).toBeDefined();
  });

  it("renders children inside the main landmark, associated with the skip link target", () => {
    render(<RootLayout>{<p>page content</p>}</RootLayout>);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(screen.getByText("page content").closest("main")).toBe(main);
  });

  it("renders the theme toggle in the header", () => {
    render(<RootLayout>{<p>page content</p>}</RootLayout>);
    expect(screen.getByRole("button", { name: /theme/i })).toBeDefined();
  });
});

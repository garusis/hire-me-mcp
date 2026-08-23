import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NotFoundPage from "./not-found";

describe("NotFoundPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a 404 heading, so a route not found is unambiguous to a visitor", () => {
    render(<NotFoundPage />);
    expect(screen.getByText(/404/i)).toBeInTheDocument();
  });

  it("says the page was not found in plain language", () => {
    render(<NotFoundPage />);
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });

  it("links back to the home page", () => {
    render(<NotFoundPage />);
    const homeLink = screen.getByRole("link", { name: /home/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("renders no inline style attribute or <style> tag (#42) — Next's own default 404 page does, which the nonce-scoped CSP blocks", () => {
    const { container } = render(<NotFoundPage />);
    expect(container.querySelectorAll("[style]")).toHaveLength(0);
    expect(container.querySelectorAll("style")).toHaveLength(0);
  });
});

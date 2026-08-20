import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RevealOnScroll } from "./reveal-on-scroll.js";

function stubMatchMedia(reducedMotion: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("RevealOnScroll", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders children with no animation classes or data attributes when reduced motion is preferred", () => {
    stubMatchMedia(true);
    render(
      <RevealOnScroll>
        <p>content</p>
      </RevealOnScroll>,
    );

    const wrapper = screen.getByText("content").parentElement as HTMLElement;
    expect(wrapper.className).toBe("");
    expect(wrapper.getAttribute("data-reveal")).toBeNull();
  });

  it("renders children in a hidden-until-revealed wrapper when motion is allowed", () => {
    stubMatchMedia(false);
    render(
      <RevealOnScroll>
        <p>content</p>
      </RevealOnScroll>,
    );

    const wrapper = screen.getByText("content").parentElement as HTMLElement;
    expect(wrapper.getAttribute("data-reveal")).toBe("pending");
  });
});

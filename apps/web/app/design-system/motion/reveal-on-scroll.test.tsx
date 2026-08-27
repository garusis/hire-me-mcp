import { act, cleanup, render, screen } from "@testing-library/react";
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

let restoreObserver: (() => void) | undefined;

/**
 * Replaces `IntersectionObserver` with a stub that hands the registered
 * callback back to the test, so a spec can drive the intersecting /
 * not-intersecting branches explicitly rather than relying on layout.
 */
function captureIntersectionObserver(): {
  emit: (isIntersecting: boolean) => void;
  disconnected: () => boolean;
} {
  let callback: IntersectionObserverCallback | undefined;
  let disconnected = false;
  const original = globalThis.IntersectionObserver;
  class CapturingObserver {
    constructor(cb: IntersectionObserverCallback) {
      callback = cb;
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      disconnected = true;
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver = CapturingObserver as unknown as typeof IntersectionObserver;
  window.IntersectionObserver = CapturingObserver as unknown as typeof IntersectionObserver;
  restoreObserver = () => {
    globalThis.IntersectionObserver = original;
    window.IntersectionObserver = original;
  };

  return {
    emit: (isIntersecting: boolean) => {
      if (!callback) {
        throw new Error("IntersectionObserver was never constructed");
      }
      act(() => {
        callback?.(
          [{ isIntersecting }] as unknown as IntersectionObserverEntry[],
          {
            disconnect: () => undefined,
          } as unknown as IntersectionObserver,
        );
      });
    },
    disconnected: () => disconnected,
  };
}

describe("RevealOnScroll", () => {
  afterEach(() => {
    cleanup();
    restoreObserver?.();
    restoreObserver = undefined;
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

  // Issue 273: the server-rendered markup (and the first client paint that
  // hydrates it) must never carry the hidden `pending` state — otherwise the
  // content is invisible until JS runs, and invisible forever without it.
  it("renders visible, with no hidden state, before the observer has reported anything", () => {
    stubMatchMedia(false);
    render(
      <RevealOnScroll>
        <p>content</p>
      </RevealOnScroll>,
    );

    const wrapper = screen.getByText("content").parentElement as HTMLElement;
    expect(wrapper.className).toBe("");
    expect(wrapper.getAttribute("data-reveal")).toBeNull();
  });

  it("never hides content that is already on screen — an intersecting wrapper goes straight to revealed", () => {
    stubMatchMedia(false);
    const observer = captureIntersectionObserver();
    render(
      <RevealOnScroll>
        <p>content</p>
      </RevealOnScroll>,
    );

    observer.emit(true);

    const wrapper = screen.getByText("content").parentElement as HTMLElement;
    expect(wrapper.getAttribute("data-reveal")).toBe("revealed");
    expect(observer.disconnected()).toBe(true);
  });

  it("hides an off-screen wrapper so it can animate in, then reveals it on intersection", () => {
    stubMatchMedia(false);
    const observer = captureIntersectionObserver();
    render(
      <RevealOnScroll>
        <p>content</p>
      </RevealOnScroll>,
    );

    observer.emit(false);
    const wrapper = screen.getByText("content").parentElement as HTMLElement;
    expect(wrapper.getAttribute("data-reveal")).toBe("pending");

    observer.emit(true);
    expect(wrapper.getAttribute("data-reveal")).toBe("revealed");
  });

  it("leaves content visible when the browser has no IntersectionObserver at all", () => {
    stubMatchMedia(false);
    const original = globalThis.IntersectionObserver;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    restoreObserver = () => {
      globalThis.IntersectionObserver = original;
    };

    render(
      <RevealOnScroll>
        <p>content</p>
      </RevealOnScroll>,
    );

    const wrapper = screen.getByText("content").parentElement as HTMLElement;
    expect(wrapper.getAttribute("data-reveal")).toBeNull();
  });
});

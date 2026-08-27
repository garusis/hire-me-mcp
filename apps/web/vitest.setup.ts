import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/**
 * Shared Vitest setup for apps/web.
 *
 * - Mocks `next/font/google` so component tests never hit the network: the
 *   real loader fetches font metadata/CSS from Google Fonts at build/import
 *   time, which is neither hermetic nor fast in a unit-test run. Every
 *   exported font factory returns a stable, inert shape (className,
 *   variable, style) that source files can assert against.
 * - Provides a default `window.matchMedia` implementation (happy-dom does
 *   not implement it) that reports "no match" for every query unless a test
 *   overrides it — theme/reduced-motion tests stub this per-case.
 * - Provides a minimal `IntersectionObserver` stub (happy-dom does not
 *   implement it) so motion primitives that observe visibility don't throw
 *   in the test environment; tests that need to simulate an intersection
 *   trigger the stored callback directly.
 */

vi.mock("next/font/google", () => {
  const makeFont =
    (name: string) =>
    (options: { variable?: string } = {}) => ({
      className: `mock-font-${name}`,
      style: { fontFamily: "mock" },
      variable: options.variable ?? `--font-${name}`,
    });

  return {
    Fraunces: makeFont("fraunces"),
    IBM_Plex_Sans: makeFont("ibm-plex-sans"),
    IBM_Plex_Mono: makeFont("ibm-plex-mono"),
  };
});

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  // Required by the newer `lib.dom.d.ts` TypeScript 7 bundles (the CSS
  // scroll-margin integration); 5.9's DOM lib did not declare it.
  readonly scrollMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(): void {
    // no-op: tests that need to simulate an intersection call the stored
    // callback via the instance they construct through a spy.
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

if (typeof window !== "undefined" && !window.IntersectionObserver) {
  window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}

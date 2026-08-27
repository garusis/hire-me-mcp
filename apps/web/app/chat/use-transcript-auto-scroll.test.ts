import { cleanup, render } from "@testing-library/react";
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPinnedToBottom,
  scrollTranscriptToBottom,
  TRANSCRIPT_PIN_THRESHOLD_PX,
  useTranscriptAutoScroll,
} from "./use-transcript-auto-scroll";

/**
 * `happy-dom` does not lay anything out, so scroll geometry is stubbed on the
 * element the hook is given — the same way the real container would report it.
 */
function stubGeometry(
  element: HTMLElement,
  geometry: { scrollHeight: number; clientHeight: number; scrollTop: number },
): void {
  Object.defineProperty(element, "scrollHeight", { value: geometry.scrollHeight, writable: true });
  Object.defineProperty(element, "clientHeight", { value: geometry.clientHeight, writable: true });
  element.scrollTop = geometry.scrollTop;
}

describe("isPinnedToBottom", () => {
  it("is pinned at the exact bottom", () => {
    const element = document.createElement("div");
    stubGeometry(element, { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 });
    expect(isPinnedToBottom(element)).toBe(true);
  });

  it("tolerates sub-threshold drift, which streaming and sub-pixel rounding both produce", () => {
    const element = document.createElement("div");
    stubGeometry(element, {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 600 - (TRANSCRIPT_PIN_THRESHOLD_PX - 1),
    });
    expect(isPinnedToBottom(element)).toBe(true);
  });

  it("is not pinned once the visitor has deliberately scrolled up", () => {
    const element = document.createElement("div");
    stubGeometry(element, { scrollHeight: 1000, clientHeight: 400, scrollTop: 100 });
    expect(isPinnedToBottom(element)).toBe(false);
  });
});

describe("scrollTranscriptToBottom", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("animates by default", () => {
    const element = document.createElement("div");
    stubGeometry(element, { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });
    const scrollTo = vi.fn();
    element.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
    vi.stubGlobal("matchMedia", () => ({ matches: false }));

    scrollTranscriptToBottom(element);

    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
  });

  it("jumps instantly for a visitor who asked for reduced motion", () => {
    const element = document.createElement("div");
    stubGeometry(element, { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });
    const scrollTo = vi.fn();
    element.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
    }));

    scrollTranscriptToBottom(element);

    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "auto" });
  });

  it("falls back to assigning scrollTop where scrollTo does not exist", () => {
    const element = document.createElement("div");
    stubGeometry(element, { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });
    Object.defineProperty(element, "scrollTo", { value: undefined, writable: true });

    scrollTranscriptToBottom(element);

    expect(element.scrollTop).toBe(1000);
  });
});

/** Mounts the hook over a container whose geometry the test controls. */
function renderHarness(initialKey: string) {
  const scrollTo = vi.fn();
  let followNow: () => void = () => undefined;
  let fireScroll: () => void = () => undefined;

  function Harness({ activityKey }: { activityKey: string }) {
    const transcript = useTranscriptAutoScroll(activityKey);
    followNow = transcript.followNow;
    fireScroll = transcript.onScroll;
    return createElement("div", {
      "data-testid": "log",
      ref: transcript.ref,
      onScroll: transcript.onScroll,
    });
  }

  const view = render(createElement(Harness, { activityKey: initialKey }));
  const element = view.getByTestId("log");
  stubGeometry(element, { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 });
  element.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
  scrollTo.mockClear();

  return {
    scrollTo,
    element,
    rerender: (activityKey: string) => view.rerender(createElement(Harness, { activityKey })),
    followNow: () => act(() => followNow()),
    fireScroll: () => act(() => fireScroll()),
  };
}

describe("useTranscriptAutoScroll", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("follows new activity while the visitor is at the bottom", () => {
    const harness = renderHarness("turn-1");
    harness.rerender("turn-2");
    expect(harness.scrollTo).toHaveBeenCalled();
  });

  // Issue 271's core symptom: the second question produced no visible change
  // at all, because the transcript never moved.
  it("keeps following through several turns, not only the first", () => {
    const harness = renderHarness("turn-1");
    harness.rerender("turn-2");
    harness.rerender("turn-3");
    harness.rerender("turn-4");
    expect(harness.scrollTo).toHaveBeenCalledTimes(3);
  });

  it("stops following once the visitor scrolls up to re-read", () => {
    const harness = renderHarness("turn-1");
    harness.element.scrollTop = 0;
    harness.fireScroll();

    harness.rerender("turn-2");

    expect(harness.scrollTo).not.toHaveBeenCalled();
  });

  it("resumes following when the visitor scrolls back to the bottom", () => {
    const harness = renderHarness("turn-1");
    harness.element.scrollTop = 0;
    harness.fireScroll();
    harness.element.scrollTop = 600;
    harness.fireScroll();

    harness.rerender("turn-2");

    expect(harness.scrollTo).toHaveBeenCalled();
  });

  it("re-pins on followNow, so submitting always shows the new turn", () => {
    const harness = renderHarness("turn-1");
    harness.element.scrollTop = 0;
    harness.fireScroll();

    harness.followNow();
    expect(harness.scrollTo).toHaveBeenCalledTimes(1);

    harness.rerender("turn-2");
    expect(harness.scrollTo).toHaveBeenCalledTimes(2);
  });
});

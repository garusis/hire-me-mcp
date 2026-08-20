import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyToClipboard } from "./copy-to-clipboard.js";

describe("CopyToClipboard", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders an accessible button with the given label", () => {
    render(<CopyToClipboard value="hello@example.com" label="Copy email" />);
    expect(screen.getByRole("button", { name: "Copy email" })).toBeDefined();
  });

  it("copies the value to the clipboard and shows a success state on click", async () => {
    render(<CopyToClipboard value="hello@example.com" label="Copy email" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello@example.com");
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();
  });

  it("reverts to the original label after the success state times out", async () => {
    render(<CopyToClipboard value="hello@example.com" label="Copy email" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    });
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole("button", { name: "Copy email" })).toBeDefined();
  });
});

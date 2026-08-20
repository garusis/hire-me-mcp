import { describe, expect, it } from "vitest";
import { size } from "./apple-icon";

describe("apple-icon", () => {
  it("declares the standard 180x180 Apple touch icon size", () => {
    expect(size).toEqual({ width: 180, height: 180 });
  });

  it("renders a PNG image response", async () => {
    const { default: AppleIcon } = await import("./apple-icon.js");
    const response = await AppleIcon();

    expect(response.headers.get("content-type")).toBe("image/png");
  });
});

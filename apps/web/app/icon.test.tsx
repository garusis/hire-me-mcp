import { describe, expect, it } from "vitest";
import { size } from "./icon";

describe("icon", () => {
  it("declares a square favicon size", () => {
    expect(size.width).toBe(size.height);
    expect(size.width).toBeGreaterThan(0);
  });

  it("renders a PNG image response", async () => {
    const { default: Icon } = await import("./icon.js");
    const response = await Icon();

    expect(response.headers.get("content-type")).toBe("image/png");
  });
});

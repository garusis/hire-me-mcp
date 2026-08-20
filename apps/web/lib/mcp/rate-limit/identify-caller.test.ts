import { describe, expect, it } from "vitest";
import { identifyCaller } from "./identify-caller";

describe("identifyCaller", () => {
  it("uses the first entry of x-forwarded-for when present", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5" });
    expect(identifyCaller(headers)).toBe("203.0.113.5");
  });

  it("takes only the first IP out of a comma-separated x-forwarded-for chain", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" });
    expect(identifyCaller(headers)).toBe("203.0.113.5");
  });

  it("trims whitespace around the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "  203.0.113.5  ,70.41.3.18" });
    expect(identifyCaller(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.23" });
    expect(identifyCaller(headers)).toBe("198.51.100.23");
  });

  it("prefers x-forwarded-for over x-real-ip when both are present", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.5",
      "x-real-ip": "198.51.100.23",
    });
    expect(identifyCaller(headers)).toBe("203.0.113.5");
  });

  it("falls back to a fixed 'unknown' identifier when neither header is present", () => {
    const headers = new Headers();
    expect(identifyCaller(headers)).toBe("unknown");
  });

  it("falls back to 'unknown' when x-forwarded-for is present but empty", () => {
    const headers = new Headers({ "x-forwarded-for": "" });
    expect(identifyCaller(headers)).toBe("unknown");
  });

  it("falls back to x-real-ip when x-forwarded-for is only whitespace/commas", () => {
    const headers = new Headers({ "x-forwarded-for": " , ", "x-real-ip": "198.51.100.23" });
    expect(identifyCaller(headers)).toBe("198.51.100.23");
  });
});

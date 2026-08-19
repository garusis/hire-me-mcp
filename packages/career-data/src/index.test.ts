import { describe, expect, it } from "vitest";
import { formatYearRange } from "./index.js";

describe("formatYearRange", () => {
  it("formats a closed range", () => {
    expect(formatYearRange(2019, 2021)).toBe("2019 – 2021");
  });

  it("formats an open-ended range as Present when end is omitted", () => {
    expect(formatYearRange(2021)).toBe("2021 – Present");
  });

  it("rejects a non-integer start year", () => {
    expect(() => formatYearRange(2019.5)).toThrow(RangeError);
  });

  it("rejects an end year before the start year", () => {
    expect(() => formatYearRange(2021, 2019)).toThrow(RangeError);
  });
});

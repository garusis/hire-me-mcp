import { describe, expect, it } from "vitest";
import {
  hasAllCapsFlood,
  hasLinkFlood,
  hasRepetitionFlood,
  hasSpamKeyword,
  honeypotFilled,
  isEmptyAfterTrim,
  isMostlyLinks,
} from "./heuristics.js";

const legitimateRecruiterMessage = `Hi there,

I came across your portfolio while researching senior full-stack engineers for a role on our
platform team. Your work on distributed systems and TypeScript tooling looks like a strong match
for what we're building this quarter.

Would you be open to a short call next week? Feel free to check out the role here:
https://example.com/careers/platform-engineer

Looking forward to hearing from you.

Best,
Alex
`;

describe("honeypotFilled", () => {
  it("fires when the honeypot field is non-empty", () => {
    expect(honeypotFilled({ honeypot: "http://spam.example.com" })).toBe(true);
  });

  it("does not fire for a legitimate empty honeypot", () => {
    expect(honeypotFilled({ honeypot: "" })).toBe(false);
  });
});

describe("hasLinkFlood", () => {
  it("fires when the message contains an excessive number of links", () => {
    const message = Array.from(
      { length: 6 },
      (_, i) => `https://spam-example-${i}.example.com`,
    ).join(" ");
    expect(hasLinkFlood(message)).toBe(true);
  });

  it("does not fire for a legitimate message with a single link", () => {
    expect(hasLinkFlood(legitimateRecruiterMessage)).toBe(false);
  });
});

describe("isMostlyLinks", () => {
  it("fires when links make up most of the message content", () => {
    const message = "https://spam.example.com/one https://spam.example.com/two check it out";
    expect(isMostlyLinks(message)).toBe(true);
  });

  it("does not fire for a legitimate multi-paragraph message with one link", () => {
    expect(isMostlyLinks(legitimateRecruiterMessage)).toBe(false);
  });
});

describe("hasRepetitionFlood", () => {
  it("fires on obvious single-character flooding", () => {
    expect(hasRepetitionFlood(`Check this out! ${"a".repeat(20)}`)).toBe(true);
  });

  it("fires on the same word repeated many times in a row", () => {
    expect(hasRepetitionFlood("buy buy buy buy buy buy now")).toBe(true);
  });

  it("does not fire for a legitimate message", () => {
    expect(hasRepetitionFlood(legitimateRecruiterMessage)).toBe(false);
  });
});

describe("hasAllCapsFlood", () => {
  it("fires when the message is mostly uppercase", () => {
    expect(hasAllCapsFlood("URGENT ACTION REQUIRED NOW TO CLAIM YOUR FREE PRIZE TODAY ONLY")).toBe(
      true,
    );
  });

  it("does not fire for a legitimate message", () => {
    expect(hasAllCapsFlood(legitimateRecruiterMessage)).toBe(false);
  });

  it("does not fire for a short message that happens to contain an acronym", () => {
    expect(hasAllCapsFlood("Hi, I saw your MCP project and loved it.")).toBe(false);
  });
});

describe("hasSpamKeyword", () => {
  it("fires when the message contains a classic spam phrase", () => {
    expect(hasSpamKeyword("Act now to claim your guaranteed income opportunity!")).toBe(true);
  });

  it("does not fire for a legitimate message", () => {
    expect(hasSpamKeyword(legitimateRecruiterMessage)).toBe(false);
  });
});

describe("isEmptyAfterTrim", () => {
  it("fires when a required field is whitespace-only", () => {
    expect(isEmptyAfterTrim({ name: "   ", contact: "jamie@example.com", message: "Hello" })).toBe(
      true,
    );
  });

  it("does not fire when every required field has real content", () => {
    expect(
      isEmptyAfterTrim({
        name: "Jamie Recruiter",
        contact: "jamie@example.com",
        message: "Hello there.",
      }),
    ).toBe(false);
  });
});

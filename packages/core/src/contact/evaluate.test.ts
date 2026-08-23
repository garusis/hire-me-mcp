import { describe, expect, it } from "vitest";
import { evaluateContactSubmission } from "./evaluate.js";
import { CONTACT_MESSAGE_MAX_LENGTH } from "./schema.js";

const validInput = {
  name: "Jamie Recruiter",
  contact: "jamie@example.com",
  message: "Hello, I would like to talk about an opportunity.",
};

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

describe("evaluateContactSubmission", () => {
  it("accepts a valid, non-spammy submission and returns the normalized submission", () => {
    const result = evaluateContactSubmission(validInput);

    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.submission).toEqual(validInput);
    }
  });

  it("accepts a realistic multi-paragraph recruiter message containing one legitimate link", () => {
    const result = evaluateContactSubmission({
      name: "Alex Sourcer",
      contact: "alex@example.com",
      context: "Sourced via portfolio site",
      message: legitimateRecruiterMessage,
    });

    expect(result.status).toBe("accepted");
  });

  it("rejects input that fails schema validation (missing required field) with reason invalid_input", () => {
    const { message: _message, ...rest } = validInput;
    const result = evaluateContactSubmission(rest);

    expect(result).toEqual({
      status: "rejected",
      reason: "invalid_input",
      detail: { firedHeuristics: [] },
    });
  });

  it("rejects a non-object input with reason invalid_input", () => {
    const result = evaluateContactSubmission("not an object");

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("invalid_input");
    }
  });

  it("rejects an oversized message with reason too_long, before any heuristic runs", () => {
    const result = evaluateContactSubmission({
      ...validInput,
      // Also stuff it with spam-keyword content, to prove the schema check
      // short-circuits before heuristics ever get a chance to run.
      message: `buy now act now ${"a".repeat(CONTACT_MESSAGE_MAX_LENGTH)}`,
    });

    expect(result).toEqual({
      status: "rejected",
      reason: "too_long",
      detail: { firedHeuristics: [] },
    });
  });

  it("rejects a filled honeypot as spam, naming the honeypot heuristic in the internal detail", () => {
    const result = evaluateContactSubmission({ ...validInput, honeypot: "I am a bot" });

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("rejected_as_spam");
      expect(result.detail.firedHeuristics).toContain("honeypot");
    }
  });

  it("rejects a whitespace-only message as spam, naming emptyAfterTrim in the internal detail", () => {
    const result = evaluateContactSubmission({ ...validInput, message: "   " });

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("rejected_as_spam");
      expect(result.detail.firedHeuristics).toEqual(["emptyAfterTrim"]);
    }
  });

  it("the rejected reason union never contains a heuristic name or a threshold value", () => {
    const result = evaluateContactSubmission({ ...validInput, honeypot: "spam" });

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(["invalid_input", "too_long", "rejected_as_spam"]).toContain(result.reason);
    }
  });

  it("is deterministic: calling twice with identical input returns identical results", () => {
    const first = evaluateContactSubmission(validInput);
    const second = evaluateContactSubmission(validInput);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("is deterministic for rejected input too", () => {
    const spamInput = { ...validInput, honeypot: "spam" };
    const first = evaluateContactSubmission(spamInput);
    const second = evaluateContactSubmission(spamInput);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

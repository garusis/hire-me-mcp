import { describe, expect, it } from "vitest";
import { normalizeContactSubmission } from "./normalize.js";
import { CONTACT_CONTEXT_MAX_LENGTH } from "./schema.js";

describe("normalizeContactSubmission", () => {
  it("trims leading and trailing whitespace on every field", () => {
    const result = normalizeContactSubmission({
      name: "  Jamie Recruiter  ",
      contact: "  jamie@example.com  ",
      message: "  Hello there.  ",
      context: "  From /projects  ",
      honeypot: "",
    });

    expect(result).toEqual({
      name: "Jamie Recruiter",
      contact: "jamie@example.com",
      message: "Hello there.",
      context: "From /projects",
    });
  });

  it("omits context entirely when it was not provided", () => {
    const result = normalizeContactSubmission({
      name: "Jamie Recruiter",
      contact: "jamie@example.com",
      message: "Hello there.",
      honeypot: "",
    });

    expect(result.context).toBeUndefined();
  });

  it("strips control characters from name, contact and message", () => {
    const controlChars = String.fromCharCode(0, 7, 27);
    const result = normalizeContactSubmission({
      name: `Jamie${controlChars}Recruiter`,
      contact: "jamie@example.com",
      message: `Hello${controlChars}there!`,
      honeypot: "",
    });

    expect(result.name).toBe("JamieRecruiter");
    expect(result.message).toBe("Hellothere!");
  });

  it("unifies CRLF/CR line endings to LF in the message", () => {
    const result = normalizeContactSubmission({
      name: "Jamie Recruiter",
      contact: "jamie@example.com",
      message: "Line one.\r\nLine two.\rLine three.",
      honeypot: "",
    });

    expect(result.message).toBe("Line one.\nLine two.\nLine three.");
  });

  it("collapses runs of 3+ blank lines in the message down to a single blank line", () => {
    const result = normalizeContactSubmission({
      name: "Jamie Recruiter",
      contact: "jamie@example.com",
      message: "Paragraph one.\n\n\n\n\nParagraph two.",
      honeypot: "",
    });

    expect(result.message).toBe("Paragraph one.\n\nParagraph two.");
  });

  it("caps the stored context string at the documented max length, even if an unusually long value slipped through", () => {
    const overlong = "a".repeat(CONTACT_CONTEXT_MAX_LENGTH + 50);
    const result = normalizeContactSubmission({
      name: "Jamie Recruiter",
      contact: "jamie@example.com",
      message: "Hello there.",
      context: overlong,
      honeypot: "",
    });

    expect(result.context).toHaveLength(CONTACT_CONTEXT_MAX_LENGTH);
  });

  it("is deterministic: normalizing the same input twice returns byte-identical output", () => {
    const input = {
      name: "  Jamie Recruiter  ",
      contact: "  jamie@example.com  ",
      message: "  Hello\r\n\r\n\r\nthere.  ",
      context: "  From /projects  ",
      honeypot: "",
    };

    const first = normalizeContactSubmission(input);
    const second = normalizeContactSubmission(input);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

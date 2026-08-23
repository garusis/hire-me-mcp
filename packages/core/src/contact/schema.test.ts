import { describe, expect, it } from "vitest";
import {
  CONTACT_CONTACT_MAX_LENGTH,
  CONTACT_CONTEXT_MAX_LENGTH,
  CONTACT_HONEYPOT_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  contactSubmissionSchema,
} from "./schema.js";

const validInput = {
  name: "Jamie Recruiter",
  contact: "jamie@example.com",
  message: "Hello, I would like to talk about an opportunity.",
};

describe("contactSubmissionSchema", () => {
  it("accepts a minimal valid submission (no context, no honeypot) and defaults honeypot to an empty string", () => {
    const result = contactSubmissionSchema.safeParse(validInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ ...validInput, honeypot: "" });
    }
  });

  it("accepts a full submission including context and an empty honeypot", () => {
    const result = contactSubmissionSchema.safeParse({
      ...validInput,
      context: "From the /projects page",
      honeypot: "",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const { name: _name, ...rest } = validInput;
    const result = contactSubmissionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing contact", () => {
    const { contact: _contact, ...rest } = validInput;
    const result = contactSubmissionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing message", () => {
    const { message: _message, ...rest } = validInput;
    const result = contactSubmissionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string name (schema-level min length, distinct from the empty-after-trim heuristic)", () => {
    const result = contactSubmissionSchema.safeParse({ ...validInput, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than the max length", () => {
    const result = contactSubmissionSchema.safeParse({
      ...validInput,
      name: "a".repeat(CONTACT_NAME_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === "too_big")).toBe(true);
    }
  });

  it("rejects a contact longer than the max length", () => {
    const result = contactSubmissionSchema.safeParse({
      ...validInput,
      contact: "a".repeat(CONTACT_CONTACT_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === "too_big")).toBe(true);
    }
  });

  it("rejects a message longer than the max length", () => {
    const result = contactSubmissionSchema.safeParse({
      ...validInput,
      message: "a".repeat(CONTACT_MESSAGE_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === "too_big")).toBe(true);
    }
  });

  it("rejects a context longer than the max length", () => {
    const result = contactSubmissionSchema.safeParse({
      ...validInput,
      context: "a".repeat(CONTACT_CONTEXT_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a honeypot longer than the max length", () => {
    const result = contactSubmissionSchema.safeParse({
      ...validInput,
      honeypot: "a".repeat(CONTACT_HONEYPOT_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a name exactly at the max length (boundary)", () => {
    const result = contactSubmissionSchema.safeParse({
      ...validInput,
      name: "a".repeat(CONTACT_NAME_MAX_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it("accepts a message exactly at the max length (boundary)", () => {
    const result = contactSubmissionSchema.safeParse({
      ...validInput,
      message: "a".repeat(CONTACT_MESSAGE_MAX_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-string field", () => {
    const result = contactSubmissionSchema.safeParse({ ...validInput, message: 12345 });
    expect(result.success).toBe(false);
  });

  it("does not require schema-level trimming — a whitespace-only message still passes schema validation (left for the empty-after-trim heuristic to catch)", () => {
    const result = contactSubmissionSchema.safeParse({ ...validInput, message: "   " });
    expect(result.success).toBe(true);
  });
});

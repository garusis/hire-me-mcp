import { describe, expect, it } from "vitest";
import { contactSubmissionSchema, evaluateContactSubmission } from "./index.js";

describe("contact module entry point", () => {
  it("re-exports the schema and the evaluation function together, composable end to end", () => {
    const parsed = contactSubmissionSchema.parse({
      name: "Jamie Recruiter",
      contact: "jamie@example.com",
      message: "Hello, I would like to talk about an opportunity.",
    });

    const result = evaluateContactSubmission(parsed);

    expect(result.status).toBe("accepted");
  });
});

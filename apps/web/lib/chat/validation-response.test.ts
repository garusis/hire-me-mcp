import { describe, expect, it } from "vitest";
import { buildValidationErrorResponse, classifyValidationIssues } from "./validation-response";

describe("buildValidationErrorResponse", () => {
  it("returns a 400 response", () => {
    const response = buildValidationErrorResponse("sessionId: Required");
    expect(response.status).toBe(400);
  });

  it("returns a JSON content type", () => {
    const response = buildValidationErrorResponse("sessionId: Required");
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("returns a typed, machine-readable error payload with no stack trace", async () => {
    const response = buildValidationErrorResponse("sessionId: Required");
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toBe("sessionId: Required");
    expect(JSON.stringify(body)).not.toContain("at ");
    expect(JSON.stringify(body)).not.toMatch(/\.ts:\d+/);
  });

  it("accepts an explicit code override and returns it in the payload", async () => {
    const response = buildValidationErrorResponse("too many messages", "message_count_exceeded");
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("message_count_exceeded");
  });
});

describe("classifyValidationIssues (#68)", () => {
  it("maps a custom issue's chatErrorCode param to that code", () => {
    const code = classifyValidationIssues([
      {
        code: "custom",
        path: ["messages"],
        message: "too big",
        params: { chatErrorCode: "conversation_size_exceeded" },
      },
    ]);
    expect(code).toBe("conversation_size_exceeded");
  });

  it("maps a too_big issue on the messages array itself to message_count_exceeded", () => {
    const code = classifyValidationIssues([
      { code: "too_big", path: ["messages"], message: "too many" },
    ]);
    expect(code).toBe("message_count_exceeded");
  });

  it("maps a too_big issue on a message's text part to message_size_exceeded", () => {
    const code = classifyValidationIssues([
      { code: "too_big", path: ["messages", 0, "parts", 0, "text"], message: "too long" },
    ]);
    expect(code).toBe("message_size_exceeded");
  });

  it("falls back to invalid_request for any other structural issue", () => {
    const code = classifyValidationIssues([
      { code: "invalid_type", path: ["sessionId"], message: "Required" },
    ]);
    expect(code).toBe("invalid_request");
  });

  it("falls back to invalid_request for an empty issue list", () => {
    expect(classifyValidationIssues([])).toBe("invalid_request");
  });
});

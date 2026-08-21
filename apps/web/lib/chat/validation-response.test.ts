import { describe, expect, it } from "vitest";
import { buildValidationErrorResponse } from "./validation-response";

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
});

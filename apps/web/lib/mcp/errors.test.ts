import { describe, expect, it } from "vitest";
import { buildToolErrorResult, mapThrownError, ToolDomainError } from "./errors.js";

describe("mapThrownError", () => {
  it("maps a ToolDomainError to code domain_error, passing its message through unmodified", () => {
    const payload = mapThrownError(new ToolDomainError('skill "foo" has no resolvable citation'));
    expect(payload).toEqual({
      code: "domain_error",
      message: 'skill "foo" has no resolvable citation',
    });
  });

  it("maps an arbitrary Error to internal_error, dropping the original message entirely", () => {
    const original = new Error(
      "ENOENT: /Users/marcos/secret/.env not found\n    at Object.openSync (node:fs:599:3)",
    );
    const payload = mapThrownError(original);
    expect(payload.code).toBe("internal_error");
    expect(payload.message).not.toContain("/Users");
    expect(payload.message).not.toContain(".env");
    expect(payload.message).not.toContain("at Object");
    expect(payload.message).not.toContain(original.message);
  });

  it("maps a non-Error thrown value to internal_error without leaking its content", () => {
    const payload = mapThrownError("raw string throw with /etc/passwd inside");
    expect(payload.code).toBe("internal_error");
    expect(payload.message).not.toContain("/etc/passwd");
  });

  it("returns the identical generic message for every internal_error — the pair is stable", () => {
    const a = mapThrownError(new Error("first failure"));
    const b = mapThrownError(new TypeError("second, unrelated failure"));
    expect(a.message).toBe(b.message);
    expect(a.code).toBe(b.code);
  });
});

describe("buildToolErrorResult", () => {
  it("builds an isError result carrying the code and message as structuredContent and text", () => {
    const result = buildToolErrorResult({ code: "invalid_input", message: "skill: Required" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ code: "invalid_input", message: "skill: Required" });
    expect(result.content[0].text).toBe(JSON.stringify(result.structuredContent));
  });
});

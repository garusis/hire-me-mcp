import { describe, expect, it, vi } from "vitest";

const { headers } = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("next/headers", () => ({ headers }));

describe("getRequestNonce", () => {
  it("reads the x-nonce header proxy.ts set on the current request", async () => {
    headers.mockResolvedValue(new Headers({ "x-nonce": "abc123" }));
    const { getRequestNonce } = await import("./get-request-nonce");

    expect(await getRequestNonce()).toBe("abc123");
  });

  it("returns null when no x-nonce header is present (e.g. an API route the proxy doesn't nonce)", async () => {
    headers.mockResolvedValue(new Headers());
    const { getRequestNonce } = await import("./get-request-nonce");

    expect(await getRequestNonce()).toBeNull();
  });
});

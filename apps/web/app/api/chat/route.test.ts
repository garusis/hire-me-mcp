// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as route from "./route";

/**
 * `route.ts` must export nothing beyond what Next.js's App Router
 * recognizes for a route module — `next build` type-checks this (see
 * `handler.ts`'s doc comment for why the full handler logic and its test
 * injection seam live there instead). This is a thin smoke test for the
 * wiring; the full behavioral suite (stream shape, tool steps, citations,
 * validation, error mapping, abort, logging) lives in `handler.test.ts`
 * against `createChatPostHandler` directly.
 */
describe("app/api/chat/route.ts", () => {
  it("exports exactly the Next.js route fields — POST and the route-segment config", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "maxDuration", "runtime"]);
  });

  it("exports POST as a request handler function", () => {
    expect(typeof route.POST).toBe("function");
  });

  it("pins the Node.js runtime", () => {
    expect(route.runtime).toBe("nodejs");
  });

  it("sets a maxDuration within the Hobby plan's ceiling", () => {
    expect(route.maxDuration).toBeGreaterThan(0);
    expect(route.maxDuration).toBeLessThanOrEqual(60);
  });
});

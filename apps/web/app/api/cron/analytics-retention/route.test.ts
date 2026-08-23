// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as route from "./route";

/**
 * `route.ts` must export nothing beyond what Next.js's App Router
 * recognizes for a route module — mirrors `app/api/chat/route.test.ts`'s
 * smoke test. The full behavioral suite lives in `handler.test.ts` against
 * `createRetentionCronHandler` directly.
 */
describe("app/api/cron/analytics-retention/route.ts", () => {
  it("exports exactly the Next.js route fields — GET and the route-segment config", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "maxDuration", "runtime"]);
  });

  it("exports GET as a request handler function", () => {
    expect(typeof route.GET).toBe("function");
  });

  it("pins the Node.js runtime", () => {
    expect(route.runtime).toBe("nodejs");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

describe("configureZodJitless", () => {
  afterEach(() => {
    // Reset to zod's own default so this test can't leak into any other
    // test file's zod usage in the same worker.
    z.config({ jitless: false });
  });

  it("sets zod's global jitless config, so the client bundle never attempts new Function()/eval (#42)", async () => {
    z.config({ jitless: false });
    const { configureZodJitless } = await import("./configure-zod-jitless");

    configureZodJitless();

    expect(z.config().jitless).toBe(true);
  });

  it("is idempotent — calling it again after another caller already flipped jitless off doesn't error", async () => {
    const { configureZodJitless } = await import("./configure-zod-jitless");

    configureZodJitless();
    configureZodJitless();

    expect(z.config().jitless).toBe(true);
  });
});

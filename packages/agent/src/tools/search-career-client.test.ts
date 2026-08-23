import { describe, expect, it } from "vitest";
import {
  resetAgentSearchCareerForTests,
  resolveAgentSearchCareer,
} from "./search-career-client.js";

describe("resolveAgentSearchCareer", () => {
  it("reports unavailable, naming the reason, when DATABASE_URL is missing", () => {
    const availability = resolveAgentSearchCareer({
      GOOGLE_GENERATIVE_AI_API_KEY: "fake-key",
    });

    expect(availability.available).toBe(false);
    if (!availability.available) {
      expect(availability.reason).toMatch(/DATABASE_URL/);
    }
  });

  it("reports unavailable, naming the reason, when GOOGLE_GENERATIVE_AI_API_KEY is missing", () => {
    const availability = resolveAgentSearchCareer({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    });

    expect(availability.available).toBe(false);
    if (!availability.available) {
      expect(availability.reason).toMatch(/GOOGLE_GENERATIVE_AI_API_KEY/);
    }
  });

  it("reports unavailable when both are missing", () => {
    const availability = resolveAgentSearchCareer({});

    expect(availability.available).toBe(false);
  });

  it("never throws for missing configuration — returns a typed result instead", () => {
    expect(() => resolveAgentSearchCareer({})).not.toThrow();
  });

  it("builds a working searchCareer function when both env vars are present, without any network I/O", () => {
    // createDbClient/createGoogleEmbeddingClient both connect lazily — constructing them (and the
    // searchCareer function that closes over them) must not touch the network, mirroring
    // packages/core/src/db/client.test.ts's own "without connecting eagerly" convention.
    const availability = resolveAgentSearchCareer({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      GOOGLE_GENERATIVE_AI_API_KEY: "fake-key",
    });

    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(typeof availability.searchCareer).toBe("function");
    }
  });
});

describe("getAgentSearchCareer (module-scope memoization)", () => {
  it("returns the same availability result on every call for the same process env", async () => {
    resetAgentSearchCareerForTests();
    const originalDbUrl = process.env.DATABASE_URL;
    const originalApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "fake-key";
    try {
      const { getAgentSearchCareer } = await import("./search-career-client.js");
      expect(getAgentSearchCareer()).toBe(getAgentSearchCareer());
    } finally {
      if (originalDbUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDbUrl;
      }
      if (originalApiKey === undefined) {
        delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      } else {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalApiKey;
      }
      resetAgentSearchCareerForTests();
    }
  });
});

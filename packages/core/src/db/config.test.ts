import { describe, expect, it } from "vitest";
import { loadDbConfig, MissingDatabaseUrlError } from "./config.js";

describe("loadDbConfig", () => {
  it("returns the trimmed connection string from DATABASE_URL", () => {
    const config = loadDbConfig({ DATABASE_URL: "  postgres://user:pass@host/db  " });
    expect(config).toEqual({ connectionString: "postgres://user:pass@host/db" });
  });

  it("throws MissingDatabaseUrlError when DATABASE_URL is unset", () => {
    expect(() => loadDbConfig({})).toThrow(MissingDatabaseUrlError);
  });

  it("throws MissingDatabaseUrlError when DATABASE_URL is blank", () => {
    expect(() => loadDbConfig({ DATABASE_URL: "   " })).toThrow(MissingDatabaseUrlError);
  });

  it("defaults to process.env when no env object is passed", () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://default-env/db";
    try {
      expect(loadDbConfig()).toEqual({ connectionString: "postgres://default-env/db" });
    } finally {
      if (original === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = original;
      }
    }
  });
});

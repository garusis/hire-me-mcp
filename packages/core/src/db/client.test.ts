import { describe, expect, it } from "vitest";
import { createDbClient } from "./client.js";

describe("createDbClient", () => {
  it("returns a tagged-template sql function and a close() function, without connecting eagerly", () => {
    // postgres() connects lazily (on first query) — constructing a client
    // must not touch the network, so this is safe to run with no DATABASE_URL.
    const client = createDbClient({ connectionString: "postgres://user:pass@localhost:5432/db" });

    expect(typeof client.sql).toBe("function");
    expect(typeof client.sql.unsafe).toBe("function");
    expect(typeof client.sql.begin).toBe("function");
    expect(typeof client.close).toBe("function");
  });

  it("close() resolves even when no query was ever run", async () => {
    const client = createDbClient({ connectionString: "postgres://user:pass@localhost:5432/db" });
    await expect(client.close()).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPooledConnectionUri,
  loadNeonBranchConfig,
  type NeonCreateBranchResponse,
} from "./neon-branch.js";

// Shape captured from a real `POST /branches` call against the project's
// Neon API (see #14's PR description) — values below are fakes, not the
// project's real credentials.
const fixtureConnectionParameters = {
  database: "neondb",
  password: "fake-pw",
  role: "neondb_owner",
  host: "ep-fake-direct.aws.neon.tech",
  pooler_host: "ep-fake-direct-pooler.aws.neon.tech",
};

const fixtureConnectionUri = {
  connection_uri:
    "postgresql://neondb_owner:fake-pw@ep-fake-direct.aws.neon.tech/neondb?sslmode=require",
  connection_parameters: fixtureConnectionParameters,
};

const fixtureResponse: NeonCreateBranchResponse = {
  branch: { id: "br-fake-branch-123" },
  connection_uris: [fixtureConnectionUri],
};

describe("buildPooledConnectionUri", () => {
  it("builds a pooled connection URI from the branch-creation response", () => {
    expect(buildPooledConnectionUri(fixtureResponse)).toBe(
      "postgresql://neondb_owner:fake-pw@ep-fake-direct-pooler.aws.neon.tech/neondb?sslmode=require",
    );
  });

  it("URL-encodes a password containing reserved characters", () => {
    const response: NeonCreateBranchResponse = {
      branch: fixtureResponse.branch,
      connection_uris: [
        {
          ...fixtureConnectionUri,
          connection_parameters: { ...fixtureConnectionParameters, password: "p@ss/word#1" },
        },
      ],
    };
    expect(buildPooledConnectionUri(response)).toContain(encodeURIComponent("p@ss/word#1"));
  });

  it("throws a descriptive error when the response has no connection_uris", () => {
    expect(() => buildPooledConnectionUri({ branch: { id: "br-x" }, connection_uris: [] })).toThrow(
      /connection_uri/,
    );
  });
});

describe("loadNeonBranchConfig", () => {
  it("returns undefined when NEON_API_KEY or NEON_PROJECT_ID is missing", () => {
    expect(loadNeonBranchConfig({})).toBeUndefined();
    expect(loadNeonBranchConfig({ NEON_API_KEY: "key" })).toBeUndefined();
    expect(loadNeonBranchConfig({ NEON_PROJECT_ID: "proj" })).toBeUndefined();
  });

  it("returns a config object when both are present", () => {
    expect(loadNeonBranchConfig({ NEON_API_KEY: "key", NEON_PROJECT_ID: "proj" })).toEqual({
      apiKey: "key",
      projectId: "proj",
    });
  });
});

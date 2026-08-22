/**
 * Neon branch create/delete helper (#14) — used by integration tests (and,
 * later, CI re-indexing/eval automation, #52) to run against a disposable
 * database branch rather than the shared project database. Talks to the
 * Neon "console" API (https://api-docs.neon.tech/reference) directly over
 * `fetch` — no SDK dependency, since this is two small HTTP calls.
 */

const NEON_API_BASE = "https://console.neon.tech/api/v2";

export interface NeonBranchConfig {
  apiKey: string;
  projectId: string;
}

/**
 * Reads `NEON_API_KEY` and `NEON_PROJECT_ID` from the given environment
 * (defaults to `process.env`). Returns `undefined` — never throws — when
 * either is missing, so callers (integration tests) can skip cleanly rather
 * than fail contributors who haven't set up Neon credentials.
 */
export function loadNeonBranchConfig(
  env: NodeJS.ProcessEnv = process.env,
): NeonBranchConfig | undefined {
  const apiKey = env.NEON_API_KEY?.trim();
  const projectId = env.NEON_PROJECT_ID?.trim();
  if (!apiKey || !projectId) {
    return undefined;
  }
  return { apiKey, projectId };
}

export interface NeonConnectionUri {
  connection_uri: string;
  connection_parameters: {
    database: string;
    password: string;
    role: string;
    host: string;
    pooler_host: string;
  };
}

/** The subset of Neon's `POST /branches` response this module reads. */
export interface NeonCreateBranchResponse {
  branch: { id: string };
  connection_uris: NeonConnectionUri[];
}

export interface NeonTestBranch {
  branchId: string;
  /** Pooled connection URI — see {@link buildPooledConnectionUri}. */
  connectionUri: string;
}

/**
 * Builds a pooled Postgres connection URI (using `pooler_host`, matching
 * production's `DATABASE_URL` shape) from a branch-creation response's
 * first connection URI entry.
 */
export function buildPooledConnectionUri(response: NeonCreateBranchResponse): string {
  const uri = response.connection_uris[0];
  if (uri === undefined) {
    throw new Error(
      "Neon branch creation response did not include a connection_uri — cannot build a pooled connection string.",
    );
  }
  const { role, password, database, pooler_host: poolerHost } = uri.connection_parameters;
  return `postgresql://${role}:${encodeURIComponent(password)}@${poolerHost}/${database}?sslmode=require`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Creates a new branch (with a read-write endpoint) off the project's
 * default branch, and returns its id and a ready-to-use pooled connection
 * string. Each call gets a unique name so parallel test runs don't collide.
 */
export async function createNeonTestBranch(
  config: NeonBranchConfig,
  namePrefix = "test",
): Promise<NeonTestBranch> {
  const res = await fetch(`${NEON_API_BASE}/projects/${config.projectId}/branches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch: { name: `${namePrefix}-${Date.now()}-${randomSuffix()}` },
      endpoints: [{ type: "read_write" }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Neon branch creation failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as NeonCreateBranchResponse;
  return { branchId: json.branch.id, connectionUri: buildPooledConnectionUri(json) };
}

/**
 * Deletes a branch by id. Treats 404 (already gone) as success so teardown
 * stays idempotent even if a previous attempt partially succeeded.
 */
export async function deleteNeonTestBranch(
  config: NeonBranchConfig,
  branchId: string,
): Promise<void> {
  const res = await fetch(`${NEON_API_BASE}/projects/${config.projectId}/branches/${branchId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Neon branch deletion failed: ${res.status} ${await res.text()}`);
  }
}

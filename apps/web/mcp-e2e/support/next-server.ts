/**
 * Boots and tears down a real, production `next start` server for the
 * protocol-level MCP integration suite (#49) — deliberately NOT the route
 * handlers imported in-process (that's `app/api/mcp/route.test.ts`'s job).
 * This is the black-box half of the coverage: a real socket, real HTTP,
 * real Next.js production server process, so transport/serialization/
 * schema-registration bugs that only show up when the app is actually
 * running are caught too.
 *
 * Assumes `next build` has already produced `apps/web/.next` — see
 * `global-setup.ts`, which runs the build exactly once for the whole suite
 * run. Each spec file starts its OWN server process on its own ephemeral
 * port (via `getFreePort`) so specs never share rate-limit state or port
 * assignment, and can each pass their own env (e.g. a low
 * `RATELIMIT_MAX_REQUESTS` for the rate-limit spec) — since the route reads
 * those env vars once, at module load / process start (see
 * `lib/mcp/rate-limit/select-limiter.ts`), a shared server could not
 * support both the default-config specs and the rate-limit spec at once.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getFreePort } from "./free-port";

const APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Bounded wait for the server to accept connections and answer the MCP endpoint. */
const READY_TIMEOUT_MS = 45_000;
const READY_POLL_INTERVAL_MS = 250;

export interface StartedServer {
  /** Base URL of the running server, e.g. `http://127.0.0.1:54231`. */
  baseUrl: string;
  /** The MCP endpoint URL, `${baseUrl}/api/mcp`. */
  mcpUrl: string;
  /** Stops the server process and waits for it to exit. */
  stop: () => Promise<void>;
}

function waitForReady(baseUrl: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `next start exited before becoming ready (code=${code}, signal=${signal}). ` +
            "Check stdout/stderr above for the underlying failure.",
        ),
      );
    };
    child.once("exit", onExit);

    const poll = async () => {
      if (settled) return;
      if (Date.now() > deadline) {
        settled = true;
        child.off("exit", onExit);
        reject(new Error(`next start did not become ready within ${READY_TIMEOUT_MS}ms`));
        return;
      }
      try {
        // Any HTTP response — including a 4xx from the MCP endpoint for a
        // bare GET with no session — proves the server is accepting
        // connections and routing to the app, which is all readiness means
        // here; the specs themselves drive the real protocol handshake.
        await fetch(`${baseUrl}/api/mcp`, { method: "GET" });
        settled = true;
        child.off("exit", onExit);
        resolve();
        return;
      } catch {
        // Not ready yet — connection refused/reset. Keep polling.
      }
      setTimeout(poll, READY_POLL_INTERVAL_MS);
    };

    void poll();
  });
}

function stopProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    // Belt-and-braces: force-kill if SIGTERM hasn't taken effect quickly,
    // so a hung child can never leave the test run itself hanging.
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 5_000).unref();
  });
}

/**
 * Starts `next start` on a fresh ephemeral port with `env` merged over the
 * current process environment, waits for it to be ready, and returns a
 * handle to query it and tear it down. Requires `apps/web/.next` to already
 * exist (built once by `global-setup.ts`).
 */
export async function startNextServer(
  env: Record<string, string | undefined> = {},
): Promise<StartedServer> {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn("pnpm", ["exec", "next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: APP_ROOT,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output: string[] = [];
  child.stdout?.on("data", (chunk) => output.push(String(chunk)));
  child.stderr?.on("data", (chunk) => output.push(String(chunk)));

  try {
    await waitForReady(baseUrl, child);
  } catch (error) {
    await stopProcess(child);
    throw new Error(`${(error as Error).message}\n--- next start output ---\n${output.join("")}`);
  }

  return {
    baseUrl,
    mcpUrl: `${baseUrl}/api/mcp`,
    stop: () => stopProcess(child),
  };
}

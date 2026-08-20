/**
 * Picks a free TCP port by asking the OS for an ephemeral one (`listen(0)`),
 * reading it back, then releasing it. There is an inherent (tiny) TOCTOU
 * race between release and the caller's own `listen`, but it's the standard
 * approach for "find me a free port" in Node and is good enough for a test
 * harness that immediately reuses the port on the same machine.
 */
import { createServer } from "node:net";

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close();
        reject(new Error("getFreePort: could not resolve an ephemeral port"));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

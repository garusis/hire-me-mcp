/**
 * "Add this connector" deep links (#45) — one-click URL schemes that open a
 * client's own add-connector flow pre-filled with this server's endpoint,
 * as a complement to (never a replacement for) the manual setup snippet
 * rendered on `/mcp` and the home connect panel. Deliberately narrow: a
 * link is added here only where the client itself documents a URL scheme
 * for it, verified against that client's *own* docs at implementation
 * time. "Omit rather than guess" (#45) — a broken deep link is worse than
 * no deep link, so every `ClientId` not covered below simply renders none.
 *
 * Verified 2026-08-21:
 *
 * - **Cursor** — `cursor://anysphere.cursor-deeplink/mcp/install?name=<name>&config=<base64>`,
 *   where `config` is `JSON.stringify({ url })` (the same shape Cursor's
 *   own `mcp.json` uses for a remote server, per `client-setups.ts`'s
 *   verification note), base64-encoded. Documented at
 *   https://cursor.com/docs/mcp/install-links, which states the config
 *   "uses the same format as mcp.json"; the page's own worked example uses
 *   a local stdio server, so the `{ url }` shape for a *remote* server is
 *   inferred from that "same format as mcp.json" statement plus Cursor's
 *   documented `mcp.json` remote-server shape (verified separately for
 *   `client-setups.ts`) rather than a second worked example — flagged for
 *   manual click-through verification before merge (see the PR
 *   description's deep-link table).
 * - **VS Code** — `vscode:mcp/install?<url-encoded-json>`, where the JSON
 *   is `{ name, type: "http", url }` (`encodeURIComponent(JSON.stringify(...))`,
 *   per the code sample on
 *   https://code.visualstudio.com/api/extension-guides/ai/mcp) and the
 *   `{ type: "http", url }` remote-server shape is confirmed by
 *   https://code.visualstudio.com/docs/agent-customization/mcp-servers's
 *   own `mcp.json` example. Also flagged for manual click-through
 *   verification before merge, since the two pieces (scheme+encoding, and
 *   object shape) come from different pages rather than one combined
 *   worked example.
 * - **Claude (web/desktop)** — no documented URL scheme; adding a custom
 *   connector is a Settings UI flow only (see `client-setups.ts`'s
 *   verification note). No deep link.
 * - **Claude Code** — CLI-only (`claude mcp add ...`); no URL scheme to
 *   deep-link into a terminal. No deep link.
 * - **Claude Desktop (JSON config)**, **raw JSON-RPC (curl)**, **generic**
 *   — no client to deep-link into (a hand-edited config file, a shell
 *   command, and "any client" respectively). No deep link.
 */

import type { ClientId } from "@hire-me-mcp/connect-metadata";

export interface DeepLink {
  /** Distinguishes multiple deep links for one `ClientId` (e.g. "cursor" vs "vscode" under `vscode-cursor`). */
  id: string;
  label: string;
  href: string;
}

function base64Encode(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }
  // Browser fallback — this module is also importable from a client component.
  return btoa(value);
}

function buildCursorDeepLink(endpointUrl: string, serverName: string): string {
  const config = base64Encode(JSON.stringify({ url: endpointUrl }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(serverName)}&config=${config}`;
}

function buildVsCodeDeepLink(endpointUrl: string, serverName: string): string {
  const config = encodeURIComponent(
    JSON.stringify({ name: serverName, type: "http", url: endpointUrl }),
  );
  return `vscode:mcp/install?${config}`;
}

/** Every `ClientId` with at least one verified deep link, and how to build it. */
const DEEP_LINK_BUILDERS: Partial<
  Record<
    ClientId,
    Array<{ id: string; label: string; build: (url: string, name: string) => string }>
  >
> = {
  "vscode-cursor": [
    { id: "cursor", label: "Open in Cursor", build: buildCursorDeepLink },
    { id: "vscode", label: "Open in VS Code", build: buildVsCodeDeepLink },
  ],
};

/**
 * Every verified deep link for a given client — empty for any client
 * without one. `endpointUrl` and `serverName` are always parameters, never
 * a literal, so a deep link can't drift from the connection metadata it's
 * derived from (the same discipline `client-setups.ts` follows for
 * snippets).
 */
export function getDeepLinksForClient(
  clientId: ClientId,
  endpointUrl: string,
  serverName: string,
): DeepLink[] {
  const builders = DEEP_LINK_BUILDERS[clientId] ?? [];
  return builders.map((builder) => ({
    id: builder.id,
    label: builder.label,
    href: builder.build(endpointUrl, serverName),
  }));
}

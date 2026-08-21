import { describe, expect, it } from "vitest";
import { getDeepLinksForClient } from "./client-deep-links.js";

const ENDPOINT_URL = "https://hire-me-mcp-web.vercel.app/api/mcp";
const SERVER_NAME = "hire-me-mcp";

/**
 * Deep links for adding this MCP server directly, verified against each
 * client's own documentation at implementation time (#45 — "verify each
 * one manually ... omit rather than guess"). See client-deep-links.ts for
 * the verification notes and doc sources; this test locks the exact URL
 * format so a future change can't silently drift from what was verified.
 */
describe("getDeepLinksForClient (#45)", () => {
  it("builds a Cursor one-click install deep link for the vscode-cursor client, base64-encoding a { url } config", () => {
    const links = getDeepLinksForClient("vscode-cursor", ENDPOINT_URL, SERVER_NAME);
    const cursorLink = links.find((link) => link.id === "cursor");
    if (!cursorLink) throw new Error("expected a cursor deep link");

    const expectedConfig = Buffer.from(JSON.stringify({ url: ENDPOINT_URL }), "utf8").toString(
      "base64",
    );
    expect(cursorLink.href).toBe(
      `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(SERVER_NAME)}&config=${expectedConfig}`,
    );
  });

  it("builds a VS Code install deep link for the vscode-cursor client, URL-encoding a { name, type, url } config", () => {
    const links = getDeepLinksForClient("vscode-cursor", ENDPOINT_URL, SERVER_NAME);
    const vscodeLink = links.find((link) => link.id === "vscode");
    if (!vscodeLink) throw new Error("expected a vscode deep link");

    const expectedConfig = encodeURIComponent(
      JSON.stringify({ name: SERVER_NAME, type: "http", url: ENDPOINT_URL }),
    );
    expect(vscodeLink.href).toBe(`vscode:mcp/install?${expectedConfig}`);
  });

  it("returns an empty array for clients with no documented add-connector URL scheme", () => {
    expect(getDeepLinksForClient("claude-web-desktop", ENDPOINT_URL, SERVER_NAME)).toEqual([]);
    expect(getDeepLinksForClient("claude-code", ENDPOINT_URL, SERVER_NAME)).toEqual([]);
    expect(getDeepLinksForClient("claude-desktop-json", ENDPOINT_URL, SERVER_NAME)).toEqual([]);
    expect(getDeepLinksForClient("curl-jsonrpc", ENDPOINT_URL, SERVER_NAME)).toEqual([]);
    expect(getDeepLinksForClient("generic", ENDPOINT_URL, SERVER_NAME)).toEqual([]);
  });

  it("changes the deep link when the endpoint URL changes — never a hardcoded URL", () => {
    const links = getDeepLinksForClient(
      "vscode-cursor",
      "https://a-different-deploy.example.com/api/mcp",
      SERVER_NAME,
    );
    for (const link of links) {
      expect(link.href).not.toContain(ENDPOINT_URL);
    }
  });
});

import { describe, expect, it } from "vitest";
import { computeDocsMcpRegions, computeReadmeRegions } from "./generate-connect";

const ENDPOINT_URL = "https://hire-me-mcp-web.vercel.app/api/mcp";

describe("computeDocsMcpRegions (#17 — docs/mcp.md generated regions)", () => {
  it("produces one region per marked section docs/mcp.md defines", () => {
    const regions = computeDocsMcpRegions(ENDPOINT_URL);
    expect(regions.map((region) => region.id)).toEqual([
      "mcp-endpoint-url",
      "mcp-claude-code-snippet",
      "mcp-cursor-vscode-snippet",
      "mcp-curl-jsonrpc-snippet",
      "mcp-tool-table",
    ]);
  });

  it("wraps the endpoint URL in a fenced code block", () => {
    const regions = computeDocsMcpRegions(ENDPOINT_URL);
    const region = regions.find((r) => r.id === "mcp-endpoint-url");
    expect(region?.content).toBe(`\`\`\`\n${ENDPOINT_URL}\n\`\`\``);
  });

  it("wraps the Claude Code snippet in a bash-fenced code block containing the http transport flag", () => {
    const regions = computeDocsMcpRegions(ENDPOINT_URL);
    const region = regions.find((r) => r.id === "mcp-claude-code-snippet");
    expect(region?.content).toContain("```bash");
    expect(region?.content).toContain("--transport http");
    expect(region?.content).toContain(ENDPOINT_URL);
  });

  it("wraps the Cursor/VS Code snippet in a json-fenced valid JSON block", () => {
    const regions = computeDocsMcpRegions(ENDPOINT_URL);
    const region = regions.find((r) => r.id === "mcp-cursor-vscode-snippet");
    expect(region?.content).toMatch(/^```json\n/);
    const jsonBody = region?.content.replace(/^```json\n/, "").replace(/\n```$/, "") ?? "";
    expect(() => JSON.parse(jsonBody)).not.toThrow();
  });

  it("wraps the curl JSON-RPC snippet in a bash-fenced block", () => {
    const regions = computeDocsMcpRegions(ENDPOINT_URL);
    const region = regions.find((r) => r.id === "mcp-curl-jsonrpc-snippet");
    expect(region?.content).toContain("```bash");
    expect(region?.content).toContain("curl -s");
  });

  it("renders a tool table row for every non-diagnostic tool, in registry order, excluding ping", () => {
    const regions = computeDocsMcpRegions(ENDPOINT_URL);
    const region = regions.find((r) => r.id === "mcp-tool-table");
    expect(region?.content).toContain("`get-profile`");
    expect(region?.content).toContain("`get-experience`");
    expect(region?.content).toContain("`search-projects`");
    expect(region?.content).toContain("`get-skill-evidence`");
    expect(region?.content).not.toContain("`ping`");
  });
});

describe("computeReadmeRegions (#17 — README.md generated regions)", () => {
  it("produces exactly the endpoint URL region, wrapped in a fenced code block", () => {
    const regions = computeReadmeRegions(ENDPOINT_URL);
    expect(regions).toEqual([
      { id: "mcp-endpoint-url", content: `\`\`\`\n${ENDPOINT_URL}\n\`\`\`` },
    ]);
  });
});

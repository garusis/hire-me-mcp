import { CAREER_DATA_PACKAGE_NAME } from "@hire-me-mcp/career-data";
import { CORE_PACKAGE_NAME } from "@hire-me-mcp/core";

export default function Home() {
  return (
    <main>
      <h1>Hire-me MCP</h1>
      <p>Portfolio as an API — placeholder page, design work pending.</p>
      <p>Domain package: {CORE_PACKAGE_NAME}</p>
      <p>Career data package: {CAREER_DATA_PACKAGE_NAME}</p>
    </main>
  );
}

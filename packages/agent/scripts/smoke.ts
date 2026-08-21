/**
 * One-off smoke verification (#63): a single real call to the default
 * Gemini model, proving the AI SDK <-> Mastra binding works end-to-end
 * beyond the mocked test suite. Not part of the test suite or CI — the
 * `smoke` package script exists purely for manual invocation with a real
 * `GOOGLE_GENERATIVE_AI_API_KEY` in the environment.
 *
 *   pnpm --filter @hire-me-mcp/agent smoke
 *
 * Never logs the API key — only the resolved model id and a short excerpt
 * of the model's response.
 */
import { getInterviewAgent } from "../src/index.js";

async function main(): Promise<void> {
  const agent = getInterviewAgent();
  const result = await agent.generate(
    "In one short sentence, say hello as an interview assistant.",
  );

  console.log(`Smoke call succeeded via ${process.env.CHAT_PROVIDER ?? "google"} provider.`);
  console.log(`Response: ${result.text}`);
}

main().catch((error: unknown) => {
  console.error("Smoke call failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

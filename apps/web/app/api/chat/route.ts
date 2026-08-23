/**
 * `POST /api/chat` (#67) route wiring. The handler logic (including the
 * `createChatPostHandler` test-injection seam) lives in `handler.ts` —
 * Next.js's App Router type-checks a route module's exports against a
 * closed set of recognized fields, and `next build` fails on anything else,
 * so this file exports only what that check expects.
 */

import { createChatPostHandler } from "./handler";

// Node runtime: the embedded Mastra agent and the `@ai-sdk/*` provider
// clients it depends on need full Node APIs, not the Edge runtime subset —
// same rationale as `apps/web/app/api/mcp/route.ts`.
export const runtime = "nodejs";

// Standard Next.js/Vercel route-segment `maxDuration`
// (https://vercel.com/docs/functions/configuring-functions/duration). A
// streamed multi-tool-call agent turn can run considerably longer than the
// MCP endpoint's single tool call. This project runs on Fluid compute
// (visible in the deployment's function panel), where the Hobby ceiling is
// 300s — not classic Hobby's 60s. 60s was observed truncating real slow
// free-tier Gemini turns mid-stream as FUNCTION_INVOCATION_TIMEOUT 504s
// (issue 169), so the full Fluid ceiling is used: streaming ends the invocation
// as soon as the turn finishes, so the higher cap costs nothing on the
// happy path.
export const maxDuration = 300;

export const POST = createChatPostHandler();

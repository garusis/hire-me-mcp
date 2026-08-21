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
// MCP endpoint's single tool call; 60s is the maximum this project's Hobby
// plan allows, chosen as a generous ceiling for a chat turn rather than a
// measured requirement.
export const maxDuration = 60;

export const POST = createChatPostHandler();

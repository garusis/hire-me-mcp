import { createRetentionCronHandler } from "./handler";

// Node.js runtime: this route needs `postgres` (`@hire-me-mcp/core/db`),
// same reasoning as `app/api/mcp/route.ts`.
export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = createRetentionCronHandler();

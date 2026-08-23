import { createStatsRouteHandler } from "./handler";

// Node.js runtime: this route needs `postgres` (`@hire-me-mcp/core/db`),
// same reasoning as `app/api/cron/analytics-retention/route.ts`.
export const runtime = "nodejs";
export const maxDuration = 30;

export const GET = createStatsRouteHandler();

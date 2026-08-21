/**
 * The typed 400 response `POST /api/chat` (`route.ts`) returns for a
 * malformed request body — `chatRequestSchema` (#67) rejected it before the
 * agent ever ran. `message` is always a Zod field-level complaint (built
 * from the schema's own issues, see `route.ts`), the same trust boundary
 * `apps/web/lib/mcp/define-tool.ts` uses for tool input validation: it
 * names request fields, never filesystem paths, stack frames, or
 * environment values, so it's safe to return verbatim.
 */

export interface ValidationErrorPayload {
  error: {
    code: "invalid_request";
    message: string;
  };
}

export function buildValidationErrorResponse(message: string): Response {
  const payload: ValidationErrorPayload = {
    error: { code: "invalid_request", message },
  };
  return new Response(JSON.stringify(payload), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

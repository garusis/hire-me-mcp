/**
 * The typed 400 response `POST /api/chat` (`route.ts`/`handler.ts`) returns
 * for a malformed or over-cap request body — `chatRequestSchema` rejected it
 * before the agent ever ran.
 *
 * `classifyValidationIssues` (#68) maps a Zod issue list to one of the
 * distinct machine-readable codes in `error-codes.ts`: the conversation-cap
 * `superRefine` in `request-schema.ts` tags its custom issue with a
 * `chatErrorCode` param (read directly here), and the two size/count
 * `.max()` bounds are told apart by issue shape — a `too_big` issue whose
 * path is exactly `["messages"]` is the message-COUNT cap, one ending in
 * `"text"` is a single message's SIZE cap. Every other issue (missing
 * field, wrong type, bad UUID, ...) falls back to the generic
 * `invalid_request` code, unchanged from #67. `message` is always a Zod
 * field-level complaint (built from the schema's own issues, see
 * `handler.ts`), the same trust boundary `apps/web/lib/mcp/define-tool.ts`
 * uses for tool input validation: it names request fields, never filesystem
 * paths, stack frames, or environment values, so it's safe to return
 * verbatim.
 */

import type { ChatErrorCode } from "./error-codes";
import { buildChatErrorPayload } from "./error-codes";

/** The minimal shape of a Zod issue this module reads — matches `z.core.$ZodIssue`. */
export interface ValidationIssueLike {
  code: string;
  path: PropertyKey[];
  message: string;
  params?: Record<string, unknown>;
}

function isMessageCountIssue(issue: ValidationIssueLike): boolean {
  return issue.code === "too_big" && issue.path.length === 1 && issue.path[0] === "messages";
}

function isMessageSizeIssue(issue: ValidationIssueLike): boolean {
  return issue.code === "too_big" && issue.path[issue.path.length - 1] === "text";
}

function codeFromIssue(issue: ValidationIssueLike): ChatErrorCode | undefined {
  const paramCode = issue.params?.chatErrorCode;
  if (
    typeof paramCode === "string" &&
    (paramCode === "conversation_size_exceeded" ||
      paramCode === "message_count_exceeded" ||
      paramCode === "message_size_exceeded")
  ) {
    return paramCode;
  }
  if (isMessageCountIssue(issue)) return "message_count_exceeded";
  if (isMessageSizeIssue(issue)) return "message_size_exceeded";
  return undefined;
}

/** Classifies a Zod issue list into the distinct #68 error code it maps to, defaulting to `invalid_request`. */
export function classifyValidationIssues(issues: readonly ValidationIssueLike[]): ChatErrorCode {
  for (const issue of issues) {
    const code = codeFromIssue(issue);
    if (code) return code;
  }
  return "invalid_request";
}

export type { ChatErrorPayload as ValidationErrorPayload } from "./error-codes";

/** Builds the 400 response body for `code` (defaults to `invalid_request`), with `message` shown verbatim. */
export function buildValidationErrorResponse(
  message: string,
  code: ChatErrorCode = "invalid_request",
): Response {
  const payload = buildChatErrorPayload(code, message);
  return new Response(JSON.stringify(payload), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

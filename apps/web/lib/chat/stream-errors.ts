/**
 * Typed error classification for `POST /api/chat` (#67).
 *
 * The route never lets a thrown provider/model error reach the client as a
 * raw message, a stack trace, or a broken connection. Everything thrown
 * while producing the stream — a rate limit, a timeout, an arbitrary
 * upstream failure, or anything unclassified — is mapped here to one of a
 * small, closed set of codes and a fixed, safe message, then serialized
 * (`toStreamErrorEventText`) into the `error` part `createUIMessageStream`'s
 * `onError` callback (`route.ts`) writes into the stream — a clean, typed
 * event the client can branch on, not an exception.
 */

import { APICallError } from "ai";

export type StreamErrorCode = "rate_limited" | "timeout" | "upstream_error" | "unknown";

export interface ClassifiedStreamError {
  code: StreamErrorCode;
  /** Fixed, safe, user-facing copy — never the original error's message or stack. */
  message: string;
}

const MESSAGES: Record<StreamErrorCode, string> = {
  rate_limited: "The model provider is rate-limiting requests right now. Please try again shortly.",
  timeout: "The request to the model provider timed out.",
  upstream_error: "The model provider returned an error.",
  unknown: "An unexpected error occurred while generating a response.",
};

const TIMEOUT_STATUS_CODES = new Set([408, 504]);

/** Classifies an arbitrary thrown value into a small, closed set of stream error codes. */
export function classifyStreamError(error: unknown): ClassifiedStreamError {
  const code = classifyCode(error);
  return { code, message: MESSAGES[code] };
}

function classifyCode(error: unknown): StreamErrorCode {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) {
      return "rate_limited";
    }
    if (error.statusCode !== undefined && TIMEOUT_STATUS_CODES.has(error.statusCode)) {
      return "timeout";
    }
    return "upstream_error";
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "timeout";
  }
  return "unknown";
}

/** Serializes a classified error as the JSON text written into the stream's `error` part. */
export function toStreamErrorEventText(classified: ClassifiedStreamError): string {
  return JSON.stringify(classified);
}

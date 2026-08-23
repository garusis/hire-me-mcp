import { z } from "zod";

/**
 * Zod 4's object parser JIT-compiles a fast path via `new Function(...)`
 * the first time a schema is parsed, unless `jitless` is configured
 * (https://zod.dev/compile, "Content Security Policy"). Under this app's
 * nonce-scoped CSP (#42), `script-src` has no `unsafe-eval`, so that
 * attempt is blocked by the browser — Zod's own feature-detection catches
 * the resulting exception and falls back to its regular parser, so nothing
 * breaks functionally, but the browser still reports it as a CSP
 * violation, which the #42 acceptance criteria (zero violations on every
 * public page) treats as a real bug, not noise to ignore.
 *
 * `@ai-sdk/react`'s `useChat` (used by `chat-widget.tsx`, mounted on every
 * page via `app/layout.tsx`) bundles and parses with `zod` client-side for
 * its own message/stream validation — this app never imports `zod`
 * directly into a client component, so the violation traces to that
 * dependency, not first-party code. Calling `configureZodJitless()` once,
 * before any client-side schema is parsed, opts the *client bundle's* zod
 * instance out of the JIT attempt entirely, avoiding the CSP violation at
 * the source rather than widening the policy. This only affects the
 * browser bundle: server-side zod usage (MCP tool schemas, chat request
 * validation in `lib/chat/request-schema.ts`, career-data validation) runs
 * in a separate module instance in Node and keeps its JIT fast path.
 */
export function configureZodJitless(): void {
  z.config({ jitless: true });
}

// Also applied as a module-level side effect, unconditionally, the instant
// this module is imported — not only when a caller invokes the export
// above. `@ai-sdk/react`/`ai` (bundled client-side by `chat-widget.tsx`)
// triggers zod's eval feature-detection during their OWN module
// evaluation, which — per ES module semantics — can run before any
// statement in an *importing* file executes (a file's own top-level code
// runs only after every one of its imports has finished evaluating). If
// this only ran inside the exported function, a caller placing the call
// after its other imports (the natural way to write it) would already be
// too late. `chat-widget.tsx` still imports this module first and calls
// the export explicitly too, for readability — this line is what actually
// makes the timing safe regardless of import order.
configureZodJitless();

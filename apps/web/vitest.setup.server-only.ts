// Test-only stand-in for the `server-only` package.
//
// `server-only`'s real module unconditionally throws when imported — it
// relies on bundlers (webpack/Turbopack, via Next.js) resolving the
// `react-server` export condition to a no-op instead. Vitest runs under
// plain Node/happy-dom with no such condition, so `vitest.config.ts`
// aliases `server-only` to this empty module for tests, exactly as
// Next.js's own testing docs recommend — the guarantee this package makes
// (accessors under `src/lib/content/` can't be imported from a client
// component) is enforced at build time by Next.js itself; this stub only
// keeps unit tests for those accessors runnable in Node.
export {};

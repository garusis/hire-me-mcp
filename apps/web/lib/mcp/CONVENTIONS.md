# MCP tool-authoring conventions

Every tool registered against this server goes through `defineTool` (`define-tool.ts`) and is
defined as one `ToolDefinition` object. This document is the house style for that object —
models choose tools from `name` and `description` alone, so both are a first-class deliverable,
not an afterthought.

## Naming rules

- `name` is `kebab-case`, a verb phrase describing the action from the model's point of view:
  `get-profile`, `get-experience`, `search-projects`, `get-skill-evidence`, `ping`.
- No prefixes or namespacing (`hire-me:get-profile`) — the server itself is the namespace.
- No abbreviations that aren't already domain vocabulary (`get-experience`, not `get-exp`).

## Description template

`description` is one paragraph, plain prose, written directly to the model. Structure it as:

1. **What it does** — one sentence, stated plainly: what data it returns and its shape at a
   glance (a single record, a list, a discriminated outcome).
2. **When to use it** — the concrete situations/questions that should trigger this tool.
3. **When *not* to use it** — the adjacent tool(s) or situations this one is commonly confused
   with, and which one to reach for instead. Every tool description in this server must include
   this, even when the answer is "there is no adjacent tool" (state that explicitly, as `ping`'s
   description does, so a model doesn't have to guess).
4. **What "no result" looks like**, if relevant — for tools that can return a gap/unknown/empty
   outcome (e.g. `get-skill-evidence`), say so, so the model doesn't treat an honest "not
   claimed" answer as a failed call and retry or hallucinate around it.

Example shape (illustrative — not a real tool in this server yet):

> Looks up a single skill or technology by name and reports whether it's a claimed skill (with
> supporting evidence) or an explicit, acknowledged gap. Use this when a user asks "do you know
> X" or "have you worked with Y" about one specific, named technology. Do not use it to browse
> the full skill list (there is no such tool yet) or to search project descriptions for a
> keyword — use `search-projects` for that. A "not claimed" or "unknown" result is a normal,
> successful answer, not an error — it means the term is a known gap or isn't in the dataset at
> all, and should be relayed to the user honestly rather than retried.

## Parameters: `.describe()` is required

Every field on `inputSchema` — with no exceptions — carries its own `.describe()`, e.g.:

```ts
const inputSchema = z.object({
  skill: z.string().min(1).describe("Skill or gap term to look up, e.g. 'TypeScript' or 'Rust'."),
});
```

A parameter without a description is a bug: the model sees only the JSON Schema generated from
`inputSchema` (via `tools/list`), not this file's prose, so an undocumented field is invisible
context the model has to guess at. This applies to `outputSchema` fields too, when one is
declared.

## When not to add a tool

Don't add a tool as a thin pass-through for something a model can already do without one (e.g. a
tool that just echoes a static string back). `ping` is the one deliberate exception — it exists
purely as a connectivity diagnostic, and its own description says so.

## The envelope and error contract (for context, not something each tool re-implements)

- A tool's `handler` returns a `DomainResult<T>` from `packages/core` (or throws — see below).
  `defineTool` wraps it into `{ content: [textBlock], structuredContent: { data, citations } }`
  automatically; `citations` passes through byte-for-byte. Handlers must not reshape, summarize,
  re-rank, or re-word what the domain service returned.
- A domain "no result" / "not claimed" / "unknown" outcome is data, not a failure — return it
  from `handler` like any other `DomainResult`. Never throw for it, never map it to an empty
  array.
- Throw `ToolDomainError` (`errors.ts`) for an intentional, already-safe-to-show failure (its
  message reaches the client verbatim). Any other thrown value — an unexpected exception, a bug
  — is caught and replaced with a fixed, generic `internal_error` message; nothing about the
  original error (message, stack, paths) reaches the client.
- Invalid arguments (the tool's own `inputSchema.safeParse` failing) map to `invalid_input`
  automatically — no handler code needed.

See `envelope.ts`, `errors.ts`, and `define-tool.ts` for the implementation, and their co-located
`*.test.ts` files for the enforced contract.

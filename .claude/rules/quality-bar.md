---
paths:
  - "apps/**"
  - "packages/**"
  - "tooling/**"
---

# Quality Bar

These aren't hook-enforced (yet — `.claude/hooks` only cover test-first and test protection); they
are the standard `.claude/hooks/tdd-stop-guard.sh` and lefthook (#18) hold you to via `pnpm turbo
lint typecheck test`:

- **Biome is the only linter/formatter.** No ESLint, no Prettier, no per-package overrides outside
  the root `biome.json`. `noExplicitAny`/`noImplicitAnyLet`, unused imports/variables,
  cognitive-complexity limits, and organized imports are `error`, not `warn`.
- **`strict: true` TypeScript everywhere**, via the shared `tsconfig.base.json`. Don't add
  `// @ts-expect-error` or loosen `strict` to make something compile.
- **No default exports**, except the Next.js App Router files that require them
  (`apps/web/app/**/{page,layout,...}.tsx`, `route.ts`) and config files — both already carved out
  in `biome.json`.
- **Small, focused commits** with conventional messages referencing the issue they implement.
- Run before considering anything done: `pnpm turbo lint typecheck test build`.

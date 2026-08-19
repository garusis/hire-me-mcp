import { defineConfig } from "vitest/config";

/**
 * Shared Vitest configuration inherited by every package's `vitest.config.ts`.
 *
 * Per-package configs use `mergeConfig` to layer their own `test.environment`
 * (and, for apps/web, plugins) on top of this base — keeping the test file
 * convention, reporters and coverage settings consistent across the monorepo.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.turbo/**"],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
    },
  },
});

import react from "@vitejs/plugin-react";
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config.base.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        // `server-only`'s real module unconditionally throws unless a
        // bundler resolves its `react-server` export condition (Next.js
        // does this at build time). Vitest runs under plain Node, so tests
        // for `src/lib/content/` accessors get a no-op stand-in instead —
        // see `vitest.setup.server-only.ts`.
        "server-only": new URL("./vitest.setup.server-only.ts", import.meta.url).pathname,
      },
    },
    test: {
      environment: "happy-dom",
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
);

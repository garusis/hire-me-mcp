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
      // `proxy.ts` (#42; `middleware.ts` before Next 16 renamed the
      // convention) must live at the app root per Next.js's own
      // convention (it can't move under `app/`/`src/`/`lib/`, the only
      // globs `vitest.config.base.ts` includes), so its co-located test is
      // added explicitly here rather than by relaxing the shared glob for
      // every package.
      include: ["proxy.test.ts"],
    },
  }),
);

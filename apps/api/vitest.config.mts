import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Nest's dependency injection reads constructor parameter types from
// decorator metadata, which Vitest's default esbuild transform does not
// emit — SWC does (the setup recommended by the NestJS docs for Vitest).
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each file boots its own in-process PGlite database; keep them isolated.
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

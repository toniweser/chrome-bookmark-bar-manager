import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    // Reset module registry between tests so engine.ts state is fresh
    mockReset: true,
    restoreMocks: true,
    pool: "forks",
    isolate: true,
  },
});

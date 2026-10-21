import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 240_000,
    pool: "forks",
    env: { NODE_ENV: "test", FSSA_DB_MEMORY: "1", FSSA_AUTOSEED_CONTENT: "0", AUTH_SECRET: "test-secret-test-secret-test-secret-0123456789" },
  },
});

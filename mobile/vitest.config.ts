import { defineConfig } from "vitest/config";

// Unit tests for the pure logic in src/logic. Node only; nothing here ships to Expo Go.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});

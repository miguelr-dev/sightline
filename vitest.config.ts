import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests (npm test). No network: Claude, Bright Data and Neon are mocked in each test.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Keep real keys out of tests: each test sets the env vars it needs.
    env: {
      ANTHROPIC_API_KEY: "",
      ELEVENLABS_API_KEY: "",
      BRIGHTDATA_API_KEY: "",
      BRIGHTDATA_SERP_ZONE: "",
      DATABASE_URL: "",
      DEVICE_SHARED_KEY: "",
    },
  },
});

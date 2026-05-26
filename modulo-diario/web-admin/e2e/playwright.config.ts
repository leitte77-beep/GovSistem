import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "http://localhost:7201",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    port: 7201,
    reuseExistingServer: true,
  },
});

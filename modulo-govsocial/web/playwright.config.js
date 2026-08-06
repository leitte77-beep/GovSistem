import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 45_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.GOVSOCIAL_E2E_URL || "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node servidor-teste.mjs",
    url: "http://127.0.0.1:4174/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
    { name: "chromium-estreita", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } } },
  ],
});

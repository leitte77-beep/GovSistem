import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "edition-pdf-wait.spec.ts",
  timeout: 10_000,
  retries: 0,
  workers: 1,
});

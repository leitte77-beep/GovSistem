import { defineConfig, devices } from "@playwright/test";

// E2E do fluxo da fase roda contra o app com MSW ligado (sem backend real).
// Porta dedicada 7411 (a 7401 do dev pode estar ocupada em ambiente de CI/dev).
const PORTA = 7411;
const BASE = `http://localhost:${PORTA}/assistencia-social/`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev:mock -- --port ${PORTA}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

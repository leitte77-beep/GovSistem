import { defineConfig, devices } from "@playwright/test";

/**
 * E2E de navegador (§164).
 *
 * Os testes sobem o `web-admin` e interceptam a API no navegador
 * (`page.route`), de modo que exercitam a interface de verdade sem depender de
 * backend, banco ou SSO. Para rodar contra um ambiente já no ar, defina
 * `E2E_BASE_URL` — nesse caso o `webServer` não é iniciado.
 */
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:7399";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- -p 7399",
        url: `${BASE_URL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

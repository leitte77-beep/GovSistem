import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E do fluxo-chave (1) da Fase 8 antecipado à Fase 3:
 * buscar → abrir ficha → ler trilha → revelar conteúdo sigiloso.
 * Roda com MSW (npm run dev:mock), perfil default tecnico_superior.
 */

test("busca leva à ficha da família e mostra o cabeçalho fixo", async ({ page }) => {
  await page.goto("./familias?q=maria");
  await page.getByRole("heading", { name: /Resultados para/ }).waitFor();
  // Abre a primeira família dos resultados.
  await page.getByRole("link", { name: /Família nº/ }).first().click();
  await expect(page.getByRole("heading", { name: /Maria da Silva Souza/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar atendimento" })).toBeVisible();
});

test("trilha mostra eventos e evento de outra unidade sem conteúdo", async ({ page }) => {
  await page.goto("./familias/8f2a1c4e-0b3d-4a9e-9c11-2f7d6a1b0c33");
  await expect(page.getByRole("region", { name: "Trilha da família" })).toBeVisible();
  await expect(page.getByText(/conteúdo restrito à unidade/i)).toBeVisible();
});

test("revela conteúdo sigiloso sob demanda (com aviso de auditoria)", async ({ page }) => {
  await page.goto("./familias/8f2a1c4e-0b3d-4a9e-9c11-2f7d6a1b0c33");
  const trilha = page.getByRole("region", { name: "Trilha da família" });
  await trilha.waitFor();
  // Estado velado avisa que a visualização será registrada.
  await expect(page.getByText(/sua visualização será registrada/i).first()).toBeVisible();
  await page.getByRole("button", { name: /ver conteúdo restrito/i }).first().click();
  await expect(page.getByText(/sua visualização foi registrada/i).first()).toBeVisible();
  await expect(page.getByText(/acompanhamento PAIF/i)).toBeVisible();
});

test("abas sensíveis existem para técnico e a composição familiar aparece", async ({ page }) => {
  await page.goto("./familias/8f2a1c4e-0b3d-4a9e-9c11-2f7d6a1b0c33");
  await page.getByRole("tab", { name: "Composição familiar" }).click();
  await expect(page.getByText("João Souza", { exact: true })).toBeVisible();
});

test("sem violações sérias de acessibilidade na ficha (axe)", async ({ page }) => {
  await page.goto("./familias/8f2a1c4e-0b3d-4a9e-9c11-2f7d6a1b0c33");
  await page.getByRole("region", { name: "Trilha da família" }).waitFor();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serias = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serias).toEqual([]);
});

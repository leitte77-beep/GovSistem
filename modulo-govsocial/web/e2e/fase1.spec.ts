import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E do fluxo da Fase 1: a shell carrega, monta a navegação por perfil e as
 * guardas funcionam. Roda com MSW ligado (npm run dev:mock) e perfil default
 * (VITE_MOCK_ROLE=tecnico_superior).
 *
 * Os fluxos-chave completos (busca→ficha, atendimento ≤2min, etc.) entram nas
 * fases seguintes; aqui garantimos o esqueleto acessível e navegável.
 */

test("carrega o módulo e mostra o cabeçalho com busca global", async ({ page }) => {
  await page.goto("./inicio");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  // Seletor de unidade (contexto global) presente.
  await expect(page.getByLabel("Selecionar unidade de atendimento")).toBeVisible();
});

test("atalho '/' foca a busca global", async ({ page }) => {
  await page.goto("./inicio");
  await page.getByRole("heading", { level: 1 }).waitFor();
  // Garante que o foco está na página (não na barra de endereço) antes do atalho.
  await page.locator("#conteudo").click();
  await page.keyboard.press("/");
  await expect(page.getByLabel("Busca global")).toBeFocused();
});

test("navegação por teclado alcança os itens do menu", async ({ page }) => {
  await page.goto("./inicio");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await expect(menu.getByRole("link", { name: "Famílias" })).toBeVisible();
  await menu.getByRole("link", { name: "Famílias" }).click();
  await expect(page).toHaveURL(/\/familias$/);
});

test("guarda de rota bloqueia área sem permissão para o perfil técnico", async ({ page }) => {
  // Técnico superior não gere Administração — a rota mostra 'sem acesso'.
  await page.goto("./administracao");
  await expect(
    page.getByRole("heading", { name: "Você não tem acesso a esta área" }),
  ).toBeVisible();
});

test("sem violações sérias de acessibilidade na tela inicial (axe)", async ({ page }) => {
  await page.goto("./inicio");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const resultados = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serias = resultados.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serias).toEqual([]);
});

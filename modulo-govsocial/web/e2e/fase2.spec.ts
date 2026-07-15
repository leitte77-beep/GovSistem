import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E dos fluxos da Fase 2:
 * (1) buscar → ver resultados agrupados;
 * (2) cadastrar família com alerta de duplicidade (criar mesmo assim);
 * Roda com MSW (npm run dev:mock), perfil default tecnico_superior.
 */

test("busca global mostra typeahead e leva aos resultados", async ({ page }) => {
  await page.goto("./inicio");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const busca = page.getByLabel("Busca global");
  await busca.click();
  await busca.fill("maria");
  // Sugestão do typeahead aparece na lista da busca (agrupada em Pessoas).
  const lista = page.getByRole("listbox", { name: "Resultados da busca" });
  await expect(lista.getByRole("option").first()).toContainText("Maria", { timeout: 5000 });
  await busca.press("Enter");
  await expect(page).toHaveURL(/\/familias\?q=maria/);
  await expect(page.getByRole("heading", { name: /Resultados para/ })).toBeVisible();
});

test("página de resultados agrupa Pessoas e Famílias", async ({ page }) => {
  await page.goto("./familias?q=maria");
  await expect(page.getByRole("heading", { name: "Pessoas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Famílias" })).toBeVisible();
});

test("estado vazio convida a cadastrar quando não há resultado", async ({ page }) => {
  await page.goto("./familias?q=zzzznaoexiste");
  await expect(page.getByText(/Nenhum resultado para/)).toBeVisible();
});

test("cadastro dispara alerta de duplicidade e permite criar mesmo assim", async ({ page }) => {
  await page.goto("./familias/nova");
  await page.getByLabel("Nome civil").fill("Maria da Silva Souza");
  await page.getByLabel("Data de nascimento").fill("1988-05-14");
  await page.getByRole("button", { name: "Cadastrar família" }).click();

  // Modal de duplicata aparece antes de criar.
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Encontramos pessoas semelhantes")).toBeVisible();

  // Sem justificativa, "criar mesmo assim" cobra o campo.
  await modal.getByRole("button", { name: "Criar mesmo assim" }).click();
  await expect(modal.getByText(/pelo menos 5 caracteres/)).toBeVisible();

  // Com justificativa, cria e navega para a ficha (stub na Fase 2).
  await modal.getByLabel(/Justificativa/).fill("Homônimo confirmado com documento.");
  await modal.getByRole("button", { name: "Criar mesmo assim" }).click();
  await expect(page).toHaveURL(/\/familias\/[0-9a-f-]+$/, { timeout: 8000 });
});

test("sem violações sérias de acessibilidade no cadastro (axe)", async ({ page }) => {
  await page.goto("./familias/nova");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const resultados = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serias = resultados.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serias).toEqual([]);
});

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const FAMILIA = "8f2a1c4e-0b3d-4a9e-9c11-2f7d6a1b0c33";

/**
 * E2E do fluxo-chave (2): registrar atendimento em ≤ 2 minutos.
 * Roda com MSW (npm run dev:mock), perfil default tecnico_superior.
 * O registro acontece na página dedicada /familias/:id/atendimento.
 */

test("registra um atendimento pela página dedicada", async ({ page }) => {
  await page.goto(`./familias/${FAMILIA}`);
  await page.getByRole("button", { name: "Registrar atendimento" }).click();

  // Navega para a página dedicada.
  await expect(page).toHaveURL(new RegExp(`/familias/${FAMILIA}/atendimento`));
  await expect(
    page.getByRole("heading", { name: "Registrar atendimento" }),
  ).toBeVisible();

  // Serviço já vem pré-selecionado (PAIF). Marca um membro e escreve a evolução.
  await page.getByRole("button", { name: /Maria da Silva Souza/ }).click();
  await page.getByRole("textbox", { name: "Evolução técnica" }).fill(
    "Família acolhida. Acompanhamento PAIF em andamento.",
  );
  await page.getByRole("button", { name: "Salvar atendimento" }).click();

  // Toast de sucesso e retorno à ficha da família.
  await expect(page.getByText("Atendimento registrado.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/familias/${FAMILIA}$`));
});

test("fluxo feliz de registro leva menos de 2 minutos", async ({ page }) => {
  await page.goto(`./familias/${FAMILIA}`);
  const inicio = Date.now();

  await page.getByRole("button", { name: "Registrar atendimento" }).click();
  await page.getByRole("button", { name: /Maria da Silva Souza/ }).click();
  await page.getByRole("textbox", { name: "Evolução técnica" }).fill("Evolução breve.");
  await page.getByRole("button", { name: "Salvar atendimento" }).click();
  await expect(page.getByText("Atendimento registrado.")).toBeVisible();

  const segundos = (Date.now() - inicio) / 1000;
  expect(segundos).toBeLessThan(120);
});

test("ação encadeada 'Salvar e conceder benefício' navega já vinculada", async ({ page }) => {
  await page.goto(`./familias/${FAMILIA}/atendimento`);
  // Aguarda os tipos de serviço carregarem (select com opção PAIF).
  await expect(page.getByRole("option", { name: /PAIF/ })).toBeAttached();
  await page.getByRole("textbox", { name: "Evolução técnica" }).fill("Encaminhado a benefício.");
  await page.getByRole("button", { name: "Salvar e conceder benefício" }).click();
  await expect(page).toHaveURL(new RegExp(`/beneficios\\?familia=${FAMILIA}`));
});

test("sem violações sérias de acessibilidade na página de atendimento (axe)", async ({ page }) => {
  await page.goto(`./familias/${FAMILIA}/atendimento`);
  await page.getByRole("heading", { name: "Registrar atendimento" }).waitFor();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serias = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serias).toEqual([]);
});

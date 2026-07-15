import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E do fluxo-chave (4): chamada de frequência offline → sincronizar.
 * Roda com MSW (npm run dev:mock), perfil default tecnico_superior (tem
 * grupo.gerir e frequencia.registrar). O grupo "Convivência de Idosos" já vem
 * com participantes e um encontro do dia sem chamada registrada.
 */

const GRUPO = "ac01-scfv-idosos-000000000001";

test("lista de grupos mostra o grupo da unidade e navega ao detalhe", async ({ page }) => {
  await page.goto("./grupos");
  await expect(page.getByRole("heading", { name: "Grupos & SCFV" })).toBeVisible();
  await page.getByRole("link", { name: /Convivência de Idosos/ }).click();
  await expect(page.getByRole("heading", { name: "Convivência de Idosos" })).toBeVisible();
  // Participantes resolvidos por nome (GET /persons/:id).
  await expect(page.getByText("Maria da Silva Souza")).toBeVisible();
});

test("faz a chamada offline e sincroniza ao reconectar", async ({ page, context }) => {
  await page.goto(`./grupos/${GRUPO}`);
  await expect(page.getByRole("heading", { name: "Convivência de Idosos" })).toBeVisible();

  // Abre a chamada do primeiro encontro.
  await page.getByRole("button", { name: "Fazer chamada" }).first().click();
  await expect(page.getByRole("list", { name: "Lista de presença" })).toBeVisible();

  // Marca uma falta justificada para a Maria.
  const linhaMaria = page.getByRole("listitem").filter({ hasText: "Maria da Silva Souza" });
  await linhaMaria.getByRole("radio", { name: "Justificada" }).click();
  await linhaMaria
    .getByLabel(/Justificativa de Maria da Silva Souza/)
    .fill("Consulta médica");

  // Fica offline e encerra a chamada → entra na fila.
  await context.setOffline(true);
  await expect(page.getByText(/Você está trabalhando offline/)).toBeVisible();
  await page.getByRole("button", { name: "Encerrar chamada" }).click();
  await expect(page.getByText(/Sem conexão/)).toBeVisible();
  await expect(page.getByText("Chamada encerrada")).toBeVisible();

  // Reconecta → a fila sincroniza sozinha e a barra offline some.
  await context.setOffline(false);
  await expect(page.getByText(/Você está trabalhando offline/)).toBeHidden();
});

test("sem violações sérias de acessibilidade na chamada (axe)", async ({ page }) => {
  await page.goto(`./grupos/${GRUPO}`);
  await page.getByRole("heading", { name: "Convivência de Idosos" }).waitFor();
  await page.getByRole("button", { name: "Fazer chamada" }).first().click();
  await page.getByRole("list", { name: "Lista de presença" }).waitFor();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serias = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serias).toEqual([]);
});

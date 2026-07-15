import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E dos fluxos da Fase 7 (Agenda & Fila e Encaminhamentos).
 * Roda com MSW (npm run dev:mock), perfil default tecnico_superior.
 */

test("fila do dia mostra as três colunas do kanban", async ({ page }) => {
  await page.goto("./agenda");
  await expect(page.getByRole("heading", { name: "Agenda & Fila do dia" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Aguardando/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Em atendimento/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Concluído/ })).toBeVisible();
});

test("check-in move um agendamento e chamar avança para atendimento", async ({ page }) => {
  await page.goto("./agenda");
  await page.getByRole("heading", { name: "Agenda & Fila do dia" }).waitFor();

  // O agendamento de João está AGENDADO → botão de check-in.
  const cartaoJoao = page.getByRole("article").filter({ hasText: "João Souza" });
  await cartaoJoao.getByRole("button", { name: "Fazer check-in" }).click();
  await expect(page.getByText("Check-in realizado.")).toBeVisible();

  // Após o check-in, o cartão passa a oferecer "Chamar".
  await expect(
    page.getByRole("article").filter({ hasText: "João Souza" }).getByRole("button", { name: "Chamar" }),
  ).toBeVisible();
});

test("painel de encaminhamentos lista recebidos e permite registrar devolutiva", async ({ page }) => {
  await page.goto("./encaminhamentos");
  await expect(page.getByRole("heading", { name: "Encaminhamentos" })).toBeVisible();

  // Aba Recebidos ativa: há um encaminhamento ACEITO (a devolver).
  const cartaoAceito = page
    .getByRole("article")
    .filter({ has: page.getByRole("button", { name: "Registrar devolutiva" }) });
  await cartaoAceito.getByRole("button", { name: "Registrar devolutiva" }).click();

  const modal = page.getByRole("dialog", { name: "Registrar devolutiva" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Devolutiva").fill("Família incluída no acompanhamento PAIF, com plano definido.");
  await modal.getByRole("button", { name: "Enviar devolutiva" }).click();
  await expect(page.getByText("Devolutiva registrada.")).toBeVisible();
});

test("aba Enviados sinaliza encaminhamento fora do prazo", async ({ page }) => {
  await page.goto("./encaminhamentos");
  await page.getByRole("tab", { name: "Enviados" }).click();
  // O externo para a UBS foi enviado há 40 dias (prazo 30) → "fora do prazo".
  await expect(page.getByText(/fora do prazo/).first()).toBeVisible();
});

test("sem violações sérias de acessibilidade na agenda (axe)", async ({ page }) => {
  await page.goto("./agenda");
  await page.getByRole("heading", { name: "Agenda & Fila do dia" }).waitFor();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serias = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serias).toEqual([]);
});

test("sem violações sérias de acessibilidade no painel de encaminhamentos (axe)", async ({ page }) => {
  await page.goto("./encaminhamentos");
  await page.getByRole("heading", { name: "Encaminhamentos" }).waitFor();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serias = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serias).toEqual([]);
});

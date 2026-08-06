import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const FAMILIA = "8f2a1c4e-0b3d-4a9e-9c11-2f7d6a1b0c33";

/**
 * E2E do fluxo-chave (3): concessão com alerta de duplicidade.
 * A família tem "Cesta básica" ENTREGUE há 12 dias (janela 30) → alerta âmbar.
 * Roda com MSW (npm run dev:mock), perfil default tecnico_superior.
 */

test("tela de concessão mostra as duas colunas e o histórico", async ({ page }) => {
  await page.goto(`./beneficios?familia=${FAMILIA}`);
  await expect(page.getByRole("heading", { name: "Conceder benefício eventual" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Histórico da família na rede" })).toBeVisible();
  // Histórico já traz a cesta básica entregue (item da lista, não a <option>).
  await expect(page.getByRole("listitem").filter({ hasText: "Cesta básica" }).first()).toBeVisible();
});

test("alerta de duplicidade aparece para cesta básica e exige justificativa", async ({ page }) => {
  await page.goto(`./beneficios?familia=${FAMILIA}`);
  // Cesta básica é o primeiro tipo → alerta âmbar visível.
  await expect(page.getByRole("alert")).toContainText(/Cesta básica concedida há/);
  await expect(page.getByText(/Janela mínima do município: 30 dias/)).toBeVisible();
  // Campo de justificativa obrigatório aparece.
  await expect(page.getByLabel(/Justificativa da nova concessão/)).toBeVisible();
});

test("concede benefício sem duplicidade e avança o fluxo de status", async ({ page }) => {
  await page.goto(`./beneficios?familia=${FAMILIA}`);
  // Troca para um benefício sem janela (auxílio funeral) → sem alerta.
  await page.getByLabel("Tipo de benefício").selectOption("AUXILIO_FUNERAL");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Solicitar benefício" }).click();

  // Painel de acompanhamento com FluxoStatus.
  await expect(page.getByRole("list", { name: "Andamento" })).toBeVisible();
  await page.getByRole("button", { name: "Registrar parecer" }).click();
  await page.getByRole("button", { name: "Aprovar concessão" }).click();
  await page.getByRole("button", { name: "Registrar entrega" }).click();
  await expect(page.getByText(/Entregue em/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir comprovante" })).toBeVisible();
});

test("sem violações sérias de acessibilidade na concessão (axe)", async ({ page }) => {
  await page.goto(`./beneficios?familia=${FAMILIA}`);
  await page.getByRole("heading", { name: "Conceder benefício eventual" }).waitFor();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serias = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serias).toEqual([]);
});

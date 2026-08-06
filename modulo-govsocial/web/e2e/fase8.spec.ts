import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E da Fase 8 (RMA §4.8 + Dashboard/Vigilância §4.9).
 * O dev:mock sobe com perfil default tecnico_superior, que NÃO tem acesso ao
 * RMA/Vigilância. Para testar essas telas, injetamos um token do perfil correto
 * no sessionStorage antes da app carregar (a shell faria o mesmo via ?token=).
 */

const TENANT = "org-nova-esperanca";
const CHAVE = "govsocial.access_token";

function tokenFalso(papel: string): string {
  const seg = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const header = seg({ alg: "none", typ: "JWT" });
  const payload = seg({
    sub: `user-${papel}`,
    roles: [papel],
    organization_id: TENANT,
    iat: agora,
    exp: agora + 8 * 60 * 60,
  });
  return `${header}.${payload}.mock`;
}

async function entrarComo(page: Page, papel: string) {
  await page.addInitScript(
    ([chave, token]) => {
      window.sessionStorage.setItem(chave, token);
    },
    [CHAVE, tokenFalso(papel)],
  );
}

// ── RMA (§4.8) ─────────────────────────────────────────────────────

test("RMA mostra os blocos e o número ajustado (C4)", async ({ page }) => {
  await entrarComo(page, "gestor_municipal");
  await page.goto("./rma");

  await expect(page.getByRole("heading", { name: /^RMA/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Bloco C — Atendimentos individualizados/ }),
  ).toBeVisible();
  // O C4 (encaminhados ao BPC) veio ajustado de 6 → 5 na fixture.
  await expect(page.getByText("ajustado").first()).toBeVisible();
});

test("drill-down abre a lista de registros de um número", async ({ page }) => {
  await entrarComo(page, "gestor_municipal");
  await page.goto("./rma");
  await page.getByRole("heading", { name: /^RMA/ }).waitFor();

  await page.getByRole("button", { name: /Ver registros de C1/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("columnheader", { name: "Referência" })).toBeVisible();
});

test("ajustar um número exige justificativa e marca como ajustado", async ({ page }) => {
  await entrarComo(page, "gestor_municipal");
  await page.goto("./rma");
  await page.getByRole("heading", { name: /^RMA/ }).waitFor();

  await page.getByRole("button", { name: /Ajustar C1/ }).click();
  const modal = page.getByRole("dialog", { name: /Ajustar C1/ });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Valor ajustado").fill("130");
  await modal.getByLabel("Justificativa").fill("Correção após revisão dos registros de origem.");
  await modal.getByRole("button", { name: "Salvar ajuste" }).click();

  await expect(page.getByText("Número ajustado. Ficará marcado no espelho.")).toBeVisible();
});

test("fechar o mês confirma consequências e deixa em somente leitura", async ({ page }) => {
  await entrarComo(page, "gestor_municipal");
  await page.goto("./rma");
  await page.getByRole("heading", { name: /^RMA/ }).waitFor();

  await page.getByRole("button", { name: /Fechar RMA de junho/ }).click();
  const modal = page.getByRole("dialog", { name: /Fechar RMA de Junho\/2026/ });
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/ficam travados/)).toBeVisible();
  await modal.getByRole("button", { name: "Confirmar fechamento" }).click();

  await expect(page.getByText("RMA de Junho/2026 fechado.")).toBeVisible();
  await expect(page.getByText(/Este RMA está/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Solicitar reabertura" })).toBeVisible();
});

test("sem violações sérias de acessibilidade no RMA (axe)", async ({ page }) => {
  await entrarComo(page, "gestor_municipal");
  await page.goto("./rma");
  await page.getByRole("heading", { name: /Bloco C/ }).waitFor();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serias = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serias).toEqual([]);
});

// ── Dashboard / Vigilância (§4.9) ──────────────────────────────────

test("dashboard mostra os cartões grandes de indicadores", async ({ page }) => {
  await entrarComo(page, "gestor_municipal");
  await page.goto("./vigilancia");

  await expect(page.getByRole("heading", { name: "Visão geral do município" })).toBeVisible();
  await expect(page.getByText("Atendimentos no mês")).toBeVisible();
  await expect(page.getByText("Encaminhamentos pendentes")).toBeVisible();
  // Gráficos com títulos textuais (donut/barras).
  await expect(page.getByText("Atendimentos nos últimos 12 meses")).toBeVisible();
});

test("gestor ativa pinos identificados e vê aviso de auditoria", async ({ page }) => {
  await entrarComo(page, "gestor_municipal");
  await page.goto("./vigilancia");
  await page.getByRole("heading", { name: "Distribuição territorial" }).waitFor();

  await page.getByLabel("Mostrar pinos identificados").check();
  await expect(page.getByText(/Sua visualização será registrada em auditoria/)).toBeVisible();
});

test("vigilância (sem permissão de pinos) não vê a camada identificada", async ({ page }) => {
  await entrarComo(page, "vigilancia");
  await page.goto("./vigilancia");
  await page.getByRole("heading", { name: "Distribuição territorial" }).waitFor();

  await expect(page.getByLabel("Mostrar pinos identificados")).toHaveCount(0);
});

test("sem violações sérias de acessibilidade no dashboard (axe)", async ({ page }) => {
  await entrarComo(page, "gestor_municipal");
  await page.goto("./vigilancia");
  await page.getByRole("heading", { name: "Distribuição territorial" }).waitFor();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serias = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serias).toEqual([]);
});

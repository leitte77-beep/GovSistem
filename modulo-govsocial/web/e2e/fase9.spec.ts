import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E da Fase 9 (Administração do tenant §4.10).
 * A rota /administracao exige administracao.gerir (ADMIN/suporte). Injetamos um
 * token de ADMIN no sessionStorage antes da app carregar.
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

test("wizard exibe as etapas e percorre a etapa de unidades", async ({ page }) => {
  await entrarComo(page, "ADMIN");
  await page.goto("./administracao");

  await expect(page.getByRole("heading", { name: "Implantação do município" })).toBeVisible();
  // Stepper com as etapas.
  await expect(page.getByRole("button", { name: /Unidades/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Importação CadÚnico/ })).toBeVisible();

  // Adiciona uma unidade e salva a etapa.
  await page.getByLabel("Nome da unidade").fill("CRAS Teste");
  await page.getByRole("button", { name: "Adicionar unidade" }).click();
  await expect(page.getByText("CRAS Teste")).toBeVisible();

  await page.getByRole("button", { name: "Salvar unidades e avançar" }).click();
  await expect(page.getByText("Etapa concluída.")).toBeVisible();
  // Avançou para Territórios (título da etapa).
  await expect(page.getByRole("heading", { name: "Territórios", level: 2 })).toBeVisible();
});

test("importação do CadÚnico mostra a prévia da conciliação", async ({ page }) => {
  await entrarComo(page, "ADMIN");
  await page.goto("./administracao");
  await page.getByRole("heading", { name: "Implantação do município" }).waitFor();

  // Vai direto para a etapa de importação pelo stepper.
  await page.getByRole("button", { name: /Importação CadÚnico/ }).click();
  await expect(page.getByRole("heading", { name: "Importação CadÚnico", level: 2 })).toBeVisible();

  const linhas = ["nis;cpf;nome"];
  for (let i = 0; i < 10; i++) linhas.push(`1000000000${i};1112223330${i};Pessoa ${i}`);
  await page.setInputFiles("#arquivo-cadunico", {
    name: "base_cadunico.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(linhas.join("\n"), "utf-8"),
  });

  await page.getByRole("button", { name: "Enviar e conciliar" }).click();
  await expect(page.getByText("Importação processada. Confira a conciliação.")).toBeVisible();
  await expect(page.getByText("Novos")).toBeVisible();
  await expect(page.getByText("Conflitos")).toBeVisible();
});

test("sem violações sérias de acessibilidade no wizard (axe)", async ({ page }) => {
  await entrarComo(page, "ADMIN");
  await page.goto("./administracao");
  await page.getByRole("heading", { name: "Implantação do município" }).waitFor();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serias = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serias).toEqual([]);
});

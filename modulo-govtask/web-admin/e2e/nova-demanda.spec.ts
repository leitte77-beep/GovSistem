import { expect, test } from "@playwright/test";

import { instalarApiMock } from "./utils";

test.describe("Nova demanda (§113, §114)", () => {
  test("formulário progressivo envia as escolhas de cada passo", async ({ page }) => {
    const capturas = await instalarApiMock(page);
    await page.goto("/demandas");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Nova demanda/i }).dispatchEvent("click");
    await page
      .getByPlaceholder("Ex.: Aquisição de veículo por indicação parlamentar")
      .fill("Aquisição de ambulância");

    await page.getByRole("button", { name: /Continuar/i }).click(); // pessoas
    await page.getByLabel("Origem").selectOption("REUNIAO");
    await page.getByRole("button", { name: /Continuar/i }).click(); // prazos
    await page.getByLabel("Prazo final").fill("2026-10-01");
    await page.getByRole("button", { name: /Continuar/i }).click(); // documentos
    await page.getByRole("button", { name: /Continuar/i }).click(); // workflow
    await page.getByRole("button", { name: /Criar demanda/i }).click();

    await expect.poll(() => capturas.criacao?.titulo).toBe("Aquisição de ambulância");
    expect(capturas.criacao?.origem).toBe("REUNIAO");
    expect(String(capturas.criacao?.prazo_final)).toContain("2026-10-01");
    await expect(page).toHaveURL(/\/demandas\/d1/);
  });

  test("criação rápida salva como rascunho a partir do primeiro passo", async ({ page }) => {
    const capturas = await instalarApiMock(page);
    await page.goto("/demandas");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Nova demanda/i }).dispatchEvent("click");
    await page
      .getByPlaceholder("Ex.: Aquisição de veículo por indicação parlamentar")
      .fill("Providenciar ofício ao Deputado");
    await page.getByRole("button", { name: /Criar rápido/i }).click();

    await expect.poll(() => capturas.criacao?.titulo).toBe("Providenciar ofício ao Deputado");
    expect(capturas.criacao?.rascunho).toBe(true);
  });

  test("não deixa continuar sem título", async ({ page }) => {
    await instalarApiMock(page);
    await page.goto("/demandas");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Nova demanda/i }).dispatchEvent("click");

    await expect(page.getByRole("button", { name: /Continuar/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Criar rápido/i })).toBeDisabled();
  });
});

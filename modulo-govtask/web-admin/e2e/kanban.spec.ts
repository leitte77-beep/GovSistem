import { expect, test } from "@playwright/test";

import { instalarApiMock } from "./utils";

test.describe("Mesa operacional (§51, §201)", () => {
  test("move a demanda de situação pela seleção acessível do card", async ({ page }) => {
    const capturas = await instalarApiMock(page);
    await page.goto("/operacao");

    // A coluna de encerramento não recebe arraste, mas o seletor do card é o
    // caminho acessível por teclado para mudar de situação.
    const seletor = page.locator("select").first();
    await expect(seletor).toBeVisible();
    await seletor.selectOption("s2");

    await expect.poll(() => capturas.status).toEqual({ id: "d1", statusId: "s2" });
  });

  test("mostra as colunas por situação, com a final marcada como encerramento", async ({ page }) => {
    await instalarApiMock(page);
    await page.goto("/operacao");

    await expect(page.getByRole("heading", { name: "Aberta" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Em andamento" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Concluída" })).toBeVisible();
  });
});

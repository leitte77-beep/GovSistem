import { test, expect } from "@playwright/test";

const BASE = "http://localhost:7201";

test.describe("Matérias - CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/matters`);
    await page.waitForLoadState("networkidle");
  });

  test("lista matérias e navega para criação", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Matérias");
    await page.click('a:has-text("Nova Matéria")');
    await expect(page).toHaveURL(/\/matters\/new/);
    await expect(page.locator("h1")).toContainText("Nova Matéria");
  });

  test("cria nova matéria (rascunho)", async ({ page }) => {
    await page.goto(`${BASE}/matters/new`);
    await page.waitForLoadState("networkidle");

    await page.fill('input[placeholder="Título da matéria"]', "Matéria E2E Teste");

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Conteúdo de teste para matéria E2E");

    await page.click('button:has-text("Salvar Rascunho")');

    await expect(page.locator(".text-green-600, [role=status]")).toBeVisible({ timeout: 10000 });
  });

  test("exibe preview HTML", async ({ page }) => {
    await page.goto(`${BASE}/matters/new`);
    await page.waitForLoadState("networkidle");

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await editor.fill("<p>Conteúdo <strong>negrito</strong></p>");

    await page.click('button[title="Preview HTML"]');
    await expect(page.locator("text=Preview HTML")).toBeVisible();
    await expect(page.locator("strong")).toContainText("negrito");
  });

  test("campos obrigatórios são validados", async ({ page }) => {
    await page.goto(`${BASE}/matters/new`);
    await page.waitForLoadState("networkidle");

    await page.click('button:has-text("Salvar Rascunho")');
    await expect(page.locator("text=Título é obrigatório")).toBeVisible();
  });
});

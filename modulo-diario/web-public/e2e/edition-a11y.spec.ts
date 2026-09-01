import { test, expect, Page } from "@playwright/test";

/**
 * Fase 20 — smoke visual + acessibilidade da página pública da edição.
 * Requer web-public + API no ar (homologação). Roda com:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test
 *
 * Foco: snapshot imutável renderizado, um único <h1>, sumário navegável,
 * busca na edição, painel de autenticidade, tabela acessível e contraste.
 */

const EDITION = "/edicoes/2026/21";

async function runAxe(page: Page) {
  let axePath: string | undefined;
  try {
    axePath = require.resolve("axe-core");
  } catch {
    /* axe-core não instalado — teste de violações será pulado */
  }
  if (axePath) {
    await page.addScriptTag({ path: axePath });
  }
  const result = await page.evaluate(async () => {
    const source = (window as any).axe?.source;
    if (!source) return { error: "axe-core não carregado" };
    // eslint-disable-next-line no-eval
    return eval(`${source}; (async () => { const r = await axe.run(document); return { violations: r.violations, passes: r.passes.length }; })();`);
  });
  return result;
}

test.describe("Página pública da edição (snapshot)", () => {
  test("renderiza header institucional, dados e ações", async ({ page }) => {
    await page.goto(EDITION);
    await expect(page).toHaveTitle(/Diário Oficial/);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText("Baixar PDF oficial", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Representação HTML da edição oficial", { exact: false })).toBeVisible();
  });

  test("exibe exatamente um <h1> na página", async ({ page }) => {
    await page.goto(EDITION);
    const h1count = await page.locator("h1").count();
    expect(h1count).toBe(1);
  });

  test("sumário navega para âncoras das matérias", async ({ page }) => {
    await page.goto(EDITION);
    const link = page.locator('nav[aria-label="Sumário"] a').first();
    if ((await link.count()) > 0) {
      const href = await link.getAttribute("href");
      await link.click();
      await expect(page).toHaveURL(new RegExp(`#${href?.slice(1)}`));
    }
  });

  test("busca local na edição filtra matérias", async ({ page }) => {
    await page.goto(EDITION);
    const input = page.getByPlaceholder(/Pesquisar nesta edição/);
    await input.fill("zzz-sem-resultado");
    await expect(page.getByText("Nenhuma matéria encontrada.")).toBeVisible();
  });

  test("painel de autenticidade e hashes visíveis", async ({ page }) => {
    await page.goto(EDITION);
    await expect(page.getByText("Painel de Autenticidade")).toBeVisible();
    await expect(page.getByText(/SHA-256 do PDF/i)).toBeVisible();
  });

  test("roda axe-core sem violações críticas", async ({ page }) => {
    await page.goto(EDITION);
    const axe = await runAxe(page);
    test.skip(!!axe.error, axe.error || "axe indisponível");
    const critical = (axe.violations || []).filter((v: any) => v.impact === "critical" || v.impact === "serious");
    expect(critical).toEqual([]);
  });
});

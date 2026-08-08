import { expect, test } from "@playwright/test";
import { instalarMocks } from "./atendimento.fixtures";

/**
 * Smoke de build (Gate 1 — P0-A): a FichaFamilia deve abrir SEM nenhum
 * pageerror/console error, com cache frio e quente (reload), todas as abas
 * acessíveis e conteúdo revelado conforme o perfil. Falha = bundle corrompido
 * ou regressão de runtime — exatamente o sintoma histórico do build em modo lib.
 */
test.describe("Smoke de build — FichaFamilia", () => {
  test("cache frio e quente sem erro de runtime", async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") erros.push(`console.error: ${m.text()}`);
    });

    await instalarMocks(page, {
      caseFiles: [
        {
          id: "cf-smoke-1",
          family_id: "2",
          unit_id: "u1",
          service_type_code: "PAIF",
          status: "ATIVO",
          acolhida_data: null,
          aberto_em: "2026-01-01",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      trilha: [
        {
          attendance_id: "att-smoke-1",
          data_atendimento: "2026-07-10T10:00:00Z",
          tipo: "INDIVIDUAL",
          service_type_code: "PAIF",
          unit_id: "u1",
          sigiloso_reforcado: false,
          pode_ler_evolucao: true,
        },
      ],
    });
    // Cache frio: primeira carga sem nada em memória.
    await page.goto("./familias/2");
    await expect(page.getByRole("heading", { name: /Carlos Henrique/ })).toBeVisible();

    // Cache quente: reload com recursos já no cache do navegador.
    await page.reload();
    await expect(page.getByRole("heading", { name: /Carlos Henrique/ })).toBeVisible();

    // Abas sensíveis/trilha renderizam sem exceção.
    await page.getByRole("tab", { name: /Trilha/ }).click();
    await expect(page.getByRole("region", { name: "Trilha da família" })).toBeVisible();
    await page.getByRole("tab", { name: /Composição/ }).click();
    await expect(page.getByText("Responsável").first()).toBeVisible();

    expect(erros).toEqual([]);
  });
});

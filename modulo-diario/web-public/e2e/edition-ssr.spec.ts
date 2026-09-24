import { test, expect } from "@playwright/test";

/**
 * SSR / indexação (REGRESSÃO obrigatória).
 * Uma requisição HTTP direta (sem JS de navegador) a /edicoes/{ano}/{numero}
 * deve devolver no HTML inicial: número da edição, data e o título de pelo
 * menos uma matéria publicada — e NUNCA apenas "Carregando edição…".
 *
 * Requer um deploy/host com o web-public + API no ar:
 *   PLAYWRIGHT_BASE_URL=http://localhost:9200 npx playwright test e2e/edition-ssr.spec.ts
 */

const EDITION = "/edicoes/2026/23";

test("HTML inicial contém conteúdo da edição (SSR), não apenas 'Carregando…'", async ({ request }) => {
  const res = await request.get(EDITION);
  expect(res.status()).toBe(200);
  const html = await res.text();

  // O problema que este teste impede: uma página entregue apenas como
  // "Carregando edição…" (conteúdo só via useEffect + fetch client-side).
  const onlyLoading = html.includes("Carregando edição") && !/Edição nº 23/.test(html);
  expect(onlyLoading).toBe(false);

  // Conteúdo documental presente no HTML inicial (SSR/indexável).
  expect(html).toMatch(/Edi[çc][ãa]o n[ºo] 23|Edição nº 23/);
  expect(html).toMatch(/2026|Setembro/);
});

test("uma matéria publicada tem título no HTML inicial", async ({ request }) => {
  const res = await request.get(EDITION);
  expect(res.status()).toBe(200);
  const html = await res.text();

  const singleH1 = (html.match(/<h1\b/g) || []).length;
  expect(singleH1).toBeGreaterThanOrEqual(1);
  expect(singleH1).toBeLessThanOrEqual(1);

  // Pelo menos um sumário/título de matéria (âncora estável) foi serializado.
  expect(html).toMatch(/materia-/);
});

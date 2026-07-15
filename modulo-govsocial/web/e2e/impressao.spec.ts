import { test, expect, type Page } from "@playwright/test";

/**
 * E2E das abas de impressão. Roda com MSW (npm run dev:mock).
 *
 * Regressão: a aba de /imprimir nasce com noopener e, no Chromium atual, NÃO
 * herda o sessionStorage da aba de origem — onde vive o access_token. Sem o
 * handoff por nonce (§ tokenStorage) ela caía em "Você não tem acesso a esta
 * área" e as chamadas à API voltavam 401.
 *
 * No modo mock o main.tsx injeta um token do perfil default (tecnico_superior)
 * quando a aba não tem sessão — é o que mascarava a falha no dev. Por isso o
 * teste do dashboard entra como gestor_municipal: só o token vindo do handoff
 * dá acesso à Vigilância, então a tela renderizar prova que a troca ocorreu.
 */

const TENANT = "org-nova-esperanca";
const CHAVE = "govsocial.access_token";
const PREFIXO_HANDOFF = "govsocial.handoff.";

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

/** Injeta o token do perfil só na aba de origem — a de impressão não o herda. */
async function entrarComo(page: Page, papel: string) {
  await page.addInitScript(
    ([chave, token]) => {
      window.sessionStorage.setItem(chave, token);
    },
    [CHAVE, tokenFalso(papel)],
  );
}

test("imprimir guia abre a aba autenticada, com nonce de uso único", async ({
  page,
  context,
}) => {
  await page.goto("./encaminhamentos");
  await page.getByRole("tab", { name: "Enviados" }).click();

  const [aba] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Imprimir guia" }).first().click(),
  ]);

  // A aba nasce com o nonce na URL — o token nunca trafega na URL (§1.4).
  expect(aba.url()).toMatch(/\/imprimir\/guia\/[^?]+\?h=/);
  expect(aba.url()).not.toContain("token=");

  await aba.waitForLoadState();
  await expect(
    aba.getByRole("heading", { name: "Guia de encaminhamento à rede" }),
  ).toBeVisible();
  await expect(aba.getByText("Você não tem acesso a esta área")).toHaveCount(0);

  // O nonce foi consumido (uso único) e a query string, limpa.
  const residuo = await aba.evaluate(
    (prefixo) => Object.keys(localStorage).filter((k) => k.startsWith(prefixo)),
    PREFIXO_HANDOFF,
  );
  expect(residuo).toEqual([]);
  expect(new URL(aba.url()).search).toBe("");
});

test("aba de impressão recebe a sessão da aba de origem, não a do perfil default", async ({
  page,
  context,
}) => {
  await entrarComo(page, "gestor_municipal");
  await page.goto("./vigilancia");

  const [aba] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Versão para impressão" }).click(),
  ]);
  await aba.waitForLoadState();

  // Antes o window.open usava caminho relativo, quebrando fora da raiz.
  expect(new URL(aba.url()).pathname).toBe("/assistencia-social/imprimir/dashboard");
  // Vigilância exige gestor: sem o handoff a aba cairia no perfil default.
  await expect(aba.getByText("Você não tem acesso a esta área")).toHaveCount(0);
  await expect(aba.getByRole("button", { name: "Imprimir" })).toBeVisible();
});

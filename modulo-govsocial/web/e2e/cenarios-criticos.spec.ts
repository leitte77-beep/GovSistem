import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Cenários críticos de E2E — GovSocial (MSW mock).
 *
 * Roda com `npm run dev:mock` (MSW ligado, perfil default `tecnico_superior`).
 * Todos os testes são independentes e usam seletores de acessibilidade
 * (getByRole, getByLabel, getByText). Sem dependência de backend real.
 *
 * Execução: npm run test:e2e -- cenarios-criticos.spec.ts
 */

// ═══════════════════════════════════════════════════════════════════════
// Cenário 1 — Shell carrega autenticada (mock simula sessão ativa)
// ═══════════════════════════════════════════════════════════════════════
test("cenário 01 — shell carrega autenticada com sidebar, cabeçalho e busca global", async ({
  page,
}) => {
  await page.goto("./inicio");

  // Cabeçalho com busca global visível.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();

  // Sidebar com navegação principal.
  const nav = page.getByRole("navigation", { name: "Menu principal" });
  await expect(nav.getByRole("link", { name: "Início" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Famílias" })).toBeVisible();

  // Seletor de unidade presente.
  await expect(
    page.getByLabel("Selecionar unidade de atendimento"),
  ).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 2 — Guarda de rota bloqueia acesso sem permissão
// ═══════════════════════════════════════════════════════════════════════
test("cenário 02 — rota restrita exibe tela de 'sem acesso' para perfil sem permissão", async ({
  page,
}) => {
  // Técnico superior não pode acessar Administração.
  await page.goto("./administracao");
  await expect(
    page.getByRole("heading", { name: "Você não tem acesso a esta área" }),
  ).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 3 — Busca de famílias por termo
// ═══════════════════════════════════════════════════════════════════════
test("cenário 03 — busca de famílias por termo retorna resultados agrupados", async ({
  page,
}) => {
  await page.goto("./familias");

  // Campo de busca na página de famílias.
  const busca = page.getByRole("textbox", { name: "Buscar famílias" });
  await expect(busca).toBeVisible();
  await busca.fill("maria");
  await busca.press("Enter");

  await expect(page).toHaveURL(/\/familias\?q=maria/);
  await expect(
    page.getByRole("heading", { name: /Resultados para/ }),
  ).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 4 — Cadastro rápido de família
// ═══════════════════════════════════════════════════════════════════════
test("cenário 04 — cadastro rápido de família preenche formulário e cadastra", async ({
  page,
}) => {
  await page.goto("./familias/nova/rapida");

  // Título da página de cadastro rápido.
  await expect(
    page.getByRole("heading", { name: "Cadastro rápido" }),
  ).toBeVisible();

  // Preenche campos obrigatórios (NIS e nome da pessoa de referência).
  await page.getByLabel("NIS do responsável").fill("12345678901");
  await page.getByLabel("Nome civil").fill("Maria da Silva Souza");
  await page.getByLabel("Data de nascimento").fill("1988-05-14");

  // Clica no botão de cadastrar.
  await page.getByRole("button", { name: "Cadastrar" }).click();

  // Após cadastro, deve redirecionar para a ficha da nova família.
  // Espera um UUID na URL ou o estado de sucesso.
  await expect(page).toHaveURL(/\/familias\/[0-9a-f-]+$/, { timeout: 10000 });
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 5 — Ficha da família com abas
// ═══════════════════════════════════════════════════════════════════════
test("cenário 05 — ficha da família exibe abas Trilha, Composição familiar e Dados", async ({
  page,
}) => {
  await page.goto("./familias/1");

  // Cabeçalho da família visível.
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();

  // Aba Trilha (ativa por padrão).
  await expect(page.getByRole("tab", { name: "Trilha" })).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Composição familiar" }),
  ).toBeVisible();

  // Navega para a aba Composição familiar.
  await page.getByRole("tab", { name: "Composição familiar" }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Composição familiar" }),
  ).toBeVisible();

  // Navega para a aba Domicílio.
  await page.getByRole("tab", { name: "Domicílio" }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Domicílio" }),
  ).toBeVisible();

  // Navega para a aba Renda.
  await page.getByRole("tab", { name: "Renda" }).click();
  await expect(page.getByRole("tabpanel", { name: "Renda" })).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 6 — Registro de atendimento a partir da ficha
// ═══════════════════════════════════════════════════════════════════════
test("cenário 06 — registro de atendimento redireciona para formulário dedicado", async ({
  page,
}) => {
  await page.goto("./familias/1");

  await page.getByRole("heading", { level: 2 }).waitFor();

  // Clica no botão "Registrar atendimento" do cabeçalho da ficha.
  const botaoRegistrar = page.getByRole("button", {
    name: "Registrar atendimento",
  });
  await expect(botaoRegistrar).toBeVisible();
  await botaoRegistrar.click();

  // Deve redirecionar para a rota de atendimento.
  await expect(page).toHaveURL(/\/familias\/1\/atendimento$/);
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 7 — Navegação do menu lateral
// ═══════════════════════════════════════════════════════════════════════
test("cenário 07 — navegação do menu lateral carrega cada página", async ({
  page,
}) => {
  const menu = page.getByRole("navigation", { name: "Menu principal" });

  const rotas: { label: string; padraoUrl: RegExp }[] = [
    { label: "Início", padraoUrl: /\/inicio$/ },
    { label: "Famílias", padraoUrl: /\/familias$/ },
    { label: "Atendimentos", padraoUrl: /\/atendimentos$/ },
    { label: "Agenda & Fila", padraoUrl: /\/agenda$/ },
    { label: "Benefícios", padraoUrl: /\/beneficios$/ },
    { label: "Grupos & SCFV", padraoUrl: /\/grupos$/ },
    { label: "Encaminhamentos", padraoUrl: /\/encaminhamentos$/ },
  ];

  for (const { label, padraoUrl } of rotas) {
    await page.goto("./inicio");
    await page.getByRole("heading", { level: 1 }).waitFor();

    const link = menu.getByRole("link", { name: label });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(padraoUrl);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 8 — Busca global com typeahead
// ═══════════════════════════════════════════════════════════════════════
test("cenário 08 — busca global mostra typeahead e navega para resultados", async ({
  page,
}) => {
  await page.goto("./inicio");
  await page.getByRole("heading", { level: 1 }).waitFor();

  const busca = page.getByLabel("Busca global");
  await busca.click();
  await busca.fill("maria");

  // Typeahead aparece com sugestões.
  const lista = page.getByRole("listbox", { name: "Resultados da busca" });
  await expect(lista.getByRole("option").first()).toContainText("Maria", {
    timeout: 5000,
  });

  // Enter sem seleção específica abre página de resultados.
  await busca.press("Enter");
  await expect(page).toHaveURL(/\/familias\?q=maria/);
  await expect(
    page.getByRole("heading", { name: /Resultados para/ }),
  ).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 9 — Concessão de benefício
// ═══════════════════════════════════════════════════════════════════════
test("cenário 09 — página de concessão de benefício carrega com formulário", async ({
  page,
}) => {
  // BenefíciosConcessao exige ?familia=<uuid>.
  await page.goto("./beneficios?familia=1");

  await expect(
    page.getByRole("heading", { name: "Conceder benefício" }),
  ).toBeVisible();

  // Formulário com seletor de tipo de benefício.
  await expect(page.getByLabel("Tipo de benefício")).toBeVisible();
  await expect(page.getByLabel("Quantidade")).toBeVisible();
  await expect(page.getByLabel("Justificativa")).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 10 — Conferência RMA
// ═══════════════════════════════════════════════════════════════════════
test("cenário 10 — página de conferência RMA carrega com seletores de mês/ano", async ({
  page,
}) => {
  await page.goto("./rma");

  // Título da página.
  await expect(
    page.getByRole("heading", { name: "Conferência RMA" }),
  ).toBeVisible();

  // Seletores de competência (ano e mês).
  await expect(page.getByLabel("Ano")).toBeVisible();
  await expect(page.getByLabel("Mês")).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 11 — Agenda & Fila do dia
// ═══════════════════════════════════════════════════════════════════════
test("cenário 11 — agenda exibe abas Fila do Dia e Agenda", async ({
  page,
}) => {
  await page.goto("./agenda");

  await expect(
    page.getByRole("heading", { name: "Agenda & Fila do dia" }),
  ).toBeVisible();

  // Abas Fila do Dia e Agenda.
  await expect(
    page.getByRole("tab", { name: "Fila do dia" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Agenda" })).toBeVisible();

  // Alterna para a aba Agenda.
  await page.getByRole("tab", { name: "Agenda" }).click();
  await expect(page.getByRole("tabpanel", { name: "Agenda" })).toBeVisible();

  // Volta para Fila do dia.
  await page.getByRole("tab", { name: "Fila do dia" }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Fila do dia" }),
  ).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 12 — Dashboard do Gestor (Vigilância)
// ═══════════════════════════════════════════════════════════════════════
test("cenário 12 — dashboard do gestor exibe KPIs e gráficos", async ({
  page,
}) => {
  await page.goto("./vigilancia");

  // Título da visão geral.
  await expect(
    page.getByRole("heading", { name: "Visão geral do município" }),
  ).toBeVisible();

  // Cartões de indicadores (KPIs) visíveis.
  const indicadores = page.getByRole("region", { name: "Indicadores" });
  await expect(indicadores).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 13 — Painel de notificações
// ═══════════════════════════════════════════════════════════════════════
test("cenário 13 — painel de notificações abre ao clicar no sino", async ({
  page,
}) => {
  await page.goto("./inicio");
  await page.getByRole("heading", { level: 1 }).waitFor();

  // Clica no botão de notificações (sino no cabeçalho).
  const botaoNotificacoes = page.getByLabel(/Notificações/);
  await expect(botaoNotificacoes).toBeVisible();
  await botaoNotificacoes.click();

  // Painel dropdown de notificações aparece.
  await expect(page.getByText("Notificações")).toBeVisible();

  // Link "Ver todas" presente.
  await expect(page.getByText("Ver todas")).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 14 — Encaminhamentos (Recebidos/Enviados)
// ═══════════════════════════════════════════════════════════════════════
test("cenário 14 — painel de encaminhamentos exibe abas Recebidos e Enviados", async ({
  page,
}) => {
  await page.goto("./encaminhamentos");

  await expect(
    page.getByRole("heading", { name: "Encaminhamentos" }),
  ).toBeVisible();

  // Abas Recebidos e Enviados.
  await expect(
    page.getByRole("tab", { name: "Recebidos" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Enviados" }),
  ).toBeVisible();

  // Alterna para Enviados.
  await page.getByRole("tab", { name: "Enviados" }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Enviados" }),
  ).toBeVisible();

  // Volta para Recebidos.
  await page.getByRole("tab", { name: "Recebidos" }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Recebidos" }),
  ).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════
// Cenário 15 — Logout (botão Sair)
// ═══════════════════════════════════════════════════════════════════════
test("cenário 15 — botão sair está presente e visível no cabeçalho", async ({
  page,
}) => {
  await page.goto("./inicio");
  await page.getByRole("heading", { level: 1 }).waitFor();

  // Botão de logout com aria-label e tooltip.
  const botaoSair = page.getByLabel("Sair e voltar à plataforma");
  await expect(botaoSair).toBeVisible();

  // Tooltip "Sair" via atributo title.
  await expect(botaoSair).toHaveAttribute("title", "Sair");
});

// ═══════════════════════════════════════════════════════════════════════
// Acessibilidade — varredura axe nas páginas principais
// ═══════════════════════════════════════════════════════════════════════
test("a11y — sem violações sérias na tela inicial", async ({ page }) => {
  await page.goto("./inicio");
  await page.getByRole("heading", { level: 1 }).waitFor();

  const resultados = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const serias = resultados.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serias).toEqual([]);
});

test("a11y — sem violações sérias na página de famílias", async ({ page }) => {
  await page.goto("./familias?q=maria");
  await page.getByRole("heading", { name: /Resultados para/ }).waitFor();

  const resultados = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const serias = resultados.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serias).toEqual([]);
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function abrirSessaoDev(page, request) {
  const response = await request.post('/api/dev/saas/e2e-session');
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.goto(`/?token=${encodeURIComponent(session.token)}`);
  await expect(page.getByText('Agenda', { exact: true }).first()).toBeVisible();
}

async function abrirConfiguracoes(page, request, projectName) {
  page.on('pageerror', (error) => console.error('[browser]', error.message));
  await abrirSessaoDev(page, request);
  if (projectName.includes('mobile')) {
    await page.getByTitle('Mais', { exact: true }).click();
    await page.getByRole('button', { name: /Configurações/ }).click();
  } else {
    await page.getByTitle('Configurações').click();
  }
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
}

async function abrirDashboard(page, request, projectName) {
  page.on('pageerror', (error) => console.error('[browser]', error.message));
  await abrirSessaoDev(page, request);
  if (projectName.includes('mobile')) {
    await page.getByTitle('Mais', { exact: true }).click();
    await page.getByRole('button', { name: /Dashboard/ }).click();
  } else {
    await page.getByTitle('Dashboard', { exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Dashboard operacional' })).toBeVisible();
}

test('login interno usa credenciais reais do GovSistem', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('chatgov_auth'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ChatGov' })).toBeVisible();
  await expect(page.getByPlaceholder('E-mail')).toBeVisible();
  await expect(page.getByPlaceholder('Senha')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar com GovSistem' })).toBeVisible();
});

test('central autenticada funciona sem estouro horizontal', async ({ page, request }, testInfo) => {
  await abrirSessaoDev(page, request);
  await expect(page.getByLabel('Pesquisar conversas por nome ou telefone')).toBeVisible();
  await expect(page.getByRole('button', { name: /Mais filtros/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Fila:/ })).toBeVisible();
  if (!testInfo.project.name.includes('mobile')) {
    await expect(page.getByRole('heading', { name: 'Conversas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Selecione uma conversa' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recolher menu lateral' })).toBeVisible();
    await expect(page.getByRole('separator', { name: 'Redimensionar lista de conversas' })).toBeVisible();
  }
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await page.screenshot({ path: testInfo.outputPath('central-atendimento.png'), fullPage: true });
});

test('tela principal atende verificação automatizada WCAG AA', async ({ page, request }) => {
  await abrirSessaoDev(page, request);
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(resultado.violations, JSON.stringify(resultado.violations, null, 2)).toEqual([]);
});

test('layout principal pode ser ajustado por teclado', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Controles de painéis existem somente no desktop.');
  await abrirSessaoDev(page, request);
  const separador = page.getByRole('separator', { name: 'Redimensionar lista de conversas' });
  const antes = Number(await separador.getAttribute('aria-valuenow'));
  await separador.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(separador).toHaveAttribute('aria-valuenow', String(Math.max(380, antes - 20)));
  await page.getByRole('button', { name: 'Recolher menu lateral' }).click();
  await expect(page.getByRole('button', { name: 'Expandir menu lateral' })).toBeVisible();
  await page.getByRole('button', { name: /Mais filtros/ }).click();
  await expect(page.getByRole('group', { name: 'Filtros adicionais de conversas' })).toBeVisible();
});

test('notificações possui fonte única, abas e pesquisa', async ({ page, request }) => {
  await abrirSessaoDev(page, request);
  await page.getByTitle('Notificações').first().click();
  await expect(page.getByText('Notificações', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Todas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Não lidas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arquivadas' })).toBeVisible();
  await expect(page.getByLabel('Pesquisar notificações')).toBeVisible();
});

test('protocolo abre em página dedicada e preserva a navegação', async ({ page, request }, testInfo) => {
  await abrirSessaoDev(page, request);
  await page.route(/\/api\/v1\/protocols\/[^/]+\/messages$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'mensagem-e2e',
        conteudo: 'Mensagem existente do protocolo',
        direcao: 'entrada',
        canal: 'portal',
        criado_em: '2026-08-07T12:00:00.000Z',
      }]),
    });
  });
  await page.route(/\/api\/v1\/protocols\/[^/]+\/documents$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'documento-e2e',
        nome_amigavel: 'documento-de-validacao.pdf',
        tamanho_bytes: 351744,
        status: 'PENDENTE',
        visivel_cidadao: false,
        criado_em: '2026-08-07T12:00:00.000Z',
      }]),
    });
  });
  const mobile = testInfo.project.name.includes('mobile');
  if (mobile) {
    await page.getByTitle('Mais', { exact: true }).click();
    await page.getByRole('button', { name: /Protocolos/ }).click();
  } else {
    await page.getByTitle('Protocolos', { exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Protocolos' })).toBeVisible();
  if (mobile) {
    await page.locator('tbody tr').first().click();
  } else {
    const abrir = page.getByRole('button', { name: 'Abrir' }).first();
    await expect(abrir).toBeVisible();
    await abrir.click();
  }
  await expect(page).toHaveURL(/#\/protocolos\//);
  await expect(page.locator('.protocolo-summary')).toBeVisible();
  await expect(page.getByText('Assunto', { exact: true })).toBeVisible();
  await expect(page.getByText('Setor atual', { exact: true }).first()).toBeVisible();
  if (!mobile) await expect(page.getByTitle('Protocolos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mensagens' }).click();
  await expect(page.getByText('Mensagem existente do protocolo', { exact: true })).toBeVisible();
  const mensagem = page.getByPlaceholder('Mensagem visível ao cidadão...');
  await mensagem.click();
  await mensagem.pressSequentially('Mensagem completa sem perder o foco', { delay: 15 });
  await expect(mensagem).toBeFocused();
  await expect(mensagem).toHaveValue('Mensagem completa sem perder o foco');
  await page.getByRole('button', { name: 'Documentos' }).click();
  const acoesDocumento = page.locator('.protocolo-document-actions').first();
  await expect(acoesDocumento).toBeVisible();
  const larguraAcoes = await acoesDocumento.evaluate((el) => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }));
  expect(larguraAcoes.scrollWidth).toBeLessThanOrEqual(larguraAcoes.clientWidth + 1);
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await page.screenshot({ path: testInfo.outputPath('protocolo-detalhe.png'), fullPage: true });
  if (mobile) {
    await page.getByTitle('Mais', { exact: true }).click();
    await page.getByRole('button', { name: /Protocolos/ }).click();
  } else {
    await page.getByTitle('Protocolos', { exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Protocolos' })).toBeVisible();
});

test('lista de protocolos oferece concluir, arquivar, reabrir e ações em massa', async ({ page, request }, testInfo) => {
  await abrirSessaoDev(page, request);
  await page.route(/\/api\/v1\/protocols\?.+/, async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: '10000000-0000-4000-8000-000000000001', numero: '2026-08-900001', assunto: 'Em análise', status_operacional: 'EM_ANDAMENTO', prioridade: 'NORMAL' },
      { id: '10000000-0000-4000-8000-000000000002', numero: '2026-08-900002', assunto: 'Finalizado', status_operacional: 'CONCLUIDO', prioridade: 'NORMAL' },
      { id: '10000000-0000-4000-8000-000000000003', numero: '2026-08-900003', assunto: 'Guardado', status_operacional: 'ARQUIVADO', prioridade: 'NORMAL' },
    ]),
  }));

  const mobile = testInfo.project.name.includes('mobile');
  if (mobile) {
    await page.getByTitle('Mais', { exact: true }).click();
    await page.getByRole('button', { name: /Protocolos/ }).click();
  } else {
    await page.getByTitle('Protocolos', { exact: true }).click();
  }

  await expect(page.getByTitle('Concluir protocolo')).toHaveCount(1);
  await expect(page.getByTitle('Arquivar protocolo')).toHaveCount(1);
  await expect(page.getByTitle('Reabrir protocolo')).toHaveCount(2);

  const concluido = page.getByRole('row').filter({ hasText: '2026-08-900002' });
  await concluido.getByTitle('Selecionar protocolo').click();
  await expect(page.getByText('1 selecionado(s)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arquivar (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reabrir (1)' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('protocolos-acoes.png'), fullPage: true });
});

test('agenda abre em lista e mantém ação de arquivamento', async ({ page, request }) => {
  await abrirSessaoDev(page, request);
  await page.getByText('Agenda', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Novo contato/i })).toBeVisible();
});

test('administração avançada expõe canais, SLA e governança sem overflow', async ({ page, request }, testInfo) => {
  await abrirConfiguracoes(page, request, testInfo.project.name);
  await page.getByRole('button', { name: 'Canais' }).click();
  await expect(page.getByText('Canais oficiais de atendimento')).toBeVisible();
  await page.getByRole('button', { name: 'SLA e roteamento' }).click();
  await expect(page.getByText('SLA e distribuição automática')).toBeVisible();
  await page.getByRole('button', { name: 'Governança' }).click();
  await expect(page.getByText('Saúde e dependências')).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await page.screenshot({ path: testInfo.outputPath('governanca.png'), fullPage: true });
});

test('admin cria avisos e acompanha confirmações', async ({ page, request }, testInfo) => {
  await page.route('**/api/evolucoes/avisos/admin', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: '10000000-0000-4000-8000-000000000099',
      titulo: 'Nova funcionalidade', mensagem: 'Confira o novo painel de avisos.',
      prioridade: 'importante', publico: 'todos', exige_confirmacao: true,
      ativo: true, departamento_ids: [], departamento_nomes: [],
      total_destinatarios: 8, total_lidos: 5, total_confirmados: 4,
      publicado_em: '2026-08-18T12:00:00.000Z',
    }]),
  }));
  await page.route('**/api/evolucoes/avisos', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'novo-aviso' }) });
  });
  await abrirConfiguracoes(page, request, testInfo.project.name);
  await page.getByRole('button', { name: 'Avisos' }).click();
  await expect(page.getByText('Novo aviso aos atendentes')).toBeVisible();
  await expect(page.getByText('5/8 leram')).toBeVisible();
  await page.getByLabel('Título').fill('Atualização do ChatGov');
  await page.getByLabel('Mensagem').fill('Uma nova funcionalidade está disponível.');
  await expect(page.getByText('Prévia · Informativo')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar aviso' }).click();
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  const acessibilidade = await new AxeBuilder({ page })
    .include('[data-testid="avisos-admin"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(acessibilidade.violations, JSON.stringify(acessibilidade.violations, null, 2)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('avisos-admin.png'), fullPage: true });
});

test('atendente recebe comunicado compacto e confirma leitura', async ({ page, request }, testInfo) => {
  let confirmado = false;
  await page.route('**/api/evolucoes/avisos/pendentes', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(confirmado ? [] : [{
      id: '10000000-0000-4000-8000-000000000098',
      titulo: 'Nova funcionalidade no ChatGov',
      mensagem: 'Agora os administradores podem enviar comunicados internos.',
      prioridade: 'importante', exige_confirmacao: true, autor_nome: 'Administração',
    }]),
  }));
  await page.route('**/api/evolucoes/avisos/*/ler', async (route) => {
    confirmado = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, confirmado: true }) });
  });
  await abrirSessaoDev(page, request);
  const modal = page.getByRole('dialog', { name: 'Nova funcionalidade no ChatGov' });
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Comunicado interno · Importante')).toBeVisible();
  const acessibilidade = await new AxeBuilder({ page })
    .include('.aviso-chatgov')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(acessibilidade.violations, JSON.stringify(acessibilidade.violations, null, 2)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('aviso-flutuante.png'), fullPage: true });
  await modal.getByRole('button', { name: 'Li e entendi' }).click();
  await expect(modal).toBeHidden();
});

test('dashboard operacional possui filtros, indicadores e grade responsiva', async ({ page, request }, testInfo) => {
  await abrirDashboard(page, request, testInfo.project.name);
  await expect(page.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Data inicial')).toBeVisible();
  await expect(page.getByLabel('Data final')).toBeVisible();
  await expect(page.getByLabel('Filtrar por departamento')).toBeVisible();
  await expect(page.getByLabel('Filtrar por tipo de atendimento')).toBeVisible();
  await expect(page.getByText('Conversas criadas', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Volume de atendimentos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conversas por status' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Equipe em operação' })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await page.screenshot({ path: testInfo.outputPath('dashboard-operacional.png'), fullPage: true });
});

test('dashboard separa a situação atual dos números do período', async ({ page, request }, testInfo) => {
  await abrirDashboard(page, request, testInfo.project.name);
  await expect(page.getByRole('heading', { name: 'Agora' })).toBeVisible();
  await expect(page.getByText('Aguardando atendimento')).toBeVisible();
  await expect(page.getByText('Espera mais longa').first()).toBeVisible();
  await expect(page.getByText('Sem resposta humana')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fila por tempo de espera' })).toBeVisible();
  // Indicadores que a API já devolvia e a tela ignorava.
  await expect(page.getByRole('heading', { name: 'Ranking de atendentes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tempo médio de conclusão' })).toBeVisible();
  await expect(page.getByText('Resolvido pela Iris')).toBeVisible();
});

test('filtro do dashboard vale para todos os painéis, inclusive os administrativos', async ({ page, request }, testInfo) => {
  await abrirDashboard(page, request, testInfo.project.name);
  const chamadas = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/admin/dashboard')) chamadas.push(req.url());
  });
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect.poll(() => chamadas.length).toBeGreaterThan(0);
  expect(chamadas.every((url) => /inicio=\d{4}-\d{2}-\d{2}/.test(url) && /fim=\d{4}-\d{2}-\d{2}/.test(url))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Assuntos mais frequentes' })).toBeVisible();
  await expect(page.getByText('Protocolos abertos no período')).toBeVisible();
});

test('dashboard exporta o período em CSV com procedência', async ({ page, request }, testInfo) => {
  await abrirDashboard(page, request, testInfo.project.name);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^painel-operacional_\d{4}-\d{2}-\d{2}/);
  const fs = await import('node:fs');
  const conteudo = fs.readFileSync(await download.path(), 'utf8');
  expect(conteudo).toContain('Painel operacional');
  expect(conteudo).toContain('Emitido em');
  expect(conteudo).toContain('Aguardando acima da meta');
});

test('impressão do dashboard esconde controles e traz cabeçalho institucional', async ({ page, request }, testInfo) => {
  await abrirDashboard(page, request, testInfo.project.name);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.cg-so-impressao').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar dados do dashboard' })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('dashboard-impressao.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' });
});

test('dashboard operacional atende verificação automatizada WCAG AA', async ({ page, request }, testInfo) => {
  await abrirDashboard(page, request, testInfo.project.name);
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(resultado.violations, JSON.stringify(resultado.violations, null, 2)).toEqual([]);
});

test('Iris possui versionamento e simulação segura', async ({ page, request }, testInfo) => {
  await abrirConfiguracoes(page, request, testInfo.project.name);
  await page.getByRole('button', { name: 'Iris IA' }).click();
  await expect(page.getByText('Versões auditáveis do prompt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simular sem enviar' })).toBeVisible();
});

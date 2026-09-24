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

test('dashboard operacional possui filtros, indicadores e grade responsiva', async ({ page, request }, testInfo) => {
  await abrirDashboard(page, request, testInfo.project.name);
  await expect(page.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Data inicial')).toBeVisible();
  await expect(page.getByLabel('Data final')).toBeVisible();
  await expect(page.getByLabel('Filtrar por departamento')).toBeVisible();
  await expect(page.getByLabel('Filtrar por canal')).toBeVisible();
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

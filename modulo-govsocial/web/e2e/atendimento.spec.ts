import { expect, test } from "@playwright/test";
import { FAMILIA, SERVICOS, UNIDADES, instalarMocks } from "./atendimento.fixtures";

async function preencherFormulario(page, { servico = "PAIF", texto = "Família acompanhada no CRAS. Demanda apresentada e orientações fornecidas." } = {}) {
  const combobox = page.getByRole("combobox", { name: "Serviço" });
  await combobox.click();
  await combobox.fill(servico);
  const opcao = page.getByRole("option", { name: new RegExp(`^${servico}`) });
  await opcao.click();
  await expect(combobox).toHaveValue(new RegExp(`^${servico}`));
  await page.getByRole("checkbox", { name: /Fernanda Lima Oliveira/ }).check();
  const editor = page.getByRole("textbox", { name: "Evolução técnica" });
  await editor.click();
  await editor.pressSequentially(texto);
}

test.describe("Registrar atendimento", () => {
  test("combobox de serviços: pesquisa, teclado, limites e estados", async ({ page }, testInfo) => {
    await instalarMocks(page);
    await page.goto("./familias/2/atendimento");

    await expect(page.getByRole("heading", { name: "Registrar atendimento" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Famílias" })).toBeVisible();
    await expect(page.getByText("Novo atendimento")).toBeVisible();

    const combobox = page.getByRole("combobox", { name: "Serviço" });
    await expect(combobox).toHaveAttribute("placeholder", "Pesquise pelo código ou nome do serviço");

    // abre a lista e verifica que não ultrapassa a viewport
    await combobox.click();
    const lista = page.getByRole("listbox", { name: "Serviços disponíveis" });
    await expect(lista).toBeVisible();
    const caixa = await lista.boundingBox();
    expect(caixa.x).toBeGreaterThanOrEqual(0);
    expect(caixa.y).toBeGreaterThanOrEqual(0);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(1366);
    await expect(lista.getByRole("option").first()).toContainText("ABORD");
    await expect(lista.getByRole("option").first()).toContainText("Serviço Especializado em Abordagem Social");

    // pesquisa por código (sem caixa alta)
    await combobox.fill("abord");
    await expect(lista.getByRole("option")).toHaveCount(1);
    await expect(lista.getByRole("option").first()).toContainText("ABORD");

    // pesquisa por parte da descrição, sem acentos
    await combobox.fill("convivencia");
    await expect(lista.getByRole("option")).toHaveCount(1);
    await expect(lista.getByRole("option").first()).toContainText("SCFV");

    // sem resultados
    await combobox.fill("zzzzz");
    await expect(page.getByText("Nenhum serviço encontrado.")).toBeVisible();

    // Escape fecha
    await combobox.fill("paif");
    await page.keyboard.press("Escape");
    await expect(lista).toBeHidden();

    // seleção por teclado
    await combobox.click();
    await combobox.fill("paefi");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(combobox).toHaveValue("PAEFI — Serviço de Proteção e Atendimento Especializado a Famílias e Indivíduos");
    await expect(lista).toBeHidden();

    // botão de limpar
    await page.getByRole("button", { name: "Limpar seleção do serviço" }).click();
    await expect(combobox).toHaveValue("");

    await testInfo.attach("combobox-servicos", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });

  test("tipo de atendimento: quatro opções, descrições e regras de participantes", async ({ page }, testInfo) => {
    await instalarMocks(page);
    await page.goto("./familias/2/atendimento");

    const tipo = page.getByRole("combobox", { name: "Tipo de atendimento" });
    await expect(tipo).toContainText("Familiar");
    await tipo.click();
    const listaTipo = page.getByRole("listbox", { name: "Tipos de atendimento" });
    await expect(listaTipo).toBeVisible();
    await expect(listaTipo.getByRole("option")).toHaveCount(4);
    for (const rotulo of ["Individual", "Familiar", "Visita domiciliar", "Coletivo / grupo"]) {
      await expect(listaTipo.getByRole("option").filter({ hasText: rotulo })).toBeVisible();
    }
    await expect(listaTipo.getByText("Atendimento direcionado principalmente a uma pessoa.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(listaTipo).toBeHidden();

    // individual: apenas um participante
    await tipo.click();
    await page.getByRole("option", { name: /Individual/ }).click();
    await expect(page.getByText("O atendimento individual permite apenas um participante.")).toBeVisible();
    await page.getByRole("checkbox", { name: /Fernanda Lima Oliveira/ }).check();
    await expect(page.getByText("1 participante selecionado")).toBeVisible();
    await page.getByRole("checkbox", { name: /Carlos Henrique Oliveira Santos/ }).click();
    const modalIndividual = page.getByRole("dialog", { name: "Atendimento individual" });
    await expect(modalIndividual).toBeVisible();
    await expect(modalIndividual).toContainText("Escolha quem será mantido.");
    await modalIndividual.getByRole("button", { name: "Fernanda Lima Oliveira" }).click();
    await expect(page.getByText("1 participante selecionado")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Carlos Henrique Oliveira Santos/ })).not.toBeChecked();

    // familiar: múltiplos + selecionar todos
    await tipo.click();
    await page.getByRole("option", { name: /Familiar/ }).click();
    await page.getByRole("button", { name: "Selecionar todos" }).click();
    await expect(page.getByText("4 participantes selecionados")).toBeVisible();
    await page.getByRole("button", { name: "Limpar seleção" }).first().click();
    await expect(page.getByText("0 participantes selecionados")).toBeVisible();

    await testInfo.attach("tipo-participantes", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });

  test("salvamento automático e status de sincronização", async ({ page }, testInfo) => {
    await instalarMocks(page);
    await page.goto("./familias/2/atendimento");

    await expect(page.getByText("Novo", { exact: true }).first()).toBeVisible();

    const editor = page.getByRole("textbox", { name: "Evolução técnica" });
    await editor.click();
    await editor.pressSequentially("Registro inicial do acompanhamento da família.");
    await expect(page.getByText("Alterações não salvas").first()).toBeVisible();

    await expect(page.getByText(/Rascunho salvo às \d{2}:\d{2}/).first()).toBeVisible({ timeout: 8000 });

    const rascunho = await page.evaluate(async () => {
      const abrir = () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open("govsocial", 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      const db = await abrir();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("rascunhos", "readonly");
        const get = tx.objectStore("rascunhos").get("e2e-admin|atendimento|2");
        get.onsuccess = () => resolve(get.result ? { chave: get.result.chave, dados: get.result.dados, atualizadoEm: get.result.atualizadoEm } : null);
        get.onerror = () => reject(get.error);
      });
    });
    expect(rascunho).not.toBeNull();
    expect(rascunho.dados.evolucao).toContain("Registro inicial");
    expect(rascunho.dados.tipo).toBe("FAMILIAR");

    await testInfo.attach("autosave-status", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });

  test("validações de finalização e fluxo pós-finalização", async ({ page }, testInfo) => {
    await instalarMocks(page);
    await page.goto("./familias/2/atendimento");

    await page.getByRole("button", { name: "Finalizar atendimento" }).click();
    await expect(page.getByRole("alert").first()).toContainText("Verifique os campos destacados");
    await expect(page.getByText("Selecione o serviço do atendimento.").first()).toBeVisible();
    await expect(page.getByText("Selecione pelo menos um participante.").first()).toBeVisible();
    await expect(page.getByText("Descreva a evolução técnica.").first()).toBeVisible();

    await preencherFormulario(page);
    await expect(page.getByText(/Rascunho salvo às \d{2}:\d{2}/).first()).toBeVisible({ timeout: 8000 });

    await page.getByRole("button", { name: "Finalizar atendimento" }).click();
    const modal = page.getByRole("dialog", { name: "Atendimento finalizado" });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("O atendimento foi registrado com sucesso.");
    await expect(modal.getByRole("button", { name: "Criar encaminhamento" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Conceder benefício" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Agendar retorno" })).toBeVisible();

    const enviados = await page.evaluate(() => window.__atendimentos);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].tipo).toBe("FAMILIAR");
    expect(enviados[0].member_ids).toEqual(["p2"]);
    expect(enviados[0].evolution_text).toContain("Família acompanhada");
    expect(enviados[0].sigiloso_reforcado).toBe(false);
    expect(enviados[0].professional_ids).toEqual([]);

    await page.getByRole("dialog", { name: "Atendimento finalizado" }).getByLabel("Fechar").click();
    await expect(page.getByText("Atendimento finalizado com sucesso.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar novo atendimento" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finalizar atendimento" })).toBeHidden();

    await testInfo.attach("apos-finalizacao", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });

  test("sigilo reforçado exige motivo e é enviado ao backend", async ({ page }) => {
    await instalarMocks(page);
    await page.goto("./familias/2/atendimento");

    await page.getByLabel("Sigilo reforçado").click();
    const modal = page.getByRole("dialog", { name: "Ativar sigilo reforçado?" });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("será registrada no histórico de auditoria");
    await modal.getByRole("button", { name: "Ativar sigilo" }).click();
    await expect(page.getByText("Informe o motivo do sigilo reforçado.")).toBeVisible();
    await modal.getByLabel("Motivo do sigilo").fill("Vulnerabilidade extrema da família; necessidade de proteção de dados.");
    await modal.getByRole("button", { name: "Ativar sigilo" }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByText("Sigilo", { exact: true })).toBeVisible();
    await expect(page.getByText("Motivo: Vulnerabilidade extrema")).toBeVisible();

    await preencherFormulario(page);
    await page.getByRole("button", { name: "Finalizar atendimento" }).click();
    await expect(page.getByRole("dialog", { name: "Atendimento finalizado" })).toBeVisible();
    const enviados = await page.evaluate(() => window.__atendimentos);
    expect(enviados[0].sigiloso_reforcado).toBe(true);
  });

  test("possível duplicidade é sinalizada antes de finalizar", async ({ page }) => {
    const agora = new Date();
    const similar = new Date(agora.getTime() - 30 * 60 * 1000);
    await instalarMocks(page, {
      trilha: [
        {
          attendance_id: "att-antiga",
          data_atendimento: similar.toISOString(),
          tipo: "FAMILIAR",
          service_type_code: "PAIF",
          unit_id: "u1",
          sigiloso_reforcado: false,
          pode_ler_evolucao: true,
        },
      ],
    });
    await page.goto("./familias/2/atendimento");
    await preencherFormulario(page);

    await page.getByRole("button", { name: "Finalizar atendimento" }).click();
    const modal = page.getByRole("dialog", { name: "Possível atendimento duplicado" });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Encontramos outro atendimento semelhante registrado recentemente.");
    await expect(modal.getByRole("button", { name: "Continuar mesmo assim" })).toBeVisible();
    await modal.getByRole("button", { name: "Continuar mesmo assim" }).click();
    await expect(page.getByRole("dialog", { name: "Atendimento finalizado" })).toBeVisible();
    const enviados = await page.evaluate(() => window.__atendimentos);
    expect(enviados).toHaveLength(1);
  });

  test("guarda de saída preserva alterações não finalizadas", async ({ page }) => {
    await instalarMocks(page);
    await page.goto("./familias/2/atendimento");

    const editor = page.getByRole("textbox", { name: "Evolução técnica" });
    await editor.click();
    await editor.pressSequentially("Texto ainda não salvo pelo debounce.");

    await page.getByRole("button", { name: "Famílias" }).click();
    const modal = page.getByRole("dialog", { name: "Existem alterações não finalizadas" });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Você possui informações que ainda não foram finalizadas.");
    await modal.getByRole("button", { name: "Continuar editando" }).click();
    await expect(modal).toBeHidden();
    await expect(editor).toBeVisible();

    await page.getByRole("button", { name: "Famílias" }).click();
    await modal.getByRole("button", { name: "Descartar alterações" }).click();
    await expect(page).toHaveURL(/\/familias$/);
  });

  test("modelos de evolução: aplicar, avisar e inserir sem apagar", async ({ page }) => {
    await instalarMocks(page);
    await page.goto("./familias/2/atendimento");

    await page.getByRole("button", { name: "Usar modelo" }).click();
    const modal = page.getByRole("dialog", { name: "Modelos de evolução" });
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Atendimento inicial" }).click();

    const editor = page.getByRole("textbox", { name: "Evolução técnica" });
    await expect(editor).toContainText("Demanda apresentada:");
    await expect(editor).toContainText("Próximos passos:");

    await editor.click();
    await editor.pressSequentially("Registro manual adicional.");

    await page.getByRole("button", { name: "Usar modelo" }).click();
    await modal.getByRole("button", { name: "Visita domiciliar" }).click();
    const aviso = page.getByRole("dialog", { name: "Aplicar modelo de evolução" });
    await expect(aviso).toContainText("Já existe conteúdo nesta evolução.");
    await aviso.getByRole("button", { name: "Inserir modelo abaixo" }).click();
    await expect(editor).toContainText("Registro manual adicional.");
    await expect(editor).toContainText("Motivo da visita:");
  });

  test("barra inferior não cobre o conteúdo na tela reduzida", async ({ page }) => {
    await instalarMocks(page);
    await page.goto("./familias/2/atendimento");

    const barra = page.getByRole("button", { name: "Finalizar atendimento" }).locator("xpath=ancestor::div[contains(@class,'fixed')][1]");
    await expect(barra).toBeVisible();

    const editor = page.getByRole("textbox", { name: "Evolução técnica" });
    await editor.scrollIntoViewIfNeeded();
    await editor.click();
    await editor.pressSequentially("Acompanhamento da família realizado no CRAS, com orientações sobre os serviços disponíveis.");

    const editorRodape = page.getByText(/palavras · \d+ caracteres/);
    await editorRodape.scrollIntoViewIfNeeded();
    const rodapeBox = await editorRodape.boundingBox();
    const barraBox = await barra.boundingBox();
    expect(rodapeBox.y + rodapeBox.height).toBeLessThanOrEqual(barraBox.y + 1);

    // estado salvo continua visível na barra
    await expect(page.getByText(/Rascunho salvo às \d{2}:\d{2}/).last()).toBeVisible({ timeout: 8000 });
  });

  test("coluna única e sem rolagem horizontal em janela estreita", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-estreita", "apenas no projeto de janela estreita");
    await instalarMocks(page);
    await page.goto("./familias/2/atendimento");

    // em telas < xl os cards empilham em uma coluna
    const dados = page.getByText("Dados do atendimento", { exact: true });
    const participantes = page.getByText("Participantes do atendimento", { exact: true });
    await dados.scrollIntoViewIfNeeded();
    const boxDados = await dados.boundingBox();
    const boxParticipantes = await participantes.boundingBox();
    expect(boxParticipantes.y).toBeGreaterThan(boxDados.y + boxDados.height - 2);

    const semOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(semOverflow).toBe(true);

    // dropdown do serviço respeita a viewport na janela estreita
    const combobox = page.getByRole("combobox", { name: "Serviço" });
    await combobox.click();
    const lista = page.getByRole("listbox", { name: "Serviços disponíveis" });
    await expect(lista).toBeVisible();
    const caixa = await lista.boundingBox();
    expect(caixa.x).toBeGreaterThanOrEqual(0);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(1024);

    await testInfo.attach("janela-estreita", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
});

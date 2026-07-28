import { expect, test } from "@playwright/test";

const CARLOS = {
  id: "2",
  codigo: 1,
  responsavel_nome: "Carlos Henrique Oliveira Santos",
  nis_responsavel_mascarado: "***.*****.**-*",
  bairro: "Jardim Esperança",
  territorio: "CRAS Norte",
  faixa_renda: "POBREZA",
  beneficiaria_pbf: true,
  created_at: "2026-07-10T12:00:00Z",
};

const PESSOAS = [
  { id: "p1", nome_exibicao: "Carlos Henrique Oliveira Santos", nome_civil: "Carlos Henrique Oliveira Santos", cpf_mascarado: "***.***.***-31", nis_mascarado: "*******8632", data_nascimento: "1982-03-14", sexo: "MASCULINO", tipo_deficiencia: null, frequenta_escola: null, is_falecido: false, family_id: "2", familia_codigo: 1, familia_nome: "Carlos Henrique Oliveira Santos", parentesco: "RESPONSAVEL", is_responsavel: true, bairro: "Jardim Esperança", unidade: "CRAS Norte", membro_pbf: true, beneficiario_bpc: false, cpf_irregular: false },
  { id: "p2", nome_exibicao: "Fernanda Lima Oliveira", nome_civil: "Fernanda Lima Oliveira", cpf_mascarado: "***.***.***-67", nis_mascarado: "*******6152", data_nascimento: "1985-09-21", sexo: "FEMININO", tipo_deficiencia: null, frequenta_escola: null, is_falecido: false, family_id: "2", familia_codigo: 1, familia_nome: "Carlos Henrique Oliveira Santos", parentesco: "CONJUGE", is_responsavel: false, bairro: "Jardim Esperança", unidade: "CRAS Norte", membro_pbf: true, beneficiario_bpc: false, cpf_irregular: false },
  { id: "p3", nome_exibicao: "Juliana Lima Oliveira", nome_civil: "Juliana Lima Oliveira", cpf_mascarado: "***.***.***-43", nis_mascarado: "*******6193", data_nascimento: "2014-12-02", sexo: "FEMININO", tipo_deficiencia: "VISUAL", frequenta_escola: true, is_falecido: false, family_id: "2", familia_codigo: 1, familia_nome: "Carlos Henrique Oliveira Santos", parentesco: "FILHO", is_responsavel: false, bairro: "Jardim Esperança", unidade: "CRAS Norte", membro_pbf: true, beneficiario_bpc: false, cpf_irregular: false },
  { id: "p4", nome_exibicao: "Lucas Lima Oliveira", nome_civil: "Lucas Lima Oliveira", cpf_mascarado: "***.***.***-77", nis_mascarado: "*******6757", data_nascimento: "2010-07-07", sexo: "MASCULINO", tipo_deficiencia: null, frequenta_escola: null, is_falecido: false, family_id: "2", familia_codigo: 1, familia_nome: "Carlos Henrique Oliveira Santos", parentesco: "FILHO", is_responsavel: false, bairro: "Jardim Esperança", unidade: "CRAS Norte", membro_pbf: true, beneficiario_bpc: false, cpf_irregular: true },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ familia, pessoas }) => {
    localStorage.setItem("govsocial-tema", "claro");
    const codificar = (valor: object) => btoa(JSON.stringify(valor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    sessionStorage.setItem("govsocial.access_token", `${codificar({ alg: "none", typ: "JWT" })}.${codificar({ sub: "e2e-admin", roles: ["ADMIN"], organization_id: "00000000-0000-0000-0000-000000000001", exp: 4102444800 })}.mock`);
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (entrada, init) => {
      const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url, location.href);
      if (url.pathname.endsWith("/families")) {
        return Promise.resolve(new Response(JSON.stringify([familia]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));
      }
      if (url.pathname.endsWith("/persons")) {
        return Promise.resolve(new Response(JSON.stringify(pessoas), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));
      }
      const revelacao = url.pathname.match(/\/persons\/(p\d+)\/reveal\/(cpf|nis)$/);
      if (revelacao) {
        const valores = {
          p1: { cpf: "123.456.789-31", nis: "12345678632" },
          p2: { cpf: "123.456.789-67", nis: "12345676152" },
          p3: { cpf: "123.456.789-43", nis: "12345676193" },
          p4: { cpf: "123.456.789-77", nis: "12345676757" },
        };
        const pessoa = valores[revelacao[1] as keyof typeof valores];
        return Promise.resolve(new Response(JSON.stringify({ value: pessoa[revelacao[2] as keyof typeof pessoa] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));
      }
      return fetchOriginal(entrada, init);
    };
  }, { familia: CARLOS, pessoas: PESSOAS });
});

test("renderiza a aba Pessoas completa, coerente e reversível", async ({ page }, testInfo) => {
  await page.goto("./familias");
  await page.getByRole("tab", { name: "Pessoas" }).click();

  await expect(page.getByRole("heading", { name: "Pessoas cadastradas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cadastrar nova pessoa" })).toContainText("Nova Pessoa");
  await expect(page.getByTitle("Filtrar por Total de pessoas")).toContainText("4");
  await expect(page.getByTitle("Filtrar por Total de pessoas")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTitle("Filtrar por Crianças (0–12)")).toContainText("1");
  await expect(page.getByTitle("Filtrar por Adolescentes (12–17)")).toContainText("1");
  await expect(page.getByTitle("Filtrar por Adultos (18–59)")).toContainText("2");
  await expect(page.getByTitle("Filtrar por Idosos (60+)")).toContainText("0");
  await expect(page.getByTitle("Filtrar por Pessoas com deficiência")).toContainText("1");
  await expect(page.getByTitle("Filtrar por Beneficiários do BPC")).toContainText("0");
  await expect(page.getByTitle("Filtrar por Sem CPF / CPF irregular")).toContainText("1");
  await expect(page.getByRole("alert", { name: "Alertas de pessoas" })).toContainText("1 CPF a regularizar");
  await expect(page.getByText("44 anos · Adulto")).toBeVisible();
  await expect(page.getByText("11 anos · Criança")).toBeVisible();
  await expect(page.getByText("16 anos · Adolescente")).toBeVisible();
  await expect(page.getByText("Vínculo:")).toHaveCount(0);
  const cardCarlos = page.getByRole("link", { name: /Carlos Henrique Oliveira Santos\. Abrir cadastro/ });
  await expect(cardCarlos.getByText("Masculino", { exact: true })).toBeVisible();

  const revelarCpf = cardCarlos.getByRole("button", { name: "Mostrar CPF completo" });
  await revelarCpf.click();
  await expect(page.getByText("123.456.789-31")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pessoas cadastradas" })).toBeVisible();
  await expect(cardCarlos.getByRole("button", { name: "Ocultar CPF" })).toBeVisible();

  await testInfo.attach("pessoas-cards-claro", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await page.getByRole("button", { name: "Visualização de pessoas em tabela" }).click();
  const tabela = page.getByRole("table", { name: "Pessoas cadastradas" });
  await expect(tabela).toBeVisible();
  await expect(tabela.getByRole("button", { name: "Mostrar NIS completo" }).first()).toBeVisible();
  expect((await tabela.locator("thead th").allTextContents()).map((t) => t.trim())).toEqual([
    "Selecionar tudo", "Nome", "CPF / NIS", "Idade / Faixa", "Gênero", "Vínculo", "Família", "Benefícios", "Ações",
  ]);
  await tabela.getByRole("checkbox", { name: "Selecionar Carlos Henrique Oliveira Santos" }).check();
  await expect(page.getByText("1 pessoa selecionada")).toBeVisible();

  await page.getByRole("button", { name: /Tema: claro/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "escuro");
  await testInfo.attach("pessoas-tabela-escuro", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await tabela.getByRole("button", { name: "Família nº 1", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Famílias cadastradas" })).toBeVisible();
  await expect(page.getByText("4 membros")).toBeVisible();
});

test("renderiza o acabamento final em cards e tabela nos dois temas", async ({ page }, testInfo) => {
  await page.goto("./familias");

  await expect(page.getByRole("heading", { name: "Famílias cadastradas" })).toBeVisible();
  await expect(page.getByText("Carlos Henrique Oliveira Santos")).toBeVisible();
  await expect(page.getByRole("button", { name: "Visualização em cards" })).toHaveAttribute("aria-pressed", "true");

  const alerta = page.getByRole("alert");
  await expect(alerta).toContainText("1 cadastro a regularizar");
  await expect(alerta).toContainText("(recadastramento vencido)");
  const dimensoesAlerta = await alerta.evaluate((elemento) => {
    const estilo = getComputedStyle(elemento);
    return {
      fundo: estilo.backgroundColor,
      bordaEsquerda: estilo.borderLeftWidth,
      largura: elemento.getBoundingClientRect().width,
      larguraPai: elemento.parentElement?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(dimensoesAlerta.fundo).not.toBe("rgba(0, 0, 0, 0)");
  expect(Number.parseFloat(dimensoesAlerta.bordaEsquerda)).toBeGreaterThanOrEqual(3);
  expect(Math.abs(dimensoesAlerta.largura - dimensoesAlerta.larguraPai)).toBeLessThanOrEqual(1);

  await testInfo.attach("familias-cards-claro", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.getByRole("button", { name: "Visualização em tabela" }).click();
  await expect(page.getByRole("button", { name: "Visualização em tabela" })).toHaveAttribute("aria-pressed", "true");

  const tabela = page.getByRole("table", { name: "Famílias cadastradas" });
  await expect(tabela).toBeVisible();
  await expect(tabela.getByText("Carlos Henrique Oliveira Santos")).toBeVisible();
  await expect(tabela.getByText("Pobreza", { exact: true })).toBeVisible();
  await expect(tabela.getByText("PBF ativo", { exact: true })).toBeVisible();
  await expect(tabela.getByText("A regularizar", { exact: true })).toBeVisible();

  const cabecalhos = (await tabela.locator("thead th").allTextContents()).map((texto) => texto.trim());
  expect(cabecalhos).toEqual([
    "Selecionar tudo",
    "Responsável",
    "Membros",
    "Bairro",
    "Faixa",
    "PBF",
    "Último atendimento",
    "Status do cadastro",
    "Ações",
  ]);

  await tabela.getByRole("checkbox", { name: "Selecionar família de Carlos Henrique Oliveira Santos" }).check();
  await expect(page.getByText("1 família selecionada")).toBeVisible();

  await testInfo.attach("familias-tabela-claro", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.getByRole("button", { name: /Tema: claro/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "escuro");

  const coresEscuras = await tabela.getByText("Pobreza", { exact: true }).evaluate((elemento) => {
    const estilo = getComputedStyle(elemento);
    return { fundo: estilo.backgroundColor, texto: estilo.color };
  });
  expect(coresEscuras.fundo).not.toBe("rgba(0, 0, 0, 0)");
  expect(coresEscuras.texto).not.toBe(coresEscuras.fundo);

  await testInfo.attach("familias-tabela-escuro", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("renderiza o prontuário honesto nas abas prioritárias", async ({ page }, testInfo) => {
  const familia = {
    id: "carlos", codigo: 1, responsavel_id: "p1", responsavel_nome: "Carlos Henrique Oliveira Santos", nis_responsavel_mascarado: "*******8880",
    cep: "58000000", logradouro: "Rua das Flores", numero: "18", complemento: null, bairro: "Centro", municipio: "Nova Esperança", uf: "PB", ponto_referencia: null, telefone_contato: null,
    situacao_rua: false, data_cadastramento: "2024-01-10", despesa_aluguel: null, despesa_transporte: null, despesa_alimentacao: null, despesa_medicamentos: null, despesa_outros: null,
    latitude: null, longitude: null, geocode_status: "PENDENTE", territorio: "Centro", faixa_renda: "POBREZA", no_cadunico: true, cadunico_atualizado_em: "2026-06-01", beneficiaria_pbf: true, possui_bpc: false, inseguranca_alimentar: false,
    membros: [
      ["m1", "p1", "Carlos Henrique Oliveira Santos", "RESPONSAVEL", true], ["m2", "p2", "Fernanda Lima Oliveira", "CONJUGE", false], ["m3", "p3", "Juliana Lima Oliveira", "FILHO", false], ["m4", "p4", "Lucas Lima Oliveira", "FILHO", false],
    ].map(([membership_id, person_id, nome_exibicao, parentesco, is_responsavel]) => ({ membership_id, person_id, nome_exibicao, parentesco, is_responsavel, status: "ATIVO", data_entrada: "2024-01-10", data_saida: null })),
    created_at: "2024-01-10T10:00:00Z", updated_at: "2026-07-15T14:15:00Z",
  };
  await page.addInitScript((detalhe) => {
    const anterior = window.fetch.bind(window);
    window.fetch = (entrada, init) => {
      const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url, location.href);
      if (url.pathname.endsWith("/families/carlos")) return Promise.resolve(new Response(JSON.stringify(detalhe), { status: 200, headers: { "Content-Type": "application/json" } }));
      if (url.pathname.endsWith("/case-files") && url.searchParams.get("family_id") === "carlos") return Promise.resolve(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
      if (url.pathname.endsWith("/case-files/family/carlos/network")) return Promise.resolve(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
      return anterior(entrada, init);
    };
  }, familia);
  await page.route("**/*", (route) => route.request().url().includes("/families/carlos") ? route.fulfill({ json: familia }) : route.fallback());
  await page.route("**/api/govsocial/v1/case-files?family_id=carlos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/govsocial/v1/case-files/family/carlos/network", (route) => route.fulfill({ json: [] }));
  await page.goto("./familias/carlos");

  await expect(page.getByRole("heading", { name: "Carlos Henrique Oliveira Santos" })).toBeVisible();
  await expect(page.getByText("PBF ativo", { exact: true })).toBeVisible();
  await expect(page.getByText("Pobreza", { exact: true })).toBeVisible();
  await expect(page.getByText("A regularizar", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mostrar NIS completo" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Atendimentos.*3 registros/ })).toBeVisible();
  await expect(page.getByText("sobre: Lucas Lima Oliveira").first()).toBeVisible();
  await testInfo.attach("prontuario-trilha", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await page.getByRole("tab", { name: /Composição familiar/ }).click();
  await expect(page.getByText("44 anos · Adulto")).toBeVisible();
  await expect(page.getByText("Pessoa com deficiência")).toBeVisible();

  await page.getByRole("tab", { name: /Atendimentos/ }).click();
  await expect(page.getByRole("heading", { name: "Atendimentos da família" })).toBeVisible();
  await expect(page.getByText("Visita domiciliar", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /Benefícios eventuais/ }).click();
  await expect(page.getByRole("heading", { name: "Benefícios de transferência de renda (via CadÚnico)" })).toBeVisible();
  await expect(page.getByText(/Nenhum benefício EVENTUAL/)).toBeVisible();

  await page.getByRole("tab", { name: /Encaminhamentos/ }).click();
  await expect(page.getByText("UBS Centro")).toBeVisible();
  await testInfo.attach("prontuario-encaminhamentos", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

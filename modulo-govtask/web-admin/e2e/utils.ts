import type { Page } from "@playwright/test";

/** Stub da API do GovTask para os testes de navegador.
 *
 * Os specs exercitam a interface de verdade sem backend: as chamadas são
 * interceptadas no navegador e devolvem dados controlados. O que se verifica é
 * o comportamento da tela — o que ela envia e para onde navega.
 */

const USER = {
  id: "u1",
  email: "assessor@municipio.gov.br",
  name: "Assessor",
  roles: [{ id: "r1", name: "ASSESSOR", label: "Assessor" }],
  permissions: [
    "resource.view",
    "resource.create",
    "resource.edit",
    "admin.config",
    "financial.view",
  ],
  organization_id: "o1",
};

const CATALOGOS = {
  tipos: [
    { id: "t1", chave: "AQUISICAO", rotulo: "Aquisição" },
    { id: "t2", chave: "OBRA", rotulo: "Obra" },
  ],
  categorias: [],
  status: [
    { id: "s1", chave: "ABERTA", rotulo: "Aberta", is_inicial: true, is_final: false },
    { id: "s2", chave: "EM_ANDAMENTO", rotulo: "Em andamento", is_final: false },
    { id: "s3", chave: "CONCLUIDA", rotulo: "Concluída", is_final: true },
  ],
};

const DEMANDA_RESUMO = {
  id: "d1",
  numero: "2026/000001",
  titulo: "Aquisição de ambulância",
  prioridade: "NORMAL",
  progresso: 0,
  versao: 1,
  prazo_final: null,
  ultima_movimentacao_em: "2026-09-17T12:00:00Z",
  bloqueada: false,
  atrasada: false,
  dias_sem_movimentacao: 0,
  concluida_em: null,
  status: { id: "s1", rotulo: "Aberta" },
  tags: [],
};

export const DEMANDA_DETALHE = {
  ...DEMANDA_RESUMO,
  descricao: null,
  objeto: null,
  resumo_executivo: null,
  proxima_acao: null,
  seguindo: false,
  favorito: false,
};

export type Capturas = {
  criacao?: Record<string, unknown>;
  status?: { id: string; statusId: string };
};

export async function instalarApiMock(page: Page): Promise<Capturas> {
  const capturas: Capturas = {};

  await page.addInitScript(() => {
    localStorage.setItem("govtask_access_token", "e2e-token");
  });

  await page.route("**/api/govtask/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const metodo = request.method();
    const json = (dados: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(dados) });

    if (url.includes("/eventos/stream")) return route.abort();
    if (url.includes("/auth/me")) return json(USER);
    if (url.includes("/notificacoes/resumo")) return json({ total: 0, nao_lidas: 0 });
    if (url.includes("/notificacoes/preferencias")) return json({ email_ativo: false, tipos_email: [], tipos_disponiveis: [], tipos_obrigatorios: [] });
    if (url.includes("/catalogos/demandas")) return json(CATALOGOS);
    if (url.includes("/admin/users")) return json([{ id: "u1", name: "Assessor", email: "a@b.c" }]);
    if (url.includes("/admin/setores")) return json([{ id: "set1", nome: "Gabinete", sigla: "GAB" }]);
    if (url.includes("/workflows")) return json([]);
    // Endpoints de lista que as telas testadas carregam na montagem. Devolver
    // `[]` (e não `{}`) evita que um `.map` derrube a tela durante o teste.
    if (
      [
        "/visoes",
        "/alertas",
        "/mencoes",
        "/autoridades",
        "/obras",
        "/protocolos",
        "/checklists",
        "/comentarios",
        "/campos-customizados",
        "/medicoes",
        "/documentos",
      ].some((caminho) => url.includes(caminho))
    ) {
      return json([]);
    }

    const statusDemanda = url.match(/\/demandas\/([^/?]+)\/status/);
    if (statusDemanda && metodo === "POST") {
      const corpo = JSON.parse(request.postData() || "{}");
      capturas.status = { id: statusDemanda[1], statusId: corpo.status_id };
      const destino = CATALOGOS.status.find((s) => s.id === corpo.status_id);
      return json({ ...DEMANDA_DETALHE, status: destino ? { id: destino.id, rotulo: destino.rotulo } : DEMANDA_DETALHE.status });
    }

    if (url.match(/\/demandas$/) && metodo === "POST") {
      capturas.criacao = JSON.parse(request.postData() || "{}");
      return json(DEMANDA_DETALHE, 201);
    }
    if (url.match(/\/demandas\/[^/?]+$/) && metodo === "GET") return json(DEMANDA_DETALHE);
    if (url.includes("/tarefas")) return json([]);
    if (url.includes("/timeline")) return json({ total: 0, items: [] });
    if (url.includes("/demandas")) return json({ items: [DEMANDA_RESUMO], total: 1, page: 1, page_size: 25, pages: 1 });

    return json({});
  });

  return capturas;
}

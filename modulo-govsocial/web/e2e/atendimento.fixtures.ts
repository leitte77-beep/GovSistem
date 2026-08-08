export const FAMILIA = {
  id: "2",
  codigo: 1,
  responsavel_id: "p1",
  responsavel_nome: "Carlos Henrique Oliveira Santos",
  nis_responsavel_mascarado: "*******8880",
  cep: "58000000",
  logradouro: "Rua das Flores",
  numero: "18",
  complemento: null,
  bairro: "Jardim Esperança",
  municipio: "Nova Esperança",
  uf: "PB",
  ponto_referencia: null,
  telefone_contato: null,
  situacao_rua: false,
  data_cadastramento: "2024-01-10",
  latitude: null,
  longitude: null,
  geocode_status: "PENDENTE",
  territorio: "Centro",
  faixa_renda: "POBREZA",
  no_cadunico: true,
  cadunico_atualizado_em: "2026-06-01",
  beneficiaria_pbf: true,
  possui_bpc: false,
  inseguranca_alimentar: false,
  membros: [
    ["m1", "p1", "Carlos Henrique Oliveira Santos", "RESPONSAVEL", true],
    ["m2", "p2", "Fernanda Lima Oliveira", "CONJUGE", false],
    ["m3", "p3", "Juliana Lima Oliveira", "FILHO", false],
    ["m4", "p4", "Lucas Lima Oliveira", "FILHO", false],
  ].map(([membership_id, person_id, nome_exibicao, parentesco, is_responsavel]) => ({
    membership_id,
    person_id,
    nome_exibicao,
    parentesco,
    is_responsavel,
    status: "ATIVO",
    data_entrada: "2024-01-10",
    data_saida: null,
  })),
  created_at: "2024-01-10T10:00:00Z",
  updated_at: "2026-07-15T14:15:00Z",
};

export const SERVICOS = [
  { id: "s1", code: "ABORD", nome: "Serviço Especializado em Abordagem Social", sigla: "ABORD", source: "NACIONAL", vigencia_inicio: "2024-01-01", vigencia_fim: null, ativo: true, protecao: "ESPECIAL_ALTA" },
  { id: "s2", code: "ACOLH", nome: "Serviço de Acolhimento Institucional", sigla: "ACOLH", source: "NACIONAL", vigencia_inicio: "2024-01-01", vigencia_fim: null, ativo: true, protecao: "ESPECIAL_ALTA" },
  { id: "s3", code: "MSE", nome: "Serviço de MSE em Meio Aberto", sigla: "MSE", source: "NACIONAL", vigencia_inicio: "2024-01-01", vigencia_fim: null, ativo: true, protecao: "ESPECIAL_MEDIA" },
  { id: "s4", code: "PAIF", nome: "Serviço de Proteção e Atendimento Integral à Família", sigla: "PAIF", source: "NACIONAL", vigencia_inicio: "2024-01-01", vigencia_fim: null, ativo: true, protecao: "BASICA" },
  { id: "s5", code: "PAEFI", nome: "Serviço de Proteção e Atendimento Especializado a Famílias e Indivíduos", sigla: "PAEFI", source: "NACIONAL", vigencia_inicio: "2024-01-01", vigencia_fim: null, ativo: true, protecao: "ESPECIAL_MEDIA" },
  { id: "s6", code: "SCFV", nome: "Serviço de Convivência e Fortalecimento de Vínculos", sigla: "SCFV", source: "NACIONAL", vigencia_inicio: "2024-01-01", vigencia_fim: null, ativo: true, protecao: "BASICA" },
  { id: "s7", code: "PSR", nome: "Serviço Especializado para Pessoas em Situação de Rua", sigla: "PSR", source: "NACIONAL", vigencia_inicio: "2024-01-01", vigencia_fim: null, ativo: true, protecao: "ESPECIAL_ALTA" },
];

export const UNIDADES = [{ id: "u1", nome: "CRAS Norte", is_active: true }];

declare global {
  interface Window {
    __atendimentos: unknown[];
    __trilha: unknown[];
  }
}

export async function instalarMocks(page: import("@playwright/test").Page, { trilha = [] as unknown[] } = {}) {
  await page.addInitScript(
    ({ familia, servicos, unidades, trilha }) => {
      window.__atendimentos = [];
      window.__trilha = trilha ?? [];
      localStorage.setItem("govsocial-tema", "claro");
      const codificar = (valor: unknown) => btoa(JSON.stringify(valor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      sessionStorage.setItem(
        "govsocial.access_token",
        `${codificar({ alg: "none", typ: "JWT" })}.${codificar({ sub: "e2e-admin", roles: ["ADMIN"], organization_id: "00000000-0000-0000-0000-000000000001", exp: 4102444800 })}.mock`,
      );
      window.fetch = (entrada, init) => {
        const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url, location.href);
        const p = url.pathname;
        const metodo = (init?.method ?? "GET").toUpperCase();
        const json = (corpo: unknown, status = 200) =>
          Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } }));
        if (p.endsWith("/service-types")) return json(servicos);
        if (p.endsWith("/units")) return json(unidades);
        if (p.endsWith("/auth/me"))
          return json({
            id: "e2e-admin",
            name: "Profissional Teste",
            roles: [{ name: "ADMIN" }],
            organization_id: "00000000-0000-0000-0000-000000000001",
            lotacoes: [],
          });
        if (/\/families\/[0-9a-zA-Z-]+$/.test(p) && metodo === "GET") return json(familia);
        if (p.endsWith("/families") && metodo === "GET") return json([]);
        if (p.endsWith("/case-files") && metodo === "GET") return json([]);
        if (p.endsWith("/case-files") && metodo === "POST")
          return json(
            {
              id: "cf1",
              family_id: familia.id,
              unit_id: "u1",
              service_type_code: JSON.parse(String(init?.body ?? "{}")).service_type_code ?? "PAIF",
              status: "ATIVO",
              acolhida_data: null,
              aberto_em: "2026-01-01",
              created_at: "2026-01-01T00:00:00Z",
            },
            201,
          );
        const tl = p.match(/\/case-files\/([0-9a-zA-Z-]+)\/timeline$/);
        if (tl && metodo === "GET") return json(window.__trilha ?? []);
        const att = p.match(/\/case-files\/([0-9a-zA-Z-]+)\/attendances$/);
        if (att && metodo === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}"));
          window.__atendimentos.push(body);
          return json(
            {
              id: "att1",
              case_file_id: att[1],
              unit_id: "u1",
              service_type_code: "PAIF",
              data_atendimento: body.data_atendimento,
              tipo: body.tipo,
              sigiloso_reforcado: body.sigiloso_reforcado,
              registrado_por_id: null,
              member_ids: body.member_ids,
              professional_ids: [],
              evolution_text: body.evolution_text,
              evolution_restrita: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            201,
          );
        }
        return json({ detail: "nao mockado" }, 404);
      };
    },
    { familia: FAMILIA, servicos: SERVICOS, unidades: UNIDADES, trilha },
  );
}

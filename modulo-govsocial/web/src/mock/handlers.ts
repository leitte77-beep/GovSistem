import { http, HttpResponse, delay } from "msw";
import { UNIDADES, TENANT, meDoPerfil } from "./fixtures/novaEsperanca";
import { papelDoAmbiente } from "./tokenFalso";
import { decodificarClaims } from "@/nucleo/auth/jwt";
import type { Papel } from "@/tipos/api";
import {
  adicionarMembro,
  buscarPessoas,
  cpfOuNisEmUso,
  criarFamilia,
  criarPessoa,
  encontrarDuplicatas,
  obterFamilia,
  obterPessoa,
} from "./fixtures/store";
import {
  criarEncontro as criarEncontroMock,
  encontroExiste,
  inscrever as inscreverMock,
  listarAcoes,
  listarEncontros,
  listarFrequencia,
  listarInscricoes,
  obterAcao,
  registrarFrequencia as registrarFrequenciaMock,
} from "./fixtures/grupos";
import {
  atualizarAgendamento,
  chamarAgendamento,
  criarAgendamento,
  filaDoDia as filaAgendaDoDia,
  listarAgendamentos,
} from "./fixtures/agenda";
import {
  aceitarEncaminhamento,
  cancelarEncaminhamento,
  criarEncaminhamento,
  devolverEncaminhamento,
  gerarOficio,
  listarEncaminhamentos,
  obterEncaminhamento,
  recusarEncaminhamento,
} from "./fixtures/encaminhamentos";
import {
  CASE_FILE_PAIF,
  REDE,
  SERVICE_TYPES,
  TIMELINE,
  atendimentoPorId,
  criarAtendimentoMock,
  criarCaseFile,
  listarCaseFiles,
  serviceCodeDoCaseFile,
  timelineDinamica,
} from "./fixtures/prontuario";
import {
  BENEFIT_TYPES,
  criarConcessao,
  listarConcessoes,
  obterConcessao,
  temDuplicidade,
  transicionar,
} from "./fixtures/beneficios";
import {
  calcularOuObter as calcularOuObterRma,
  drillDown as drillDownRma,
  exportarCsv as exportarCsvRma,
  obterFechamento,
  fecharFechamento,
  ajustarFechamento,
  reabrirFechamento,
  listarFechamentos,
} from "./fixtures/rma";
import {
  DASHBOARD_BENEFICIOS,
  DASHBOARD_INDICADORES,
  DASHBOARD_MAPA,
  DASHBOARD_OVERVIEW,
  DASHBOARD_SERIE,
  DASHBOARD_TERRITORIOS,
} from "./fixtures/dashboard";
import {
  executarEtapa,
  listarImportacoes,
  obterImportacao,
  processarUpload,
  statusOnboarding,
} from "./fixtures/admin";

/**
 * Handlers MSW fiéis aos contratos do backend (/api/govsocial/v1).
 * Erros seguem RFC 9457 (application/problem+json). Latência simulada para
 * exercitar skeletons; um endpoint de erro exercita o EstadoErro.
 */
const BASE = "/api/govsocial/v1";

const CT_PROBLEM = { "Content-Type": "application/problem+json" };

function problema(status: number, title: string, detail: string, extra?: object) {
  return HttpResponse.json(
    { type: "about:blank", title, status, detail, ...extra },
    { status, headers: CT_PROBLEM },
  );
}

/** Resolve o perfil a partir do token (como o backend faria). */
function papelDaRequisicao(request: Request): Papel {
  const auth = request.headers.get("Authorization");
  const token = auth?.replace(/^Bearer\s+/i, "");
  const claims = token ? decodificarClaims(token) : null;
  return claims?.roles?.[0] ?? papelDoAmbiente();
}

export const handlers = [
  http.get(`${BASE}/auth/me`, async ({ request }) => {
    await delay(120);
    return HttpResponse.json(meDoPerfil(papelDaRequisicao(request)));
  }),

  http.post(`${BASE}/auth/login`, async ({ request }) => {
    await delay(150);
    return HttpResponse.json({
      access_token: "mock",
      refresh_token: "mock",
      user: meDoPerfil(papelDaRequisicao(request)),
    });
  }),

  http.get(`${BASE}/units`, async () => {
    await delay(120);
    return HttpResponse.json(UNIDADES);
  }),

  // Tipos de serviço (domínio) para o registro de atendimento.
  http.get(`${BASE}/service-types`, async () => {
    await delay(80);
    return HttpResponse.json(SERVICE_TYPES);
  }),

  // ── Benefícios eventuais (Fase 5) ──────────────────────────────
  http.get(`${BASE}/benefit-types`, async () => {
    await delay(80);
    return HttpResponse.json(BENEFIT_TYPES);
  }),

  http.get(`${BASE}/benefit-concessions`, async ({ request }) => {
    await delay(140);
    const familyId = new URL(request.url).searchParams.get("family_id") ?? undefined;
    return HttpResponse.json(listarConcessoes(familyId));
  }),

  http.get(`${BASE}/benefit-concessions/:id`, async ({ params }) => {
    await delay(120);
    const c = obterConcessao(String(params.id));
    if (!c) return problema(404, "Recurso não encontrado", "Concessão não encontrada.");
    return HttpResponse.json(c);
  }),

  http.post(`${BASE}/benefit-concessions`, async ({ request }) => {
    await delay(160);
    const body = (await request.json()) as {
      family_id: string;
      unit_id: string;
      benefit_type_code: string;
      quantidade?: number;
    };
    // Antiduplicidade: o backend bloqueia com 409 (o front avisa em âmbar antes).
    if (temDuplicidade(body.family_id, body.benefit_type_code)) {
      return problema(
        409,
        "Conflito",
        `Família já recebeu ${body.benefit_type_code} dentro do período de antiduplicidade`,
      );
    }
    return HttpResponse.json(criarConcessao(body), { status: 201 });
  }),

  http.post(`${BASE}/benefit-concessions/:id/analyze`, async ({ request, params }) => {
    await delay(120);
    const body = (await request.json().catch(() => ({}))) as { parecer?: string | null };
    const c = transicionar(String(params.id), "analyze", { parecer: body.parecer ?? null });
    if (!c) return problema(404, "Recurso não encontrado", "Concessão não encontrada.");
    return HttpResponse.json(c);
  }),

  http.post(`${BASE}/benefit-concessions/:id/approve`, async ({ params }) => {
    await delay(120);
    const c = transicionar(String(params.id), "approve");
    if (!c) return problema(404, "Recurso não encontrado", "Concessão não encontrada.");
    return HttpResponse.json(c);
  }),

  http.post(`${BASE}/benefit-concessions/:id/deny`, async ({ request, params }) => {
    await delay(120);
    const body = (await request.json().catch(() => ({}))) as { motivo_negacao?: string };
    const c = transicionar(String(params.id), "deny", { motivo: body.motivo_negacao });
    if (!c) return problema(404, "Recurso não encontrado", "Concessão não encontrada.");
    return HttpResponse.json(c);
  }),

  http.post(`${BASE}/benefit-concessions/:id/deliver`, async ({ params }) => {
    await delay(140);
    const c = transicionar(String(params.id), "deliver");
    if (!c) return problema(404, "Recurso não encontrado", "Concessão não encontrada.");
    return HttpResponse.json(c);
  }),

  // Busca unificada (store em memória).
  http.get(`${BASE}/search`, async ({ request }) => {
    await delay(200);
    const q = new URL(request.url).searchParams.get("q") ?? "";
    if (!q) return HttpResponse.json([]);
    return HttpResponse.json(buscarPessoas(q));
  }),

  // Criação de pessoa com detecção de duplicata (espelha persons.py).
  http.post(`${BASE}/persons`, async ({ request }) => {
    await delay(180);
    const body = (await request.json()) as {
      nome_civil: string;
      nome_social?: string | null;
      cpf?: string | null;
      nis?: string | null;
      data_nascimento?: string | null;
      sexo?: string | null;
      confirmar_duplicata?: boolean;
    };

    const emUso = cpfOuNisEmUso(body.cpf ?? null, body.nis ?? null);
    if (emUso) {
      return problema(409, "Conflito", `Já existe pessoa com este ${emUso.toUpperCase()} no tenant`);
    }

    if (!body.confirmar_duplicata) {
      const candidatos = encontrarDuplicatas(body.nome_civil, body.data_nascimento ?? null);
      if (candidatos.length > 0) {
        return HttpResponse.json({ created: false, person: null, duplicates: candidatos }, { status: 201 });
      }
    }

    const person = criarPessoa({
      nome_civil: body.nome_civil,
      nome_social: body.nome_social ?? null,
      cpf: body.cpf ?? null,
      nis: body.nis ?? null,
      data_nascimento: body.data_nascimento ?? null,
      sexo: body.sexo ?? null,
    });
    return HttpResponse.json({ created: true, person, duplicates: [] }, { status: 201 });
  }),

  // Família (detalhe).
  http.get(`${BASE}/families/:id`, async ({ params }) => {
    await delay(160);
    const fam = obterFamilia(String(params.id));
    if (!fam) return problema(404, "Recurso não encontrado", "Não encontramos esta família.");
    return HttpResponse.json(fam);
  }),

  // Criação de família.
  http.post(`${BASE}/families`, async ({ request }) => {
    await delay(180);
    const body = (await request.json()) as Record<string, unknown>;
    const fam = criarFamilia(body);
    return HttpResponse.json(fam, { status: 201 });
  }),

  // Adicionar membro à família.
  http.post(`${BASE}/families/:id/members`, async ({ request, params }) => {
    await delay(140);
    const body = (await request.json()) as {
      person_id: string;
      parentesco?: string | null;
      definir_responsavel?: boolean;
    };
    const fam = adicionarMembro(
      String(params.id),
      body.person_id,
      body.parentesco ?? null,
      Boolean(body.definir_responsavel),
    );
    if (!fam) return problema(422, "Erro de validação", "Pessoa ou família inválida.");
    return HttpResponse.json(fam, { status: 201 });
  }),

  // Atendimento (evolução restrita — sigilo).
  http.get(`${BASE}/case-files/:cid/attendances/:aid`, async ({ params }) => {
    await delay(150);
    const att = atendimentoPorId(String(params.aid));
    if (!att) return problema(404, "Recurso não encontrado", "Atendimento não encontrado.");
    return HttpResponse.json({
      ...att,
      member_ids: [],
      professional_ids: att.registrado_por_id ? [att.registrado_por_id] : [],
      created_at: att.data_atendimento,
      updated_at: att.data_atendimento,
    });
  }),

  // Cria atendimento sob um prontuário (idempotente por header).
  http.post(`${BASE}/case-files/:cid/attendances`, async ({ request, params }) => {
    await delay(160);
    const caseFileId = String(params.cid);
    const meta = serviceCodeDoCaseFile(caseFileId);
    if (!meta) return problema(404, "Recurso não encontrado", "Prontuário não encontrado.");
    const body = (await request.json()) as {
      data_atendimento: string;
      tipo: string;
      evolution_text: string | null;
      sigiloso_reforcado: boolean;
      member_ids?: string[];
      professional_ids?: string[];
    };
    const att = criarAtendimentoMock(caseFileId, meta.unitId, meta.code, body);
    return HttpResponse.json(
      {
        ...att,
        member_ids: body.member_ids ?? [],
        professional_ids: body.professional_ids ?? [],
        created_at: att.data_atendimento,
        updated_at: att.data_atendimento,
      },
      { status: 201 },
    );
  }),

  // Prontuários de uma família (opcionalmente por unidade).
  http.get(`${BASE}/case-files`, async ({ request }) => {
    await delay(140);
    const url = new URL(request.url);
    const familyId = url.searchParams.get("family_id");
    const unitId = url.searchParams.get("unit_id") ?? undefined;
    if (!familyId) return HttpResponse.json([]);
    return HttpResponse.json(listarCaseFiles(familyId, unitId));
  }),

  // Cria prontuário (409 se já existe família/unidade/serviço).
  http.post(`${BASE}/case-files`, async ({ request }) => {
    await delay(150);
    const body = (await request.json()) as {
      family_id: string;
      unit_id: string;
      service_type_code: string;
    };
    const existentes = listarCaseFiles(body.family_id, body.unit_id);
    if (existentes.some((c) => c.service_type_code === body.service_type_code)) {
      return problema(409, "Conflito", "Já existe prontuário desta família/unidade/serviço");
    }
    const cf = criarCaseFile(body.family_id, body.unit_id, body.service_type_code);
    return HttpResponse.json(cf, { status: 201 });
  }),

  // Linha do tempo (timeline) de um prontuário.
  http.get(`${BASE}/case-files/:cid/timeline`, async ({ params }) => {
    await delay(160);
    const cid = String(params.cid);
    const criados = listarCaseFiles(CASE_FILE_PAIF.family_id).map((c) => c.id);
    if (cid === CASE_FILE_PAIF.id) {
      // Inclui os atendimentos criados no mock, além dos fixos.
      const extras = timelineDinamica(cid);
      return HttpResponse.json([...extras, ...TIMELINE]);
    }
    if (criados.includes(cid)) {
      return HttpResponse.json(timelineDinamica(cid));
    }
    return HttpResponse.json([]);
  }),

  // Visão de rede da família (existência sem conteúdo).
  http.get(`${BASE}/case-files/family/:fid/network`, async () => {
    await delay(150);
    return HttpResponse.json(REDE);
  }),

  // ── Grupos / SCFV e frequência (Fase 6) ────────────────────────
  http.get(`${BASE}/acoes-coletivas`, async ({ request }) => {
    await delay(140);
    const unitId = new URL(request.url).searchParams.get("unit_id") ?? undefined;
    return HttpResponse.json(listarAcoes(unitId));
  }),

  http.get(`${BASE}/acoes-coletivas/:id`, async ({ params }) => {
    await delay(120);
    const a = obterAcao(String(params.id));
    if (!a) return problema(404, "Recurso não encontrado", "Ação não encontrada.");
    return HttpResponse.json(a);
  }),

  http.get(`${BASE}/acoes-coletivas/:id/enrollments`, async ({ params }) => {
    await delay(120);
    return HttpResponse.json(listarInscricoes(String(params.id)));
  }),

  http.post(`${BASE}/acoes-coletivas/:id/enrollments`, async ({ request, params }) => {
    await delay(150);
    const body = (await request.json()) as { person_id: string; family_id?: string | null };
    const insc = inscreverMock(String(params.id), body.person_id, body.family_id ?? null);
    if (!insc) {
      return problema(409, "Conflito", "Pessoa já inscrita nesta ação.");
    }
    return HttpResponse.json(insc, { status: 201 });
  }),

  http.get(`${BASE}/acoes-coletivas/:id/meetings`, async ({ params }) => {
    await delay(120);
    return HttpResponse.json(listarEncontros(String(params.id)));
  }),

  http.post(`${BASE}/acoes-coletivas/:id/meetings`, async ({ request, params }) => {
    await delay(150);
    const body = (await request.json()) as { data_encontro: string; tema?: string | null };
    const enc = criarEncontroMock(String(params.id), body.data_encontro, body.tema ?? null);
    if (!enc) return problema(404, "Recurso não encontrado", "Ação não encontrada.");
    return HttpResponse.json(enc, { status: 201 });
  }),

  http.get(
    `${BASE}/acoes-coletivas/:id/meetings/:encontroId/attendance`,
    async ({ params }) => {
      await delay(120);
      return HttpResponse.json(listarFrequencia(String(params.encontroId)));
    },
  ),

  http.post(
    `${BASE}/acoes-coletivas/:id/meetings/:encontroId/attendance`,
    async ({ request, params }) => {
      await delay(160);
      const encontroId = String(params.encontroId);
      if (!encontroExiste(encontroId)) {
        return problema(404, "Recurso não encontrado", "Encontro não encontrado.");
      }
      const body = (await request.json()) as {
        inscricao_id: string;
        presente: boolean;
        justificativa: string | null;
      }[];
      return HttpResponse.json(registrarFrequenciaMock(encontroId, body));
    },
  ),

  // Detalhe de pessoa (para resolver nomes na chamada de frequência).
  http.get(`${BASE}/persons/:id`, async ({ params }) => {
    await delay(100);
    const p = obterPessoa(String(params.id));
    if (!p) return problema(404, "Recurso não encontrado", "Pessoa não encontrada.");
    return HttpResponse.json(p);
  }),

  // ── Agenda & Fila do dia (Fase 7) ──────────────────────────────
  http.get(`${BASE}/appointments/daily-queue`, async ({ request }) => {
    await delay(120);
    const unitId = new URL(request.url).searchParams.get("unit_id") ?? "";
    return HttpResponse.json(filaAgendaDoDia(unitId));
  }),

  http.get(`${BASE}/appointments`, async ({ request }) => {
    await delay(140);
    const unitId = new URL(request.url).searchParams.get("unit_id") ?? undefined;
    return HttpResponse.json(listarAgendamentos(unitId));
  }),

  http.post(`${BASE}/appointments`, async ({ request }) => {
    await delay(160);
    const body = (await request.json()) as { unit_id: string };
    return HttpResponse.json(criarAgendamento(body), { status: 201 });
  }),

  http.post(`${BASE}/appointments/:id/call`, async ({ request, params }) => {
    await delay(120);
    const body = (await request.json()) as { professional_id: string };
    const a = chamarAgendamento(String(params.id), body.professional_id);
    if (!a) return problema(404, "Recurso não encontrado", "Agendamento não encontrado.");
    return HttpResponse.json(a);
  }),

  http.patch(`${BASE}/appointments/:id`, async ({ request, params }) => {
    await delay(120);
    const body = (await request.json()) as Record<string, unknown>;
    const a = atualizarAgendamento(String(params.id), body);
    if (!a) return problema(404, "Recurso não encontrado", "Agendamento não encontrado.");
    return HttpResponse.json(a);
  }),

  // Recepção espontânea (não é atendimento — regra do RMA).
  http.get(`${BASE}/reception`, async ({ request }) => {
    await delay(120);
    void new URL(request.url).searchParams.get("unit_id");
    // O mock não mantém recepção separada; a fila do dia usa os agendamentos.
    return HttpResponse.json([]);
  }),

  // ── Encaminhamentos (Fase 7) ───────────────────────────────────
  http.get(`${BASE}/encaminhamentos-pendentes`, async ({ request }) => {
    await delay(120);
    const unitId = new URL(request.url).searchParams.get("unit_id") ?? "";
    return HttpResponse.json(
      listarEncaminhamentos({ destino_id: unitId, status: "PENDENTE", tipo: "INTERNO" }),
    );
  }),

  http.get(`${BASE}/encaminhamentos`, async ({ request }) => {
    await delay(140);
    const url = new URL(request.url);
    return HttpResponse.json(
      listarEncaminhamentos({
        unit_id: url.searchParams.get("unit_id") ?? undefined,
        destino_id: url.searchParams.get("destino_id") ?? undefined,
        tipo: url.searchParams.get("tipo") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
      }),
    );
  }),

  http.post(`${BASE}/encaminhamentos`, async ({ request }) => {
    await delay(160);
    const body = (await request.json()) as {
      unit_id: string;
      tipo: string;
      unidade_destino_id?: string | null;
      referral_code?: string | null;
    };
    if (body.tipo === "INTERNO" && !body.unidade_destino_id) {
      return problema(422, "Erro de validação", "Encaminhamento interno requer unidade de destino.");
    }
    if (body.tipo === "EXTERNO" && !body.referral_code) {
      return problema(422, "Erro de validação", "Encaminhamento externo requer código de referência.");
    }
    return HttpResponse.json(criarEncaminhamento(body), { status: 201 });
  }),

  http.get(`${BASE}/encaminhamentos/:id`, async ({ params }) => {
    await delay(120);
    const e = obterEncaminhamento(String(params.id));
    if (!e) return problema(404, "Recurso não encontrado", "Encaminhamento não encontrado.");
    return HttpResponse.json(e);
  }),

  http.post(`${BASE}/encaminhamentos/:id/accept`, async ({ request, params }) => {
    await delay(120);
    const body = (await request.json().catch(() => ({}))) as {
      profissional_destino_id?: string | null;
    };
    const e = aceitarEncaminhamento(String(params.id), body.profissional_destino_id ?? null);
    if (!e) return problema(422, "Erro de validação", "Status inválido para aceite.");
    return HttpResponse.json(e);
  }),

  http.post(`${BASE}/encaminhamentos/:id/reject`, async ({ request, params }) => {
    await delay(120);
    const body = (await request.json()) as { motivo_recusa: string };
    const e = recusarEncaminhamento(String(params.id), body.motivo_recusa);
    if (!e) return problema(422, "Erro de validação", "Status inválido para recusa.");
    return HttpResponse.json(e);
  }),

  http.post(`${BASE}/encaminhamentos/:id/return`, async ({ request, params }) => {
    await delay(140);
    const body = (await request.json().catch(() => ({}))) as { devolutiva?: string | null };
    const e = devolverEncaminhamento(String(params.id), body.devolutiva ?? null);
    if (!e) {
      return problema(422, "Erro de validação", "Status inválido para devolutiva (precisa estar aceito).");
    }
    return HttpResponse.json(e);
  }),

  http.post(`${BASE}/encaminhamentos/:id/generate-office`, async ({ params }) => {
    await delay(140);
    const e = gerarOficio(String(params.id));
    if (!e) return problema(404, "Recurso não encontrado", "Encaminhamento externo não encontrado.");
    return HttpResponse.json({ message: "ok", numero_oficio: e.numero_oficio, status: e.status });
  }),

  http.post(`${BASE}/encaminhamentos/:id/cancel`, async ({ params }) => {
    await delay(120);
    const e = cancelarEncaminhamento(String(params.id));
    if (!e) return problema(422, "Erro de validação", "Não é possível cancelar este encaminhamento.");
    return HttpResponse.json(e);
  }),

  // ── RMA (Fase 8, §4.8) ─────────────────────────────────────────
  http.get(`${BASE}/rma`, async ({ request }) => {
    await delay(140);
    const url = new URL(request.url);
    return HttpResponse.json(
      listarFechamentos({
        unit_id: url.searchParams.get("unit_id") ?? undefined,
        ano: url.searchParams.get("ano") ? Number(url.searchParams.get("ano")) : undefined,
        status: url.searchParams.get("status") ?? undefined,
      }),
    );
  }),

  // calculate é POST com query params e SEM corpo (idempotente).
  http.post(`${BASE}/rma/calculate`, async ({ request }) => {
    await delay(220);
    const url = new URL(request.url);
    const unitId = url.searchParams.get("unit_id");
    const ano = Number(url.searchParams.get("ano"));
    const mes = Number(url.searchParams.get("mes"));
    if (!unitId || !ano || !mes) {
      return problema(422, "Erro de validação", "Informe unidade, ano e mês.");
    }
    return HttpResponse.json(calcularOuObterRma(unitId, ano, mes));
  }),

  http.get(`${BASE}/rma/:id/drilldown`, async ({ request, params }) => {
    await delay(160);
    const url = new URL(request.url);
    const bloco = url.searchParams.get("bloco") ?? "";
    const campo = url.searchParams.get("campo") ?? "";
    const d = drillDownRma(String(params.id), bloco, campo);
    if (!d) return problema(404, "Recurso não encontrado", "RMA não encontrado.");
    return HttpResponse.json(d);
  }),

  http.get(`${BASE}/rma/:id/export`, async ({ params }) => {
    await delay(120);
    const csv = exportarCsvRma(String(params.id));
    if (csv === null) {
      return problema(404, "Recurso não encontrado", "RMA não calculado.");
    }
    return new HttpResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=rma.csv",
      },
    });
  }),

  http.get(`${BASE}/rma/:id`, async ({ params }) => {
    await delay(150);
    const f = obterFechamento(String(params.id));
    if (!f) return problema(404, "Recurso não encontrado", "Fechamento não encontrado.");
    return HttpResponse.json(f);
  }),

  http.post(`${BASE}/rma/:id/adjust`, async ({ request, params }) => {
    await delay(150);
    const body = (await request.json()) as {
      bloco: string;
      campo: string;
      valor_calculado: number;
      valor_ajustado: number;
      justificativa: string;
    };
    const r = ajustarFechamento(String(params.id), body);
    if (r === null) return problema(404, "Recurso não encontrado", "Fechamento não encontrado.");
    if (r === "FECHADO") {
      return problema(422, "Erro de validação", "RMA já fechado; reabra para ajustar.");
    }
    return HttpResponse.json(r, { status: 201 });
  }),

  http.post(`${BASE}/rma/:id/close`, async ({ params }) => {
    await delay(180);
    const r = fecharFechamento(String(params.id));
    if (r === null) return problema(404, "Recurso não encontrado", "Fechamento não encontrado.");
    if (r === "FECHADO") return problema(422, "Erro de validação", "RMA já está fechado.");
    return HttpResponse.json(r);
  }),

  http.post(`${BASE}/rma/:id/reopen`, async ({ request, params }) => {
    await delay(160);
    const body = (await request.json()) as { motivo_reabertura: string };
    const r = reabrirFechamento(String(params.id), body.motivo_reabertura);
    if (r === null) return problema(404, "Recurso não encontrado", "Fechamento não encontrado.");
    if (r === "NAO_FECHADO") {
      return problema(422, "Erro de validação", "Apenas RMA fechado pode ser reaberto.");
    }
    return HttpResponse.json(r);
  }),

  // ── Dashboard / Vigilância (Fase 8, §4.9) ──────────────────────
  http.get(`${BASE}/dashboard/overview`, async () => {
    await delay(160);
    return HttpResponse.json(DASHBOARD_OVERVIEW);
  }),

  http.get(`${BASE}/dashboard/time-series`, async ({ request }) => {
    await delay(160);
    const meses = Number(new URL(request.url).searchParams.get("meses") ?? "12");
    return HttpResponse.json(DASHBOARD_SERIE.slice(-meses));
  }),

  http.get(`${BASE}/dashboard/by-territory`, async () => {
    await delay(140);
    return HttpResponse.json(DASHBOARD_TERRITORIOS);
  }),

  http.get(`${BASE}/dashboard/map`, async () => {
    await delay(160);
    return HttpResponse.json(DASHBOARD_MAPA);
  }),

  http.get(`${BASE}/dashboard/benefits-report`, async () => {
    await delay(140);
    return HttpResponse.json(DASHBOARD_BENEFICIOS);
  }),

  http.get(`${BASE}/dashboard/indicators`, async () => {
    await delay(160);
    return HttpResponse.json(DASHBOARD_INDICADORES);
  }),

  // ── Administração / onboarding (Fase 9, §4.10) ─────────────────
  http.get(`${BASE}/organizations/config`, async () => {
    await delay(100);
    return HttpResponse.json({
      nome_municipio: TENANT.nomeMunicipio,
      brasao_url: TENANT.brasaoUrl,
      cor_destaque: TENANT.corDestaque,
    });
  }),

  http.get(`${BASE}/onboarding/status`, async () => {
    await delay(140);
    return HttpResponse.json(statusOnboarding());
  }),

  http.post(`${BASE}/onboarding/wizard/:step`, async ({ request, params }) => {
    await delay(180);
    const body = (await request.json().catch(() => ({}))) as { data?: Record<string, unknown> };
    return HttpResponse.json(executarEtapa(String(params.step), body.data ?? {}));
  }),

  http.get(`${BASE}/import-jobs`, async () => {
    await delay(120);
    return HttpResponse.json(listarImportacoes());
  }),

  http.post(`${BASE}/import-jobs/cadunico/upload`, async ({ request }) => {
    await delay(320);
    const form = await request.formData();
    const arquivo = form.get("file");
    if (!(arquivo instanceof File)) {
      return problema(422, "Erro de validação", "Arquivo CSV obrigatório.");
    }
    if (!arquivo.name.toLowerCase().endsWith(".csv")) {
      return problema(422, "Erro de validação", "Arquivo CSV obrigatório.");
    }
    const conteudo = await arquivo.text();
    if (!conteudo.trim()) {
      return problema(422, "Erro de validação", "Arquivo vazio.");
    }
    return HttpResponse.json(processarUpload(arquivo.name, conteudo));
  }),

  http.get(`${BASE}/import-jobs/:id`, async ({ params }) => {
    await delay(120);
    const r = obterImportacao(String(params.id));
    if (!r) return problema(404, "Recurso não encontrado", "Importação não encontrada.");
    return HttpResponse.json(r);
  }),

  // Endpoint proposital de erro (demonstra o EstadoErro).
  http.get(`${BASE}/__demo/erro`, async () => {
    await delay(100);
    return problema(503, "Serviço indisponível", "O serviço está temporariamente indisponível.");
  }),
];

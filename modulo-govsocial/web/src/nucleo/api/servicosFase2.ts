/** Hooks e serviços adicionais — Fase 2. */
import { useQuery } from "@tanstack/react-query";
import { http } from "@/nucleo/http/clienteHttp";

// ─── DOMICÍLIO ──────────────────────────────────────

export interface DadosDomicilio {
  id: string; family_id: string;
  tipo_construcao: string | null; abastecimento_agua: string | null;
  iluminacao_eletrica: boolean | null; destino_lixo: string | null;
  escoamento_sanitario: string | null; total_comodos: number | null;
  total_dormitorios: number | null; total_pessoas: number | null;
  total_mulheres_gravidas: number | null; total_idosos: number | null;
}

export const servicoDomicilio = {
  obter: (familyId: string) => http.get<DadosDomicilio>(`/families/${familyId}/domicilio`),
  atualizar: (familyId: string, corpo: Partial<DadosDomicilio>) =>
    http.patch<DadosDomicilio>(`/families/${familyId}/domicilio`, corpo),
};

export function useDomicilio(familyId: string) {
  return useQuery({ queryKey: ["domicilio", familyId], queryFn: () => servicoDomicilio.obter(familyId), enabled: !!familyId });
}

// ─── RENDA ──────────────────────────────────────────

export interface RendaMembro { id: string; person_id: string; tipo: string; valor: number; }
export interface DespesaFamiliar { id: string; tipo: string; valor: number; }
export interface RendaDemonstrativo {
  family_id: string; total_membros: number; renda_familiar_total: number;
  renda_per_capita: number; renda_sem_programas: number;
  renda_sem_programas_per_capita: number; total_despesas: number;
  despesas_per_capita: number; faixa_renda: string;
  rendas: RendaMembro[]; despesas: DespesaFamiliar[];
}

export const servicoRenda = {
  demonstrativo: (familyId: string) => http.get<RendaDemonstrativo>(`/families/${familyId}/renda`),
  adicionarRenda: (personId: string, familyId: string, corpo: { person_id: string; tipo: string; valor: number; data_inicio?: string }) =>
    http.post<RendaMembro>(`/persons/${personId}/renda?family_id=${familyId}`, corpo),
  removerRenda: (personId: string, rendaId: string) => http.delete(`/persons/${personId}/renda/${rendaId}`),
  adicionarDespesa: (familyId: string, corpo: { tipo: string; valor: number }) =>
    http.post<DespesaFamiliar>(`/families/${familyId}/despesas`, corpo),
  removerDespesa: (familyId: string, despesaId: string) => http.delete(`/families/${familyId}/despesas/${despesaId}`),
};

export function useRenda(familyId: string) {
  return useQuery({ queryKey: ["renda", familyId], queryFn: () => servicoRenda.demonstrativo(familyId), enabled: !!familyId });
}

// ─── VULNERABILIDADES ──────────────────────────────

export interface VulnerabilidadeOut { id: string; tipo: string; data_inicio: string; data_saida: string | null; observacoes: string | null; }
export const servicoVulnerabilidades = {
  listar: (familyId: string) => http.get<VulnerabilidadeOut[]>(`/families/${familyId}/vulnerabilidades`),
  adicionar: (familyId: string, corpo: { tipo: string; data_inicio: string; observacoes?: string }) =>
    http.post<VulnerabilidadeOut>(`/families/${familyId}/vulnerabilidades`, corpo),
  encerrar: (familyId: string, vulnId: string, data_saida: string) =>
    http.patch<VulnerabilidadeOut>(`/families/${familyId}/vulnerabilidades/${vulnId}?data_saida=${data_saida}`),
};

export function useVulnerabilidades(familyId: string) {
  return useQuery({ queryKey: ["vulnerabilidades", familyId], queryFn: () => servicoVulnerabilidades.listar(familyId), enabled: !!familyId });
}

// ─── QUESTIONÁRIOS ─────────────────────────────────

export interface QuestionarioOut { id: string; nome: string; descricao: string | null; questoes: { id: string; enunciado: string; tipo: string; obrigatorio: boolean; opcoes: any }[]; }
export const servicoQuestionarios = {
  listar: () => http.get<QuestionarioOut[]>("/questionarios"),
  criar: (corpo: any) => http.post<QuestionarioOut>("/questionarios", corpo),
  responder: (familyId: string, corpo: any) => http.post(`/families/${familyId}/questionarios/responder`, corpo),
  historico: (familyId: string) => http.get<any[]>(`/families/${familyId}/questionarios`),
};

export function useQuestionarios() {
  return useQuery({ queryKey: ["questionarios"], queryFn: () => servicoQuestionarios.listar() });
}

// ─── HABITACIONAL ──────────────────────────────────

export interface ProgramaHabitacional { id: string; nome: string; esfera: string; criterios: any; ativo: boolean; }
export interface DemandaHabitacional { id: string; family_id: string; tipo_demanda: string; status: string; pontuacao: number | null; programa?: ProgramaHabitacional; }
export const servicoHabitacional = {
  listarProgramas: (esfera?: string) => http.get<ProgramaHabitacional[]>(`/programas-habitacionais${esfera ? `?esfera=${esfera}` : ""}`),
  criarPrograma: (corpo: any) => http.post<ProgramaHabitacional>("/programas-habitacionais", corpo),
  listarDemandas: (params?: string) => http.get<DemandaHabitacional[]>(`/demandas-habitacionais${params ? `?${params}` : ""}`),
  criarDemanda: (corpo: any) => http.post<DemandaHabitacional>("/demandas-habitacionais", corpo),
  classificar: (programaId?: string) => http.get<any[]>(`/demandas-habitacionais/classificacao${programaId ? `?programa_id=${programaId}` : ""}`),
};

export function useProgramasHabitacionais(esfera?: string) {
  return useQuery({ queryKey: ["programas-habitacionais", esfera], queryFn: () => servicoHabitacional.listarProgramas(esfera) });
}

export function useDemandas(familyId?: string) {
  return useQuery({ queryKey: ["demandas", familyId], queryFn: () => servicoHabitacional.listarDemandas(familyId ? `family_id=${familyId}` : ""), enabled: !!familyId });
}

// ─── NOTIFICAÇÕES ──────────────────────────────────

export interface NotificacaoOut {
  id: string; titulo: string; mensagem: string | null;
  tipo: NotificacaoTipo; lida: boolean; link: string | null;
  role_alvo: string | null; created_at: string;
}

export type NotificacaoTipo =
  | "ENCAMINHAMENTO"
  | "AGENDA"
  | "BENEFICIO"
  | "PRAZO"
  | "ALERTA"
  | "SISTEMA";

export const TIPO_NOTIFICACAO_ICONE: Record<NotificacaoTipo, string> = {
  ENCAMINHAMENTO: "forward",
  AGENDA: "calendar_today",
  BENEFICIO: "volunteer_activism",
  PRAZO: "schedule",
  ALERTA: "warning",
  SISTEMA: "settings",
};

export const TIPO_NOTIFICACAO_COR: Record<NotificacaoTipo, string> = {
  ENCAMINHAMENTO: "text-blue-600 bg-blue-50",
  AGENDA: "text-green-600 bg-green-50",
  BENEFICIO: "text-purple-600 bg-purple-50",
  PRAZO: "text-amber-600 bg-amber-50",
  ALERTA: "text-red-600 bg-red-50",
  SISTEMA: "text-slate-600 bg-slate-50",
};

export const servicoNotificacoes = {
  listar: (naoLidas?: boolean) => http.get<NotificacaoOut[]>(`/notifications${naoLidas ? "?nao_lidas=true" : ""}`),
  contar: () => http.get<{ total: number }>("/notifications/count"),
  marcarLida: (id: string) => http.post(`/notifications/${id}/read`),
  marcarTodas: () => http.post("/notifications/read-all"),
};

export function useNotificacoes() {
  return useQuery({ queryKey: ["notificacoes"], queryFn: () => servicoNotificacoes.listar(), refetchInterval: 30_000 });
}

export function useContagemNotificacoes() {
  return useQuery({
    queryKey: ["notificacoes", "count"],
    queryFn: () => servicoNotificacoes.contar(),
    refetchInterval: 30_000,
  });
}

// ─── IMPORTAÇÕES SICON/SIBEC ───────────────────────

export const servicoImportacao = {
  uploadSicon: (file: File) => { const fd = new FormData(); fd.append("file", file); return http.post("/sicon/import", fd); },
  uploadSibec: (file: File) => { const fd = new FormData(); fd.append("file", file); return http.post("/sibec/import", fd); },
  jobsSicon: () => http.get<any[]>("/sicon/jobs"),
  jobsSibec: () => http.get<any[]>("/sibec/jobs"),
  siconFamilia: (familyId: string) => http.get<any>(`/sicon/family/${familyId}`),
  sibecFamilia: (familyId: string) => http.get<any>(`/sibec/family/${familyId}`),
};

// ─── EXPORTADOR ────────────────────────────────────

export const servicoExportador = {
  listar: () => http.get<any[]>("/data-exports"),
  executar: (id: string, params?: Record<string, string>) => http.postBlob(`/data-exports/${id}/execute`, params || {}),
};

// ─── LIMITES BENEFÍCIO ─────────────────────────────

export const servicoLimites = {
  listar: (code?: string) => http.get<any[]>(`/limites-beneficio${code ? `?benefit_type_code=${code}` : ""}`),
  criar: (corpo: any) => http.post<any>("/limites-beneficio", corpo),
  verificar: (familyId: string, code: string, valor: number) =>
    http.get<any>(`/beneficios/verificar-limite?family_id=${familyId}&benefit_type_code=${code}&valor=${valor}`),
};

// ─── QUICK FAMILY ──────────────────────────────────

export const servicoFamiliaRapida = {
  criar: (corpo: { nome_responsavel: string; cpf_responsavel?: string; nis_responsavel?: string; bairro: string; membros: { nome: string; parentesco: string }[] }) =>
    http.post("/families/quick", corpo),
};

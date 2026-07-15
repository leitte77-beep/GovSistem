import { http } from "@/nucleo/http/clienteHttp";
import type {
  AttendanceOut,
  CaseFileEncerrar,
  CaseFileListItem,
  CaseFileOut,
  NetworkViewItem,
  TimelineItem,
} from "@/tipos/prontuario";

/**
 * Serviços de prontuário/atendimentos (Fase 3). A leitura da evolução de um
 * atendimento usa `semCache: true` — conteúdo sensível NUNCA fica em cache
 * persistente (§1.2). Cada leitura concedida é auditada no backend.
 */
export const servicoProntuario = {
  listarPorFamilia: (familyId: string) =>
    http.get<CaseFileListItem[]>(`/case-files?family_id=${familyId}`),

  /**
   * Prontuários da unidade (worklist de "Atendimentos"). Sem `unitId`, o
   * backend já restringe às unidades do usuário (escopo em app/services/scoping).
   */
  listarDaUnidade: (unitId?: string, params?: { skip?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (unitId) qs.set("unit_id", unitId);
    if (params?.skip != null) qs.set("skip", String(params.skip));
    if (params?.limit != null) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return http.get<CaseFileListItem[]>(`/case-files${q ? `?${q}` : ""}`);
  },

  timeline: (caseFileId: string) =>
    http.get<TimelineItem[]>(`/case-files/${caseFileId}/timeline`),

  // Revelação sob demanda do conteúdo sigiloso (gera auditoria no backend).
  obterAtendimento: (caseFileId: string, attendanceId: string) =>
    http.get<AttendanceOut>(`/case-files/${caseFileId}/attendances/${attendanceId}`, {
      semCache: true,
    }),

  visaoDeRede: (familyId: string) =>
    http.get<NetworkViewItem[]>(`/case-files/family/${familyId}/network`),

  /**
   * Encerra o acompanhamento: arquiva o prontuário e encerra os
   * acompanhamentos (PAIF/PAEFI/MSE) ativos vinculados, com motivo de
   * desligamento — alimenta o RMA (bloco de desligamentos do mês).
   */
  encerrar: (caseFileId: string, corpo: CaseFileEncerrar) =>
    http.post<CaseFileOut>(`/case-files/${caseFileId}/encerrar`, corpo),
};

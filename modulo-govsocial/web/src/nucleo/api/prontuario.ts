import { http } from "@/nucleo/http/clienteHttp";
import type {
  AttendanceOut,
  CaseFileOut,
  MotivoDesligamento,
  NetworkViewItem,
  TimelineItem,
} from "@/tipos/prontuario";

/**
 * Serviços do prontuário (case-files) — Fase 3 (§4.3).
 * - Listagens e timeline NUNCA trazem a evolução técnica.
 * - A evolução de um atendimento é buscada sob demanda (semCache: true) e
 *   auditada no backend (READ_SENSIVEL) quando a política concede.
 * - A visão de rede mostra apenas a EXISTÊNCIA do atendimento, sem conteúdo.
 */
export const servicoProntuario = {
  listarPorFamilia: (familyId: string) => {
    const qs = new URLSearchParams({ family_id: familyId });
    return http.get<CaseFileOut[]>(`/case-files?${qs.toString()}`);
  },

  listarPorUnidade: (unitId?: string) => {
    const qs = new URLSearchParams();
    if (unitId) qs.set("unit_id", unitId);
    const q = qs.toString();
    return http.get<CaseFileOut[]>(`/case-files${q ? `?${q}` : ""}`);
  },

  timeline: (caseFileId: string) =>
    http.get<TimelineItem[]>(`/case-files/${caseFileId}/timeline`),

  obterAtendimento: (caseFileId: string, attendanceId: string) =>
    http.get<AttendanceOut>(`/case-files/${caseFileId}/attendances/${attendanceId}`, {
      semCache: true,
    }),

  visaoDeRede: (familyId: string) =>
    http.get<NetworkViewItem[]>(`/case-files/family/${familyId}/network`),

  encerrar: (
    caseFileId: string,
    corpo: {
      motivo_desligamento: MotivoDesligamento;
      data_fim?: string;
      observacoes?: string;
    },
  ) => http.post<CaseFileOut>(`/case-files/${caseFileId}/encerrar`, corpo),
};

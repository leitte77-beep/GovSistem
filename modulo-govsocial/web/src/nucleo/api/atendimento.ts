import { http } from "@/nucleo/http/clienteHttp";
import { ErroApi } from "@/nucleo/http/problemDetails";
import type { ServiceTypeOut } from "@/tipos/dominios";
import type { AttendanceOut, CaseFileListItem, CaseFileOut } from "@/tipos/prontuario";

/**
 * Serviços de registro de atendimento (Fase 4).
 * O POST /attendances exige um prontuário (case_file) da família na unidade +
 * serviço. `resolverProntuario` reaproveita o existente ou cria um novo
 * (tratando o 409 "já existe" como sucesso, buscando o existente).
 */

export const servicoDominios = {
  serviceTypes: () => http.get<ServiceTypeOut[]>("/service-types"),
};

export type PayloadAtendimento = {
  data_atendimento: string; // ISO
  tipo: string;
  evolution_text: string | null;
  sigiloso_reforcado: boolean;
  member_ids: string[];
  professional_ids: string[];
};

async function listarProntuarios(familyId: string, unitId: string) {
  return http.get<CaseFileListItem[]>(
    `/case-files?family_id=${familyId}&unit_id=${unitId}`,
  );
}

export async function resolverProntuario(
  familyId: string,
  unitId: string,
  serviceTypeCode: string,
): Promise<string> {
  const existentes = await listarProntuarios(familyId, unitId);
  const jaExiste = existentes.find((c) => c.service_type_code === serviceTypeCode);
  if (jaExiste) return jaExiste.id;

  try {
    const criado = await http.post<CaseFileOut>("/case-files", {
      family_id: familyId,
      unit_id: unitId,
      service_type_code: serviceTypeCode,
    });
    return criado.id;
  } catch (e) {
    // Corrida: outro registro criou o prontuário antes — busca o existente.
    if (e instanceof ErroApi && e.problema.status === 409) {
      const novamente = await listarProntuarios(familyId, unitId);
      const achado = novamente.find((c) => c.service_type_code === serviceTypeCode);
      if (achado) return achado.id;
    }
    throw e;
  }
}

export async function criarAtendimento(
  caseFileId: string,
  payload: PayloadAtendimento,
  chaveIdempotencia: string,
): Promise<AttendanceOut> {
  return http.post<AttendanceOut>(
    `/case-files/${caseFileId}/attendances`,
    payload,
    { chaveIdempotencia },
  );
}

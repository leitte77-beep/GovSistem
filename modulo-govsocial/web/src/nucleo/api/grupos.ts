import { http } from "@/nucleo/http/clienteHttp";
import type {
  AcaoColetivaOut,
  EncontroOut,
  FrequenciaOut,
  FrequenciaRegistro,
  InscricaoOut,
} from "@/tipos/grupos";

/**
 * Serviços de grupos/SCFV e frequência (Fase 6). O registro de frequência é um
 * upsert em lote (presente/falta/justificada) — combina com o offline em fila.
 */
export const servicoGrupos = {
  listar: (unitId?: string) =>
    http.get<AcaoColetivaOut[]>(
      `/acoes-coletivas${unitId ? `?unit_id=${unitId}` : ""}`,
    ),
  obter: (id: string) => http.get<AcaoColetivaOut>(`/acoes-coletivas/${id}`),

  inscricoes: (id: string) =>
    http.get<InscricaoOut[]>(`/acoes-coletivas/${id}/enrollments`),
  inscrever: (id: string, personId: string, familyId?: string | null) =>
    http.post<InscricaoOut>(`/acoes-coletivas/${id}/enrollments`, {
      person_id: personId,
      family_id: familyId ?? null,
    }),

  encontros: (id: string) => http.get<EncontroOut[]>(`/acoes-coletivas/${id}/meetings`),
  criarEncontro: (id: string, data_encontro: string, tema?: string | null) =>
    http.post<EncontroOut>(`/acoes-coletivas/${id}/meetings`, { data_encontro, tema }),

  frequencia: (acaoId: string, encontroId: string) =>
    http.get<FrequenciaOut[]>(
      `/acoes-coletivas/${acaoId}/meetings/${encontroId}/attendance`,
    ),
  registrarFrequencia: (
    acaoId: string,
    encontroId: string,
    registros: FrequenciaRegistro[],
    chaveIdempotencia: string,
  ) =>
    http.post<FrequenciaOut[]>(
      `/acoes-coletivas/${acaoId}/meetings/${encontroId}/attendance`,
      registros,
      { chaveIdempotencia },
    ),
};

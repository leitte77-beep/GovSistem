import type { FrequenciaOut, FrequenciaRegistro } from "@/tipos/grupos";

/**
 * Estado tri-valorado da chamada (§4.5): Presente / Falta / Justificada.
 * Mapeia para o DTO do backend (presente:bool + justificativa):
 * - PRESENTE   → presente:true,  justificativa:null
 * - FALTA      → presente:false, justificativa:null
 * - JUSTIFICADA→ presente:false, justificativa:"<texto>"
 */
export type EstadoPresenca = "PRESENTE" | "FALTA" | "JUSTIFICADA";

export function estadoParaRegistro(
  inscricaoId: string,
  estado: EstadoPresenca,
  justificativa?: string | null,
): FrequenciaRegistro {
  if (estado === "PRESENTE") {
    return { inscricao_id: inscricaoId, presente: true, justificativa: null };
  }
  if (estado === "JUSTIFICADA") {
    return {
      inscricao_id: inscricaoId,
      presente: false,
      justificativa: justificativa?.trim() || "Falta justificada",
    };
  }
  return { inscricao_id: inscricaoId, presente: false, justificativa: null };
}

export function registroParaEstado(f: Pick<FrequenciaOut, "presente" | "justificativa">): EstadoPresenca {
  if (f.presente) return "PRESENTE";
  return f.justificativa ? "JUSTIFICADA" : "FALTA";
}

export type ResumoChamada = { presentes: number; faltas: number; justificadas: number };

export function resumirChamada(estados: Iterable<EstadoPresenca>): ResumoChamada {
  const r: ResumoChamada = { presentes: 0, faltas: 0, justificadas: 0 };
  for (const e of estados) {
    if (e === "PRESENTE") r.presentes += 1;
    else if (e === "JUSTIFICADA") r.justificadas += 1;
    else r.faltas += 1;
  }
  return r;
}

export const ROTULO_PRESENCA: Record<EstadoPresenca, string> = {
  PRESENTE: "Presente",
  FALTA: "Falta",
  JUSTIFICADA: "Justificada",
};

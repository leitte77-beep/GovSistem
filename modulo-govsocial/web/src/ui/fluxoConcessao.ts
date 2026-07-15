import type { EtapaFluxo } from "./FluxoStatus";

/** Etapas e mapeamento de status da concessão de benefício (§4.4). */
export const ETAPAS_CONCESSAO: EtapaFluxo[] = [
  { id: "solicitado", rotulo: "Solicitado" },
  { id: "parecer", rotulo: "Parecer" },
  { id: "aprovacao", rotulo: "Aprovação" },
  { id: "entrega", rotulo: "Entrega" },
];

/** Mapeia o status da concessão para o índice na linha de 4 etapas. */
export function indiceStatusConcessao(status: string): { indice: number; cancelado: boolean } {
  switch (status) {
    case "SOLICITADO":
      return { indice: 0, cancelado: false };
    case "EM_ANALISE":
      return { indice: 1, cancelado: false };
    case "APROVADO":
      return { indice: 2, cancelado: false };
    case "ENTREGUE":
      return { indice: 3, cancelado: false };
    case "NEGADO":
      return { indice: 2, cancelado: true };
    case "CANCELADO":
      return { indice: 1, cancelado: true };
    default:
      return { indice: 0, cancelado: false };
  }
}

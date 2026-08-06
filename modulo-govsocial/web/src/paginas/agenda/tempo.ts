/**
 * Regras de tempo para a Agenda & Fila e o painel de encaminhamentos (§4.6/§4.7).
 * Funções puras e testáveis, sem dependência de relógio global (recebem `agora`).
 */

/** Minutos decorridos desde `desde` até `agora` (nunca negativo). */
export function minutosDeEspera(desde: string, agora: Date = new Date()): number {
  const inicio = new Date(desde).getTime();
  if (Number.isNaN(inicio)) return 0;
  const diff = Math.floor((agora.getTime() - inicio) / 60_000);
  return diff > 0 ? diff : 0;
}

/** Formata a espera de forma legível: "12 min" ou "1 h 05 min". */
export function formatarEspera(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

/** Faixa de urgência da espera para a cor do cartão (texto sempre acompanha). */
export type UrgenciaEspera = "normal" | "atencao" | "critica";

export function urgenciaEspera(minutos: number): UrgenciaEspera {
  if (minutos >= 60) return "critica";
  if (minutos >= 30) return "atencao";
  return "normal";
}

/** Dias inteiros decorridos desde o encaminhamento. */
export function idadeEmDias(desde: string, agora: Date = new Date()): number {
  const inicio = new Date(desde).getTime();
  if (Number.isNaN(inicio)) return 0;
  const diff = Math.floor((agora.getTime() - inicio) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/**
 * Um encaminhamento enviado está "atrasado" (âmbar) quando passou do prazo de
 * devolutiva sem ter sido devolvido/finalizado. Prazo padrão do município: 30
 * dias (§4.7).
 */
const PRAZO_DEVOLUTIVA_DIAS = 30;

export function encaminhamentoAtrasado(
  status: string,
  dataEncaminhamento: string,
  agora: Date = new Date(),
  prazoDias: number = PRAZO_DEVOLUTIVA_DIAS,
): boolean {
  // Aguardando retorno: interno (PENDENTE/ACEITO) ou externo (ENVIADO/ofício).
  const aguardando = ["PENDENTE", "ACEITO", "ENVIADO", "OFICIO_GERADO"].includes(status);
  if (!aguardando) return false;
  return idadeEmDias(dataEncaminhamento, agora) > prazoDias;
}

export { PRAZO_DEVOLUTIVA_DIAS };

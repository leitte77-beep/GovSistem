import type { DashboardActivityItem } from "@/tipos/dashboard";

/**
 * Mapeador de códigos entidade.ação → frases em linguagem humana (pt-BR).
 * Nunca exibe snake_case cru.
 */

const MAPA_ENTIDADE: Record<string, string> = {
  atendimento: "um atendimento",
  familia: "uma família",
  pessoa: "uma pessoa",
  beneficio: "um benefício",
  encaminhamento: "um encaminhamento",
  grupo: "um grupo",
  prontuario: "um prontuário",
  rma_fechamento: "o fechamento do RMA",
  rma: "o RMA",
  unidade: "uma unidade",
  profissional: "um profissional",
  importacao: "uma importação",
  config: "as configurações",
};

const MAPA_ACAO: Record<string, string> = {
  criado: "registrou",
  consultado: "visualizou",
  atualizado: "atualizou",
  registrado: "registrou",
  concedido: "concedeu",
  aceito: "aceitou",
  rejeitado: "rejeitou",
  cancelado: "cancelou",
  realizado: "realizou",
  fechado: "fechou",
  reaberto: "reabriu",
  entregue: "entregou",
  arquivado: "arquivou",
  editado: "editou",
  removido: "removeu",
};

/**
 * Frases prontas por chave completa `entidade.acao`, com placeholders
 * preenchidos a partir de campos estruturados do payload (nome/competência).
 * Nunca deixa o sufixo cru (ex.: "consultado") solto na frase — quando falta
 * o dado estruturado, cai num fallback que ainda assim é uma frase completa.
 */
const MAPA_FRASE: Record<string, (item: DashboardActivityItem) => string> = {
  "rma_fechamento.consultado": (i) =>
    `visualizou o fechamento do RMA${i.competencia ? ` de ${i.competencia}` : ""}`,
  "rma_fechamento.fechado": (i) =>
    `fechou o RMA${i.competencia ? ` de ${i.competencia}` : ""}`,
  "rma_fechamento.reaberto": (i) =>
    `reabriu o RMA${i.competencia ? ` de ${i.competencia}` : ""}`,
  "familia.consultado": (i) => `consultou ${i.nome ? `a família ${i.nome}` : "uma família"}`,
  "familia.criado": (i) => `cadastrou ${i.nome ? `a família ${i.nome}` : "uma nova família"}`,
  "familia.atualizado": (i) => `atualizou ${i.nome ? `a família ${i.nome}` : "uma família"}`,
  "prontuario.consultado": (i) => `visualizou ${i.nome ? `o prontuário de ${i.nome}` : "um prontuário"}`,
  "prontuario.atualizado": (i) => `atualizou ${i.nome ? `o prontuário de ${i.nome}` : "um prontuário"}`,
  "pessoa.consultado": (i) => `consultou ${i.nome ? `os dados de ${i.nome}` : "os dados de uma pessoa"}`,
};

export type AtividadeMapeada = {
  id: string;
  actor: string;
  action: string;
  subject: string | null;
  timestamp: string;
  to: string | null;
  categoria: string;
};

/**
 * Converte um item bruto do dashboard em frase humanizada.
 * Se entidade/acao não estiverem no mapa, usa texto/descricao como fallback
 * mas nunca exibe o código cru.
 */
export function mapearAtividade(
  item: DashboardActivityItem,
): AtividadeMapeada {
  const chaveCompleta = `${item.entidade}.${item.acao}`;
  const entidadeNome = MAPA_ENTIDADE[item.entidade] ?? null;
  const acaoNome = MAPA_ACAO[item.acao] ?? null;

  const actor = item.ator ?? "Sistema";
  const subject = item.descricao?.trim() || null;

  const fraseCompleta = MAPA_FRASE[chaveCompleta]?.(item);

  const action = fraseCompleta
    ? fraseCompleta
    : acaoNome && entidadeNome
      ? `${acaoNome} ${entidadeNome}`
      : item.texto;

  const to = rotaParaEntidade(item.entidade, item.id);

  return {
    id: item.id,
    actor,
    action,
    subject,
    timestamp: item.data,
    to,
    categoria: item.categoria,
  };
}

function rotaParaEntidade(
  entidade: string,
  _id: string,
): string | null {
  if (entidade === "rma_fechamento" || entidade === "rma") return "/rma";
  if (entidade === "encaminhamento") return "/encaminhamentos";
  if (entidade === "beneficio") return "/beneficios";
  if (entidade === "grupo") return "/grupos";
  return null;
}

export function formatarTempoRelativo(dataStr: string): string {
  const data = new Date(dataStr);
  const agora = new Date();
  const diffMs = agora.getTime() - data.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHoras = Math.floor(diffMs / 3600000);
  const diffDias = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Agora mesmo";
  if (diffMin < 60) return `Há ${diffMin} min`;
  if (diffHoras < 24) return `Há ${diffHoras}h`;
  if (diffDias === 1) return "Ontem";
  if (diffDias < 7) return `Há ${diffDias} dias`;
  if (diffDias < 30) return `Há ${Math.floor(diffDias / 7)} sem`;
  return `Há ${Math.floor(diffDias / 30)} meses`;
}

export function formatarTempoAbsoluto(dataStr: string): string {
  return new Date(dataStr).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

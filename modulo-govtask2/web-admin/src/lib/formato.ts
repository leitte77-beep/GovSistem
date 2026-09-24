/** Formatação em português do Brasil, num lugar só. */

export function moeda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const numero = typeof valor === "string" ? Number(valor) : valor;
  if (Number.isNaN(numero)) return "—";
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

/** Data ISO (yyyy-mm-dd) sem conversão de fuso: prazo é dia civil, não instante. */
export function data(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const ROTULO_TIPO: Record<string, string> = {
  AQUISICAO: "Aquisição",
  OBRA: "Obra",
  OUTRO: "Outro",
};

export const ROTULO_SITUACAO: Record<string, string> = {
  COM_ASSESSOR: "Com o Assessor",
  EM_SETOR: "No setor",
  AGUARDANDO_TERCEIRO: "Órgão externo",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

export const ROTULO_ENCAMINHAMENTO: Record<string, string> = {
  AGUARDANDO: "Aguardando dono",
  EM_EXECUCAO: "Em execução",
  AGUARDANDO_COMPLEMENTO: "Complemento pendente",
  CONCLUIDO: "Devolvido",
  CANCELADO: "Cancelado",
};

export const ROTULO_ORIGEM: Record<string, string> = {
  PREFEITO: "Prefeito",
  DEPUTADO: "Deputado",
  SECRETARIA: "Secretaria",
  VEREADOR: "Vereador",
  CIDADAO: "Cidadão",
  OUTRO: "Outro",
};

export const ROTULO_PRIORIDADE: Record<string, string> = {
  NORMAL: "Normal",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const ROTULO_SETOR: Record<string, string> = {
  GABINETE: "Gabinete",
  ASSESSORIA: "Assessoria",
  JURIDICO: "Jurídico",
  CONTABILIDADE: "Contabilidade",
  ENGENHARIA: "Engenharia",
  LICITACAO: "Licitação",
  TESOURARIA: "Tesouraria",
  EXTERNO: "Órgão externo",
};

/** Frase do prazo: o que o usuário precisa saber sem fazer conta. */
export function situacaoDoPrazo(
  prazo: string | null,
  diasDeAtraso: number
): { texto: string; tom: "atrasado" | "hoje" | "proximo" | "tranquilo" | "sem" } {
  if (!prazo) return { texto: "Sem prazo", tom: "sem" };
  if (diasDeAtraso > 0) {
    return {
      texto: `Atrasado há ${diasDeAtraso} ${diasDeAtraso === 1 ? "dia" : "dias"}`,
      tom: "atrasado",
    };
  }
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [ano, mes, dia] = prazo.slice(0, 10).split("-").map(Number);
  const alvo = new Date(ano, mes - 1, dia);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
  if (dias === 0) return { texto: "Vence hoje", tom: "hoje" };
  if (dias <= 3) return { texto: `Vence em ${dias} dia${dias === 1 ? "" : "s"}`, tom: "proximo" };
  return { texto: `Prazo ${data(prazo)}`, tom: "tranquilo" };
}

export const ROTULO_MOTIVO_PARADA: Record<string, string> = {
  DOCUMENTO: "Aguardando documento",
  GOVERNO: "Aguardando o governo",
  LICITACAO: "Em licitação",
  RECURSO: "Falta de recurso",
  ASSINATURA: "Aguardando assinatura",
  OUTRO: "Outro motivo",
};

/** "há 12 dias", "desde hoje", "há 1 dia". */
export function haDias(dias: number): string {
  if (dias <= 0) return "desde hoje";
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/** Tempo relativo curto para feeds: "agora", "5 min", "3 h", "2 d". */
export function relativo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

/** Moeda compacta para KPI: R$ 1,2 mi, R$ 340 mil. */
export function moedaCurta(valor: string | number | null | undefined): string {
  const n = Number(valor || 0);
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return moeda(n);
}

/** Onde o pedido está, em linguagem de gente. */
export function ondeEsta(
  situacao: string,
  setor: string | null,
  nomeSetor: (c: string | null) => string
): string {
  if (situacao === "EM_SETOR") return nomeSetor(setor);
  if (situacao === "COM_ASSESSOR") return "Com o Assessor";
  if (situacao === "AGUARDANDO_TERCEIRO") return "Aguardando órgão externo";
  if (situacao === "CONCLUIDO") return "Concluído";
  return "Cancelado";
}

export const ROTULO_TIPO_DOCUMENTO: Record<string, string> = {
  OFICIO: "Ofício",
  CERTIDAO: "Certidão",
  PARECER: "Parecer",
  PROJETO: "Projeto",
  NOTA_FISCAL: "Nota fiscal",
  CONTRATO: "Contrato",
  FOTO: "Foto",
  OUTRO: "Outro",
};

/** "3 d 4 h", "5 h", "40 min" — duração legível a partir de horas. */
export function duracao(horas: number): string {
  if (horas <= 0) return "—";
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 24) return `${Math.round(horas)} h`;
  const d = Math.floor(horas / 24);
  const h = Math.round(horas - d * 24);
  return h ? `${d} d ${h} h` : `${d} d`;
}

/** Duração entre dois instantes ISO. */
export function entre(de: string | null | undefined, ate: string | null | undefined): string {
  if (!de) return "";
  const fim = ate ? new Date(ate).getTime() : Date.now();
  return duracao(Math.max(0, fim - new Date(de).getTime()) / 3600000);
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "Hoje", "Ontem", "23 de setembro". */
export function rotuloDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmo(d, hoje)) return "Hoje";
  if (mesmo(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric",
  });
}

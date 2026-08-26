// Helper de formatação da área de Combustíveis (categorias, documentos, status).

export const CATEGORIAS_FORNECEDOR: Record<string, string> = {
  COMBUSTIVEL: "Combustível",
  AUTOPECAS: "Autopeças",
  PNEUS: "Pneus",
  ELETRICA: "Elétrica",
  MECANICA: "Mecânica",
  FUNILARIA: "Funilaria",
  CONCESSIONARIA: "Concessionária",
  OUTRO: "Outro",
};

export function categoriaFornecedor(categoria: string | undefined | null): string {
  if (!categoria) return "—";
  return CATEGORIAS_FORNECEDOR[categoria] ?? categoria.replace(/_/g, " ").toLowerCase();
}

/** Máscara de CPF (11) ou CNPJ (14). */
export function mascaraCpfCnpj(valor: string | undefined | null): string {
  const s = (valor ?? "").replace(/\D/g, "");
  if (s.length === 14) {
    return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (s.length === 11) {
    return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return s;
}

/** Título humanizado do tipo de movimentação (enum técnico → rótulo amigável). */
export const TIPOS_MOVIMENTACAO: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  AJUSTE_POSITIVO: "Ajuste positivo",
  AJUSTE_NEGATIVO: "Ajuste negativo",
  TRANSFERENCIA_ENTRADA: "Transferência",
  TRANSFERENCIA_SAIDA: "Transferência",
  ESTORNO: "Estorno",
};

/** Origem da movimentação (enum técnico → rótulo amigável). */
export const ORIGENS_MOVIMENTACAO: Record<string, string> = {
  ENTRADA_COMPRA: "Entrada",
  ABASTECIMENTO: "Abastecimento",
  AJUSTE_MANUAL: "Ajuste",
  INVENTARIO: "Inventário",
  TRANSFERENCIA: "Transferência",
  ESTORNO_ABASTECIMENTO: "Estorno",
  CANCELAMENTO_ENTRADA: "Estorno",
  ESTOQUE_INICIAL: "Estoque inicial",
};

/** Rótulo amigável de uma movimentação (usa origem, com fallback para tipo). */
export function rotuloMovimentacao(tipo: string | undefined, origem: string | undefined): string {
  if (origem && ORIGENS_MOVIMENTACAO[origem]) return ORIGENS_MOVIMENTACAO[origem];
  if (tipo && TIPOS_MOVIMENTACAO[tipo]) return TIPOS_MOVIMENTACAO[tipo];
  return (origem || tipo || "Movimentação").replace(/_/g, " ").toLowerCase();
}

export const STATUS_TANQUE: Record<string, { rotulo: string; cor: string; bg: string }> = {
  INATIVO: { rotulo: "Inativo", cor: "text-text-subtle", bg: "bg-surface-bg" },
  VAZIO: { rotulo: "Vazio", cor: "text-[#BA1A1A]", bg: "bg-[#FFDAD6]" },
  CRITICO: { rotulo: "Crítico", cor: "text-[#BA1A1A]", bg: "bg-[#FFDAD6]" },
  BAIXO: { rotulo: "Estoque baixo", cor: "text-[#805600]", bg: "bg-[#FFDD9A]" },
  NORMAL: { rotulo: "Normal", cor: "text-[#106D34]", bg: "bg-[#9DF6B3]" },
};

export function corStatusTanque(status: string | null | undefined): string {
  const s = (status || "").toUpperCase();
  if (s === "CRITICO") return "bg-[#BA1A1A]";
  if (s === "BAIXO") return "bg-[#B54708]";
  return "bg-[#067647]";
}

export const UNIDADES_COMBUSTIVEL = ["litro", "m³", "galão", "kg"];

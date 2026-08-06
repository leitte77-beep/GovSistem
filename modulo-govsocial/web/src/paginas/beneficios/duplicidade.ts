import type { ConcessaoListItem } from "@/tipos/beneficios";

/**
 * Antiduplicidade de benefício (§4.4): dada a lista de concessões da família e a
 * janela mínima do tipo de benefício (periodicidade_max_dias), calcula se há
 * concessão recente que caracterize duplicidade. Espelha a regra do backend:
 * conta concessões APROVADO/ENTREGUE dentro da janela.
 */
export type AvisoDuplicidade = {
  duplicado: boolean;
  diasDesde: number | null;
  janelaDias: number | null;
  ultima: ConcessaoListItem | null;
};

const CONTAM = new Set(["APROVADO", "ENTREGUE"]);

export function avaliarDuplicidade(
  concessoes: ConcessaoListItem[],
  benefitCode: string,
  janelaDias: number | null | undefined,
  agora: Date = new Date(),
): AvisoDuplicidade {
  if (!janelaDias) {
    return { duplicado: false, diasDesde: null, janelaDias: null, ultima: null };
  }
  const doTipo = concessoes
    .filter((c) => c.benefit_type_code === benefitCode && CONTAM.has(c.status))
    .sort((a, b) => (a.data_solicitacao < b.data_solicitacao ? 1 : -1));

  const ultima = doTipo[0] ?? null;
  if (!ultima) {
    return { duplicado: false, diasDesde: null, janelaDias, ultima: null };
  }
  const ms = agora.getTime() - new Date(ultima.data_solicitacao).getTime();
  const diasDesde = Math.floor(ms / (1000 * 60 * 60 * 24));
  return { duplicado: diasDesde < janelaDias, diasDesde, janelaDias, ultima };
}

/**
 * Rótulos pt-BR dos domínios (vocabulário SUAS).
 * Os VALORES espelham os enums do backend (`app/models/enums.py`) — fonte de
 * verdade do contrato. Rótulos são exibição; valores são transação.
 */

export const SEXO = [
  { valor: "FEMININO", rotulo: "Feminino" },
  { valor: "MASCULINO", rotulo: "Masculino" },
  { valor: "OUTRO", rotulo: "Outro" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

export const PARENTESCO = [
  { valor: "RESPONSAVEL", rotulo: "Responsável" },
  { valor: "CONJUGE", rotulo: "Cônjuge" },
  { valor: "FILHO", rotulo: "Filho(a)" },
  { valor: "ENTEADO", rotulo: "Enteado(a)" },
  { valor: "PAI", rotulo: "Pai" },
  { valor: "MAE", rotulo: "Mãe" },
  { valor: "AVO", rotulo: "Avô/Avó" },
  { valor: "NETO", rotulo: "Neto(a)" },
  { valor: "IRMAO", rotulo: "Irmão(ã)" },
  { valor: "OUTRO_PARENTE", rotulo: "Outro parente" },
  { valor: "NAO_PARENTE", rotulo: "Sem parentesco" },
];

export const ESCOLARIDADE = [
  { valor: "NAO_ALFABETIZADO", rotulo: "Não alfabetizado" },
  { valor: "FUNDAMENTAL_INCOMPLETO", rotulo: "Fundamental incompleto" },
  { valor: "FUNDAMENTAL_COMPLETO", rotulo: "Fundamental completo" },
  { valor: "MEDIO_INCOMPLETO", rotulo: "Médio incompleto" },
  { valor: "MEDIO_COMPLETO", rotulo: "Médio completo" },
  { valor: "SUPERIOR_INCOMPLETO", rotulo: "Superior incompleto" },
  { valor: "SUPERIOR_COMPLETO", rotulo: "Superior completo" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

export const TIPO_DEFICIENCIA = [
  { valor: "NENHUMA", rotulo: "Nenhuma" },
  { valor: "FISICA", rotulo: "Física" },
  { valor: "VISUAL", rotulo: "Visual" },
  { valor: "AUDITIVA", rotulo: "Auditiva" },
  { valor: "INTELECTUAL", rotulo: "Intelectual" },
  { valor: "MENTAL_PSICOSSOCIAL", rotulo: "Mental/psicossocial" },
  { valor: "MULTIPLA", rotulo: "Múltipla" },
  { valor: "OUTRA", rotulo: "Outra" },
];

export const FAIXA_RENDA = [
  { valor: "EXTREMA_POBREZA", rotulo: "Extrema pobreza" },
  { valor: "POBREZA", rotulo: "Pobreza" },
  { valor: "BAIXA_RENDA", rotulo: "Baixa renda" },
  { valor: "ACIMA_MEIO_SM", rotulo: "Acima de meio salário mínimo" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

export const ESTADO_CIVIL = [
  { valor: "SOLTEIRO", rotulo: "Solteiro(a)" },
  { valor: "CASADO", rotulo: "Casado(a)" },
  { valor: "UNIAO_ESTAVEL", rotulo: "União estável" },
  { valor: "SEPARADO", rotulo: "Separado(a)" },
  { valor: "DIVORCIADO", rotulo: "Divorciado(a)" },
  { valor: "VIUVO", rotulo: "Viúvo(a)" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

export const RACA_COR = [
  { valor: "BRANCA", rotulo: "Branca" },
  { valor: "PRETA", rotulo: "Preta" },
  { valor: "PARDA", rotulo: "Parda" },
  { valor: "AMARELA", rotulo: "Amarela" },
  { valor: "INDIGENA", rotulo: "Indígena" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

export const SITUACAO_MERCADO = [
  { valor: "TRABALHANDO", rotulo: "Trabalhando" },
  { valor: "DESEMPREGADO", rotulo: "Desempregado(a)" },
  { valor: "APOSENTADO", rotulo: "Aposentado(a)" },
  { valor: "PENSIONISTA", rotulo: "Pensionista" },
  { valor: "ESTUDANTE", rotulo: "Estudante" },
  { valor: "DONA_DE_CASA", rotulo: "Dona de casa" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

export const TIPO_ATENDIMENTO = [
  { valor: "INDIVIDUAL", rotulo: "Individual" },
  { valor: "FAMILIAR", rotulo: "Familiar" },
  { valor: "VISITA_DOMICILIAR", rotulo: "Visita domiciliar" },
  { valor: "GRUPO", rotulo: "Coletivo / grupo" },
];

export function rotuloDe(
  lista: { valor: string; rotulo: string }[],
  valorProcurado: string | null | undefined,
): string {
  const encontrado = lista.find((item) => item.valor === valorProcurado);
  return encontrado?.rotulo ?? valorProcurado ?? "—";
}

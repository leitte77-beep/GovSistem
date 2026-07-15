import type { OpcaoSelect } from "@/ui/Select";

/**
 * Listas de domínio com rótulos pt-BR (vocabulário SUAS), espelhando os enums
 * do backend (app/models/enums.py). Usadas nos selects de cadastro.
 */

export const SEXO: OpcaoSelect[] = [
  { valor: "FEMININO", rotulo: "Feminino" },
  { valor: "MASCULINO", rotulo: "Masculino" },
  { valor: "OUTRO", rotulo: "Outro" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

export const PARENTESCO: OpcaoSelect[] = [
  { valor: "RESPONSAVEL", rotulo: "Responsável familiar" },
  { valor: "CONJUGE", rotulo: "Cônjuge / companheiro(a)" },
  { valor: "FILHO", rotulo: "Filho(a)" },
  { valor: "ENTEADO", rotulo: "Enteado(a)" },
  { valor: "PAI", rotulo: "Pai" },
  { valor: "MAE", rotulo: "Mãe" },
  { valor: "AVO", rotulo: "Avô / avó" },
  { valor: "NETO", rotulo: "Neto(a)" },
  { valor: "IRMAO", rotulo: "Irmão / irmã" },
  { valor: "OUTRO_PARENTE", rotulo: "Outro parente" },
  { valor: "NAO_PARENTE", rotulo: "Não parente" },
];

export const ESCOLARIDADE: OpcaoSelect[] = [
  { valor: "NAO_ALFABETIZADO", rotulo: "Não alfabetizado(a)" },
  { valor: "FUNDAMENTAL_INCOMPLETO", rotulo: "Fundamental incompleto" },
  { valor: "FUNDAMENTAL_COMPLETO", rotulo: "Fundamental completo" },
  { valor: "MEDIO_INCOMPLETO", rotulo: "Médio incompleto" },
  { valor: "MEDIO_COMPLETO", rotulo: "Médio completo" },
  { valor: "SUPERIOR_INCOMPLETO", rotulo: "Superior incompleto" },
  { valor: "SUPERIOR_COMPLETO", rotulo: "Superior completo" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

export const TIPO_DEFICIENCIA: OpcaoSelect[] = [
  { valor: "NENHUMA", rotulo: "Nenhuma" },
  { valor: "FISICA", rotulo: "Física" },
  { valor: "VISUAL", rotulo: "Visual" },
  { valor: "AUDITIVA", rotulo: "Auditiva" },
  { valor: "INTELECTUAL", rotulo: "Intelectual" },
  { valor: "MENTAL_PSICOSSOCIAL", rotulo: "Mental / psicossocial" },
  { valor: "MULTIPLA", rotulo: "Múltipla" },
  { valor: "OUTRA", rotulo: "Outra" },
];

export const FAIXA_RENDA: OpcaoSelect[] = [
  { valor: "EXTREMA_POBREZA", rotulo: "Extrema pobreza" },
  { valor: "POBREZA", rotulo: "Pobreza" },
  { valor: "BAIXA_RENDA", rotulo: "Baixa renda" },
  { valor: "ACIMA_MEIO_SM", rotulo: "Acima de meio salário mínimo" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

// CadÚnico — raça/cor (IBGE)
export const RACA_COR: OpcaoSelect[] = [
  { valor: "BRANCA", rotulo: "Branca" },
  { valor: "PRETA", rotulo: "Preta" },
  { valor: "PARDA", rotulo: "Parda" },
  { valor: "AMARELA", rotulo: "Amarela" },
  { valor: "INDIGENA", rotulo: "Indígena" },
  { valor: "NAO_DECLARADO", rotulo: "Não declarado" },
];

// CadÚnico — estado civil
export const ESTADO_CIVIL: OpcaoSelect[] = [
  { valor: "SOLTEIRO", rotulo: "Solteiro(a)" },
  { valor: "CASADO", rotulo: "Casado(a)" },
  { valor: "DIVORCIADO", rotulo: "Divorciado(a)" },
  { valor: "VIUVO", rotulo: "Viúvo(a)" },
  { valor: "UNIAO_ESTAVEL", rotulo: "União estável" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

// CadÚnico — situação no mercado de trabalho
export const SITUACAO_MERCADO: OpcaoSelect[] = [
  { valor: "EMPREGADO", rotulo: "Empregado(a)" },
  { valor: "DESEMPREGADO", rotulo: "Desempregado(a)" },
  { valor: "AUTONOMO", rotulo: "Autônomo(a)" },
  { valor: "EMPREGADOR", rotulo: "Empregador(a)" },
  { valor: "APOSENTADO", rotulo: "Aposentado(a)" },
  { valor: "PENSIONISTA", rotulo: "Pensionista" },
  { valor: "ESTAGIARIO", rotulo: "Estagiário(a)" },
  { valor: "APRENDIZ", rotulo: "Aprendiz" },
  { valor: "DO_LAR", rotulo: "Do lar" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];

export const UF: OpcaoSelect[] = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
].map((s) => ({ valor: s, rotulo: s }));

export const TIPO_ATENDIMENTO: OpcaoSelect[] = [
  { valor: "INDIVIDUAL", rotulo: "Individual" },
  { valor: "FAMILIAR", rotulo: "Familiar" },
  { valor: "VISITA_DOMICILIAR", rotulo: "Visita domiciliar" },
  { valor: "GRUPO", rotulo: "Coletivo / grupo" },
];

/** Rótulo pt-BR para exibição de um valor de enum (parentesco etc.). */
export function rotuloDe(lista: OpcaoSelect[], valor: string | null | undefined): string {
  if (!valor) return "";
  return lista.find((o) => o.valor === valor)?.rotulo ?? valor;
}

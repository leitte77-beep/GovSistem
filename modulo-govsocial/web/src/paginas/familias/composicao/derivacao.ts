/**
 * Derivação da Composição familiar — lógica PURA (sem JSX, sem hooks), para ser
 * testável e reutilizável. Transforma os dados crus da API (MemberOut enxuto +
 * PersonOut por pessoa + concessões da família + flags da família) nos objetos
 * que a aba consome: badges por categoria, resumo, alertas, filtros e ordenação.
 *
 * Princípio: nada de dado fixo. Tudo é derivado do que a API entrega; quando um
 * dado ainda não existe, o fallback é seguro (a informação simplesmente não vira
 * badge/alerta, em vez de inventar).
 */
import type { FamilyOut, MemberOut, PersonOut } from "@/tipos/pessoas";
import type { ConcessaoOut, StatusConcessao } from "@/tipos/beneficios";
import { idade } from "@/nucleo/datas";
import { PARENTESCO, SEXO, TIPO_DEFICIENCIA, rotuloDe } from "@/i18n/dominios";

export type FaixaEtaria = "crianca" | "adolescente" | "adulto" | "idoso" | "nao_informada";

/** Tom visual do badge — mapeado para os tokens --ga-chip-* na camada de UI. */
export type TomBadge =
  | "neutro"
  | "vinculo"
  | "faixaCrianca"
  | "faixaAdolescente"
  | "faixaAdulto"
  | "faixaIdoso"
  | "beneficio"
  | "pendencia"
  | "pendenciaCritica"
  | "acompanhamento"
  | "deficiencia";

export type CategoriaBadge = "neutro" | "beneficio" | "pendencia" | "acompanhamento" | "deficiencia";

/** Ícone semântico — a UI resolve para o componente lucide correspondente. */
export type IconeBadge =
  | "idade"
  | "genero"
  | "vinculo"
  | "beneficio"
  | "pendencia"
  | "acompanhamento"
  | "deficiencia"
  | "gestante"
  | "falecido";

export type Badge = {
  id: string;
  categoria: CategoriaBadge;
  tom: TomBadge;
  texto: string;
  /** Texto do tooltip (aria/title) — explica o badge. */
  titulo?: string;
  icone?: IconeBadge;
};

export type MembroDerivado = {
  membro: MemberOut;
  pessoa: PersonOut | null;
  carregandoPessoa: boolean;
  anos: number | null;
  faixa: FaixaEtaria;
  /** Badges já separados por categoria (a UI define a hierarquia visual). */
  neutros: Badge[];
  beneficios: Badge[];
  pendencias: Badge[];
  acompanhamentos: Badge[];
  deficiencia: Badge | null;
  temBeneficio: boolean;
  temPendencia: boolean;
  temAcompanhamento: boolean;
  temDeficiencia: boolean;
  isFalecido: boolean;
  /** Texto normalizado (sem acento, minúsculo) para a busca local. */
  chaveBusca: string;
};

export type ResumoComposicao = {
  totalAtivos: number;
  adultos: number;
  criancas: number;
  adolescentes: number;
  idosos: number;
  pcd: number;
  beneficiarios: number;
  pendencias: number;
  acompanhamentos: number;
};

export type FiltroComposicao =
  | "todos"
  | "responsavel"
  | "adultos"
  | "criancas"
  | "adolescentes"
  | "idosos"
  | "pcd"
  | "beneficiarios"
  | "pendencias"
  | "acompanhamentos";

export type Ordenacao =
  | "padrao"
  | "nome_az"
  | "nome_za"
  | "idade_maior"
  | "idade_menor"
  | "inclusao_recente"
  | "inclusao_antiga"
  | "pendencia_primeiro";

export type GravidadeAlerta = "info" | "atencao" | "importante" | "critico";

export type AlertaComposicao = {
  id: string;
  titulo: string;
  descricao: string;
  gravidade: GravidadeAlerta;
};

// ─── Helpers ───────────────────────────────────────────────────────

/** Remove acentos e caixa para busca/insensibilidade a diacríticos (§7). */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function faixaDe(anos: number | null): FaixaEtaria {
  if (anos === null) return "nao_informada";
  if (anos < 12) return "crianca";
  if (anos < 18) return "adolescente";
  if (anos >= 60) return "idoso";
  return "adulto";
}

const ROTULO_FAIXA: Record<FaixaEtaria, string> = {
  crianca: "Criança",
  adolescente: "Adolescente",
  adulto: "Adulto",
  idoso: "Idoso",
  nao_informada: "Idade não informada",
};

const TOM_FAIXA: Record<FaixaEtaria, TomBadge> = {
  crianca: "faixaCrianca",
  adolescente: "faixaAdolescente",
  adulto: "faixaAdulto",
  idoso: "faixaIdoso",
  nao_informada: "neutro",
};

export function rotuloFaixa(faixa: FaixaEtaria): string {
  return ROTULO_FAIXA[faixa];
}

/** Status de benefício que contam como "a pessoa possui benefício". */
const STATUS_BENEFICIO_ATIVO: StatusConcessao[] = ["SOLICITADO", "EM_ANALISE", "APROVADO", "ENTREGUE"];

const ROTULO_STATUS_BENEFICIO: Record<StatusConcessao, string> = {
  SOLICITADO: "Solicitado",
  EM_ANALISE: "Em análise",
  APROVADO: "Aprovado",
  ENTREGUE: "Entregue",
  NEGADO: "Negado",
  CANCELADO: "Cancelado",
};

/** Um cadastro é "desatualizado" se a última atualização passou de `meses`. */
export function cadastroDesatualizado(
  updatedAt: string | null | undefined,
  meses = 12,
  agora: Date = new Date(),
): boolean {
  if (!updatedAt) return false;
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return false;
  const limite = new Date(agora);
  limite.setMonth(limite.getMonth() - meses);
  return d < limite;
}

function documentoAusenteOuIrregular(mascarado: string | null | undefined): boolean {
  if (!mascarado) return true;
  return normalizar(mascarado).includes("regular");
}

function temDeficienciaReal(tipo: string | null | undefined): boolean {
  return Boolean(tipo) && tipo !== "NENHUMA" && tipo !== "NAO_INFORMADO";
}

function apenasDigitos(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\D/g, "");
}

// ─── Derivação de um membro ────────────────────────────────────────

/**
 * Deriva um membro ativo enriquecido. `pessoa` pode ser null enquanto a query
 * individual carrega — nesse caso só os dados do vínculo (MemberOut) alimentam
 * o cartão, e `carregandoPessoa` sinaliza o skeleton parcial.
 */
export function derivarMembro(
  membro: MemberOut,
  pessoa: PersonOut | null,
  carregandoPessoa: boolean,
  concessoesDaPessoa: ConcessaoOut[],
  familia: Pick<FamilyOut, "beneficiaria_pbf" | "possui_bpc">,
  agora: Date = new Date(),
): MembroDerivado {
  const anos = idade(pessoa?.data_nascimento);
  const faixa = faixaDe(anos);

  const neutros: Badge[] = [];
  const beneficios: Badge[] = [];
  const pendencias: Badge[] = [];
  const acompanhamentos: Badge[] = [];
  let deficiencia: Badge | null = null;

  // Neutros: faixa etária, sexo, vínculo.
  if (faixa !== "nao_informada") {
    neutros.push({
      id: "faixa",
      categoria: "neutro",
      tom: TOM_FAIXA[faixa],
      texto: ROTULO_FAIXA[faixa],
      icone: "idade",
      titulo: anos !== null ? `${anos} anos` : undefined,
    });
  }
  if (pessoa?.sexo && pessoa.sexo !== "NAO_INFORMADO") {
    neutros.push({ id: "sexo", categoria: "neutro", tom: "neutro", texto: rotuloDe(SEXO, pessoa.sexo), icone: "genero" });
  }
  if (membro.parentesco && !membro.is_responsavel) {
    neutros.push({
      id: "vinculo",
      categoria: "neutro",
      tom: "vinculo",
      texto: rotuloDe(PARENTESCO, membro.parentesco),
      icone: "vinculo",
    });
  }

  // Benefícios reais: PBF (família, atribuído ao RF), BPC e concessões da pessoa.
  if (familia.beneficiaria_pbf && membro.is_responsavel) {
    beneficios.push({ id: "pbf", categoria: "beneficio", tom: "beneficio", texto: "Bolsa Família", icone: "beneficio", titulo: "Família beneficiária do Programa Bolsa Família" });
  }
  const temBpcPessoa = Boolean((pessoa?.documentos as Record<string, unknown> | null)?.beneficiario_bpc);
  if (temBpcPessoa || (familia.possui_bpc && membro.is_responsavel)) {
    beneficios.push({ id: "bpc", categoria: "beneficio", tom: "beneficio", texto: "BPC", icone: "beneficio", titulo: "Benefício de Prestação Continuada" });
  }
  for (const c of concessoesDaPessoa) {
    if (!STATUS_BENEFICIO_ATIVO.includes(c.status)) continue;
    beneficios.push({
      id: `conc-${c.id}`,
      categoria: "beneficio",
      tom: "beneficio",
      texto: `${c.benefit_type_code} · ${ROTULO_STATUS_BENEFICIO[c.status]}`,
      icone: "beneficio",
    });
  }

  // Pendências reais (só quando a pessoa já carregou; sem pessoa não afirmamos pendência).
  if (pessoa) {
    if (documentoAusenteOuIrregular(pessoa.cpf_mascarado)) {
      pendencias.push({ id: "cpf", categoria: "pendencia", tom: "pendenciaCritica", texto: "CPF a regularizar", icone: "pendencia", titulo: "CPF ausente ou pendente de regularização" });
    }
    if (!pessoa.nis_mascarado) {
      pendencias.push({ id: "nis", categoria: "pendencia", tom: "pendencia", texto: "NIS não informado", icone: "pendencia" });
    }
    if (!pessoa.data_nascimento) {
      pendencias.push({ id: "nasc", categoria: "pendencia", tom: "pendencia", texto: "Data de nascimento ausente", icone: "pendencia" });
    }
    if (cadastroDesatualizado(pessoa.updated_at, 12, agora)) {
      pendencias.push({ id: "desatualizado", categoria: "pendencia", tom: "pendencia", texto: "Cadastro desatualizado", icone: "pendencia", titulo: "Sem atualização há mais de 12 meses" });
    }
  }

  // Acompanhamentos reais.
  if (pessoa?.gestante) {
    acompanhamentos.push({ id: "gestante", categoria: "acompanhamento", tom: "acompanhamento", texto: "Gestante", icone: "gestante" });
  }
  const isFalecido = Boolean(pessoa?.is_falecido);
  if (isFalecido) {
    pendencias.push({ id: "falecido", categoria: "pendencia", tom: "pendenciaCritica", texto: "Pessoa falecida", icone: "falecido", titulo: "Registrada como falecida, mas ainda ativa na composição" });
  }

  // Pessoa com deficiência — institucional (azul/roxo), NUNCA como erro (§9.5).
  if (temDeficienciaReal(pessoa?.tipo_deficiencia)) {
    deficiencia = {
      id: "pcd",
      categoria: "deficiencia",
      tom: "deficiencia",
      texto: "Pessoa com deficiência",
      icone: "deficiencia",
      titulo: rotuloDe(TIPO_DEFICIENCIA, pessoa?.tipo_deficiencia) || undefined,
    };
  }

  const chaveBusca = normalizar(
    [
      membro.nome_exibicao,
      pessoa?.nome_social,
      rotuloDe(PARENTESCO, membro.parentesco),
      apenasDigitos(pessoa?.cpf_mascarado),
      apenasDigitos(pessoa?.nis_mascarado),
    ]
      .filter(Boolean)
      .join(" "),
  );

  return {
    membro,
    pessoa,
    carregandoPessoa,
    anos,
    faixa,
    neutros,
    beneficios,
    pendencias,
    acompanhamentos,
    deficiencia,
    temBeneficio: beneficios.length > 0,
    temPendencia: pendencias.length > 0,
    temAcompanhamento: acompanhamentos.length > 0,
    temDeficiencia: deficiencia !== null,
    isFalecido,
    chaveBusca,
  };
}

// ─── Resumo, filtros, ordenação, alertas ───────────────────────────

export function resumoDe(derivados: MembroDerivado[]): ResumoComposicao {
  return {
    totalAtivos: derivados.length,
    adultos: derivados.filter((d) => d.faixa === "adulto").length,
    criancas: derivados.filter((d) => d.faixa === "crianca").length,
    adolescentes: derivados.filter((d) => d.faixa === "adolescente").length,
    idosos: derivados.filter((d) => d.faixa === "idoso").length,
    pcd: derivados.filter((d) => d.temDeficiencia).length,
    beneficiarios: derivados.filter((d) => d.temBeneficio).length,
    pendencias: derivados.filter((d) => d.temPendencia).length,
    acompanhamentos: derivados.filter((d) => d.temAcompanhamento).length,
  };
}

function correspondeFiltro(d: MembroDerivado, filtro: FiltroComposicao): boolean {
  switch (filtro) {
    case "todos":
      return true;
    case "responsavel":
      return d.membro.is_responsavel;
    case "adultos":
      return d.faixa === "adulto";
    case "criancas":
      return d.faixa === "crianca";
    case "adolescentes":
      return d.faixa === "adolescente";
    case "idosos":
      return d.faixa === "idoso";
    case "pcd":
      return d.temDeficiencia;
    case "beneficiarios":
      return d.temBeneficio;
    case "pendencias":
      return d.temPendencia;
    case "acompanhamentos":
      return d.temAcompanhamento;
    default:
      return true;
  }
}

/**
 * Aplica filtros (combináveis) e busca textual. `filtros` vazio = todos.
 * A busca ignora acentos/caixa e casa nome, nome social, vínculo e dígitos
 * visíveis de CPF/NIS.
 */
export function filtrar(
  derivados: MembroDerivado[],
  filtros: FiltroComposicao[],
  termo: string,
): MembroDerivado[] {
  const ativos = filtros.filter((f) => f !== "todos");
  const alvo = normalizar(termo);
  const alvoDigitos = apenasDigitos(termo);
  return derivados.filter((d) => {
    if (ativos.length > 0 && !ativos.every((f) => correspondeFiltro(d, f))) return false;
    if (alvo.length === 0) return true;
    if (d.chaveBusca.includes(alvo)) return true;
    if (alvoDigitos.length >= 3 && d.chaveBusca.includes(alvoDigitos)) return true;
    return false;
  });
}

export function ordenar(derivados: MembroDerivado[], ordem: Ordenacao): MembroDerivado[] {
  const arr = [...derivados];
  const porNome = (a: MembroDerivado, b: MembroDerivado) =>
    normalizar(a.membro.nome_exibicao).localeCompare(normalizar(b.membro.nome_exibicao));
  const idadeNum = (d: MembroDerivado) => (d.anos ?? -1);
  const entrada = (d: MembroDerivado) => new Date(d.membro.data_entrada).getTime() || 0;

  switch (ordem) {
    case "nome_az":
      arr.sort(porNome);
      break;
    case "nome_za":
      arr.sort((a, b) => porNome(b, a));
      break;
    case "idade_maior":
      arr.sort((a, b) => idadeNum(b) - idadeNum(a) || porNome(a, b));
      break;
    case "idade_menor":
      arr.sort((a, b) => idadeNum(a) - idadeNum(b) || porNome(a, b));
      break;
    case "inclusao_recente":
      arr.sort((a, b) => entrada(b) - entrada(a));
      break;
    case "inclusao_antiga":
      arr.sort((a, b) => entrada(a) - entrada(b));
      break;
    case "pendencia_primeiro":
      arr.sort((a, b) => Number(b.temPendencia) - Number(a.temPendencia) || porNome(a, b));
      break;
    case "padrao":
    default:
      // Responsável primeiro; depois maiores de idade; depois nome.
      arr.sort(
        (a, b) =>
          Number(b.membro.is_responsavel) - Number(a.membro.is_responsavel) ||
          idadeNum(b) - idadeNum(a) ||
          porNome(a, b),
      );
      break;
  }
  return arr;
}

/**
 * Alertas automáticos da composição (§16). Só as validações possíveis com os
 * dados atuais são emitidas; as demais ficam preparadas para quando o backend
 * expuser os campos (fallback: não emite, não bloqueia).
 */
export function alertasDe(
  derivados: MembroDerivado[],
  agora: Date = new Date(),
): AlertaComposicao[] {
  const alertas: AlertaComposicao[] = [];
  const responsaveis = derivados.filter((d) => d.membro.is_responsavel);

  if (derivados.length > 0 && responsaveis.length === 0) {
    alertas.push({
      id: "sem-responsavel",
      titulo: "Família sem responsável familiar",
      descricao: "Defina um responsável para a composição.",
      gravidade: "importante",
    });
  }
  if (responsaveis.length > 1) {
    alertas.push({
      id: "multiplos-responsaveis",
      titulo: "Mais de um responsável familiar ativo",
      descricao: `${responsaveis.length} membros marcados como responsável. Mantenha apenas um.`,
      gravidade: "critico",
    });
  }
  for (const r of responsaveis) {
    if (r.anos !== null && r.anos < 18) {
      alertas.push({
        id: `responsavel-menor-${r.membro.person_id}`,
        titulo: "Responsável familiar menor de idade",
        descricao: `${r.membro.nome_exibicao} é responsável e tem ${r.anos} anos.`,
        gravidade: "importante",
      });
    }
  }
  const temAdultoAtivo = derivados.some((d) => d.faixa === "adulto" || d.faixa === "idoso");
  const temMenor = derivados.some((d) => d.faixa === "crianca" || d.faixa === "adolescente");
  if (temMenor && !temAdultoAtivo) {
    alertas.push({
      id: "menor-sem-adulto",
      titulo: "Criança/adolescente sem adulto na composição",
      descricao: "Não há adulto ou idoso ativo responsável pelos menores.",
      gravidade: "importante",
    });
  }
  for (const d of derivados) {
    if (d.isFalecido) {
      alertas.push({
        id: `falecido-${d.membro.person_id}`,
        titulo: "Pessoa falecida ativa na composição",
        descricao: `${d.membro.nome_exibicao} consta como falecida, mas segue ativa.`,
        gravidade: "critico",
      });
    }
  }
  // Cadastro sem atualização (informativo, não bloqueia).
  const desatualizados = derivados.filter((d) => d.pessoa && cadastroDesatualizado(d.pessoa.updated_at, 12, agora));
  if (desatualizados.length > 0) {
    alertas.push({
      id: "cadastros-desatualizados",
      titulo: "Cadastros desatualizados",
      descricao: `${desatualizados.length} membro(s) sem atualização há mais de 12 meses.`,
      gravidade: "atencao",
    });
  }
  return alertas;
}

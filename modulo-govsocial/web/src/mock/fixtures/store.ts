import { FAMILIA, RESULTADOS_BUSCA } from "./novaEsperanca";
import { mascararCpf, mascararNis } from "@/nucleo/validadoresBr";
import type { FamilyOut } from "@/tipos/pessoas";

/**
 * Store em memória para o modo mock — reproduz o comportamento do backend de
 * pessoas/famílias (dedup por nome+nascimento, unicidade de CPF/NIS, criação
 * com vínculo). Reiniciável nos testes via `resetarStore()`.
 */
type PessoaStore = {
  id: string;
  nome_civil: string;
  nome_social: string | null;
  nome_exibicao: string;
  cpf: string | null;
  nis: string | null;
  data_nascimento: string | null;
  sexo: string | null;
};

type FamiliaStore = FamilyOut;

let pessoas: PessoaStore[] = [];
let familias: FamiliaStore[] = [];
let seqCodigo = 20240200;

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function resetarStore() {
  seqCodigo = 20240200;
  familias = [structuredClone(FAMILIA) as FamiliaStore];
  pessoas = [
    {
      id: RESULTADOS_BUSCA[0].person_id,
      nome_civil: "Maria da Silva Souza",
      nome_social: null,
      nome_exibicao: "Maria da Silva Souza",
      cpf: "52998224725",
      nis: "20883856292",
      data_nascimento: "1988-05-14",
      sexo: "FEMININO",
    },
    {
      id: "c3e4f5a6-0000-0000-0000-000000000002",
      nome_civil: "João Souza",
      nome_social: null,
      nome_exibicao: "João Souza",
      cpf: null,
      nis: null,
      data_nascimento: "2014-02-10",
      sexo: "MASCULINO",
    },
  ];
}
resetarStore();

export function buscarPessoas(termo: string) {
  const t = normalizar(termo);
  const soDigitos = termo.replace(/\D/g, "");
  return pessoas
    .filter((p) => {
      if (soDigitos.length >= 3) {
        return (p.cpf ?? "").includes(soDigitos) || (p.nis ?? "").includes(soDigitos);
      }
      return normalizar(p.nome_exibicao).includes(t);
    })
    .map((p) => ({
      person_id: p.id,
      nome_exibicao: p.nome_exibicao,
      cpf_mascarado: mascararCpf(p.cpf),
      nis_mascarado: mascararNis(p.nis),
      data_nascimento: p.data_nascimento,
      familias: familiasDaPessoa(p.id),
    }));
}

function familiasDaPessoa(personId: string) {
  const saida: { family_id: string; codigo: number; territorio: string | null }[] = [];
  for (const f of familias) {
    if (f.membros.some((m) => m.person_id === personId && m.status === "ATIVO")) {
      saida.push({ family_id: f.id, codigo: f.codigo, territorio: f.territorio });
    }
  }
  return saida;
}

export function obterFamilia(id: string): FamiliaStore | undefined {
  return familias.find((f) => f.id === id);
}

/** Detalhe de pessoa (CPF/NIS mascarados) — usado pelo GET /persons/{id}. */
export function obterPessoa(id: string) {
  const p = pessoas.find((x) => x.id === id);
  if (!p) return undefined;
  return {
    id: p.id,
    nome_civil: p.nome_civil,
    nome_social: p.nome_social,
    nome_exibicao: p.nome_exibicao,
    cpf_mascarado: mascararCpf(p.cpf),
    nis_mascarado: mascararNis(p.nis),
    data_nascimento: p.data_nascimento,
    sexo: p.sexo,
    escolaridade: null,
    ocupacao: null,
    tipo_deficiencia: null,
    deficiencia_detalhe: null,
    documentos: null,
    is_falecido: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function encontrarDuplicatas(nome: string, nascimento: string | null) {
  const n = normalizar(nome);
  return pessoas
    .filter((p) => normalizar(p.nome_civil) === n && (!nascimento || p.data_nascimento === nascimento))
    .map((p) => ({
      id: p.id,
      nome_exibicao: p.nome_exibicao,
      cpf_mascarado: mascararCpf(p.cpf),
      data_nascimento: p.data_nascimento,
    }));
}

export function cpfOuNisEmUso(cpf: string | null, nis: string | null): "cpf" | "nis" | null {
  if (cpf && pessoas.some((p) => p.cpf === cpf)) return "cpf";
  if (nis && pessoas.some((p) => p.nis === nis)) return "nis";
  return null;
}

export function criarPessoa(dados: {
  nome_civil: string;
  nome_social: string | null;
  cpf: string | null;
  nis: string | null;
  data_nascimento: string | null;
  sexo: string | null;
}) {
  const id = crypto.randomUUID();
  const nome_exibicao = dados.nome_social?.trim() || dados.nome_civil;
  const p: PessoaStore = { id, nome_exibicao, ...dados };
  pessoas.push(p);
  return {
    id,
    nome_civil: p.nome_civil,
    nome_social: p.nome_social,
    nome_exibicao,
    cpf_mascarado: mascararCpf(p.cpf),
    nis_mascarado: mascararNis(p.nis),
    data_nascimento: p.data_nascimento,
    sexo: p.sexo,
    escolaridade: null,
    ocupacao: null,
    tipo_deficiencia: null,
    deficiencia_detalhe: null,
    documentos: null,
    is_falecido: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function criarFamilia(dados: Partial<FamiliaStore>): FamiliaStore {
  const id = crypto.randomUUID();
  const base = structuredClone(FAMILIA) as FamiliaStore;
  const nova: FamiliaStore = {
    ...base,
    id,
    codigo: seqCodigo++,
    responsavel_id: null,
    responsavel_nome: null,
    membros: [],
    geocode_status: dados.logradouro ? "PENDENTE" : "SEM_ENDERECO",
    territorio: dados.bairro ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...dados,
  };
  familias.push(nova);
  return nova;
}

export function adicionarMembro(
  familyId: string,
  personId: string,
  parentesco: string | null,
  definirResponsavel: boolean,
): FamiliaStore | undefined {
  const fam = familias.find((f) => f.id === familyId);
  const pessoa = pessoas.find((p) => p.id === personId);
  if (!fam || !pessoa) return undefined;
  fam.membros.push({
    membership_id: crypto.randomUUID(),
    person_id: personId,
    nome_exibicao: pessoa.nome_exibicao,
    parentesco,
    status: "ATIVO",
    data_entrada: new Date().toISOString().slice(0, 10),
    data_saida: null,
    is_responsavel: definirResponsavel,
  });
  if (definirResponsavel) {
    fam.responsavel_id = personId;
    fam.responsavel_nome = pessoa.nome_exibicao;
    if (pessoa.nis) fam.nis_responsavel_mascarado = mascararNis(pessoa.nis);
  }
  return fam;
}

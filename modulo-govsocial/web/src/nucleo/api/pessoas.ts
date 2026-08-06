import { http } from "@/nucleo/http/clienteHttp";
import type {
  FamilyCreate,
  FamilyListItem,
  FamilyOut,
  FamilyUpdate,
  PersonCreate,
  PersonCreateResult,
  PersonListItem,
  PersonOut,
  PersonUpdate,
  PessoaBuscaItem,
  UnifiedSearchItem,
} from "@/tipos/pessoas";

/**
 * Serviços de API da Fase 2 (busca, pessoas, famílias). Todos passam pelo
 * cliente HTTP único (token/tenant, RFC 9457, retry idempotente).
 */

export const servicoBusca = {
  unificada: (q: string, sinal?: AbortSignal) =>
    http.get<UnifiedSearchItem[]>(`/search?q=${encodeURIComponent(q)}`, { sinal }),
};

export const servicoPessoas = {
  buscar: (q: string) =>
    http.get<PessoaBuscaItem[]>(`/persons/search?q=${encodeURIComponent(q)}`),
  listar: (busca?: string) =>
    http.get<PersonListItem[]>(
      `/persons${busca ? `?search=${encodeURIComponent(busca)}` : ""}`,
    ),
  obter: (id: string) => http.get<PersonOut>(`/persons/${id}`, { semCache: true }),
  criar: (corpo: PersonCreate) => http.post<PersonCreateResult>("/persons", corpo),
  atualizar: (id: string, corpo: PersonUpdate) =>
    http.patch<PersonOut>(`/persons/${id}`, corpo),
};

export const servicoFamilias = {
  listar: (params?: { search?: string; territorio?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.territorio) qs.set("territorio", params.territorio);
    const q = qs.toString();
    return http.get<FamilyListItem[]>(`/families${q ? `?${q}` : ""}`);
  },
  obter: (id: string) => http.get<FamilyOut>(`/families/${id}`, { semCache: true }),
  criar: (corpo: FamilyCreate) => http.post<FamilyOut>("/families", corpo),
  atualizar: (id: string, corpo: FamilyUpdate) =>
    http.patch<FamilyOut>(`/families/${id}`, corpo),
  adicionarMembro: (
    familyId: string,
    corpo: {
      person_id: string;
      parentesco?: string | null;
      definir_responsavel?: boolean;
    },
  ) => http.post<FamilyOut>(`/families/${familyId}/members`, corpo),
  /** Atualiza o vínculo (parentesco); dados da pessoa vão em servicoPessoas. */
  atualizarMembro: (
    familyId: string,
    personId: string,
    corpo: { parentesco?: string | null },
  ) => http.patch<FamilyOut>(`/families/${familyId}/members/${personId}`, corpo),
  definirResponsavel: (familyId: string, personId: string) =>
    http.patch<FamilyOut>(`/families/${familyId}`, { responsavel_id: personId }),
  removerMembro: (familyId: string, personId: string) =>
    http.delete<void>(`/families/${familyId}/members/${personId}`),
};

// ── Busca de CEP e Localidades (proxy backend → ViaCEP + IBGE) ──
export type EnderecoCep = {
  cep: string;
  logradouro: string;
  complemento?: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge?: string;
  ddd?: string;
};

export type Estado = {
  sigla: string;
  nome: string;
  id: number;
};

export type Municipio = {
  id: number;
  nome: string;
};

export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  return http.get<EnderecoCep>(`/cep/${d}`).catch(() => null);
}

export const servicoLocalidades = {
  estados: () => http.get<Estado[]>("/localidades/estados"),
  municipios: (uf: string) => http.get<Municipio[]>(`/localidades/estados/${uf}/municipios`),
};

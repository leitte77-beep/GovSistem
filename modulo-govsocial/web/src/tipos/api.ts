/**
 * Papéis (RBAC) da plataforma — espelham os names do backend
 * (modulo-govsocial README §Perfis).
 */
export type Papel =
  | "ADMIN"
  | "recepcao"
  | "tecnico_medio"
  | "tecnico_superior"
  | "coordenador_unidade"
  | "gestor_municipal"
  | "vigilancia"
  | "conselho"
  | "suporte_govassist";

/** Claims úteis extraídas do JWT injetado pela shell. */
export type ClaimsJwt = {
  sub: string; // user_id
  roles: Papel[];
  organization_id: string | null; // tenant
  exp?: number;
};

/** /auth/me — complementa o token com nome e detalhes. */
export type UsuarioMe = {
  id: string;
  email: string;
  name: string;
  roles: { id: string; name: Papel; label: string }[];
  organization_id: string | null;
};

/** Unidade (subset de UnitOut necessário ao seletor global de contexto). */
export type UnidadeResumo = {
  id: string;
  tipo: string; // CRAS | CREAS | CENTRO_POP | ...
  nome: string;
  is_active: boolean;
};

/** Problem Details (RFC 9457) como o backend retorna. */
export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: { field: string; message: string }[];
};

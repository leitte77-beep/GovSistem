import type { Papel } from "@/tipos/api";

/**
 * Tenant fictício "Nova Esperança" (mesmo do seed do backend).
 * Fixtures fiéis aos DTOs do módulo — CPF/NIS já vêm MASCARADOS como o backend
 * retorna em listagens/detalhes de tela (LGPD).
 */

export const TENANT = {
  id: "org-nova-esperanca",
  nomeMunicipio: "Nova Esperança",
  brasaoUrl: null as string | null,
  // Cor de destaque proposital que PASSA no contraste contra texto branco.
  corDestaque: "#17635A",
};

export const UNIDADES = [
  { id: "u-cras-norte", tipo: "CRAS", nome: "CRAS Norte", is_active: true },
  { id: "u-cras-sul", tipo: "CRAS", nome: "CRAS Sul", is_active: true },
  { id: "u-creas", tipo: "CREAS", nome: "CREAS Municipal", is_active: true },
  { id: "u-sede", tipo: "SEDE", nome: "Secretaria (SEDE)", is_active: true },
];

/** Usuário de exemplo por perfil (o perfil ativo vem de VITE_MOCK_ROLE). */
export const USUARIOS: Record<Papel, { id: string; name: string; email: string }> = {
  gestor_municipal: {
    id: "user-gestor",
    name: "Beatriz Gestora",
    email: "gestor@nova-esperanca.gov.br",
  },
  coordenador_unidade: {
    id: "user-coord",
    name: "Ana Coordenadora",
    email: "coordenador@nova-esperanca.gov.br",
  },
  tecnico_superior: {
    id: "user-tecnico",
    name: "Carla Assistente Social",
    email: "tecnico@nova-esperanca.gov.br",
  },
  tecnico_medio: {
    id: "user-medio",
    name: "Diego Educador",
    email: "educador@nova-esperanca.gov.br",
  },
  recepcao: {
    id: "user-recepcao",
    name: "Rita Recepção",
    email: "recepcao@nova-esperanca.gov.br",
  },
  vigilancia: {
    id: "user-vigilancia",
    name: "Vera Vigilância",
    email: "vigilancia@nova-esperanca.gov.br",
  },
  conselho: {
    id: "user-conselho",
    name: "Carlos Conselheiro",
    email: "conselho@nova-esperanca.gov.br",
  },
  ADMIN: { id: "user-admin", name: "Administrador", email: "admin@nova-esperanca.gov.br" },
  suporte_govassist: {
    id: "user-suporte",
    name: "Suporte GovSocial",
    email: "suporte@govsocial.com.br",
  },
};

const LABELS: Record<Papel, string> = {
  gestor_municipal: "Gestor(a) municipal",
  coordenador_unidade: "Coordenador(a) de unidade",
  tecnico_superior: "Técnico(a) superior",
  tecnico_medio: "Técnico(a) de nível médio",
  recepcao: "Recepção",
  vigilancia: "Vigilância socioassistencial",
  conselho: "Conselho",
  ADMIN: "Administração",
  suporte_govassist: "Suporte GovSocial",
};

export function meDoPerfil(papel: Papel) {
  const u = USUARIOS[papel] ?? USUARIOS.recepcao;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roles: [{ id: `role-${papel}`, name: papel, label: LABELS[papel] }],
    organization_id: TENANT.id,
  };
}

/** Família fiel a FamilyOut (§ payload de exemplo do plano). */
export const FAMILIA = {
  id: "8f2a1c4e-0b3d-4a9e-9c11-2f7d6a1b0c33",
  codigo: 20240193,
  responsavel_id: "b1d2e3f4-0000-0000-0000-000000000001",
  responsavel_nome: "Maria da Silva Souza",
  nis_responsavel_mascarado: "********821",
  cep: "58000000",
  logradouro: "Rua das Acácias",
  numero: "45",
  complemento: null,
  bairro: "Vila Rica",
  municipio: "Nova Esperança",
  uf: "PB",
  latitude: -7.11,
  longitude: -34.88,
  geocode_status: "CONCLUIDO",
  territorio: "Território Vila Rica",
  faixa_renda: "ATE_MEIO_SM",
  no_cadunico: true,
  cadunico_atualizado_em: "2026-03-01",
  beneficiaria_pbf: true,
  possui_bpc: true,
  inseguranca_alimentar: false,
  membros: [
    {
      membership_id: "m1",
      person_id: "b1d2e3f4-0000-0000-0000-000000000001",
      nome_exibicao: "Maria da Silva Souza",
      parentesco: "RESPONSAVEL",
      status: "ATIVO",
      data_entrada: "2024-01-10",
      data_saida: null,
      is_responsavel: true,
    },
    {
      membership_id: "m2",
      person_id: "c3e4f5a6-0000-0000-0000-000000000002",
      nome_exibicao: "João Souza",
      parentesco: "FILHO",
      status: "ATIVO",
      data_entrada: "2024-01-10",
      data_saida: null,
      is_responsavel: false,
    },
  ],
  created_at: "2024-01-10T13:02:00Z",
  updated_at: "2026-03-01T10:15:00Z",
};

/** Atendimento fiel a AttendanceOut — evolução restrita (sigilo respeitado). */
export const ATENDIMENTO = {
  id: "a7c9b0d1-0000-0000-0000-0000000000aa",
  case_file_id: "cf010000-0000-0000-0000-0000000000cf",
  unit_id: "u-cras-norte",
  service_type_code: "PAIF",
  data_atendimento: "2026-07-04T17:20:00Z",
  tipo: "FAMILIAR",
  sigiloso_reforcado: false,
  registrado_por_id: "prof-carla",
  member_ids: [
    "b1d2e3f4-0000-0000-0000-000000000001",
    "c3e4f5a6-0000-0000-0000-000000000002",
  ],
  professional_ids: ["prof-carla"],
  evolution_text: null,
  evolution_restrita: true,
  created_at: "2026-07-04T17:35:00Z",
  updated_at: "2026-07-04T17:35:00Z",
};

/** RMA fiel a RmaFechamentoOut — em conferência, com um ajuste. */
export const RMA = {
  id: "rma01",
  unit_id: "u-cras-norte",
  ano: 2026,
  mes: 6,
  status: "EM_CONFERENCIA",
  fechado_por_id: null,
  fechado_em: null,
  reaberto_por_id: null,
  reaberto_em: null,
  motivo_reabertura: null,
  dados_calculados: {
    bloco2: [
      { campo: "C1", rotulo: "Famílias atendidas", valor: 128 },
      { campo: "C2", rotulo: "Encaminhadas p/ inclusão no CadÚnico", valor: 14 },
      { campo: "C4", rotulo: "Indivíduos encaminhados ao BPC", valor: 6 },
    ],
  },
  calculado_em: "2026-07-01T08:00:00Z",
  ajustes: [
    {
      id: "aj1",
      bloco: "bloco2",
      campo: "C4",
      valor_calculado: 6,
      valor_ajustado: 5,
      justificativa: "Duplicidade identificada no registro de origem.",
      ajustado_por_id: "user-coord",
      created_at: "2026-07-02T09:00:00Z",
    },
  ],
  created_at: "2026-07-01T08:00:00Z",
  updated_at: "2026-07-02T09:00:00Z",
};

/** Busca unificada (UnifiedSearchItem) — CPF/NIS mascarados. */
export const RESULTADOS_BUSCA = [
  {
    person_id: "b1d2e3f4-0000-0000-0000-000000000001",
    nome_exibicao: "Maria da Silva Souza",
    cpf_mascarado: "***.***.***-12",
    nis_mascarado: "********821",
    data_nascimento: "1988-05-14",
    familias: [{ id: FAMILIA.id, codigo: FAMILIA.codigo, territorio: FAMILIA.territorio }],
  },
];

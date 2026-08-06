import type { Papel } from "@/tipos/api";

/**
 * Matriz de papéis → capacidades e itens de menu.
 * Regra de ouro (§1.1): quem não pode agir NÃO vê o elemento.
 * As capacidades espelham as policies do backend (require_roles) para que a UI
 * não mostre ações que o servidor recusaria.
 */

export type Capacidade =
  | "familia.ler"
  | "familia.cadastrar"
  | "prontuario.ler"
  | "atendimento.registrar"
  | "beneficio.conceder"
  | "beneficio.entregar"
  | "encaminhamento.criar"
  | "grupo.gerir"
  | "frequencia.registrar"
  | "rma.conferir"
  | "rma.fechar"
  | "vigilancia.ver"
  | "vigilancia.pinos"
  | "administracao.gerir"
  | "auditoria.ler"
  | "questionario.gerir"
  | "habitacao.gerir"
  | "exportador.gerir"
  | "ivs.visualizar" | "ivs.alterar" | "estoque.gerir" | "teleatendimento.realizar";

export type ItemMenu =
  | "inicio"
  | "familias"
  | "atendimentos"
  | "agenda"
  | "beneficios"
  | "grupos"
  | "encaminhamentos"
  | "rma"
  | "vigilancia"
  | "estoque"
  | "administracao"
  | "habitacao";

const CAPACIDADES: Record<Papel, Capacidade[]> = {
  ADMIN: [
    "familia.ler",
    "familia.cadastrar",
    "prontuario.ler",
    "atendimento.registrar",
    "beneficio.conceder",
    "beneficio.entregar",
    "encaminhamento.criar",
    "grupo.gerir",
    "frequencia.registrar",
    "rma.conferir",
    "rma.fechar",
    "vigilancia.ver",
    "vigilancia.pinos",
    "administracao.gerir",
    "auditoria.ler",
    "questionario.gerir",
    "habitacao.gerir",
    "exportador.gerir",
    "estoque.gerir",
    "ivs.visualizar",
    "ivs.alterar",
    "teleatendimento.realizar",
  ],
  suporte_govassist: ["administracao.gerir", "auditoria.ler"],
  gestor_municipal: [
    "familia.ler",
    "prontuario.ler",
    "beneficio.conceder",
    "encaminhamento.criar",
    "administracao.gerir",
    "rma.conferir",
    "rma.fechar",
    "vigilancia.ver",
    "vigilancia.pinos",
    "auditoria.ler",
    "habitacao.gerir",
    "exportador.gerir",
    "estoque.gerir",
  ],
  coordenador_unidade: [
    "familia.ler",
    "familia.cadastrar",
    "prontuario.ler",
    "atendimento.registrar",
    "beneficio.conceder",
    "beneficio.entregar",
    "encaminhamento.criar",
    "grupo.gerir",
    "frequencia.registrar",
    "rma.conferir",
    "auditoria.ler",
    "questionario.gerir",
    "habitacao.gerir",
    "estoque.gerir",
  ],
  tecnico_superior: [
    "familia.ler",
    "familia.cadastrar",
    "prontuario.ler",
    "atendimento.registrar",
    "beneficio.conceder",
    "encaminhamento.criar",
    "grupo.gerir",
    "frequencia.registrar",
    "habitacao.gerir",
  ],
  tecnico_medio: ["familia.ler", "familia.cadastrar", "grupo.gerir", "frequencia.registrar"],
  recepcao: ["familia.ler", "familia.cadastrar"],
  vigilancia: ["familia.ler", "vigilancia.ver", "auditoria.ler"],
  conselho: [],
};

const MENU: Record<Papel, ItemMenu[]> = {
  ADMIN: [
    "inicio", "familias", "atendimentos", "agenda", "beneficios",
    "grupos", "encaminhamentos", "rma", "vigilancia", "estoque", "administracao", "habitacao",
  ],
  suporte_govassist: ["inicio", "administracao"],
  gestor_municipal: [
    "inicio", "familias", "beneficios", "estoque",
    "rma", "vigilancia", "administracao", "habitacao",
  ],
  coordenador_unidade: [
    "inicio", "familias", "atendimentos", "agenda", "beneficios",
    "grupos", "encaminhamentos", "rma", "estoque", "habitacao",
  ],
  tecnico_superior: [
    "inicio",
    "familias",
    "atendimentos",
    "agenda",
    "beneficios",
    "grupos",
    "encaminhamentos",
  ],
  tecnico_medio: ["inicio", "familias", "agenda", "grupos"],
  // Recepção vê apenas Início, Famílias, Agenda & Fila (§3).
  recepcao: ["inicio", "familias", "agenda"],
  vigilancia: ["inicio", "familias", "vigilancia"],
  conselho: ["inicio"],
};

export function capacidadesDe(papeis: Papel[]): Set<Capacidade> {
  const conjunto = new Set<Capacidade>();
  for (const p of papeis) {
    for (const c of CAPACIDADES[p] ?? []) conjunto.add(c);
  }
  return conjunto;
}

export function itensDeMenuDe(papeis: Papel[]): Set<ItemMenu> {
  const conjunto = new Set<ItemMenu>();
  for (const p of papeis) {
    for (const i of MENU[p] ?? []) conjunto.add(i);
  }
  return conjunto;
}

/** Item de menu → rota + capacidade exigida (para o guard). */
export const ROTA_DO_ITEM: Record<ItemMenu, { rota: string; exige?: Capacidade }> = {
  inicio: { rota: "/inicio" },
  familias: { rota: "/familias", exige: "familia.ler" },
  atendimentos: { rota: "/atendimentos", exige: "prontuario.ler" },
  agenda: { rota: "/agenda" },
  beneficios: { rota: "/beneficios", exige: "beneficio.conceder" },
  grupos: { rota: "/grupos", exige: "grupo.gerir" },
  encaminhamentos: { rota: "/encaminhamentos", exige: "encaminhamento.criar" },
  rma: { rota: "/rma", exige: "rma.conferir" },
  vigilancia: { rota: "/vigilancia", exige: "vigilancia.ver" },
  estoque: { rota: "/estoque", exige: "estoque.gerir" },
  administracao: { rota: "/administracao", exige: "administracao.gerir" },
  habitacao: { rota: "/habitacao", exige: "habitacao.gerir" },
};

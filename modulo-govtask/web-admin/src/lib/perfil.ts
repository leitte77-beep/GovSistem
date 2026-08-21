/**
 * Perfis de trabalho derivados das permissões do usuário.
 *
 * O backend é a autoridade de acesso; aqui apenas decidimos o que faz sentido
 * mostrar a cada perfil — menu, home e ações — para que ninguém precise
 * atravessar telas que não lhe dizem respeito. Nada aqui depende do *nome* da
 * role: uma role nova criada pelo administrador cai no perfil certo apenas por
 * carregar as permissões correspondentes.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  BarChart3,
  Bell,
  CalendarDays,
  Building2,
  ClipboardCheck,
  ListChecks,
  LayoutGrid,
  HardHat,
  Gavel,
  Landmark,
  ClipboardList,
} from "lucide-react";

export const PERM = {
  VIEW: "resource.view",
  CREATE: "resource.create",
  EDIT: "resource.edit",
  DELETE: "resource.delete",
  TASK_ASSIGN: "task.assign",
  TASK_APPROVE: "task.approve",
  FINANCIAL_VIEW: "financial.view",
  FINANCIAL_MANAGE: "financial.manage",
  ENGINEERING: "engineering.manage",
  ACCOUNTABILITY: "accountability.manage",
  LICITACAO: "licitacao.manage",
  EXPORT: "export",
  AUDIT: "audit.view",
  ADMIN: "admin.config",
} as const;

export type Perfil =
  | "coordenacao"
  | "engenharia"
  | "licitacao"
  | "executivo"
  | "colaborador";

const has = (perms: string[], ...alvo: string[]) => alvo.some((p) => perms.includes(p));

export function perfilDoUsuario(perms: string[] = []): Perfil {
  if (has(perms, PERM.TASK_ASSIGN, PERM.EDIT)) return "coordenacao";
  if (has(perms, PERM.ENGINEERING)) return "engenharia";
  if (has(perms, PERM.LICITACAO)) return "licitacao";
  if (has(perms, PERM.FINANCIAL_VIEW, PERM.FINANCIAL_MANAGE)) return "executivo";
  return "colaborador";
}

/** Onde cada perfil começa o dia — sempre na sua tela de trabalho. */
export function homeDoPerfil(perfil: Perfil): string {
  switch (perfil) {
    case "coordenacao":
      return "/mesa";
    case "executivo":
      return "/executivo";
    default:
      return "/minhas-demandas";
  }
}

export const PERFIL_LABEL: Record<Perfil, string> = {
  coordenacao: "Coordenação",
  engenharia: "Engenharia",
  licitacao: "Compras & Licitações",
  executivo: "Gestão",
  colaborador: "Colaborador",
};

export type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavGroup = { title: string; items: NavItem[] };

const ITEM = {
  mesa: { key: "mesa", href: "/mesa", label: "Minha Mesa", icon: ClipboardList },
  dashboard: { key: "dashboard", href: "/", label: "Painel Geral", icon: LayoutDashboard },
  minhasDemandas: { key: "minhas-demandas", href: "/minhas-demandas", label: "Minhas Demandas", icon: CheckSquare },
  executivo: { key: "executivo", href: "/executivo", label: "Painel Executivo", icon: Landmark },
  pendencias: { key: "pendencias", href: "/pendencias", label: "Minhas Pendências", icon: CheckSquare },
  minhasTarefas: { key: "pendencias", href: "/pendencias", label: "Minhas Tarefas", icon: CheckSquare },
  coordenador: { key: "coordenador", href: "/coordenador", label: "Painel do Coordenador", icon: ListChecks },
  processos: { key: "convenios", href: "/convenios", label: "Processos", icon: FileText },
  tarefas: { key: "tarefas", href: "/tarefas", label: "Quadro de Tarefas", icon: LayoutGrid },
  setor: { key: "setor", href: "/setor", label: "Demandas do Setor", icon: Building2 },
  obras: { key: "obras", href: "/obras", label: "Obras", icon: HardHat },
  licitacoes: { key: "licitacoes", href: "/licitacoes", label: "Licitações & Contratos", icon: Gavel },
  prestacoes: { key: "prestacoes", href: "/prestacoes", label: "Prestações de Contas", icon: ClipboardCheck },
  calendario: { key: "calendario", href: "/calendario", label: "Calendário", icon: CalendarDays },
  relatorios: { key: "relatorios", href: "/convenios/relatorios", label: "Relatórios", icon: BarChart3 },
  alertas: { key: "alertas", href: "/alertas", label: "Alertas", icon: Bell },
} satisfies Record<string, NavItem>;

/**
 * Menu de cada perfil. Busca global e notificações ficam de fora — já estão na
 * barra superior (lupa e sino) e no Ctrl+K.
 */
export function navGroupsDoPerfil(perfil: Perfil, perms: string[] = []): NavGroup[] {
  const grupos: NavGroup[] = [];

  switch (perfil) {
    case "coordenacao":
      grupos.push(
        { title: "Trabalho do dia", items: [ITEM.mesa, ITEM.processos] },
        { title: "Acompanhamento", items: [ITEM.obras, ITEM.prestacoes, ITEM.calendario] },
        { title: "Gestão", items: [ITEM.dashboard, ITEM.alertas, ITEM.relatorios] }
      );
      break;

    case "engenharia":
      grupos.push(
        { title: "Trabalho do dia", items: [ITEM.minhasDemandas, ITEM.obras] },
        { title: "Consulta", items: [ITEM.processos, ITEM.calendario] }
      );
      break;

    case "licitacao":
      grupos.push(
        { title: "Trabalho do dia", items: [ITEM.minhasDemandas, ITEM.licitacoes] },
        { title: "Consulta", items: [ITEM.processos, ITEM.calendario] }
      );
      break;

    case "executivo":
      grupos.push(
        { title: "Visão Geral", items: [ITEM.executivo] },
        { title: "Acompanhamento", items: [ITEM.processos, ITEM.obras, ITEM.relatorios] }
      );
      break;

    default:
      grupos.push(
        { title: "Trabalho do dia", items: [ITEM.minhasDemandas] },
        { title: "Consulta", items: [ITEM.processos, ITEM.calendario] }
      );
  }

  // Prestações só para quem responde por elas.
  if (perfil !== "coordenacao" && has(perms, PERM.ACCOUNTABILITY)) {
    grupos.push({ title: "Prestação de Contas", items: [ITEM.prestacoes] });
  }

  return grupos;
}

/** Abas da tela do processo: exibidas conforme permissão e conforme aplicabilidade. */
export function abasDoProcesso(
  perms: string[] = [],
  contexto: { temObra?: boolean; temLicitacao?: boolean; temEntrega?: boolean } = {}
): { key: string; label: string }[] {
  const abas: { key: string; label: string }[] = [
    { key: "visao-geral", label: "Visão Geral" },
    { key: "timeline", label: "Timeline" },
    { key: "tarefas", label: "Tarefas" },
    { key: "diligencias", label: "Diligências" },
    { key: "documentos", label: "Documentos" },
    { key: "etapas", label: "Etapas" },
  ];

  if (contexto.temObra || has(perms, PERM.ENGINEERING)) {
    abas.push({ key: "obras", label: "Obras" }, { key: "medicoes", label: "Medições" });
  }
  if (contexto.temLicitacao || has(perms, PERM.LICITACAO)) {
    abas.push({ key: "licitacoes", label: "Licitações" }, { key: "contratos", label: "Contratos" });
  }
  if (has(perms, PERM.FINANCIAL_VIEW, PERM.FINANCIAL_MANAGE)) {
    abas.push({ key: "financeiro", label: "Financeiro" }, { key: "repasses", label: "Repasses" });
  }
  if (has(perms, PERM.ACCOUNTABILITY)) {
    abas.push({ key: "prestacoes", label: "Prestação de Contas" });
  }
  if (contexto.temEntrega || has(perms, PERM.ACCOUNTABILITY)) {
    abas.push({ key: "entregas", label: "Entregas" });
  }
  if (has(perms, PERM.EDIT)) {
    abas.push({ key: "configuracoes", label: "Configurações" });
  }

  return abas;
}

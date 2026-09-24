/**
 * O menu de cada perfil. Cada um vê só o que usa — o Prefeito não precisa de
 * "caixa", o departamento não precisa de painel executivo.
 */

import {
  Building2,
  ClipboardList,
  Gauge,
  HardHat,
  Hourglass,
  Inbox,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

import type { Perfil } from "@/lib/sessao";

export interface ItemNav {
  href: string;
  rotulo: string;
  curto?: string;
  icone: LucideIcon;
}

export function menuDo(perfil: Perfil, admin: boolean): { trabalho: ItemNav[]; admin: ItemNav[] } {
  const configuracoes: ItemNav[] = admin
    ? [{ href: "/configuracoes", rotulo: "Configurações", curto: "Ajustes", icone: Settings }]
    : [];

  if (perfil === "prefeito" || perfil === "consulta") {
    return {
      trabalho: [
        { href: "/", rotulo: "Meu governo", curto: "Painel", icone: LayoutDashboard },
        { href: "/pedidos?tipo=OBRA", rotulo: "Obras", icone: HardHat },
        { href: "/pedidos?tipo=AQUISICAO", rotulo: "Aquisições", icone: ShoppingCart },
        { href: "/pedidos?parados=1", rotulo: "Parados", icone: Hourglass },
        { href: "/pedidos", rotulo: "Todos os pedidos", curto: "Pedidos", icone: ClipboardList },
      ],
      admin: configuracoes,
    };
  }
  if (perfil === "departamento") {
    return {
      trabalho: [
        { href: "/", rotulo: "Minha fila", curto: "Fila", icone: Inbox },
        { href: "/pedidos", rotulo: "Tarefas do setor", curto: "Tarefas", icone: Building2 },
      ],
      admin: configuracoes,
    };
  }
  return {
    trabalho: [
      { href: "/", rotulo: "Central de despacho", curto: "Central", icone: Inbox },
      { href: "/pedidos", rotulo: "Pedidos", icone: ClipboardList },
      { href: "/pedidos?parados=1", rotulo: "Parados", icone: Hourglass },
      { href: "/painel", rotulo: "Visão do Prefeito", curto: "Painel", icone: Gauge },
    ],
    admin: configuracoes,
  };
}

/** Ativo quando o caminho e a query batem com o item. */
export function itemAtivo(href: string, caminho: string, busca: string): boolean {
  const [base, query] = href.split("?");
  if (base === "/") return caminho === "/";
  if (!caminho.startsWith(base)) return false;
  if (caminho !== base) return !query; // /pedidos/123 acende "Pedidos"
  const atual = new URLSearchParams(busca);
  const alvo = new URLSearchParams(query || "");
  const chaves = ["tipo", "parados"];
  return chaves.every((c) => (atual.get(c) || "") === (alvo.get(c) || ""));
}

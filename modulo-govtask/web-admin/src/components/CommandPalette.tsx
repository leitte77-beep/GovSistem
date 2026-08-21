"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Search, CornerDownLeft, FileText, CheckSquare, ArrowUpDown, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PERM } from "@/lib/perfil";

type Command = {
  id: string;
  label: string;
  sub?: string;
  href?: string;
  icon?: React.ReactNode;
  keywords?: string;
  /** Permissões que habilitam o comando; ausente = disponível a todos. */
  perms?: string[];
};

const STATIC_COMMANDS: Command[] = [
  { id: "novo-processo", label: "Novo processo", sub: "Criar convênio/processo", href: "/convenios/novo", icon: <FileText className="w-4 h-4" />, keywords: "criar novo convênio processo emenda" , perms: [PERM.CREATE] },
  { id: "mesa", label: "Minha mesa", sub: "Demandas que aguardam você e os departamentos", href: "/mesa", icon: <CheckSquare className="w-4 h-4" />, keywords: "mesa assessor coordenador demandas fluxo", perms: [PERM.TASK_ASSIGN, PERM.EDIT] },
  { id: "minhas-demandas", label: "Minhas demandas", sub: "O que chegou para o meu setor", href: "/minhas-demandas", icon: <CheckSquare className="w-4 h-4" />, keywords: "demandas setor departamento minhas caixa" },
  { id: "pendencias", label: "Minhas pendências", sub: "Hoje, atrasadas, próximos 7 dias", href: "/pendencias", icon: <CheckSquare className="w-4 h-4" />, keywords: "minhas tarefas pendências atrasadas hoje" },
  { id: "atrasados", label: "Tarefas atrasadas", sub: "Quadro de atrasadas", href: "/tarefas?atrasadas=true", icon: <CheckSquare className="w-4 h-4" />, keywords: "atrasadas atraso" },
  { id: "quadro", label: "Quadro de tarefas", sub: "Visão kanban", href: "/tarefas", icon: <CheckSquare className="w-4 h-4" />, keywords: "quadro kanban board tarefas" },
  { id: "coordenador", label: "Painel do coordenador", sub: "Central de coordenação", href: "/coordenador", icon: <ArrowUpDown className="w-4 h-4" />, keywords: "assessor coordenador painel" , perms: [PERM.TASK_ASSIGN, PERM.EDIT] },
  { id: "executivo", label: "Painel executivo", sub: "Visão do gestor", href: "/executivo", icon: <ArrowUpDown className="w-4 h-4" />, keywords: "prefeito presidente gestor executivo" , perms: [PERM.FINANCIAL_VIEW, PERM.FINANCIAL_MANAGE] },
  { id: "setor", label: "Demandas do setor", sub: "Caixa de entrada por departamento", href: "/setor", icon: <ArrowUpDown className="w-4 h-4" />, keywords: "setor departamento demandas" },
  { id: "obras", label: "Obras", sub: "Acompanhar obras", href: "/obras", icon: <FileText className="w-4 h-4" />, keywords: "obra engenharia execução" },
  { id: "prestacoes", label: "Prestações de contas", sub: "Status das prestações", href: "/prestacoes", icon: <FileText className="w-4 h-4" />, keywords: "prestação contas prestacao" , perms: [PERM.ACCOUNTABILITY] },
  { id: "calendario", label: "Calendário", sub: "Prazos e vencimentos", href: "/calendario", icon: <FileText className="w-4 h-4" />, keywords: "calendário prazos vencimentos agenda" },
  { id: "relatorios", label: "Relatórios", sub: "Consolidados", href: "/convenios/relatorios", icon: <FileText className="w-4 h-4" />, keywords: "relatório relatorios dossiê" , perms: [PERM.EXPORT] },
  { id: "alertas", label: "Alertas", sub: "Central de alertas e risco", href: "/alertas", icon: <FileText className="w-4 h-4" />, keywords: "alertas risco" },
  { id: "busca", label: "Busca global", sub: "Pesquisar em tudo", href: "/busca", icon: <Search className="w-4 h-4" />, keywords: "buscar pesquisa procurar" },
  { id: "licitacoes", label: "Licitações & contratos", sub: "Área de contratação", href: "/licitacoes", icon: <FileText className="w-4 h-4" />, keywords: "licitação licitacao contrato edital pregão compras", perms: [PERM.LICITACAO] },
  { id: "processos", label: "Processos", sub: "Lista de processos/convênios", href: "/convenios", icon: <FileText className="w-4 h-4" />, keywords: "processos convênios lista" },
];

export function CommandPalette() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [processos, setProcessos] = useState<{ id: string; titulo: string; tipo?: string }[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery("");
    setSelected(0);
    api.listConvenios({ limit: 50 })
      .then((c) => setProcessos(c.map((x) => ({ id: x.id, titulo: x.titulo, tipo: x.tipo }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openPalette]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else setQuery("");
  }, [open]);

  const q = query.trim().toLowerCase();

  // Só oferece o que o usuário pode de fato executar.
  const comandosDisponiveis = STATIC_COMMANDS.filter(
    (c) => !c.perms || hasPermission(...c.perms)
  );

  const commandResults: Command[] = q
    ? comandosDisponiveis.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          (c.sub || "").toLowerCase().includes(q) ||
          (c.keywords || "").includes(q)
      )
    : comandosDisponiveis;

  const processoResults: Command[] = q
    ? processos
        .filter((p) => p.titulo.toLowerCase().includes(q))
        .slice(0, 6)
        .map((p) => ({
          id: `proc-${p.id}`,
          label: p.titulo,
          sub: p.tipo || "Processo",
          href: `/convenios/${p.id}`,
          icon: <FileText className="w-4 h-4" />,
        }))
    : processos.slice(0, 6).map((p) => ({
        id: `proc-${p.id}`,
        label: p.titulo,
        sub: p.tipo || "Processo",
        href: `/convenios/${p.id}`,
        icon: <FileText className="w-4 h-4" />,
      }));

  const all: Command[] = [...commandResults, ...processoResults];

  useEffect(() => {
    setSelected(0);
  }, [query]);

  const run = (cmd: Command | undefined) => {
    if (!cmd) return;
    setOpen(false);
    if (cmd.href) router.push(cmd.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, all.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(all[selected]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center pt-[12vh] p-4" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-xl bg-surface-card rounded-card shadow-elevated overflow-hidden border border-surface-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-surface-border">
          <Search className="w-4 h-4 text-text-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="O que você quer fazer? (ex: abrir processo Creche, nova tarefa, meus atrasados)"
            className="flex-1 py-4 text-body-sm bg-transparent outline-none text-text-title placeholder:text-text-subtle"
          />
          <button onClick={() => setOpen(false)} className="text-text-subtle hover:text-text-body">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {commandResults.length > 0 && (
            <>
              <p className="text-meta text-text-subtle px-3 pt-2 pb-1 uppercase tracking-wider">Ações</p>
              {commandResults.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => run(c)}
                  onMouseEnter={() => setSelected(i)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-btn text-body-sm transition-colors",
                    selected === i ? "bg-[#1D4ED8]/10 text-[#1D4ED8]" : "text-text-body"
                  )}
                >
                  <span className={cn("shrink-0", selected === i ? "text-[#1D4ED8]" : "text-text-subtle")}>{c.icon}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block font-medium text-text-title truncate">{c.label}</span>
                    {c.sub && <span className="block text-meta text-text-subtle truncate">{c.sub}</span>}
                  </span>
                  {selected === i && <CornerDownLeft className="w-3.5 h-3.5 shrink-0 text-text-subtle" />}
                </button>
              ))}
            </>
          )}

          {processoResults.length > 0 && (
            <>
              <p className="text-meta text-text-subtle px-3 pt-3 pb-1 uppercase tracking-wider">Processos</p>
              {processoResults.map((c, i) => {
                const idx = commandResults.length + i;
                return (
                  <button
                    key={c.id}
                    onClick={() => run(c)}
                    onMouseEnter={() => setSelected(idx)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-btn text-body-sm transition-colors",
                      selected === idx ? "bg-[#1D4ED8]/10 text-[#1D4ED8]" : "text-text-body"
                    )}
                  >
                    <span className={cn("shrink-0", selected === idx ? "text-[#1D4ED8]" : "text-text-subtle")}>{c.icon}</span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block font-medium text-text-title truncate">{c.label}</span>
                      {c.sub && <span className="block text-meta text-text-subtle truncate">{c.sub}</span>}
                    </span>
                    {selected === idx && <CornerDownLeft className="w-3.5 h-3.5 shrink-0 text-text-subtle" />}
                  </button>
                );
              })}
            </>
          )}

          {all.length === 0 && (
            <p className="text-body-sm text-text-subtle text-center py-8">Nenhum resultado para "{query}".</p>
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-surface-border text-meta text-text-subtle">
          <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> selecionar</span>
          <span className="flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> navegar</span>
          <span className="flex items-center gap-1">esc fechar</span>
        </div>
      </div>
    </div>
  );
}

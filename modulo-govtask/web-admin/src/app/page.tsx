"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  formatDate,
  formatCurrency,
  daysUntil,
  relativeTime,
  prazoColor,
  prazoBgColor,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/utils";
import type { ConvenioListItem, TarefaListItem, Notificacao, DashboardData } from "@/types/govtask";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { notify } from "@/components/ui/Toast";
import {
  FileText,
  CheckSquare,
  AlertTriangle,
  Clock,
  ArrowRight,
  TrendingUp,
  Bell,
  Hourglass,
  Send,
  BarChart3,
  Plus,
  ExternalLink,
  Building2,
  Target,
  Activity,
  ClipboardList,
  X,
  Rocket,
  FileStack,
} from "lucide-react";

export default function Dashboard() {
  const { user, hasRole, hasPermission } = useAuth();
  const isAssessor = hasRole("ASSESSOR", "ADMIN");
  const isEngenheiro = hasRole("ENGENHEIRO_TECNICO");
  const isGestor = hasRole("GESTOR") && !isAssessor;

  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("govtask_onboarding_dismissed");
  });
  const [convenios, setConvenios] = useState<ConvenioListItem[]>([]);
  const [tarefas, setTarefas] = useState<TarefaListItem[]>([]);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [c, t, n] = await Promise.all([
          api.listConvenios({ limit: 50 }),
          api.listTarefas(isAssessor ? { limit: 50 } : { minhas: true, limit: 50 }),
          api.listNotificacoes({ nao_lidas: true }),
        ]);
        setConvenios(c);
        setTarefas(t);
        setNotificacoes(n);

        try {
          const dd = await api.getDashboard();
          setDashboardData(dd);
        } catch {}
      } catch (e: any) {
        notify.error("Erro ao carregar dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAssessor]);

  const conveniosAtivos = convenios.filter((c) => c.status === "EM_ANDAMENTO" || c.status === "RASCUNHO");
  const tarefasAbertas = tarefas.filter((t) => t.status !== "CONCLUIDA" && t.status !== "CANCELADA" && t.status !== "ENTREGUE");
  const tarefasAtrasadas = tarefas.filter((t) => t.atrasada);
  const tarefasEntregues = tarefas.filter((t) => t.status === "ENTREGUE");
  const contestaçõesCount = dashboardData?.contestações_pendentes || 0;
  const aguardandoGoverno = dashboardData?.aguardando_governo || 0;
  const valorTotal = conveniosAtivos.reduce((sum, c) => sum + (c.valor || 0), 0);

  const actionItems = (dashboardData?.acoes_necessarias || []).map((a: any) => ({
    tipo: a.tipo,
    item: a.item,
    descricao: a.descricao,
    link: a.link,
    urgency: a.tipo === "contestacao" ? "high" : "medium",
  }));

  const prazosProximos = tarefas
    .filter((t) => {
      if (!t.prazo || t.status === "CONCLUIDA" || t.status === "CANCELADA") return false;
      const dias = daysUntil(t.prazo);
      return dias >= 0 && dias <= 7;
    })
    .sort((a, b) => daysUntil(a.prazo!) - daysUntil(b.prazo!))
    .slice(0, 10);

  const conveniosPorStatus: Record<string, number> = {};
  convenios.forEach((c) => {
    conveniosPorStatus[c.status] = (conveniosPorStatus[c.status] || 0) + 1;
  });

  const minhasTarefasOrdenadas = [...tarefas]
    .sort((a, b) => {
      if (!a.prazo) return 1;
      if (!b.prazo) return -1;
      return new Date(a.prazo).getTime() - new Date(b.prazo).getTime();
    })
    .slice(0, 10);

  const atividadeRecente = dashboardData?.atividade_recente || notificacoes.slice(0, 5);

  const statusOrder = ["EM_ANDAMENTO", "RASCUNHO", "SUSPENSO", "CONCLUIDO", "CANCELADO"];
  const sortedStatuses = statusOrder.filter((s) => conveniosPorStatus[s]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" className="h-10 w-64 mb-2" />
        <Skeleton variant="text" className="h-5 w-96" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="card" className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton variant="card" className="lg:col-span-2 h-80" />
          <Skeleton variant="card" className="h-80" />
        </div>
      </div>
    );
  }

  if (!loading && convenios.length === 0 && tarefas.length === 0) {
    return (
      <div>
        <PageHeader
          title={`Bem-vindo${user?.name ? `, ${user.name}` : ""}`}
          description="GovTask — Gestão de Convênios Governamentais"
        />
        <div className="mt-12">
          <EmptyState
            icon="FolderOpen"
            title="Comece a usar o GovTask"
            description="Nenhum dado encontrado. Crie um convênio ou aguarde tarefas atribuídas a você."
            action={isAssessor ? { label: "Criar Primeiro Convênio", href: "/convenios/novo" } : undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with greeting (visões de engenheiro/gestor) */}
      {!isAssessor && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-h1 text-[#101828] tracking-tight">
              {`Bem-vindo${user?.name ? `, ${user.name}` : ""}`}
            </h1>
            <p className="text-body text-[#475467] mt-1">
              {isEngenheiro ? "Acompanhe suas tarefas técnicas e entregas." :
               "Visão geral dos convênios e status do sistema."}
            </p>
          </div>
          {isAssessor && hasPermission("resource.create") && (
            <div className="flex gap-2">
              <Link href="/convenios/novo" className="btn-primary">
                <Plus className="w-4 h-4" /> Novo Convênio
              </Link>
              <Link href="/tarefas" className="btn-secondary">
                <CheckSquare className="w-4 h-4" /> Minhas Tarefas
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Onboarding do módulo */}
      {onboarding && (
        <div className="relative overflow-hidden rounded-card border border-[#1D4ED8]/20 bg-gradient-to-br from-[#1D4ED8]/5 via-surface-card to-surface-card p-6">
          <button
            onClick={() => {
              setOnboarding(false);
              try { localStorage.setItem("govtask_onboarding_dismissed", "1"); } catch {}
            }}
            className="absolute top-4 right-4 p-1.5 rounded-btn text-text-subtle hover:bg-surface-bg hover:text-text-body transition-colors"
            aria-label="Dispensar onboarding"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#1D4ED8]/10 flex items-center justify-center">
                <Rocket className="w-7 h-7 text-[#1D4ED8]" />
              </div>
              <div>
                <h2 className="text-h2 text-text-title">Centralize seus convênios e emendas</h2>
                <p className="text-body-sm text-text-body mt-1">
                  Acompanhe desde o protocolo inicial até a execução, prestação de contas e entrega — tudo em um único processo digital.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap lg:ml-auto">
              <Link href="/convenios/novo" className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Criar primeiro processo</Link>
              <Link href="/coordenador" className="btn-secondary btn-sm"><FileStack className="w-4 h-4" /> Conhecer o módulo</Link>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ASSESSOR VIEW ==================== */}
      {isAssessor && (
        <>
          {/* Hero */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-primary text-white p-6 sm:p-8">
            <div className="absolute inset-0 soft-blob" />
            <div className="absolute -right-10 -top-16 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-col lg:flex-row lg:items-center gap-6">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">Torre de Controle dos Recursos</p>
                <h1 className="text-h1 font-bold tracking-tight mt-1.5">
                  Olá, {user?.name?.split(" ")[0] || "Assessor"}
                </h1>
                <p className="text-body-sm text-white/85 mt-1 max-w-xl">
                  Acompanhe emendas, convênios, obras e prestações de contas em um único lugar — com prazos, pendências e progresso em tempo real.
                </p>
                <div className="flex flex-wrap gap-2.5 mt-5">
                  <Link href="/convenios/novo" className="inline-flex items-center gap-2 rounded-lg bg-white text-[#1D4ED8] px-4 py-2.5 text-[13px] font-semibold shadow-lg hover:bg-white/90 transition-colors">
                    <Plus className="w-4 h-4" /> Novo Processo
                  </Link>
                  <Link href="/tarefas" className="inline-flex items-center gap-2 rounded-lg bg-white/15 text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-white/25 transition-colors backdrop-blur">
                    <CheckSquare className="w-4 h-4" /> Minhas Tarefas
                  </Link>
                  <Link href="/convenios/relatorios" className="inline-flex items-center gap-2 rounded-lg bg-white/15 text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-white/25 transition-colors backdrop-blur">
                    <BarChart3 className="w-4 h-4" /> Relatórios
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:w-[300px] shrink-0">
                <div className="rounded-xl bg-white/10 backdrop-blur border border-white/15 p-4">
                  <p className="text-[11px] font-medium text-white/75">Valor aprovado</p>
                  <p className="text-h2 font-bold tabular-nums mt-0.5">{formatCurrency(dashboardData?.valor_aprovado ?? valorTotal)}</p>
                </div>
                <div className="rounded-xl bg-white/10 backdrop-blur border border-white/15 p-4">
                  <p className="text-[11px] font-medium text-white/75">Executado</p>
                  <p className="text-h2 font-bold tabular-nums mt-0.5">{formatCurrency(dashboardData?.valor_executado ?? 0)}</p>
                </div>
                <div className="rounded-xl bg-white/10 backdrop-blur border border-white/15 p-4">
                  <p className="text-[11px] font-medium text-white/75">Em diligência</p>
                  <p className="text-h2 font-bold tabular-nums mt-0.5">{dashboardData?.diligencias_abertas ?? 0}</p>
                </div>
                <div className="rounded-xl bg-white/10 backdrop-blur border border-white/15 p-4">
                  <p className="text-[11px] font-medium text-white/75">Atrasadas</p>
                  <p className="text-h2 font-bold tabular-nums mt-0.5">{tarefasAtrasadas.length}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Metric cards — KPIs da gestão de recursos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
            {[
              { label: "Processos ativos", value: conveniosAtivos.length, icon: "FileText", color: "#1D4ED8", href: "/convenios" },
              { label: "Valor aprovado", value: formatCurrency(dashboardData?.valor_aprovado ?? valorTotal), icon: "Target", color: "#1D4ED8", href: "/convenios/relatorios" },
              { label: "Valor executado", value: formatCurrency(dashboardData?.valor_executado ?? 0), icon: "TrendingUp", color: "#067647", href: "/convenios/relatorios" },
              { label: "Em diligência", value: dashboardData?.diligencias_abertas ?? 0, icon: "AlertTriangle", color: (dashboardData?.diligencias_abertas ?? 0) > 0 ? "#B42318" : "#667085" },
              { label: "Tarefas atrasadas", value: tarefasAtrasadas.length, icon: "AlertTriangle", color: tarefasAtrasadas.length > 0 ? "#B42318" : "#667085", href: "/tarefas?atrasadas=true" },
              { label: "Obras em andamento", value: dashboardData?.obras_em_andamento ?? 0, icon: "Building2", color: (dashboardData?.obras_em_andamento ?? 0) > 0 ? "#B54708" : "#667085", href: "/convenios" },
              { label: "Prazos próximos", value: prazosProximos.length, icon: "Clock", color: "#B54708", href: "/tarefas" },
              { label: "Valor pago", value: formatCurrency(dashboardData?.valor_executado ?? 0), icon: "CheckSquare", color: "#067647", href: "/convenios/relatorios" },
            ].map((k, i) => (
              <MetricCard key={i} label={k.label} value={k.value as any} icon={k.icon as any} color={k.color} href={k.href as any} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left column - 8 cols */}
            <div className="lg:col-span-8 space-y-6">
              {/* Processos recentes — cards */}
              <Card padding="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-[#101828] flex items-center gap-2 text-lg">
                    <Building2 className="w-5 h-5 text-[#1D4ED8]" />
                    Processos recentes
                  </h2>
                  <Link href="/convenios" className="text-body-sm text-[#1D4ED8] hover:underline font-medium flex items-center gap-1">
                    Ver todos <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                {conveniosAtivos.length === 0 ? (
                  <p className="text-body-sm text-[#98A2B3] py-6 text-center">Nenhum processo ativo</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {conveniosAtivos.slice(0, 6).map((c) => (
                      <Link
                        key={c.id}
                        href={`/convenios/${c.id}`}
                        className="bg-surface-card border border-[#E4E7EC] rounded-card p-4 hover:shadow-card hover:border-[#1D4ED8]/30 transition-all group flex flex-col"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-semibold uppercase tracking-wide text-[#98A2B3]">{c.numero_emenda || c.numero_protocolo_governo || "—"}</span>
                        </div>
                        <h3 className="text-body-sm font-semibold text-[#101828] mt-1.5 leading-snug group-hover:text-[#1D4ED8] transition-colors line-clamp-2">{c.titulo}</h3>
                        <div className="flex items-center gap-2 mt-2">
                          <StatusPill status={c.status} />
                          {c.prioridade && <PriorityBadge priority={c.prioridade} />}
                        </div>
                        <p className="text-h2 text-[#101828] tabular-nums mt-3">{formatCurrency(c.valor)}</p>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-3">
                            <span className="text-meta text-[#667085] w-14 shrink-0">Físico</span>
                            <div className="h-2 bg-[#F6F7F9] rounded-pill overflow-hidden flex-1">
                              <div className="h-full bg-[#1D4ED8]" style={{ width: `${Number(c.percentual_fisico ?? 0)}%` }} />
                            </div>
                            <span className="text-meta text-[#101828] tabular-nums w-10 text-right">{Number(c.percentual_fisico ?? 0)}%</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-meta text-[#667085] w-14 shrink-0">Financeiro</span>
                            <div className="h-2 bg-[#F6F7F9] rounded-pill overflow-hidden flex-1">
                              <div className="h-full bg-[#067647]" style={{ width: `${Number(c.percentual_financeiro ?? 0)}%` }} />
                            </div>
                            <span className="text-meta text-[#101828] tabular-nums w-10 text-right">{Number(c.percentual_financeiro ?? 0)}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-3 text-meta text-[#667085]">
                          <Clock className="w-3.5 h-3.5" />
                          {c.proximo_prazo ? formatDate(c.proximo_prazo) : "Sem prazo"}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              {/* Ação necessária */}
              {actionItems.length > 0 && (
                <Card padding="p-6">
                  <h2 className="font-semibold text-[#101828] mb-4 flex items-center gap-2 text-lg">
                    <Activity className="w-5 h-5 text-[#B54708]" />
                    Ação Necessária
                  </h2>
                  <div className="space-y-2">
                    {actionItems.map((item: any, idx: number) => (
                      <Link
                        key={idx}
                        href={item.link}
                        className="flex items-center gap-4 p-4 rounded-card border border-[#E4E7EC] hover:bg-[#F6F7F9] hover:border-[#1D4ED8]/30 transition-all group"
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          item.urgency === "high" ? "bg-[#FEE4E2] text-[#B42318]" : "bg-[#FEF0C7] text-[#B54708]"
                        }`}>
                          {item.urgency === "high" ? <AlertTriangle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-body-sm font-semibold text-[#101828]">{item.item}</p>
                          <p className="text-meta text-[#667085]">{item.descricao}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#98A2B3] group-hover:text-[#1D4ED8] group-hover:translate-x-0.5 transition-all shrink-0" />
                      </Link>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Right column - 4 cols */}
            <div className="lg:col-span-4 space-y-6">
              {/* Prazos próximos */}
              <Card padding="p-6">
                <h2 className="font-semibold text-[#101828] mb-4 flex items-center gap-2 text-lg">
                  <Clock className="w-5 h-5 text-[#B54708]" />
                  Prazos Próximos
                </h2>
                {prazosProximos.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckSquare className="w-10 h-10 text-[#98A2B3] mx-auto mb-3" />
                    <p className="text-body-sm text-[#98A2B3]">Nenhum prazo nos próximos 7 dias</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {prazosProximos.map((t) => {
                      const dias = daysUntil(t.prazo!);
                      return (
                        <Link
                          key={t.id}
                          href={`/tarefas/${t.id}`}
                          className="flex items-center justify-between p-3 rounded-btn hover:bg-[#F6F7F9] transition-colors group"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-body-sm font-medium text-[#101828] truncate">{t.titulo}</p>
                            <p className="text-meta text-[#98A2B3]">{formatDate(t.prazo)}</p>
                          </div>
                          <span className={`text-meta font-semibold px-2.5 py-1 rounded-pill ${prazoBgColor(dias)}`}>
                            {dias <= 0 ? "Hoje" : `${dias}d`}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Convênios por Status */}
              {sortedStatuses.length > 0 && (
                <Card padding="p-6">
                  <h2 className="font-semibold text-[#101828] mb-4 flex items-center gap-2 text-lg">
                    <BarChart3 className="w-5 h-5 text-[#1D4ED8]" />
                    Por Status
                  </h2>
                  <div className="space-y-4">
                    {sortedStatuses.map((status) => {
                      const count = conveniosPorStatus[status];
                      const pct = Math.round((count / convenios.length) * 100);
                      return (
                        <div key={status}>
                          <div className="flex items-center justify-between mb-1.5">
                            <StatusPill status={status} />
                            <span className="text-body-sm font-semibold text-[#101828] tabular-nums">{count}</span>
                          </div>
                          <div className="h-2 bg-[#F6F7F9] rounded-full overflow-hidden">
                            <div className="h-full bg-[#1D4ED8] rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Atividade recente */}
              {Array.isArray(atividadeRecente) && atividadeRecente.length > 0 && (
                <Card padding="p-6">
                  <h2 className="font-semibold text-[#101828] mb-4 flex items-center gap-2 text-lg">
                    <TrendingUp className="w-5 h-5 text-[#667085]" />
                    Atividade
                  </h2>
                  <div className="relative pl-5 border-l-2 border-[#E4E7EC] space-y-4">
                    {atividadeRecente.slice(0, 6).map((item: any, idx: number) => (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[25px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#1D4ED8] border-2 border-white" />
                        <p className="text-body-sm text-[#475467] leading-snug">{item.descricao || item.mensagem}</p>
                        <p className="text-meta text-[#98A2B3] mt-0.5">{relativeTime(item.time || item.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* ==================== ENGENHEIRO VIEW ==================== */}
      {isEngenheiro && !isAssessor && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard label="Em aberto" value={tarefasAbertas.length} icon="CheckSquare" color="#1D4ED8" href="/tarefas" />
            <MetricCard label="Atrasadas" value={tarefasAtrasadas.length} icon="AlertTriangle" color={tarefasAtrasadas.length > 0 ? "#B42318" : "#667085"} />
            <MetricCard label="Entregues" value={tarefasEntregues.length} icon="Send" color="#067647" />
          </div>

          <Card padding="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#101828] flex items-center gap-2 text-lg">
                <Clock className="w-5 h-5 text-[#667085]" />
                Minhas Tarefas por Prazo
              </h2>
              <Link href="/tarefas" className="text-body-sm text-[#1D4ED8] hover:underline font-medium flex items-center gap-1">
                Ver todas <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            {minhasTarefasOrdenadas.length === 0 ? (
              <div className="text-center py-12">
                <CheckSquare className="w-12 h-12 text-[#98A2B3] mx-auto mb-3" />
                <p className="text-body text-[#98A2B3]">Nenhuma tarefa atribuída a você</p>
                <p className="text-meta text-[#98A2B3] mt-1">Quando receber tarefas, elas aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-2">
                {minhasTarefasOrdenadas.map((t) => {
                  const dias = t.prazo ? daysUntil(t.prazo) : 999;
                  return (
                    <Link
                      key={t.id}
                      href={`/tarefas/${t.id}`}
                      className="flex items-center justify-between p-4 rounded-card border border-[#E4E7EC] hover:bg-[#F6F7F9] transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium text-[#101828] truncate">{t.titulo}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <StatusPill status={t.status} />
                          <PriorityBadge priority={t.prioridade || "NORMAL"} />
                          {t.prazo && (
                            <span className={`text-meta font-medium ${prazoColor(dias)}`}>
                              {t.atrasada ? "Atrasada" : `${dias}d`}
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#98A2B3] group-hover:text-[#1D4ED8] shrink-0 ml-3" />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ==================== GESTOR VIEW ==================== */}
      {isGestor && !isAssessor && !isEngenheiro && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Convênios ativos" value={conveniosAtivos.length} icon="FileText" color="#1D4ED8" href="/convenios" />
            <MetricCard label="Concluídos" value={convenios.filter((c) => c.status === "CONCLUIDO").length} icon="CheckSquare" color="#067647" />
            <MetricCard label="Atrasos" value={tarefasAtrasadas.length} icon="AlertTriangle" color={tarefasAtrasadas.length > 0 ? "#B42318" : "#667085"} />
            <MetricCard label="Valor Total" value={formatCurrency(valorTotal)} icon="Target" color="#067647" />
          </div>

          {convenios.length > 0 && (
            <>
              <Card padding="p-6">
                <h2 className="font-semibold text-[#101828] mb-4 text-lg">Convênios por Status</h2>
                <div className="space-y-4">
                  {sortedStatuses.map((status) => {
                    const count = conveniosPorStatus[status];
                    const pct = Math.round((count / convenios.length) * 100);
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1.5">
                          <StatusPill status={status} />
                          <span className="text-body-sm font-semibold text-[#101828] tabular-nums">{count}</span>
                        </div>
                        <div className="h-2 bg-[#F6F7F9] rounded-full overflow-hidden">
                          <div className="h-full bg-[#1D4ED8] rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {convenios.slice(0, 8).map((c) => (
                  <Link
                    key={c.id}
                    href={`/convenios/${c.id}`}
                    className="block bg-white border border-[#E4E7EC] rounded-card p-5 hover:shadow-elevated transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-body-sm font-semibold text-[#101828] truncate group-hover:text-[#1D4ED8] transition-colors">{c.titulo}</p>
                        <div className="flex items-center gap-2 mt-2 text-meta text-[#667085]">
                          <span className="font-mono">{c.numero_protocolo_governo || "—"}</span>
                          <span>·</span>
                          <span>{formatDate(c.created_at)}</span>
                        </div>
                      </div>
                      <StatusPill status={c.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

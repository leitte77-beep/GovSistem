"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PERM } from "@/lib/perfil";
import {
  formatCurrency,
  formatDate,
  formatDayTime,
  daysUntil,
  prazoBgColor,
  prazoColor,
} from "@/lib/utils";
import type { ConvenioListItem, TarefaListItem, Notificacao, DashboardData } from "@/types/govtask";
import { StatCard } from "@/components/ui/StatCard";
import { ProcessCard } from "@/components/ui/ProcessCard";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { notify } from "@/components/ui/Toast";
import { ArrowRight, CheckSquare, Clock, Plus } from "lucide-react";

export default function Dashboard() {
  const { user, hasPermission } = useAuth();
  // O painel segue as permissões do usuário, não o nome da sua role.
  const isAssessor = hasPermission(PERM.TASK_ASSIGN, PERM.EDIT);
  const isEngenheiro = hasPermission(PERM.ENGINEERING) && !isAssessor;
  const isGestor = hasPermission(PERM.FINANCIAL_VIEW, PERM.FINANCIAL_MANAGE) && !isAssessor;

  const [loading, setLoading] = useState(true);
  const [convenios, setConvenios] = useState<ConvenioListItem[]>([]);
  const [tarefas, setTarefas] = useState<TarefaListItem[]>([]);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set());

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
        try {
          const favs = await api.listFavoritos();
          setFavoritos(new Set(favs.map((f) => f.id)));
        } catch {}
      } catch {
        notify.error("Erro ao carregar dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAssessor]);

  const toggleFavorito = useCallback(async (id: string, favorito: boolean) => {
    setFavoritos((prev) => {
      const next = new Set(prev);
      if (favorito) next.add(id);
      else next.delete(id);
      return next;
    });
    try {
      if (favorito) await api.favoritar(id);
      else await api.desfavoritar(id);
    } catch (e: any) {
      notify.error(e.message || "Não foi possível atualizar o favorito");
    }
  }, []);

  const conveniosAtivos = convenios.filter(
    (c) => c.status === "EM_ANDAMENTO" || c.status === "RASCUNHO"
  );
  const tarefasAbertas = tarefas.filter(
    (t) => t.status !== "CONCLUIDA" && t.status !== "CANCELADA" && t.status !== "ENTREGUE"
  );
  const tarefasAtrasadas = tarefas.filter((t) => t.atrasada);
  const tarefasEntregues = tarefas.filter((t) => t.status === "ENTREGUE");
  const valorTotal = conveniosAtivos.reduce((sum, c) => sum + (c.valor || 0), 0);

  // "Prazos próximos (15d)" — mesmo recorte do indicador exibido no cartão.
  const prazosProximos = tarefas
    .filter((t) => {
      if (!t.prazo || t.status === "CONCLUIDA" || t.status === "CANCELADA") return false;
      const dias = daysUntil(t.prazo);
      return dias >= 0 && dias <= 15;
    })
    .sort((a, b) => daysUntil(a.prazo!) - daysUntil(b.prazo!));

  const atividadeRecente: { descricao: string; autor?: string; time: string }[] =
    dashboardData?.atividade_recente?.length
      ? dashboardData.atividade_recente.map((a: any) => ({
          descricao: a.descricao,
          autor: a.ator || a.autor,
          time: a.time,
        }))
      : notificacoes.slice(0, 12).map((n) => ({ descricao: n.mensagem, time: n.created_at }));

  const minhasTarefasOrdenadas = [...tarefas]
    .sort((a, b) => {
      if (!a.prazo) return 1;
      if (!b.prazo) return -1;
      return new Date(a.prazo).getTime() - new Date(b.prazo).getTime();
    })
    .slice(0, 10);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" className="h-10 w-72 mb-2" />
        <Skeleton variant="text" className="h-5 w-96" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton variant="card" className="lg:col-span-8 h-80" />
          <Skeleton variant="card" className="lg:col-span-4 h-80" />
        </div>
      </div>
    );
  }

  if (convenios.length === 0 && tarefas.length === 0) {
    return (
      <div>
        <Header isAssessor={isAssessor} />
        <div className="mt-12">
          <EmptyState
            icon="FolderOpen"
            title="Comece a usar o GovTask"
            description="Nenhum dado encontrado. Crie um processo ou aguarde tarefas atribuídas a você."
            action={isAssessor ? { label: "Novo Processo", href: "/convenios/novo" } : undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <Header isAssessor={isAssessor} nome={user?.name} />

      {/* ==================== VISÃO ASSESSOR / ADMIN ==================== */}
      {isAssessor && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon="FileText"
              color="#2E90FA"
              value={conveniosAtivos.length}
              label="Processos ativos"
              href="/convenios"
            />
            <StatCard
              icon="DollarSign"
              color="#2E90FA"
              value={formatCurrency(dashboardData?.valor_aprovado ?? valorTotal)}
              label="Valor aprovado"
              href="/convenios/relatorios"
            />
            <StatCard
              icon="TrendingUp"
              color="#12B76A"
              value={formatCurrency(dashboardData?.valor_executado ?? 0)}
              label="Valor executado"
              href="/convenios/relatorios"
            />
            <StatCard
              icon="AlertTriangle"
              color="#F79009"
              value={dashboardData?.diligencias_abertas ?? 0}
              label="Em diligência"
            />
            <StatCard
              icon="Clock"
              color="#F04438"
              value={tarefasAtrasadas.length}
              label="Tarefas atrasadas"
              href="/tarefas?atrasadas=true"
            />
            <StatCard
              icon="Building2"
              color="#12B76A"
              value={dashboardData?.obras_em_andamento ?? 0}
              label="Obras em andamento"
              href="/obras"
            />
            <StatCard
              icon="Activity"
              color="#7A5AF8"
              value={prazosProximos.length}
              label="Prazos próximos (15d)"
              href="/tarefas"
            />
            <StatCard
              icon="DollarSign"
              color="#7A5AF8"
              value={formatCurrency(dashboardData?.valor_pago ?? 0)}
              label="Valor pago"
              href="/convenios/relatorios"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Processos recentes */}
            <div className="lg:col-span-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[17px] font-semibold text-[#101828]">Processos recentes</h2>
                <Link
                  href="/convenios"
                  className="text-[13px] text-[#1D4ED8] hover:underline font-medium flex items-center gap-1"
                >
                  Ver todos <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {conveniosAtivos.length === 0 ? (
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-8 text-center text-[13px] text-[#98A2B3]">
                  Nenhum processo ativo
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {conveniosAtivos.slice(0, 6).map((c) => (
                    <ProcessCard
                      key={c.id}
                      c={c}
                      favorito={favoritos.has(c.id)}
                      onToggleFavorito={toggleFavorito}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Atividade recente */}
            <div className="lg:col-span-4">
              <h2 className="text-[17px] font-semibold text-[#101828] mb-4">Atividade recente</h2>
              <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                {atividadeRecente.length === 0 ? (
                  <p className="text-[13px] text-[#98A2B3] text-center py-4">Nenhuma atividade registrada</p>
                ) : (
                  <ul className="space-y-4">
                    {atividadeRecente.slice(0, 12).map((item, idx) => (
                      <li key={idx} className="flex gap-3">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#2E90FA] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] text-[#101828] leading-snug">{item.descricao}</p>
                          <p className="text-[12px] text-[#98A2B3] mt-0.5">
                            {item.autor ? `${item.autor} · ` : ""}
                            {formatDayTime(item.time)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== VISÃO ENGENHEIRO ==================== */}
      {isEngenheiro && !isAssessor && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon="CheckSquare" color="#2E90FA" value={tarefasAbertas.length} label="Em aberto" href="/tarefas" />
            <StatCard icon="AlertTriangle" color="#F04438" value={tarefasAtrasadas.length} label="Atrasadas" />
            <StatCard icon="Send" color="#12B76A" value={tarefasEntregues.length} label="Entregues" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-semibold text-[#101828]">Minhas tarefas por prazo</h2>
              <Link href="/tarefas" className="text-[13px] text-[#1D4ED8] hover:underline font-medium flex items-center gap-1">
                Ver todas <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <Card padding="p-5">
              {minhasTarefasOrdenadas.length === 0 ? (
                <div className="text-center py-10">
                  <CheckSquare className="w-10 h-10 text-[#D0D5DD] mx-auto mb-3" />
                  <p className="text-[13px] text-[#98A2B3]">Nenhuma tarefa atribuída a você</p>
                </div>
              ) : (
                <div className="divide-y divide-[#F2F4F7]">
                  {minhasTarefasOrdenadas.map((t) => {
                    const dias = t.prazo ? daysUntil(t.prazo) : 999;
                    return (
                      <Link key={t.id} href={`/tarefas/${t.id}`} className="flex items-center justify-between py-3 group">
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-medium text-[#101828] truncate group-hover:text-[#1D4ED8] transition-colors">
                            {t.titulo}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <StatusPill status={t.status} />
                            <PriorityBadge priority={t.prioridade || "NORMAL"} />
                            {t.prazo && (
                              <span className={`text-[12px] font-medium ${prazoColor(dias)}`}>
                                {t.atrasada ? "Atrasada" : `${dias}d`}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[12px] text-[#667085] tabular-nums shrink-0 ml-3">
                          {t.prazo ? formatDate(t.prazo) : "—"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* ==================== VISÃO GESTOR ==================== */}
      {isGestor && !isEngenheiro && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon="FileText" color="#2E90FA" value={conveniosAtivos.length} label="Processos ativos" href="/convenios" />
            <StatCard icon="CheckSquare" color="#12B76A" value={convenios.filter((c) => c.status === "CONCLUIDO").length} label="Concluídos" />
            <StatCard icon="AlertTriangle" color="#F04438" value={tarefasAtrasadas.length} label="Tarefas atrasadas" />
            <StatCard icon="DollarSign" color="#2E90FA" value={formatCurrency(valorTotal)} label="Valor aprovado" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-semibold text-[#101828]">Processos recentes</h2>
              <Link href="/convenios" className="text-[13px] text-[#1D4ED8] hover:underline font-medium flex items-center gap-1">
                Ver todos <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {convenios.slice(0, 6).map((c) => (
                <ProcessCard key={c.id} c={c} favorito={favoritos.has(c.id)} onToggleFavorito={toggleFavorito} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Prazos próximos — visível para todos os perfis quando houver */}
      {!isAssessor && prazosProximos.length > 0 && (
        <div>
          <h2 className="text-[17px] font-semibold text-[#101828] mb-4">Prazos próximos</h2>
          <Card padding="p-5">
            <div className="divide-y divide-[#F2F4F7]">
              {prazosProximos.slice(0, 10).map((t) => {
                const dias = daysUntil(t.prazo!);
                return (
                  <Link key={t.id} href={`/tarefas/${t.id}`} className="flex items-center justify-between py-3 group">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-[#101828] truncate group-hover:text-[#1D4ED8] transition-colors">
                        {t.titulo}
                      </p>
                      <p className="text-[12px] text-[#98A2B3] mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatDate(t.prazo)}
                      </p>
                    </div>
                    <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-pill ${prazoBgColor(dias)}`}>
                      {dias <= 0 ? "Hoje" : `${dias}d`}
                    </span>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Header({ isAssessor, nome }: { isAssessor: boolean; nome?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[30px] leading-[38px] font-bold text-[#101828] tracking-tight">
          Gestão de Recursos
        </h1>
        <p className="text-[14px] text-[#667085] mt-1">
          Acompanhe emendas, convênios, obras, aquisições e prestações de contas em um único lugar.
        </p>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <Link
          href="/convenios"
          className="inline-flex items-center gap-2 rounded-lg bg-white border border-[#E4E7EC] text-[#344054] px-4 py-2.5 text-[13px] font-medium hover:bg-[#F9FAFB] transition-colors"
        >
          Ver processos
        </Link>
        {isAssessor && (
          <Link
            href="/convenios/novo"
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Processo
          </Link>
        )}
      </div>
    </div>
  );
}

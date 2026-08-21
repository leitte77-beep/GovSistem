"use client";
import { RequirePermission } from "@/components/RequirePermission";
import { PERM } from "@/lib/perfil";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, formatDate, SITUACAO_PROCESSO_LABELS, CATEGORIA_RECURSO_LABELS, cn } from "@/lib/utils";
import type { ConvenioListItem } from "@/types/govtask";
import { Target, TrendingUp, Building2, CheckCircle2, ArrowRight, Landmark, Wallet, Activity } from "lucide-react";

type ObraExec = {
  id: string; convenio_id: string; convenio_titulo: string | null; nome: string; empresa: string;
  percentual_fisico: number | null; percentual_financeiro: number | null;
  previsao_conclusao: string | null; valor_contrato: number | null; situacao: string;
};

function ExecutivoConteudo() {
  const [loading, setLoading] = useState(true);
  const [resumo, setResumo] = useState<any>(null);
  const [obras, setObras] = useState<ObraExec[]>([]);
  const [convenios, setConvenios] = useState<ConvenioListItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, o, c] = await Promise.all([
        api.relatorioResumo(),
        api.relatorioObras(),
        api.listConvenios({ limit: 100 }),
      ]);
      setResumo(r);
      setObras(o.obras);
      setConvenios(c);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const emExecucao = convenios.filter((c) => c.status === "EM_ANDAMENTO");
  const concluidos = convenios.filter((c) => c.status === "CONCLUIDO");

  const Progress = ({ pct, color }: { pct: number | null; color: string }) => {
    const v = Math.min(100, Math.max(0, pct ?? 0));
    return (
      <div className="h-2.5 bg-[#F6F7F9] rounded-pill overflow-hidden flex-1">
        <div className={cn("h-full rounded-pill transition-all duration-700", color)} style={{ width: `${v}%` }} />
      </div>
    );
  };

  const metric = (label: string, value: string, sub: string, icon: React.ReactNode, color: string) => (
    <div className="group relative bg-surface-card border border-surface-border rounded-card p-5 overflow-hidden card-hover-lift">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundImage: `linear-gradient(90deg, ${color}, ${color}55)` }} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-meta text-text-subtle font-medium">{label}</p>
          <p className="text-h1 text-text-title tabular-nums mt-1">{value}</p>
          <p className="text-meta text-text-subtle mt-0.5">{sub}</p>
        </div>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-105" style={{ background: `linear-gradient(135deg, ${color}26, ${color}0d)` }}>
          {icon}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel Executivo"
        description="Visão consolidada de captação, execução e entrega dos recursos públicos."
        breadcrumbs={[{ label: "Painel Executivo" }]}
      />

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="card" className="h-28" />)}
          </div>
          <Skeleton variant="card" className="h-64" />
        </div>
      ) : (
        <>
          {/* Hero executivo */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-primary text-white p-6 sm:p-8">
            <div className="absolute inset-0 soft-blob" />
            <div className="absolute -right-12 -bottom-16 w-72 h-72 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">Visão Executiva</p>
                <h1 className="text-h1 font-bold tracking-tight mt-1.5">Recursos Públicos</h1>
                <p className="text-body-sm text-white/85 mt-1 max-w-xl">
                  Captação, execução e entrega de emendas, convênios e obras — em uma visão consolidada para a gestão.
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="text-[11px] font-medium text-white/75">Aprovação global</p>
                  <p className="text-h2 font-bold tabular-nums">{Math.round(((resumo?.total_executado ?? 0) / (resumo?.total_aprovado || 1)) * 100)}%</p>
                </div>
                <div className="h-10 w-px bg-white/20" />
                <div className="text-right">
                  <p className="text-[11px] font-medium text-white/75">Processos ativos</p>
                  <p className="text-h2 font-bold tabular-nums">{resumo?.em_andamento ?? 0}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Cards executivos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metric("Valor aprovado", formatCurrency(resumo?.total_aprovado ?? 0), "Total captado/empenhado", <Target className="w-5 h-5 text-[#1D4ED8]" />, "#1D4ED8")}
            {metric("Recursos captados", formatCurrency(resumo?.total_captado ?? 0), "Repasses recebidos", <Wallet className="w-5 h-5 text-[#067647]" />, "#067647")}
            {metric("Em execução", String(resumo?.em_andamento ?? 0), `${emExecucao.length} processos ativos`, <Activity className="w-5 h-5 text-[#B54708]" />, "#B54708")}
            {metric("Concluídos", String(resumo?.concluidos ?? 0), `${concluidos.length} processos entregues`, <CheckCircle2 className="w-5 h-5 text-[#067647]" />, "#067647")}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Obras / principais projetos */}
            <div className="lg:col-span-8 space-y-6">
              <Card padding="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Building2 className="w-5 h-5 text-[#1D4ED8]" />
                  <h3 className="text-h3 text-text-title">Principais Projetos e Obras</h3>
                </div>
                {obras.length === 0 ? (
                  <p className="text-body-sm text-text-subtle py-6 text-center">Nenhuma obra cadastrada.</p>
                ) : (
                  <div className="space-y-5">
                    {obras.map((o) => {
                      const atrasada = o.previsao_conclusao && new Date(o.previsao_conclusao) < new Date() && (o.percentual_fisico ?? 0) < 100;
                      return (
                        <Link key={o.id} href={o.convenio_id ? `/convenios/${o.convenio_id}` : "#"} className="block p-4 rounded-card border border-surface-border hover:shadow-card transition-all">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                            <div className="min-w-0">
                              <p className="text-body font-semibold text-text-title">{o.nome || "Obra"}</p>
                              {o.convenio_titulo && <p className="text-meta text-text-subtle">{o.convenio_titulo}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              <span className="text-h2 text-text-title tabular-nums">{formatCurrency(o.valor_contrato)}</span>
                              {atrasada ? <Badge label="Atrasada" color="bg-[#B42318]/10 text-[#B42318]" /> : <Badge label={o.situacao?.replace("_", " ") || "Em andamento"} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />}
                            </div>
                          </div>

                          <div className="space-y-2.5">
                            <div className="flex items-center gap-3">
                              <span className="text-meta text-text-subtle w-24 shrink-0">Físico</span>
                              <Progress pct={o.percentual_fisico} color="bg-[#1D4ED8]" />
                              <span className="text-meta text-text-title tabular-nums w-10 text-right">{o.percentual_fisico ?? 0}%</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-meta text-text-subtle w-24 shrink-0">Financeiro</span>
                              <Progress pct={o.percentual_financeiro} color="bg-[#067647]" />
                              <span className="text-meta text-text-title tabular-nums w-10 text-right">{o.percentual_financeiro ?? 0}%</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-border">
                            <span className="text-meta text-text-subtle">
                              Previsão: {o.previsao_conclusao ? formatDate(o.previsao_conclusao) : "—"}
                            </span>
                            {o.empresa && <span className="text-meta text-text-subtle truncate">{o.empresa}</span>}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* Coluna direita */}
            <div className="lg:col-span-4 space-y-6">
              <Card padding="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Landmark className="w-5 h-5 text-[#1D4ED8]" />
                  <h3 className="text-h3 text-text-title">Processos em Execução</h3>
                </div>
                {emExecucao.length === 0 ? (
                  <p className="text-body-sm text-text-subtle">Nenhum processo em execução.</p>
                ) : (
                  <div className="space-y-2">
                    {emExecucao.slice(0, 8).map((c) => (
                      <Link key={c.id} href={`/convenios/${c.id}`} className="flex items-center justify-between gap-2 p-2.5 rounded-btn hover:bg-[#F6F7F9] transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-body-sm font-medium text-text-title truncate">{c.titulo}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {c.categoria && <Badge label={CATEGORIA_RECURSO_LABELS[c.categoria] || c.categoria} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />}
                            <span className="text-meta text-text-subtle tabular-nums">{formatCurrency(c.valor)}</span>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-text-subtle shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              <Card padding="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-[#067647]" />
                  <h3 className="text-h3 text-text-title">Situação dos Recursos</h3>
                </div>
                {convenios.length === 0 ? (
                  <p className="text-body-sm text-text-subtle">Sem dados.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(
                      convenios.reduce<Record<string, number>>((acc, c) => {
                        const key = c.situacao || "SEM_SITUACAO";
                        acc[key] = (acc[key] || 0) + (c.valor || 0);
                        return acc;
                      }, {})
                    )
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([situacao, valor]) => (
                        <div key={situacao}>
                          <div className="flex items-center justify-between text-body-sm mb-1">
                            <span className="text-text-title">{SITUACAO_PROCESSO_LABELS[situacao] || situacao}</span>
                            <span className="tabular-nums text-text-body">{formatCurrency(valor)}</span>
                          </div>
                          <div className="h-2 bg-[#F6F7F9] rounded-pill overflow-hidden">
                            <div className="h-full bg-[#1D4ED8] transition-all duration-700" style={{ width: `${(valor / (resumo?.total_aprovado || 1)) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <RequirePermission anyOf={[PERM.FINANCIAL_VIEW, PERM.FINANCIAL_MANAGE]}>
      <ExecutivoConteudo />
    </RequirePermission>
  );
}

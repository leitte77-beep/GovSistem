"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, CATEGORIA_RECURSO_LABELS, ESFERA_LABELS, STATUS_PRESTACAO_LABELS, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import { Download, FileText, TrendingUp } from "lucide-react";

type Resumo = {
  total_processos: number; total_aprovado: number; total_captado: number;
  em_andamento: number; concluidos: number; em_diligencia: number; rascunho: number;
  por_categoria: Record<string, number>; por_esfera: Record<string, number>;
};

type ObrasR = { total_obras: number; em_andamento: number; concluidas: number; atrasadas: number; obras: { id: string; nome: string; empresa: string; percentual_fisico: number | null; percentual_financeiro: number | null; previsao_conclusao: string | null; valor_contrato: number | null; situacao: string }[] };

type PrestacoesR = { total_prestacoes: number; pendentes: number; aprovadas: number; prestacoes: { id: string; titulo: string; status: string; protocolo: string }[] };

export default function RelatoriosPage() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [obras, setObras] = useState<ObrasR | null>(null);
  const [prestacoes, setPrestacoes] = useState<PrestacoesR | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerandoDossie, setGerandoDossie] = useState<string>("");
  const [processos, setProcessos] = useState<{ id: string; titulo: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [r, o, p, conv] = await Promise.all([
          api.relatorioResumo(),
          api.relatorioObras(),
          api.relatorioPrestacoes(),
          api.listConvenios({ limit: 100 }),
        ]);
        setResumo(r); setObras(o); setPrestacoes(p);
        setProcessos(conv.map((c) => ({ id: c.id, titulo: c.titulo })));
      } catch (e: any) {
        notify.error(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const exportarCSV = async () => {
    try {
      const res = await fetch("/api/govtask/relatorios/exportar/processos.csv", {
        headers: { Authorization: `Bearer ${localStorage.getItem("govtask_access_token")}` },
      });
      if (!res.ok) throw new Error("Falha na exportação");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "processos.csv"; a.click();
      URL.revokeObjectURL(url);
      notify.success("Arquivo CSV exportado!");
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const gerarDossie = async (id: string) => {
    setGerandoDossie(id);
    try {
      const dossie = await api.dossieProcesso(id);
      const blob = new Blob([JSON.stringify(dossie, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const titulo = (dossie as any)?.processo?.titulo || "processo";
      a.href = url; a.download = `dossie_${titulo.replace(/\s+/g, "_")}.json`; a.click();
      URL.revokeObjectURL(url);
      notify.success("Dossiê do processo gerado!");
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setGerandoDossie("");
    }
  };

  const maxCategoria = resumo ? Math.max(1, ...Object.values(resumo.por_categoria)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Relatórios"
        description="Visão consolidada de captação, execução, obras e prestações de contas."
        breadcrumbs={[{ label: "Convênios", href: "/convenios" }, { label: "Relatórios" }]}
        actions={<Button icon={Download} onClick={exportarCSV}>Exportar Processos (CSV)</Button>}
      />

      {loading ? (
        <div className="space-y-4"><div className="skeleton h-32 rounded-card" /><div className="skeleton h-40 rounded-card" /></div>
      ) : (
        <>
          {resumo && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <MetricCard icon="folder" label="Processos" value={String(resumo.total_processos)} color="#667085" />
                <MetricCard icon="dollar" label="Valor Aprovado" value={formatCurrency(resumo.total_aprovado)} color="#1D4ED8" />
                <MetricCard icon="dollar" label="Recursos Captados" value={formatCurrency(resumo.total_captado)} color="#067647" />
                <MetricCard icon="play" label="Em Andamento" value={String(resumo.em_andamento)} color="#1D4ED8" />
                <MetricCard icon="check" label="Concluídos" value={String(resumo.concluidos)} color="#067647" />
                <MetricCard icon="alert" label="Em Diligência" value={String(resumo.em_diligencia)} color="#B42318" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card padding="p-5">
                  <h3 className="text-h3 text-text-title mb-4">Recursos por Categoria</h3>
                  {Object.keys(resumo.por_categoria).length === 0 ? (
                    <p className="text-body-sm text-text-subtle">Sem dados.</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(resumo.por_categoria).map(([k, v]) => (
                        <div key={k}>
                          <div className="flex justify-between text-body-sm mb-1">
                            <span className="text-text-title">{CATEGORIA_RECURSO_LABELS[k] || k}</span>
                            <span className="tabular-nums text-text-body">{formatCurrency(v)}</span>
                          </div>
                          <div className="h-2 bg-[#F6F7F9] rounded-pill overflow-hidden">
                            <div className="h-full bg-[#1D4ED8] transition-all duration-700" style={{ width: `${(v / maxCategoria) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card padding="p-5">
                  <h3 className="text-h3 text-text-title mb-4">Recursos por Esfera</h3>
                  <div className="space-y-3">
                    {Object.entries(resumo.por_esfera).map(([k, v]) => (
                      <div key={k} className="flex justify-between p-3 bg-[#F6F7F9] rounded-btn">
                        <span className="text-text-title font-medium">{ESFERA_LABELS[k] || k}</span>
                        <span className="tabular-nums text-text-body">{formatCurrency(v)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {obras && (
            <Card padding="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-h3 text-text-title">Obras</h3>
                <div className="flex gap-2 text-body-sm">
                  <Badge label={`${obras.em_andamento} em andamento`} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
                  <Badge label={`${obras.concluidas} concluídas`} color="bg-[#067647]/10 text-[#067647]" />
                  <Badge label={`${obras.atrasadas} atrasadas`} color="bg-[#B42318]/10 text-[#B42318]" />
                </div>
              </div>
              {obras.obras.length === 0 ? (
                <EmptyState icon="file-text" title="Nenhuma obra cadastrada" description="As obras vinculadas aparecerão aqui." />
              ) : (
                <div className="space-y-2">
                  {obras.obras.map((o) => (
                    <div key={o.id} className="flex items-center justify-between p-3 rounded-btn hover:bg-[#F6F7F9] border border-surface-border">
                      <div className="min-w-0 flex-1">
                        <p className="text-body-sm font-medium text-text-title">{o.nome || "Obra"}</p>
                        {o.empresa && <p className="text-meta text-text-subtle">{o.empresa}</p>}
                        <div className="flex items-center gap-2 mt-1 text-meta text-text-subtle">
                          <span>Físico: {o.percentual_fisico ?? 0}%</span>
                          <span>Financeiro: {o.percentual_financeiro ?? 0}%</span>
                          {o.valor_contrato != null && <span className="tabular-nums">{formatCurrency(o.valor_contrato)}</span>}
                        </div>
                      </div>
                      <span className={`w-3 h-3 rounded-full shrink-0 ${(o.percentual_fisico ?? 0) >= 100 ? "bg-[#067647]" : (o.previsao_conclusao && new Date(o.previsao_conclusao) < new Date() ? "bg-[#B42318]" : "bg-[#1D4ED8]")}`} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {prestacoes && (
            <Card padding="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-h3 text-text-title">Prestações de Contas</h3>
                <div className="flex gap-2 text-body-sm">
                  <Badge label={`${prestacoes.pendentes} pendentes`} color="bg-[#B54708]/10 text-[#B54708]" />
                  <Badge label={`${prestacoes.aprovadas} aprovadas`} color="bg-[#067647]/10 text-[#067647]" />
                </div>
              </div>
              {prestacoes.prestacoes.length === 0 ? (
                <EmptyState icon="clipboard-list" title="Nenhuma prestação" description="As prestações de contas aparecerão aqui." />
              ) : (
                <div className="space-y-2">
                  {prestacoes.prestacoes.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-btn border border-surface-border">
                      <div>
                        <p className="text-body-sm font-medium text-text-title">{p.titulo || "Prestação"}</p>
                        {p.protocolo && <p className="text-meta text-text-subtle">Protocolo: {p.protocolo}</p>}
                      </div>
                      <Badge label={STATUS_PRESTACAO_LABELS[p.status] || p.status} color={RECURSOS_STATUS_COLORS[p.status] || "bg-[#F6F7F9] text-[#667085]"} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-[#1D4ED8]" />
              <h3 className="text-h3 text-text-title">Dossiê do Processo</h3>
            </div>
            <p className="text-body-sm text-text-body mb-4">Gere um documento consolidado de auditoria com todo o histórico do processo.</p>
            <select
              value={gerandoDossie}
              onChange={(e) => setGerandoDossie(e.target.value)}
              className="w-full max-w-md border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            >
              <option value="">Selecione um processo...</option>
              {processos.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
            </select>
            <div className="mt-3">
              <Button icon={TrendingUp} onClick={() => gerandoDossie && gerarDossie(gerandoDossie)} disabled={!gerandoDossie}>
                Gerar Dossiê
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

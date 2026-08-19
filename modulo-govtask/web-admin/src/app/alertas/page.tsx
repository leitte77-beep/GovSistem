"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toast";
import { AlertTriangle, ArrowRight, ShieldAlert, CheckCircle2 } from "lucide-react";

type Alerta = { categoria: string; severidade: string; titulo: string; descricao: string; processo_id: string; processo: string; link: string | null };
type Risco = { processo_id: string; processo: string; nivel: string; score: number; motivos: string[]; sem_movimentacao_dias: number | null; link: string };

const CATEGORIA_LABEL: Record<string, string> = {
  TAREFAS: "Tarefas", DILIGENCIAS: "Diligências", PRESTACAO: "Prestação", CONTRATOS: "Contratos", OBRAS: "Obras", FINANCEIRO: "Financeiro",
};

const CATEGORIA_COLOR: Record<string, string> = {
  TAREFAS: "bg-[#B42318]/10 text-[#B42318]",
  DILIGENCIAS: "bg-[#B54708]/10 text-[#B54708]",
  PRESTACAO: "bg-[#B54708]/10 text-[#B54708]",
  CONTRATOS: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
};

const RISCO_COLOR: Record<string, string> = {
  Baixo: "bg-[#067647]/10 text-[#067647]",
  "Médio": "bg-[#B54708]/10 text-[#B54708]",
  Alto: "bg-[#B42318]/10 text-[#B42318]",
  "Crítico": "bg-[#7A271A]/10 text-[#7A271A]",
};

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [riscos, setRiscos] = useState<Risco[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const d = await api.listarAlertas();
        setAlertas(d.alertas);
        setRiscos(d.riscos);
      } catch (e: any) {
        notify.error(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Alertas" description="Central de alertas e índice de risco dos processos." breadcrumbs={[{ label: "Alertas" }]} />
        <Skeleton variant="card" className="h-64" />
        <Skeleton variant="card" className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitoramento"
        title="Alertas"
        description="Central de alertas e índice de risco dos processos."
        breadcrumbs={[{ label: "Alertas" }]}
        actions={
          <div className="flex gap-2">
            <Badge label={`${alertas.length} alertas`} color="bg-[#B42318]/10 text-[#B42318]" />
            <Badge label={`${riscos.filter((r) => r.nivel === "Alto" || r.nivel === "Crítico").length} risco alto/crítico`} color="bg-[#B54708]/10 text-[#B54708]" />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-[#B42318]" />
              <h3 className="text-h3 text-text-title">Alertas Ativos</h3>
            </div>
            {alertas.length === 0 ? (
              <EmptyState icon="check" title="Nenhum alerta" description="Não há pendências críticas no momento." />
            ) : (
              <div className="space-y-2">
                {alertas.map((a, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-btn border border-surface-border hover:bg-[#F6F7F9]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={CATEGORIA_LABEL[a.categoria] || a.categoria} color={CATEGORIA_COLOR[a.categoria] || "bg-[#F6F7F9] text-[#667085]"} />
                        <p className="text-body-sm font-medium text-text-title">{a.titulo}</p>
                      </div>
                      <p className="text-body-sm text-text-body mt-1">{a.descricao}</p>
                      {a.processo && <p className="text-meta text-text-subtle mt-0.5">Processo: {a.processo}</p>}
                    </div>
                    {a.link && (
                      <Link href={a.link} className="shrink-0">
                        <Button size="sm" variant="ghost" icon={ArrowRight}>Ver</Button>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-5 h-5 text-[#1D4ED8]" />
              <h3 className="text-h3 text-text-title">Índice de Risco</h3>
            </div>
            <p className="text-body-sm text-text-body mb-4">Classificação por atenção com motivos transparentes.</p>
            {riscos.length === 0 ? (
              <EmptyState icon="check" title="Sem riscos" description="Nenhum processo para avaliar." />
            ) : (
              <div className="space-y-2">
                {riscos.slice(0, 15).map((r) => (
                  <Link key={r.processo_id} href={r.link} className="block p-3 rounded-btn border border-surface-border hover:bg-[#F6F7F9] transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-body-sm font-medium text-text-title truncate">{r.processo}</p>
                      <Badge label={r.nivel} color={RISCO_COLOR[r.nivel] || "bg-[#F6F7F9] text-[#667085]"} />
                    </div>
                    {r.motivos.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {r.motivos.map((m, i) => (
                          <p key={i} className="text-meta text-text-subtle flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-[#B42318]" /> {m}
                          </p>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

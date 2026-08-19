"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { HeroPanel } from "@/components/ui/HeroPanel";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { STATUS_PRESTACAO_LABELS, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import { ClipboardCheck, ArrowRight, FileText } from "lucide-react";

type PrestacaoItem = {
  id: string; convenio_id: string; convenio_titulo: string | null; titulo: string;
  status: string; protocolo: string;
};

type Filtro = "todas" | "pendentes" | "aprovadas" | "analise" | "encerradas";

export default function PrestacoesPage() {
  const [prestacoes, setPrestacoes] = useState<PrestacaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.relatorioPrestacoes();
      setPrestacoes(r.prestacoes);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const PENDENTES = ["EM_PREPARACAO", "PRONTA", "ENVIADA", "EM_ANALISE", "EM_DILIGENCIA"];
  const APROVADAS = ["APROVADA", "APROVADA_COM_OBSERVACAO"];

  const filtered = prestacoes.filter((p) => {
    if (filtro === "pendentes") return PENDENTES.includes(p.status);
    if (filtro === "aprovadas") return APROVADAS.includes(p.status);
    if (filtro === "analise") return ["ENVIADA", "EM_ANALISE", "EM_DILIGENCIA"].includes(p.status);
    if (filtro === "encerradas") return p.status === "ENCERRADA";
    return true;
  });

  const totalPendentes = prestacoes.filter((p) => PENDENTES.includes(p.status)).length;
  const totalAprovadas = prestacoes.filter((p) => APROVADAS.includes(p.status)).length;

  const filterBtn = (key: Filtro, label: string) => (
    <Button key={key} variant={filtro === key ? "primary" : "secondary"} size="sm" onClick={() => setFiltro(key)}>
      {label}
    </Button>
  );

  return (
    <div className="space-y-6">
      <HeroPanel
        eyebrow="Prestação de Contas"
        title="Prestações de Contas"
        description="Acompanhe todas as prestações de contas do órgão e seu status junto ao concedente."
        stats={[
          { label: "Total", value: prestacoes.length },
          { label: "Pendentes", value: totalPendentes, accent: totalPendentes > 0 },
          { label: "Aprovadas", value: totalAprovadas },
          { label: "Em análise", value: prestacoes.filter((p) => ["ENVIADA", "EM_ANALISE", "EM_DILIGENCIA"].includes(p.status)).length },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {filterBtn("todas", "Todas")}
        {filterBtn("pendentes", "Pendentes")}
        {filterBtn("analise", "Em análise")}
        {filterBtn("aprovadas", "Aprovadas")}
        {filterBtn("encerradas", "Encerradas")}
      </div>

      {loading ? (
        <Skeleton variant="card" className="h-64" />
      ) : filtered.length === 0 ? (
        <Card padding="p-8">
          <EmptyState icon="clipboard-list" title="Nenhuma prestação" description="As prestações de contas dos processos aparecerão aqui." />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Link key={p.id} href={p.convenio_id ? `/convenios/${p.convenio_id}?tab=prestacoes` : "#"} className="block p-4 rounded-card bg-surface-card border border-surface-border hover:shadow-card transition-all">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ClipboardCheck className="w-5 h-5 text-[#1D4ED8] shrink-0" />
                    <span className="text-body-sm font-semibold text-text-title">{p.titulo || "Prestação de Contas"}</span>
                    <Badge label={STATUS_PRESTACAO_LABELS[p.status] || p.status} color={RECURSOS_STATUS_COLORS[p.status] || "bg-[#F6F7F9] text-[#667085]"} />
                  </div>
                  {p.convenio_titulo && (
                    <p className="text-body-sm text-text-body mt-1 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-text-subtle" /> {p.convenio_titulo}
                    </p>
                  )}
                  {p.protocolo && <p className="text-meta text-text-subtle mt-0.5">Protocolo: {p.protocolo}</p>}
                </div>
                <ArrowRight className="w-4 h-4 text-text-subtle shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

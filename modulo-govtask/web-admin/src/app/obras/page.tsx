"use client";
import { RequirePermission } from "@/components/RequirePermission";
import { PERM } from "@/lib/perfil";

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
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Building2, ArrowRight, MapPin, AlertTriangle } from "lucide-react";

type ObraItem = {
  id: string; convenio_id: string; convenio_titulo: string | null; nome: string; empresa: string;
  percentual_fisico: number | null; percentual_financeiro: number | null;
  previsao_conclusao: string | null; valor_contrato: number | null; situacao: string;
};

type Filtro = "todas" | "andamento" | "concluidas" | "atrasadas";

function ObrasConteudo() {
  const [obras, setObras] = useState<ObraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.relatorioObras();
      setObras(r.obras);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = obras.filter((o) => {
    const concluida = (o.percentual_fisico ?? 0) >= 100;
    const atrasada = !!o.previsao_conclusao && new Date(o.previsao_conclusao) < new Date() && !concluida;
    if (filtro === "andamento") return !concluida;
    if (filtro === "concluidas") return concluida;
    if (filtro === "atrasadas") return atrasada;
    return true;
  });

  const Progress = ({ pct, color }: { pct: number | null; color: string }) => (
    <div className="h-2 bg-[#F6F7F9] rounded-pill overflow-hidden flex-1">
      <div className={cn("h-full rounded-pill", color)} style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }} />
    </div>
  );

  const totalAndamento = obras.filter((o) => (o.percentual_fisico ?? 0) < 100).length;
  const totalConcluidas = obras.filter((o) => (o.percentual_fisico ?? 0) >= 100).length;
  const totalAtrasadas = obras.filter((o) => !!o.previsao_conclusao && new Date(o.previsao_conclusao) < new Date() && (o.percentual_fisico ?? 0) < 100).length;

  return (
    <div className="space-y-6">
      <HeroPanel
        eyebrow="Engenharia e Execução"
        title="Obras"
        description="Acompanhe todas as obras do órgão: execução física, financeira e prazos."
        stats={[
          { label: "Total", value: obras.length },
          { label: "Em andamento", value: totalAndamento },
          { label: "Concluídas", value: totalConcluidas },
          { label: "Atrasadas", value: totalAtrasadas, accent: totalAtrasadas > 0 },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {(["todas", "andamento", "concluidas", "atrasadas"] as Filtro[]).map((f) => (
          <Button
            key={f}
            variant={filtro === f ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFiltro(f)}
          >
            {f === "todas" ? "Todas" : f === "andamento" ? "Em andamento" : f === "concluidas" ? "Concluídas" : "Atrasadas"}
          </Button>
        ))}
      </div>

      {loading ? (
        <Skeleton variant="card" className="h-64" />
      ) : filtered.length === 0 ? (
        <Card padding="p-8">
          <EmptyState icon="building" title="Nenhuma obra" description="As obras vinculadas aos processos aparecerão aqui." />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const concluida = (o.percentual_fisico ?? 0) >= 100;
            const atrasada = !!o.previsao_conclusao && new Date(o.previsao_conclusao) < new Date() && !concluida;
            return (
              <Card key={o.id} padding="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Building2 className="w-5 h-5 text-[#1D4ED8] shrink-0" />
                      <span className="text-body font-semibold text-text-title">{o.nome || "Obra"}</span>
                      {concluida ? <Badge label="Concluída" color="bg-[#067647]/10 text-[#067647]" /> : atrasada ? <Badge label="Atrasada" color="bg-[#B42318]/10 text-[#B42318]" /> : <Badge label={o.situacao?.replace("_", " ") || "Em andamento"} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />}
                    </div>
                    {o.convenio_titulo && (
                      <Link href={o.convenio_id ? `/convenios/${o.convenio_id}` : "#"} className="inline-flex items-center gap-1 text-body-sm text-[#1D4ED8] hover:underline mt-1">
                        {o.convenio_titulo} <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-body-sm text-text-body flex-wrap">
                      {o.empresa && <span>Empresa: <strong className="text-text-title">{o.empresa}</strong></span>}
                      <span>Contrato: <strong className="text-text-title tabular-nums">{formatCurrency(o.valor_contrato)}</strong></span>
                      {o.previsao_conclusao && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />Previsão: {formatDate(o.previsao_conclusao)}</span>}
                      {atrasada && <span className="flex items-center gap-1 text-[#B42318]"><AlertTriangle className="w-3.5 h-3.5" />Fora do prazo</span>}
                    </div>
                  </div>
                  <div className="lg:w-72 space-y-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-meta text-text-subtle w-16 shrink-0">Físico</span>
                      <Progress pct={o.percentual_fisico} color="bg-[#1D4ED8]" />
                      <span className="text-meta text-text-title tabular-nums w-10 text-right">{o.percentual_fisico ?? 0}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-meta text-text-subtle w-16 shrink-0">Financeiro</span>
                      <Progress pct={o.percentual_financeiro} color="bg-[#067647]" />
                      <span className="text-meta text-text-title tabular-nums w-10 text-right">{o.percentual_financeiro ?? 0}%</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <RequirePermission anyOf={[PERM.VIEW]}>
      <ObrasConteudo />
    </RequirePermission>
  );
}

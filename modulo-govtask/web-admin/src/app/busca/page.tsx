"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { notify } from "@/components/ui/Toast";
import { formatDate, formatCurrency, SITUACAO_PROCESSO_LABELS, CATEGORIA_RECURSO_LABELS, ESFERA_LABELS } from "@/lib/utils";
import type { ConvenioListItem, TarefaListItem } from "@/types/govtask";
import { Search, FileText, CheckSquare, Building2, ClipboardCheck, ArrowRight, X } from "lucide-react";

export default function BuscaPage() {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [convenios, setConvenios] = useState<ConvenioListItem[]>([]);
  const [tarefas, setTarefas] = useState<TarefaListItem[]>([]);
  const [obras, setObras] = useState<{ id: string; convenio_id: string; nome: string; empresa: string; situacao: string }[]>([]);
  const [prestacoes, setPrestacoes] = useState<{ id: string; convenio_id: string; convenio_titulo: string | null; titulo: string; status: string; protocolo: string }[]>([]);

  // lê q inicial da URL de forma segura
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const initial = params.get("q");
      if (initial) {
        setQ(initial);
        runSearch(initial);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = useCallback(async (term: string) => {
    const t = term.trim();
    if (!t) { setConvenios([]); setTarefas([]); setObras([]); setPrestacoes([]); setLoaded(true); return; }
    setSearching(true);
    try {
      const lower = t.toLowerCase();
      const [conv, tasks, obrasR, prestR] = await Promise.all([
        api.listConvenios({ search: t, limit: 50 }),
        api.listTarefas({ limit: 200 }),
        api.relatorioObras().catch(() => ({ obras: [] as any[] })),
        api.relatorioPrestacoes().catch(() => ({ prestacoes: [] as any[] })),
      ]);
      setConvenios(conv);
      setTarefas(tasks.filter((x) => (x.titulo || "").toLowerCase().includes(lower)));
      setObras(obrasR.obras.filter((o) => (o.nome || "").toLowerCase().includes(lower) || (o.empresa || "").toLowerCase().includes(lower)));
      setPrestacoes(prestR.prestacoes.filter((p) => (p.titulo || p.convenio_titulo || "").toLowerCase().includes(lower)));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setSearching(false);
      setLoaded(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(q);
  };

  const total = convenios.length + tarefas.length + obras.length + prestacoes.length;

  const inputCls = "w-full pl-11 pr-10 py-2.5 text-body-sm border border-surface-border rounded-btn bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] text-text-title placeholder:text-text-subtle";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pesquisa"
        title="Busca Global"
        description="Encontre processos, tarefas, obras, prestações, fornecedores, contratos e mais."
        breadcrumbs={[{ label: "Busca Global" }]}
      />

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título, protocolo, emenda, convênio, parlamentar, órgão, fornecedor..."
            className={inputCls}
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); setConvenios([]); setTarefas([]); setObras([]); setPrestacoes([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-body">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {searching ? (
        <div className="space-y-4"><Skeleton variant="card" className="h-24" /><Skeleton variant="card" className="h-48" /></div>
      ) : !loaded ? (
        <p className="text-body-sm text-text-subtle">Digite um termo para buscar.</p>
      ) : total === 0 ? (
        <Card padding="p-8">
          <EmptyState icon="search" title="Nenhum resultado" description={`Nada encontrado para "${q}".`} />
        </Card>
      ) : (
        <div className="space-y-6">
          <p className="text-body-sm text-text-body"><strong className="text-text-title">{total}</strong> resultado(s) para "<strong className="text-text-title">{q}</strong>"</p>

          {convenios.length > 0 && (
            <Card padding="p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-[#1D4ED8]" />
                <h3 className="text-h3 text-text-title">Processos ({convenios.length})</h3>
              </div>
              <div className="space-y-2">
                {convenios.map((c) => (
                  <Link key={c.id} href={`/convenios/${c.id}`} className="flex items-center justify-between gap-3 p-3 rounded-btn border border-surface-border hover:bg-[#F6F7F9] transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-medium text-text-title">{c.titulo}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-meta text-text-subtle">
                        {c.categoria && <span>{CATEGORIA_RECURSO_LABELS[c.categoria] || c.categoria}</span>}
                        {c.esfera && <span>{ESFERA_LABELS[c.esfera] || c.esfera}</span>}
                        {c.numero_protocolo_governo && <span className="font-mono">Protocolo {c.numero_protocolo_governo}</span>}
                        {c.parlamentar && <span>{c.parlamentar}</span>}
                        <span className="tabular-nums">{formatCurrency(c.valor)}</span>
                      </div>
                    </div>
                    <StatusPill status={c.status} />
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {tarefas.length > 0 && (
            <Card padding="p-5">
              <div className="flex items-center gap-2 mb-4">
                <CheckSquare className="w-5 h-5 text-[#1D4ED8]" />
                <h3 className="text-h3 text-text-title">Tarefas ({tarefas.length})</h3>
              </div>
              <div className="space-y-2">
                {tarefas.slice(0, 15).map((t) => (
                  <Link key={t.id} href={`/tarefas/${t.id}`} className="flex items-center justify-between gap-3 p-3 rounded-btn border border-surface-border hover:bg-[#F6F7F9] transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-medium text-text-title">{t.titulo}</p>
                      {t.convenio && <p className="text-meta text-text-subtle mt-0.5">{t.convenio.titulo}</p>}
                    </div>
                    <StatusPill status={t.status} />
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {obras.length > 0 && (
            <Card padding="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-[#1D4ED8]" />
                <h3 className="text-h3 text-text-title">Obras ({obras.length})</h3>
              </div>
              <div className="space-y-2">
                {obras.map((o) => (
                  <Link key={o.id} href={o.convenio_id ? `/convenios/${o.convenio_id}` : "#"} className="flex items-center justify-between gap-3 p-3 rounded-btn border border-surface-border hover:bg-[#F6F7F9] transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-medium text-text-title">{o.nome || "Obra"}</p>
                      {o.empresa && <p className="text-meta text-text-subtle mt-0.5">{o.empresa}</p>}
                    </div>
                    <Badge label={o.situacao?.replace("_", " ") || "—"} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {prestacoes.length > 0 && (
            <Card padding="p-5">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardCheck className="w-5 h-5 text-[#1D4ED8]" />
                <h3 className="text-h3 text-text-title">Prestações de Contas ({prestacoes.length})</h3>
              </div>
              <div className="space-y-2">
                {prestacoes.map((p) => (
                  <Link key={p.id} href={p.convenio_id ? `/convenios/${p.convenio_id}?tab=prestacoes` : "#"} className="flex items-center justify-between gap-3 p-3 rounded-btn border border-surface-border hover:bg-[#F6F7F9] transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-medium text-text-title">{p.titulo || "Prestação de Contas"}</p>
                      {p.convenio_titulo && <p className="text-meta text-text-subtle mt-0.5">{p.convenio_titulo}</p>}
                    </div>
                    <StatusPill status={p.status} />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

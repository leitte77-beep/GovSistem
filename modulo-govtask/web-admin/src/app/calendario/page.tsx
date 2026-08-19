"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatDate, daysUntil, STATUS_LABELS, PRIORITY_LABELS, PRIORITY_COLORS, cn } from "@/lib/utils";
import type { ConvenioListItem, TarefaListItem } from "@/types/govtask";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, AlertTriangle, CheckSquare, FileText } from "lucide-react";

type CalEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  titulo: string;
  tipo: "TAREFA" | "PROCESSO" | "VIGENCIA" | "PREVISAO";
  link: string;
  status?: string;
  prioridade?: string;
  convenio_titulo?: string;
};

const TIPO_ICON: Record<CalEvent["tipo"], string> = {
  TAREFA: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  PROCESSO: "bg-[#067647]/10 text-[#067647]",
  VIGENCIA: "bg-[#B54708]/10 text-[#B54708]",
  PREVISAO: "bg-[#7A271A]/10 text-[#7A271A]",
};

const TIPO_LABEL: Record<CalEvent["tipo"], string> = {
  TAREFA: "Tarefa",
  PROCESSO: "Processo",
  VIGENCIA: "Vigência",
  PREVISAO: "Previsão",
};

export default function CalendarioPage() {
  const [loading, setLoading] = useState(true);
  const [tarefas, setTarefas] = useState<TarefaListItem[]>([]);
  const [convenios, setConvenios] = useState<ConvenioListItem[]>([]);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [tipoFiltro, setTipoFiltro] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, c] = await Promise.all([
        api.listTarefas({ limit: 300 }),
        api.listConvenios({ limit: 200 }),
      ]);
      setTarefas(t);
      setConvenios(c);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const eventos = useMemo<CalEvent[]>(() => {
    const ev: CalEvent[] = [];
    for (const t of tarefas) {
      if (!t.prazo) continue;
      const d = t.prazo.slice(0, 10);
      ev.push({
        id: `t-${t.id}`, date: d, titulo: t.titulo, tipo: "TAREFA",
        link: `/tarefas/${t.id}`, status: t.status, prioridade: t.prioridade,
        convenio_titulo: t.convenio?.titulo,
      });
    }
    for (const c of convenios) {
      if (c.numero_protocolo_governo && c.created_at) {
        ev.push({
          id: `p-${c.id}`, date: c.created_at.slice(0, 10), titulo: c.titulo, tipo: "PROCESSO",
          link: `/convenios/${c.id}`, status: c.status, convenio_titulo: "Protocolo externo",
        });
      }
      const previsao = (c as ConvenioListItem & { previsao_conclusao?: string }).previsao_conclusao;
      if (previsao) {
        ev.push({
          id: `pv-${c.id}`, date: previsao.slice(0, 10), titulo: c.titulo, tipo: "PREVISAO",
          link: `/convenios/${c.id}`, status: c.status, convenio_titulo: "Previsão de conclusão",
        });
      }
    }
    const filtered = tipoFiltro ? ev.filter((e) => e.tipo === tipoFiltro) : ev;
    return filtered.sort((a, b) => a.date.localeCompare(b.date));
  }, [tarefas, convenios, tipoFiltro]);

  const primeiroDia = new Date(cursor.year, cursor.month, 1);
  const inicioSemana = new Date(primeiroDia);
  const diaSemanaInicio = primeiroDia.getDay();
  inicioSemana.setDate(primeiroDia.getDate() - diaSemanaInicio);
  const dias: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicioSemana);
    d.setDate(inicioSemana.getDate() + i);
    dias.push({ date: d, inMonth: d.getMonth() === cursor.month });
  }

  const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const eventosPorDia: Record<string, CalEvent[]> = {};
  for (const e of eventos) {
    (eventosPorDia[e.date] = eventosPorDia[e.date] || []).push(e);
  }

  const mesLabel = useMemo(
    () => primeiroDia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    [cursor]
  );

  const navigar = (delta: number) => {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const pendenciasProximas = eventos.filter((e) => {
    const diff = daysUntil(e.date + "T23:59:59");
    return diff >= 0 && diff <= 7;
  });

  const hoje = toKey(new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agenda"
        title="Calendário"
        description="Prazos, vencimentos, vigências, previsões e entregas em um único lugar."
        breadcrumbs={[{ label: "Calendário" }]}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              className="border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            >
              <option value="">Todos os tipos</option>
              <option value="TAREFA">Tarefas</option>
              <option value="PROCESSO">Processos</option>
              <option value="VIGENCIA">Vigências</option>
              <option value="PREVISAO">Previsões</option>
            </select>
          </div>
        }
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Calendário principal */}
        <div className="lg:flex-1">
          {loading ? (
            <Skeleton variant="card" className="h-[480px]" />
          ) : (
            <Card padding="p-4">
              <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => navigar(-1)} aria-label="Mês anterior">{""}</Button>
                <h2 className="text-h2 text-text-title capitalize">{mesLabel}</h2>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => navigar(1)} aria-label="Próximo mês">{""}</Button>
                  <Button variant="secondary" size="sm" onClick={() => { const n = new Date(); setCursor({ year: n.getFullYear(), month: n.getMonth() }); }}>
                    Hoje
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-meta text-text-subtle mb-2">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                  <div key={d} className="py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {dias.map(({ date, inMonth }, idx) => {
                  const key = toKey(date);
                  const dayEvents = eventosPorDia[key] || [];
                  const isToday = key === hoje;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "min-h-[96px] rounded-btn border p-1.5 flex flex-col",
                        inMonth ? "bg-surface-card border-surface-border" : "bg-[#F6F7F9] border-transparent opacity-50",
                        isToday && "border-[#1D4ED8] ring-1 ring-[#1D4ED8]/30"
                      )}
                    >
                      <div className={cn("text-meta mb-1", isToday ? "font-bold text-[#1D4ED8]" : "text-text-subtle")}>
                        {date.getDate()}
                      </div>
                      <div className="space-y-1 overflow-hidden">
                        {dayEvents.slice(0, 3).map((e) => (
                          <Link
                            key={e.id}
                            href={e.link}
                            title={e.titulo}
                            className={cn(
                              "block text-meta px-1.5 py-0.5 rounded-pill truncate hover:opacity-80 transition-opacity",
                              TIPO_ICON[e.tipo]
                            )}
                          >
                            {e.titulo}
                          </Link>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-meta text-text-subtle px-1.5">+{dayEvents.length - 3} mais</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Painel lateral */}
        <div className="lg:w-80 space-y-4">
          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-5 h-5 text-[#1D4ED8]" />
              <h3 className="text-h3 text-text-title">Próximos 7 dias</h3>
            </div>
            {pendenciasProximas.length === 0 ? (
              <p className="text-body-sm text-text-subtle">Nenhum vencimento nos próximos 7 dias.</p>
            ) : (
              <div className="space-y-2">
                {pendenciasProximas.slice(0, 12).map((e) => {
                  const diff = daysUntil(e.date + "T23:59:59");
                  return (
                    <Link key={e.id} href={e.link} className="block p-2.5 rounded-btn border border-surface-border hover:bg-[#F6F7F9] transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-meta font-medium", diff === 0 ? "text-[#B42318]" : diff <= 3 ? "text-[#B54708]" : "text-text-subtle")}>
                          {diff === 0 ? "Hoje" : diff === 1 ? "Amanhã" : `${diff} dias`}
                        </span>
                        <Badge label={TIPO_LABEL[e.tipo]} color={TIPO_ICON[e.tipo]} />
                      </div>
                      <p className="text-body-sm font-medium text-text-title truncate mt-1">{e.titulo}</p>
                      {e.convenio_titulo && <p className="text-meta text-text-subtle truncate">{e.convenio_titulo}</p>}
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card padding="p-5">
            <h3 className="text-h3 text-text-title mb-3">Legenda</h3>
            <div className="space-y-2 text-body-sm">
              {(["TAREFA", "PROCESSO", "VIGENCIA", "PREVISAO"] as const).map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <span className={cn("w-3 h-3 rounded-full", TIPO_ICON[t])} />
                  <span className="text-text-body">{TIPO_LABEL[t]}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Clock, Database, ListChecks } from "lucide-react";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";

interface HealthCheck {
  status?: string;
  latency_ms?: number;
}

interface HealthResponse {
  uptime_seconds?: number;
  checks?: Record<string, HealthCheck | string>;
}

interface QueueResponse {
  queue_length?: number;
  active_tasks?: number;
  reserved_tasks?: number;
  status?: string;
}

interface EditionsSummary {
  total?: number;
  pdf_generated?: number;
  signed?: number;
  published?: number;
}

interface DashboardResponse {
  editions?: EditionsSummary;
}

function MetricBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
      <div className="h-full rounded-full bg-secondary transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function OperacoesPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getRaw<HealthResponse>("/operations/health"),
      api.getRaw<QueueResponse>("/operations/queue-status"),
      api.getRaw<DashboardResponse>("/operations/dashboard"),
    ])
      .then(([h, q, d]) => { setHealth(h); setQueue(q); setDashboard(d); })
      .catch((err) => notifyError("Operacoes", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary" aria-hidden="true">progress_activity</span>
      </div>
    );
  }

  const uptimeHours = health?.uptime_seconds ? Math.floor(health.uptime_seconds / 3600) : 0;
  const dbCheck = health?.checks?.database as HealthCheck | undefined;
  const editions = dashboard?.editions ?? {};
  const queueLength = queue?.queue_length ?? 0;
  const queueOk = queue?.status === "ok";
  const checks = health?.checks ? Object.entries(health.checks) : [];

  const metrics = [
    { label: "Tempo de atividade", value: `${uptimeHours} h`, hint: "Serviços sem interrupção", icon: <Clock size={20} aria-hidden="true" /> },
    {
      label: "Banco de dados",
      value: dbCheck?.status === "ok" ? "Operacional" : dbCheck?.status || "—",
      hint: dbCheck?.latency_ms ? `Latência de ${dbCheck.latency_ms} ms` : "Sem leitura de latência",
      icon: <Database size={20} aria-hidden="true" />,
      tone: dbCheck?.status === "ok" ? "ok" : "neutral",
    },
    { label: "Edições publicadas", value: editions.published ?? 0, hint: "Acumulado do ano corrente", icon: <CheckCircle2 size={20} aria-hidden="true" /> },
    {
      label: "Fila de processamento",
      value: queueLength,
      hint: queueOk ? "Nenhum processo pendente" : "Há processos na fila",
      icon: <ListChecks size={20} aria-hidden="true" />,
      tone: queueOk ? "ok" : "attention",
    },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-[1400px] animate-fade-up space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Sistema"
        title="Operações"
        description="Saúde da infraestrutura, filas de processamento e volume editorial em tempo quase real."
        meta={
          <span className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${queueOk ? "bg-secondary" : "bg-warning"}`} aria-hidden="true" />
            <span className="text-body-sm font-semibold text-on-surface-variant">
              {queueOk ? "Todos os serviços operacionais" : "Atenção na fila de processamento"}
            </span>
          </span>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores operacionais">
        {metrics.map((m) => (
          <div key={m.label} className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                {m.icon}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">{m.label}</span>
            </div>
            <p className="mt-4 text-display text-primary">{m.value}</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">{m.hint}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <section className="card p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-2 text-headline-sm text-on-surface">
                <Activity size={18} className="text-primary" aria-hidden="true" />
                Verificações de saúde
              </h2>
              <span className="eyebrow">Tempo real</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {checks.map(([key, val]) => {
                const status = typeof val === "object" ? val.status : String(val);
                const isOk = status === "ok";
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between rounded-lg border-l-4 bg-surface-container-low p-4 ${isOk ? "border-secondary" : "border-warning"}`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">dns</span>
                      <span className="text-body-md font-semibold text-on-surface">{key}</span>
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isOk ? "bg-success-container text-on-success-container" : "bg-warning-container text-on-warning-container"}`}>
                      {isOk ? "Operacional" : status}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="rule flex items-center gap-2 px-6 py-4">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">reorder</span>
              <h2 className="text-headline-sm text-on-surface">Filas de processamento</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">Parâmetro</th>
                    <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">Estado atual</th>
                    <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {[
                    { label: "Tamanho da fila", value: queue?.queue_length ?? "—" },
                    { label: "Tarefas ativas", value: queue?.active_tasks ?? "—" },
                    { label: "Tarefas reservadas", value: queue?.reserved_tasks ?? "—" },
                    { label: "Status do worker", value: queueOk ? "Operacional" : queue?.status || "—" },
                  ].map((row) => (
                    <tr key={row.label}>
                      <td className="px-6 py-3.5 text-body-md font-medium text-on-surface">{row.label}</td>
                      <td className="px-6 py-3.5 text-body-md font-semibold text-primary">{row.value}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${queueOk ? "bg-secondary" : "bg-error"}`} aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-4">
          {dashboard?.editions && (
            <section className="card p-6">
              <h2 className="mb-5 flex items-center gap-2 text-headline-sm text-on-surface">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">pie_chart</span>
                Edições por status
              </h2>
              <div className="space-y-4">
                {[
                  { label: "Total", value: editions.total ?? 0 },
                  { label: "PDF gerado", value: editions.pdf_generated ?? 0 },
                  { label: "Assinadas", value: editions.signed ?? 0 },
                  { label: "Publicadas", value: editions.published ?? 0 },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-body-sm text-on-surface-variant">{row.label}</span>
                      <span className="text-body-md font-semibold text-on-surface">{row.value}</span>
                    </div>
                    <MetricBar value={row.value} total={editions.total ?? 0} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card border-t-4 border-t-secondary p-6">
            <div className="flex flex-col items-center py-6 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">verified_user</span>
              </span>
              <h3 className="text-headline-sm text-primary">Monitoramento de alertas</h3>
              <p className="mt-1 text-body-md font-semibold text-secondary">Nenhum alerta ativo</p>
              <p className="mt-3 text-body-sm leading-relaxed text-on-surface-variant">
                A infraestrutura opera dentro dos parâmetros normais de latência e processamento.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

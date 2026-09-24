"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api";

export default function OperacoesPage() {
  const [health, setHealth] = useState<any>(null);
  const [queue, setQueue] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getRaw("/operations/health"),
      api.getRaw("/operations/queue-status"),
      api.getRaw("/operations/dashboard"),
    ])
      .then(([h, q, d]) => { setHealth(h); setQueue(q); setDashboard(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
      </div>
    );
  }

  const uptimeHours = health ? Math.floor(health.uptime_seconds / 3600) : 0;
  const dbCheck = health?.checks?.database;
  const editionsPublished = dashboard?.editions?.published ?? 0;
  const queueLength = queue?.queue_length ?? 0;
  const queueOk = queue?.status === "ok";

  const checks = health?.checks ? Object.entries(health.checks) : [];
  const editions = dashboard?.editions;

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full">
      {/* STATUS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col gap-2 relative overflow-hidden group hover:scale-[1.02] transition-transform">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="material-symbols-outlined text-6xl">schedule</span>
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-primary text-xl">schedule</span>
            <span className="text-label-md font-bold uppercase tracking-wider">Uptime</span>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-4xl font-bold text-primary">{uptimeHours}</span>
            <span className="text-headline-sm font-semibold text-on-surface-variant">h</span>
          </div>
          <p className="text-body-sm text-on-surface-variant">Serviços ativos sem interrupção</p>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col gap-2 relative overflow-hidden group hover:scale-[1.02] transition-transform">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="material-symbols-outlined text-6xl">database</span>
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-secondary text-xl">database</span>
            <span className="text-label-md font-bold uppercase tracking-wider">Banco de Dados</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-3xl font-bold text-secondary">{dbCheck?.status === "ok" ? "OK" : dbCheck?.status || "-"}</span>
            {dbCheck?.status === "ok" && (
              <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            )}
          </div>
          {dbCheck?.latency_ms && <p className="text-body-sm text-on-surface-variant">Latência: {dbCheck.latency_ms}ms</p>}
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col gap-2 relative overflow-hidden group hover:scale-[1.02] transition-transform">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="material-symbols-outlined text-6xl">history_edu</span>
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-tertiary-container text-xl">history_edu</span>
            <span className="text-label-md font-bold uppercase tracking-wider">Edições Publicadas</span>
          </div>
          <div className="mt-2">
            <span className="text-4xl font-bold text-primary">{editionsPublished}</span>
          </div>
          <p className="text-body-sm text-on-surface-variant">Acumulado do ano corrente</p>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col gap-2 relative overflow-hidden group hover:scale-[1.02] transition-transform">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="material-symbols-outlined text-6xl">pending_actions</span>
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-error text-xl">pending_actions</span>
            <span className="text-label-md font-bold uppercase tracking-wider">Fila de Processamento</span>
          </div>
          <div className="mt-2">
            <span className="text-4xl font-bold text-on-surface">{queueLength}</span>
          </div>
          <p className="text-body-sm text-on-surface-variant">{queueOk ? "Nenhum processo pendente" : "Fila com processos"}</p>
        </div>
      </div>

      {/* ASYMMETRIC GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          {/* Healthchecks */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-headline-md font-headline-md text-primary">Healthchecks</h3>
              <span className="text-label-md font-bold text-on-surface-variant px-3 py-1 bg-surface-container-low rounded-lg">LIVE FEED</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {checks.map(([key, val]: [string, any]) => {
                const status = typeof val === "object" ? val.status : String(val);
                const isOk = status === "ok";
                return (
                  <div key={key} className={`flex items-center justify-between p-4 bg-surface-container-low rounded-lg border-l-4 ${isOk ? "border-secondary" : "border-outline"}`}>
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-on-surface-variant">dns</span>
                      <span className="text-body-md font-semibold">{key}</span>
                    </div>
                    <span className={`px-2 py-1 ${isOk ? "bg-secondary-container text-on-secondary-container" : "bg-surface-variant text-on-surface-variant"} text-[10px] font-bold rounded uppercase`}>
                      {isOk ? "Online" : status}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Filas */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="bg-primary px-6 py-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-white">reorder</span>
              <h3 className="text-headline-sm font-headline-sm text-white">Filas (Celery)</h3>
            </div>
            <div className="p-6">
              <table className="w-full text-left">
                <thead className="border-b border-outline-variant">
                  <tr>
                    <th className="py-3 text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Parâmetro Técnico</th>
                    <th className="py-3 text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Estado Atual</th>
                    <th className="py-3 text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  <tr>
                    <td className="py-4 text-body-md font-semibold">Tamanho da fila</td>
                    <td className="py-4 text-body-md font-bold text-primary">{queue?.queue_length ?? "-"}</td>
                    <td className="py-4"><span className={`w-3 h-3 rounded-full ${queueOk ? "bg-secondary" : "bg-error"} inline-block`} /></td>
                  </tr>
                  <tr>
                    <td className="py-4 text-body-md font-semibold">Tarefas ativas</td>
                    <td className="py-4 text-body-md font-bold text-primary">{queue?.active_tasks ?? "-"}</td>
                    <td className="py-4"><span className={`w-3 h-3 rounded-full ${queueOk ? "bg-secondary" : "bg-error"} inline-block`} /></td>
                  </tr>
                  <tr>
                    <td className="py-4 text-body-md font-semibold">Tarefas reservadas</td>
                    <td className="py-4 text-body-md font-bold text-primary">{queue?.reserved_tasks ?? "-"}</td>
                    <td className="py-4"><span className={`w-3 h-3 rounded-full ${queueOk ? "bg-secondary" : "bg-error"} inline-block`} /></td>
                  </tr>
                  <tr>
                    <td className="py-4 text-body-md font-semibold">Status do Worker</td>
                    <td className="py-4 text-body-md font-bold text-secondary uppercase">{queueOk ? "Operacional" : queue?.status || "-"}</td>
                    <td className="py-4"><span className={`w-3 h-3 rounded-full ${queueOk ? "bg-secondary" : "bg-error"} inline-block`} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          {/* Edições por Status */}
          {editions && (
            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-6 h-fit">
              <h3 className="text-headline-sm font-headline-sm text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined">pie_chart</span>
                Edições por Status
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-label-md font-bold text-on-surface-variant uppercase">Total de Edições</span>
                    <span className="text-body-md font-bold">{editions.total}</span>
                  </div>
                  <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: "100%" }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-label-md font-bold text-on-surface-variant uppercase text-[11px]">PDF Gerado</span>
                    <span className="text-body-md font-bold">{editions.pdf_generated}</span>
                  </div>
                  <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: `${editions.total > 0 ? (editions.pdf_generated / editions.total) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-label-md font-bold text-on-surface-variant uppercase text-[11px]">Assinadas</span>
                    <span className="text-body-md font-bold">{editions.signed}</span>
                  </div>
                  <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: `${editions.total > 0 ? (editions.signed / editions.total) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-label-md font-bold text-on-surface-variant uppercase text-[11px]">Publicadas</span>
                    <span className="text-body-md font-bold">{editions.published}</span>
                  </div>
                  <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: `${editions.total > 0 ? (editions.published / editions.total) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
              <button className="w-full mt-6 py-3 border border-outline text-primary font-bold rounded-lg hover:bg-surface-container-low transition-colors text-label-md">
                DETALHAR RELATÓRIO
              </button>
            </section>
          )}

          {/* Alertas */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-6 border-t-4 border-secondary">
            <div className="flex flex-col items-center text-center py-8">
              <div className="w-16 h-16 bg-secondary-container text-on-secondary-container rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
              </div>
              <h3 className="text-headline-sm font-headline-sm text-primary mb-2">Monitoramento de Alertas</h3>
              <p className="text-body-md text-on-surface-variant font-semibold text-secondary">Nenhum alerta ativo detectado</p>
              <p className="text-body-sm text-on-surface-variant mt-4 leading-relaxed">
                A infraestrutura está operando dentro dos parâmetros normais de latência e processamento.
              </p>
            </div>
          </section>

          {/* Banner */}
          <div className="rounded-xl overflow-hidden relative h-48 border border-outline-variant shadow-sm">
            <Image
              alt="Data Center"
              className="w-full h-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCjeSNPDlpImEttrHhXlPcs3hgNHIuegvpW2SzUrd4D2NPj0svELd4qxMNRdwsT-jcH3UpH4UAWz_6o4D9grSWSB_SaTCFvNR5LLFNOHffK39fvmTNjLK0CiSe3HGPzH6RFFhUj24SatYI5MW0Sa22Xr3BKkX2dI59uP-CC8lNTvUgS9kuhLokD1mF5sjItcwJlYmR_bFw7ZWL4XKzmWyrhRDCGayltZO0-5t7FGsEAqxZn-kpdyVh5EecuRk0QlExHG7hu5y3whJzL"
              fill
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent flex flex-col justify-end p-4">
              <span className="text-[10px] font-bold text-secondary-fixed uppercase tracking-[0.2em]">Local Data Center</span>
              <span className="text-white font-bold text-body-md">Node: BR-DF-01</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

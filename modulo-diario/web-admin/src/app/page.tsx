"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import AdminShell from "@/components/AdminShell";

interface DashboardData {
  editions?: { total: number; published: number; draft: number; signed: number; pdf_generated: number };
  matters?: { total: number; draft: number; review: number; approved: number; published: number };
  health?: { uptime_seconds: number };
}

function getCount(data: DashboardData, key: string): number {
  const parts = key.split(".");
  if (parts.length < 2) return 0;
  const obj = (data as any)[parts[0]];
  return obj?.[parts[1]] ?? 0;
}

function DonutRow({ label, count, total, color, activeColor }: { label: string; count: number; total: number; color: string; activeColor?: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${activeColor || ""}`} style={activeColor ? {} : { border: `2px solid ${color}` }} />
        <span className="text-body-md text-on-surface-variant">{label}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-bold">{count}</span>
        <span className="text-xs text-outline w-8 text-right">{pct}%</span>
      </div>
    </div>
  );
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRaw<DashboardData>("/operations/dashboard")
      .then((d) => setData(d))
      .catch((err) => notifyError("Dashboard", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl mb-4 block animate-spin text-primary">
            progress_activity
          </span>
          <p className="text-on-surface-variant text-body-md">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  const totalMatters = getCount(data, "matters.total");
  const totalEditions = getCount(data, "editions.total");

  return (
    <div className="space-y-8 p-8">
      {/* Hero Banner */}
      <section className="relative overflow-hidden bg-primary-container rounded-xl p-10 text-on-primary">
        <div className="absolute top-0 right-0 w-1/3 h-full opacity-10 pointer-events-none">
          <svg className="w-full h-full fill-white" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <path d="M44.7,-76.4C58.1,-69.2,69.5,-57.4,78.3,-43.8C87.1,-30.2,93.3,-15.1,92.6,-0.4C91.9,14.3,84.4,28.6,74.9,41.2C65.5,53.8,54.1,64.7,40.8,72.4C27.5,80.1,13.7,84.7,-0.7,85.9C-15.1,87.1,-30.3,84.8,-43.8,77.5C-57.3,70.2,-69.1,57.9,-77.4,43.7C-85.7,29.5,-90.4,14.7,-89.7,0.4C-89.1,-13.9,-83.1,-27.7,-74.2,-39.8C-65.3,-51.9,-53.4,-62.3,-40,-69.5C-26.6,-76.7,-13.3,-80.7,1.4,-83.1C16.1,-85.5,31.2,-83.6,44.7,-76.4Z" transform="translate(100 100)" />
          </svg>
        </div>
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-display-lg font-display-lg mb-4 tracking-tight">
            Dashboard
          </h1>
          <p className="text-body-lg text-on-primary/80 leading-relaxed">
            Gerencie matérias, edições, usuários e acompanhe o status do Diário
            Oficial Eletrônico em tempo real com transparência e segurança
            jurídica.
          </p>
        </div>
      </section>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/matters" className="block bg-white border border-outline-variant p-6 rounded-xl shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-lg bg-primary/5 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-3xl">description</span>
            </div>
            <span className="material-symbols-outlined text-outline-variant group-hover:text-primary group-hover:translate-x-1 transition-all">
              chevron_right
            </span>
          </div>
          <div>
            <span className="block text-4xl font-bold text-primary mb-1">
              {getCount(data, "matters.total")}
            </span>
            <span className="text-label-md text-on-surface-variant uppercase tracking-wider">
              Matérias
            </span>
          </div>
        </Link>

        <Link href="/editions" className="block bg-white border border-outline-variant p-6 rounded-xl shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-lg bg-secondary/5 text-secondary flex items-center justify-center group-hover:bg-secondary group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-3xl">auto_stories</span>
            </div>
            <span className="material-symbols-outlined text-outline-variant group-hover:text-secondary group-hover:translate-x-1 transition-all">
              chevron_right
            </span>
          </div>
          <div>
            <span className="block text-4xl font-bold text-primary mb-1">
              {getCount(data, "editions.total")}
            </span>
            <span className="text-label-md text-on-surface-variant uppercase tracking-wider">
              Edições
            </span>
          </div>
        </Link>

        <Link href="/editions" className="block bg-white border border-outline-variant p-6 rounded-xl shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-lg bg-tertiary-container/20 text-on-tertiary-container flex items-center justify-center group-hover:bg-tertiary-container group-hover:text-on-tertiary transition-colors">
              <span className="material-symbols-outlined text-3xl">publish</span>
            </div>
            <span className="material-symbols-outlined text-outline-variant group-hover:text-tertiary-container group-hover:translate-x-1 transition-all">
              chevron_right
            </span>
          </div>
          <div>
            <span className="block text-4xl font-bold text-primary mb-1">
              {getCount(data, "editions.published")}
            </span>
            <span className="text-label-md text-on-surface-variant uppercase tracking-wider">
              Publicadas
            </span>
          </div>
        </Link>

        <Link href="/matters" className="block bg-white border border-outline-variant p-6 rounded-xl shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-lg bg-error-container/20 text-error flex items-center justify-center group-hover:bg-error group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-3xl">report</span>
            </div>
            <span className="material-symbols-outlined text-outline-variant group-hover:text-error group-hover:translate-x-1 transition-all">
              chevron_right
            </span>
          </div>
          <div>
            <span className="block text-4xl font-bold text-primary mb-1">
              {getCount(data, "matters.review")}
            </span>
            <span className="text-label-md text-on-surface-variant uppercase tracking-wider">
              Em Revisão
            </span>
          </div>
        </Link>
      </section>

      {/* Status Details */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Matérias Status */}
          {data.matters && (
            <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col">
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-background/50">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">article</span>
                  <h3 className="text-headline-sm font-headline-sm">Matérias</h3>
                </div>
                <span className="bg-surface-container-high px-2 py-1 rounded text-xs font-semibold text-on-surface-variant">
                  {totalMatters} total
                </span>
              </div>
              <div className="p-6 flex-1 space-y-6">
                <div className="space-y-4">
                  <DonutRow label="Rascunho" count={data.matters.draft} total={totalMatters} color="#94a3b8" />
                  <DonutRow label="Em Revisão" count={data.matters.review} total={totalMatters} color="#a8c8fa" />
                  <DonutRow label="Aprovadas" count={data.matters.approved} total={totalMatters} color="#8cf5b1" />
                  <DonutRow label="Publicadas" count={data.matters.published} total={totalMatters} color="#001631" activeColor="border-4 border-primary" />
                </div>
              </div>
              <Link
                href="/matters"
                className="block text-center p-4 bg-primary/5 text-primary text-label-md hover:bg-primary/10 transition-colors border-t border-outline-variant"
              >
                Ver todas as matérias
              </Link>
            </div>
          )}

          {/* Edições Status */}
          {data.editions && (
            <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col">
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-background/50">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">library_books</span>
                  <h3 className="text-headline-sm font-headline-sm">Edições</h3>
                </div>
                <span className="bg-surface-container-high px-2 py-1 rounded text-xs font-semibold text-on-surface-variant">
                  {totalEditions} total
                </span>
              </div>
              <div className="p-6 flex-1 space-y-6">
                <div className="space-y-4">
                  <DonutRow label="Rascunho" count={data.editions.draft} total={totalEditions} color="#94a3b8" />
                  <DonutRow label="PDF Gerado" count={data.editions.pdf_generated} total={totalEditions} color="#ba1a1a" />
                  <DonutRow label="Assinadas" count={data.editions.signed} total={totalEditions} color="#a9c7ff" />
                  <DonutRow label="Publicadas" count={data.editions.published} total={totalEditions} color="#006d3d" activeColor="border-4 border-secondary" />
                </div>
              </div>
              <Link
                href="/editions"
                className="block text-center p-4 bg-secondary/5 text-secondary text-label-md hover:bg-secondary/10 transition-colors border-t border-outline-variant"
              >
                Ver todas as edições
              </Link>
            </div>
          )}
        </div>

        {/* Right Side: Quick Actions & System Status */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-on-surface-variant">bolt</span>
              <h3 className="text-headline-sm font-headline-sm">Ações Rápidas</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Link
                href="/matters/new"
                className="flex flex-col items-center justify-center p-6 rounded-xl bg-primary text-on-primary hover:opacity-90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined mb-2 text-3xl">add_box</span>
                <span className="text-label-md text-xs">Nova Matéria</span>
              </Link>
              <Link
                href="/editions/new"
                className="flex flex-col items-center justify-center p-6 rounded-xl bg-secondary text-on-secondary hover:opacity-90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined mb-2 text-3xl">menu_book</span>
                <span className="text-label-md text-xs">Nova Edição</span>
              </Link>
              <Link
                href="/importar"
                className="flex flex-col items-center justify-center p-6 rounded-xl bg-on-tertiary-fixed-variant text-white hover:opacity-90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined mb-2 text-3xl">upload</span>
                <span className="text-label-md text-xs">Importar</span>
              </Link>
              <Link
                href="/users"
                className="flex flex-col items-center justify-center p-6 rounded-xl text-white hover:opacity-90 active:scale-95 transition-all"
                style={{ backgroundColor: "#e67e22" }}
              >
                <span className="material-symbols-outlined mb-2 text-3xl">group</span>
                <span className="text-label-md text-xs">Usuários</span>
              </Link>
            </div>
          </div>

          <div className="bg-surface-container rounded-xl p-6 shadow-sm border border-outline-variant/30">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-label-md text-on-surface-variant">Status do Sistema</h4>
              <div className="flex items-center gap-1 text-secondary">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span className="text-label-md text-[10px] font-bold">ONLINE</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-label-md text-xs text-on-surface-variant">
                <span>Publicações concluídas</span>
                <span>
                  {getCount(data, "matters.published") + getCount(data, "editions.published")}/
                  {totalMatters + totalEditions}
                </span>
              </div>
              <div className="w-full h-3 bg-white/50 rounded-full overflow-hidden border border-outline-variant/20">
                <div
                  className="h-full bg-secondary rounded-full shadow-[0_0_8px_rgba(0,109,61,0.5)] transition-all duration-1000"
                  style={{
                    width: `${
                      totalMatters + totalEditions > 0
                        ? Math.min(
                            100,
                            ((getCount(data, "matters.published") + getCount(data, "editions.published")) /
                              Math.max(totalMatters + totalEditions, 1)) *
                              100,
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-outline italic text-right">
                Última atualização: Hoje, {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AdminShell>
      <DashboardContent />
    </AdminShell>
  );
}

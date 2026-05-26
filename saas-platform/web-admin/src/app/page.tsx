"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import AppLayout from "@/components/layout/AppLayout";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { useRouter } from "next/navigation";

interface ModuleInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  is_active: boolean;
  admin_url: string | null;
}

interface DashboardData {
  modules: ModuleInfo[];
  last_publication_ago: string;
  online_users_count: number;
  system_status: string;
}

const moduleConfig: Record<string, { icon: string; gradient: string }> = {
  diario: { icon: "description", gradient: "from-[#001631] via-[#001631] to-[#5392ef]" },
  financeiro: { icon: "account_balance_wallet", gradient: "from-[#006d3d] via-[#006d3d] to-[#73db9a]" },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingModuleId, setOpeningModuleId] = useState<string | null>(null);
  const [lastPublication, setLastPublication] = useState("—");
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [systemStatus, setSystemStatus] = useState("100% Operacional");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    api<DashboardData>("/dashboard")
      .then((data) => {
        setModules(data.modules || []);
        setLastPublication(data.last_publication_ago || "—");
        setOnlineUsers(data.online_users_count ?? 0);
        setSystemStatus(data.system_status || "100% Operacional");
      })
      .catch(() => toast.error("Erro ao carregar módulos"))
      .finally(() => setLoading(false));
  }, [user]);

  const router = useRouter();

  const openModule = async (mod: ModuleInfo) => {
    if (mod.slug === "financeiro") {
      router.push("/financeiro");
      return;
    }
    setOpeningModuleId(mod.id);
    try {
      const res = await api<{ module_token: string; module_url: string }>("/auth/module-access", {
        method: "POST",
        body: { module_slug: mod.slug },
      });
      const joiner = res.module_url.includes("?") ? "&" : "?";
      window.location.href = `${res.module_url}${joiner}token=${encodeURIComponent(res.module_token)}`;
    } catch (err: any) {
      toast.error(err.message || "Erro ao abrir módulo");
      setOpeningModuleId(null);
    }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <AppLayout title="GovSistem">
      <section className="mb-stack-lg">
        <h2 className="text-headline-lg text-[#001631] mb-2">{greeting()}, <span className="text-on-tertiary-container">{user?.name || "Admin"}</span>.</h2>
        <p className="text-body-lg text-on-surface-variant">Escolha o módulo que deseja acessar para iniciar suas atividades institucionais.</p>
      </section>

      {loading ? (
        <div className="bento-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-container-high" />
          ))}
        </div>
      ) : modules.length > 0 ? (
        <>
          <div className="bento-grid">
            {modules.map((mod) => {
              const opening = openingModuleId === mod.id;
              const cfg = moduleConfig[mod.slug] || { icon: "extension", gradient: "from-[#001631] via-[#001631] to-[#5392ef]" };
              return (
                <div
                  key={mod.id}
                  onClick={() => mod.is_active && !opening && openModule(mod)}
                  className={`group relative bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 module-card-hover flex flex-col h-full ${mod.is_active ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <div className={`h-32 bg-gradient-to-br ${cfg.gradient} relative overflow-hidden`}>
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />
                    <div className="absolute inset-0 opacity-50" />
                    <div className="absolute bottom-4 left-6 flex items-center justify-center w-14 h-14 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
                      <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                    </div>
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-headline-sm text-[#001631]">{mod.name}</h3>
                      <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant text-[10px] rounded uppercase tracking-wider font-semibold">v{mod.version}</span>
                    </div>
                    <p className="text-body-md text-on-surface-variant mb-8 flex-1">
                      {mod.description || "Módulo do sistema de gestão."}
                    </p>
                    <div className="flex items-center justify-between mt-auto">
                      {opening ? (
                        <span className="flex items-center gap-2 text-label-md text-[#001631] font-bold">
                          <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                          Abrindo...
                        </span>
                      ) : (
                        <>
                          <span className="text-label-md text-[#001631] font-bold group-hover:underline">Acessar Módulo</span>
                          <span className="material-symbols-outlined text-[#001631] cta-arrow transition-transform">arrow_forward</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="relative bg-surface-container-low rounded-xl p-8 flex flex-col justify-center border border-dashed border-outline-variant overflow-hidden">
              <div className="z-10">
                <div className="w-12 h-12 rounded-full bg-[#001631]/10 flex items-center justify-center mb-6 text-[#001631]">
                  <span className="material-symbols-outlined">analytics</span>
                </div>
                <h4 className="text-headline-sm text-[#001631] mb-2">Visão Geral</h4>
                <p className="text-body-sm text-on-surface-variant mb-6 leading-relaxed">
                  Acompanhe o status global de todos os módulos ativos em sua organização através do painel de métricas.
                </p>
              </div>
              <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
                <span className="material-symbols-outlined text-[200px]">insights</span>
              </div>
            </div>
          </div>

          <section className="mt-stack-lg grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-surface rounded-lg p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#001631]/5 flex items-center justify-center text-[#001631]">
                <span className="material-symbols-outlined">published_with_changes</span>
              </div>
              <div>
                <p className="text-label-md text-on-surface-variant uppercase">Última Publicação</p>
                <p className="text-body-md font-bold text-[#001631]">{lastPublication}</p>
              </div>
            </div>
            <div className="bg-surface rounded-lg p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#006d3d]/5 flex items-center justify-center text-[#006d3d]">
                <span className="material-symbols-outlined">person_check</span>
              </div>
              <div>
                <p className="text-label-md text-on-surface-variant uppercase">Usuários Online</p>
                <p className="text-body-md font-bold text-[#001631]">{onlineUsers} Colaborador{onlineUsers !== 1 ? 'es' : ''}</p>
              </div>
            </div>
            <div className="bg-surface rounded-lg p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#5392ef]/5 flex items-center justify-center text-[#5392ef]">
                <span className="material-symbols-outlined">security</span>
              </div>
              <div>
                <p className="text-label-md text-on-surface-variant uppercase">Status do Sistema</p>
                <p className="text-body-md font-bold text-[#006d3d]">{systemStatus}</p>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="bg-surface-container-low rounded-xl p-8 text-center border border-dashed border-outline-variant">
          <p className="text-body-md text-on-surface-variant">Nenhum módulo ativo encontrado.</p>
        </div>
      )}
    </AppLayout>
  );
}

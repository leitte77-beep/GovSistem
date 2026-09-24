"use client";

import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import {
  ArrowRight, Loader2, Building2, Users, Blocks, UserCheck, ShieldCheck, HardDrive,
  Newspaper, Activity, Plus, Settings2, ReceiptText, CircleAlert, CircleCheck, CircleHelp,
  FileText, Wallet, Bot, ClipboardCheck, SmilePlus, HeartHandshake, FolderOpen, Megaphone,
  Gavel, LayoutGrid, Sparkles, Lock,
} from "lucide-react";

interface ModuleInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  is_active: boolean;
  admin_url: string | null;
}

interface ModuleHealth {
  slug: string;
  name: string;
  status: "online" | "degraded" | "offline" | "unknown";
  detail: string | null;
  latency_ms: number | null;
}

interface DashboardData {
  modules: ModuleInfo[];
  module_health: ModuleHealth[];
  is_platform_admin: boolean;
  organization_name: string | null;
  total_organizations: number;
  active_organizations: number;
  total_users: number;
  total_subscriptions: number;
  active_subscriptions: number;
  monthly_recurring_revenue_cents: number;
  recent_invoices_count: number;
  last_publication_ago: string;
  online_users_count: number;
  system_status: string;
  disk: { total_gb: number; used_gb: number; free_gb: number; percent_used: number } | null;
}

const MODULE_VISUALS: Record<string, { icon: React.ElementType; gradient: string }> = {
  diario: { icon: FileText, gradient: "from-[#001631] to-[#5392ef]" },
  financeiro: { icon: Wallet, gradient: "from-[#006d3d] to-[#73db9a]" },
  chatgov: { icon: Bot, gradient: "from-[#075e54] to-[#25D366]" },
  govtask: { icon: ClipboardCheck, gradient: "from-[#1e3a5f] to-[#60a5fa]" },
  govavalia: { icon: SmilePlus, gradient: "from-[#15524c] to-[#4ecdc4]" },
  govsocial: { icon: HeartHandshake, gradient: "from-[#5b2172] to-[#c77dff]" },
  govdoc: { icon: FolderOpen, gradient: "from-[#312e81] to-[#818cf8]" },
  govouve: { icon: Megaphone, gradient: "from-[#0b3b5c] to-[#38bdf8]" },
  govpro: { icon: Gavel, gradient: "from-[#3f2d13] to-[#f59e0b]" },
};

const NEWS_MODULES = new Set(["chatgov", "govsocial", "diario"]);

const HEALTH_STYLES: Record<ModuleHealth["status"], { dot: string; chip: string; label: string; Icon: React.ElementType }> = {
  online: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Operacional", Icon: CircleCheck },
  degraded: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 ring-amber-200", label: "Instável", Icon: CircleAlert },
  offline: { dot: "bg-red-500", chip: "bg-red-50 text-red-700 ring-red-200", label: "Fora do ar", Icon: CircleAlert },
  unknown: { dot: "bg-on-surface-variant/40", chip: "bg-surface-container-high text-on-surface-variant ring-outline-variant", label: "Sem monitoramento", Icon: CircleHelp },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function firstName(name?: string) {
  if (!name) return "";
  return name.trim().split(/\s+/)[0];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingModuleId, setOpeningModuleId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    api<DashboardData>("/dashboard")
      .then(setData)
      .catch(() => toast.error("Erro ao carregar o painel"))
      .finally(() => setLoading(false));
  }, [user]);

  const isAdmin = !!(data?.is_platform_admin ?? user?.is_platform_admin);
  const modules = data?.modules ?? [];

  const healthBySlug = useMemo(() => {
    const map: Record<string, ModuleHealth> = {};
    (data?.module_health ?? []).forEach((h) => { map[h.slug] = h; });
    return map;
  }, [data]);

  const healthSummary = useMemo(() => {
    const list = data?.module_health ?? [];
    return {
      online: list.filter((m) => m.status === "online").length,
      problems: list.filter((m) => m.status === "degraded" || m.status === "offline").length,
      monitored: list.filter((m) => m.status !== "unknown").length,
    };
  }, [data]);

  const openModule = async (mod: ModuleInfo) => {
    if (mod.slug === "financeiro") { router.push("/financeiro"); return; }
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

  /* ------------------------------------------------------------ elementos */

  const KpiCard = ({ icon, label, value, hint, tone, onClick }: {
    icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; tone: string; onClick?: () => void;
  }) => {
    const Wrapper: any = onClick ? "button" : "div";
    return (
      <Wrapper
        onClick={onClick}
        className={`flex items-center gap-3 p-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-left transition-all ${
          onClick ? "hover:border-outline hover:shadow-sm active:scale-[0.99]" : ""
        }`}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tone}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-on-surface-variant font-medium truncate">{label}</p>
          <p className="text-xl font-bold text-on-surface leading-tight">{value}</p>
          {hint && <p className="text-[11px] text-on-surface-variant mt-0.5 truncate">{hint}</p>}
        </div>
      </Wrapper>
    );
  };

  const ModuleCard = ({ mod }: { mod: ModuleInfo }) => {
    const visual = MODULE_VISUALS[mod.slug] ?? { icon: LayoutGrid, gradient: "from-[#001631] to-[#5392ef]" };
    const Icon = visual.icon;
    const opening = openingModuleId === mod.id;
    const health = isAdmin ? healthBySlug[mod.slug] : undefined;
    const disabled = !mod.is_active || opening;

    return (
      <button
        type="button"
        onClick={() => !disabled && openModule(mod)}
        disabled={!mod.is_active}
        className={`group text-left bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden shadow-sm transition-all duration-200 flex flex-col h-full ${
          mod.is_active ? "hover:shadow-lg hover:-translate-y-0.5 cursor-pointer" : "opacity-60 cursor-not-allowed"
        }`}
      >
        {/* Faixa colorida */}
        <div className={`relative h-24 bg-gradient-to-br ${visual.gradient}`}>
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "22px 22px" }}
          />
          <div className="absolute -bottom-5 left-5 w-12 h-12 rounded-xl bg-surface-container-lowest border border-outline-variant shadow-sm flex items-center justify-center">
            <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${visual.gradient} flex items-center justify-center`}>
              <Icon size={18} className="text-white" />
            </span>
          </div>
          {health && (
            <span
              title={`${health.detail ?? ""}${health.latency_ms ? ` · ${health.latency_ms}ms` : ""}`}
              className={`absolute top-3 right-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/15 text-white backdrop-blur-sm`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${HEALTH_STYLES[health.status].dot}`} />
              {HEALTH_STYLES[health.status].label}
            </span>
          )}
        </div>

        <div className="p-5 pt-8 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-base font-bold text-on-surface leading-snug">{mod.name}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {NEWS_MODULES.has(mod.slug) && (
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); router.push(`/novidades/${mod.slug}`); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); router.push(`/novidades/${mod.slug}`); } }}
                  title="Ver novidades desta versão"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-primary-50 text-primary-700 ring-1 ring-primary-200 hover:bg-primary-100 transition-colors"
                >
                  <Sparkles size={10} /> Novidades
                </span>
              )}
              <span className="px-2 py-0.5 rounded-lg bg-surface-container text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                v{mod.version}
              </span>
            </div>
          </div>

          <p className="text-sm text-on-surface-variant leading-relaxed flex-1 line-clamp-3">
            {mod.description || "Módulo do sistema de gestão."}
          </p>

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-outline-variant/70">
            {opening ? (
              <span className="flex items-center gap-2 text-sm font-bold text-primary-700">
                <Loader2 size={16} className="animate-spin" /> Abrindo...
              </span>
            ) : mod.is_active ? (
              <>
                <span className="text-sm font-bold text-primary-700 group-hover:underline">Acessar módulo</span>
                <ArrowRight size={18} className="text-primary-700 transition-transform group-hover:translate-x-1" />
              </>
            ) : (
              <span className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant">
                <Lock size={15} /> Indisponível
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  /* ---------------------------------------------------------------- view */

  return (
    <AppLayout title="Painel">
      {/* Saudação */}
      <section className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight">
            {greeting()}, <span className="text-primary-700">{firstName(user?.name) || "bem-vindo"}</span>.
          </h2>
          {isAdmin ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-violet-50 text-violet-700 ring-1 ring-violet-200">
              <ShieldCheck size={12} /> Administrador da plataforma
            </span>
          ) : data?.organization_name ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-surface-container-high text-on-surface-variant">
              <Building2 size={12} /> {data.organization_name}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-on-surface-variant">
          {isAdmin
            ? "Visão geral da plataforma: acompanhe organizações, usuários e a saúde dos módulos."
            : "Escolha o módulo que deseja acessar para iniciar suas atividades."}
        </p>
      </section>

      {/* ---------------- Painel do administrador ---------------- */}
      {isAdmin && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[74px] rounded-xl bg-surface-container-high animate-pulse" />
              ))
            ) : (
              <>
                <KpiCard
                  icon={<Building2 size={20} />} tone="bg-primary-100 text-primary-600"
                  label="Organizações" value={data?.total_organizations ?? 0}
                  hint={`${data?.active_organizations ?? 0} ativas`}
                  onClick={() => router.push("/orgaos")}
                />
                <KpiCard
                  icon={<Users size={20} />} tone="bg-emerald-100 text-emerald-600"
                  label="Usuários" value={data?.total_users ?? 0}
                  hint="Cadastrados na plataforma"
                  onClick={() => router.push("/usuarios")}
                />
                <KpiCard
                  icon={<UserCheck size={20} />} tone="bg-cyan-100 text-cyan-600"
                  label="Sessões ativas" value={data?.online_users_count ?? 0}
                  hint="Usuários conectados agora"
                />
                <KpiCard
                  icon={<Blocks size={20} />} tone="bg-violet-100 text-violet-600"
                  label="Módulos" value={modules.length}
                  hint={healthSummary.problems > 0 ? `${healthSummary.problems} com problema` : "Todos respondendo"}
                  onClick={() => router.push("/modulos")}
                />
              </>
            )}
          </div>

          {/* Saúde da plataforma + infraestrutura */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl border border-outline-variant p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity size={17} className="text-on-surface-variant" />
                  <h3 className="text-sm font-bold text-on-surface">Saúde dos módulos</h3>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ring-1 ${
                  healthSummary.problems > 0
                    ? "bg-amber-50 text-amber-700 ring-amber-200"
                    : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                }`}>
                  {healthSummary.problems > 0
                    ? `${healthSummary.problems} com problema`
                    : `${healthSummary.online} operacionais`}
                </span>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="h-9 rounded-lg bg-surface-container-high animate-pulse" />)}
                </div>
              ) : (data?.module_health?.length ?? 0) === 0 ? (
                <p className="text-sm text-on-surface-variant">Nenhum módulo monitorado.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {data!.module_health.map((h) => {
                    const style = HEALTH_STYLES[h.status];
                    return (
                      <div
                        key={h.slug}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-container-low transition-colors"
                        title={h.detail || undefined}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                        <span className="text-sm font-medium text-on-surface truncate flex-1">{h.name}</span>
                        <span className="text-[11px] text-on-surface-variant shrink-0">
                          {h.status === "unknown"
                            ? "sem monitor"
                            : h.latency_ms != null
                            ? `${h.latency_ms} ms`
                            : style.label.toLowerCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <HardDrive size={17} className="text-on-surface-variant" />
                <h3 className="text-sm font-bold text-on-surface">Infraestrutura</h3>
              </div>

              {data?.disk ? (
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-xs text-on-surface-variant">Uso de disco</span>
                    <span className={`text-sm font-bold ${
                      data.disk.percent_used > 85 ? "text-red-600" : data.disk.percent_used > 70 ? "text-amber-600" : "text-on-surface"
                    }`}>
                      {data.disk.percent_used}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        data.disk.percent_used > 85 ? "bg-red-500" : data.disk.percent_used > 70 ? "bg-amber-500" : "bg-primary-600"
                      }`}
                      style={{ width: `${data.disk.percent_used}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-1.5">
                    {data.disk.free_gb} GB livres de {data.disk.total_gb} GB
                  </p>
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant">Sem dados de disco.</p>
              )}

              <div className="flex items-center gap-3 pt-3 border-t border-outline-variant/70">
                <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-on-surface-variant shrink-0">
                  <Newspaper size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-on-surface-variant">Última publicação no Diário</p>
                  <p className="text-sm font-bold text-on-surface truncate">{data?.last_publication_ago || "—"}</p>
                </div>
              </div>

              {(data?.recent_invoices_count ?? 0) > 0 && (
                <button
                  onClick={() => router.push("/faturas")}
                  className="flex items-center gap-3 pt-3 border-t border-outline-variant/70 text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                    <ReceiptText size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-on-surface-variant">Faturas pendentes</p>
                    <p className="text-sm font-bold text-on-surface">{data!.recent_invoices_count}</p>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Atalhos administrativos */}
          <div className="flex flex-wrap items-center gap-2 mb-8">
            <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mr-1">Atalhos</span>
            <button onClick={() => router.push("/orgaos/new")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors">
              <Plus size={15} /> Nova organização
            </button>
            <button onClick={() => router.push("/usuarios/new")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors">
              <Plus size={15} /> Novo usuário
            </button>
            <button onClick={() => router.push("/modulos")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors">
              <Blocks size={15} /> Gerenciar módulos
            </button>
            <button onClick={() => router.push("/assinaturas")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors">
              <ReceiptText size={15} /> Assinaturas
            </button>
            <button onClick={() => router.push("/configuracoes")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors">
              <Settings2 size={15} /> Configurações
            </button>
          </div>
        </>
      )}

      {/* ---------------- Módulos ---------------- */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-on-surface">
              {isAdmin ? "Todos os módulos" : "Seus módulos"}
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {isAdmin
                ? "Você tem acesso a todos os módulos da plataforma."
                : "Módulos liberados para o seu perfil."}
            </p>
          </div>
          {!loading && modules.length > 0 && (
            <span className="text-xs text-on-surface-variant">{modules.length} disponíveis</span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-outline-variant overflow-hidden bg-surface-container-lowest animate-pulse">
                <div className="h-24 bg-surface-container-high" />
                <div className="p-5 space-y-3">
                  <div className="h-4 w-32 bg-surface-container-high rounded" />
                  <div className="h-3 w-full bg-surface-container-high/70 rounded" />
                  <div className="h-3 w-2/3 bg-surface-container-high/70 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : modules.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-10 text-center border border-dashed border-outline-variant">
            <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant mx-auto mb-3">
              <Blocks size={26} />
            </div>
            <p className="text-sm font-semibold text-on-surface">Nenhum módulo liberado</p>
            <p className="text-xs text-on-surface-variant mt-1 max-w-sm mx-auto">
              {isAdmin
                ? "Nenhum módulo ativo cadastrado na plataforma."
                : "Seu usuário ainda não tem módulos liberados. Fale com o administrador do seu órgão para solicitar acesso."}
            </p>
            {isAdmin && (
              <button onClick={() => router.push("/modulos")}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-on-primary rounded-lg text-sm font-semibold hover:bg-primary-700">
                <Blocks size={15} /> Gerenciar módulos
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {modules.map((mod) => <ModuleCard key={mod.id} mod={mod} />)}
          </div>
        )}
      </section>

      {/* Rodapé do usuário comum */}
      {!isAdmin && !loading && modules.length > 0 && (
        <p className="text-xs text-on-surface-variant mt-6">
          Precisa de acesso a outro módulo? Fale com o administrador do seu órgão.
        </p>
      )}
    </AppLayout>
  );
}

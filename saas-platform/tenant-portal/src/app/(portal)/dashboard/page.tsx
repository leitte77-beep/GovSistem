"use client";
import { useEffect, useState } from "react";
import {
  Users,
  Blocks,
  ShieldCheck,
  Activity,
  UserPlus,
  ScrollText,
  AlertTriangle,
  Settings2,
  Star,
  ArrowUpRight,
  Building2,
  Clock,
} from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import type { ModuleCard as ModuleCardData } from "@/lib/auth-provider";
import ModuleCard from "@/components/module-card";
import { actionLabel, formatRelative } from "@/lib/format";

interface DashboardData {
  organization: { name: string; slug: string };
  counts: {
    users_total: number;
    users_active: number;
    users_suspended?: number;
    managers_active: number;
    modules_contracted: number;
    grants_total: number;
    grants_pending_review: number;
  };
  recent_activity: Array<{
    id: string;
    action: string;
    actor_email?: string | null;
    created_at?: string | null;
    details?: Record<string, unknown> | null;
  }>;
}

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

const KPI_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  users_active: { bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-100" },
  users_suspended: { bg: "bg-red-50", text: "text-red-600", ring: "ring-red-100" },
  managers_active: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
  modules_contracted: { bg: "bg-cyan-50", text: "text-cyan-600", ring: "ring-cyan-100" },
  grants_total: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  grants_pending_review: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
};

export default function DashboardPage() {
  const { ctx } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("gov_favorite_modules");
    if (stored) setFavorites(JSON.parse(stored));
  }, []);

  const toggleFavorite = (slug: string) => {
    setFavorites((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      localStorage.setItem("gov_favorite_modules", JSON.stringify(next));
      return next;
    });
  };

  const openModule = async (m: ModuleCardData) => {
    setError("");
    setOpening(m.slug);
    try {
      const res = await api<{ module_token: string; module_url: string }>("/auth/module-access", {
        method: "POST",
        body: { module_slug: m.slug },
      });
      const joiner = res.module_url.includes("?") ? "&" : "?";
      window.location.href = `${res.module_url}${joiner}token=${encodeURIComponent(res.module_token)}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acessar o módulo");
      setOpening(null);
    }
  };

  useEffect(() => {
    if (ctx?.user.is_manager) {
      api<DashboardData>("/tenant/dashboard").then(setData).catch((e) => setError(e.message));
    }
  }, [ctx?.user.is_manager]);

  const isManager = ctx?.user.is_manager;
  const counts = data?.counts;
  const modules = ctx?.modules ?? [];
  const authorizedModules = modules.filter((m) => m.authorized);
  const favModules = authorizedModules.filter((m) => favorites.includes(m.slug));
  const otherModules = authorizedModules.filter((m) => !favorites.includes(m.slug));

  const kpis = [
    { key: "users_active", label: "Usuários ativos", value: counts?.users_active ?? "—", icon: Users, href: "/usuarios" },
    { key: "users_suspended", label: "Usuários suspensos", value: counts?.users_suspended ?? "—", icon: AlertTriangle, href: "/usuarios" },
    { key: "managers_active", label: "Gestores ativos", value: counts?.managers_active ?? "—", icon: ShieldCheck, href: "/usuarios" },
    { key: "modules_contracted", label: "Módulos contratados", value: counts?.modules_contracted ?? "—", icon: Blocks, href: "/modulos-contratados" },
    { key: "grants_total", label: "Grants concedidos", value: counts?.grants_total ?? "—", icon: Activity, href: "/acessos" },
    { key: "grants_pending_review", label: "Pendências de revisão", value: counts?.grants_pending_review ?? "—", icon: Settings2, href: "/acessos" },
  ];

  const heroStats = [
    { label: "Usuários ativos", value: counts?.users_active ?? 0, icon: Users },
    { label: "Módulos contratados", value: counts?.modules_contracted ?? 0, icon: Blocks },
    { label: "Grants concedidos", value: counts?.grants_total ?? 0, icon: Activity },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white shadow-lg"
        style={{ background: "linear-gradient(135deg, #002b54 0%, #1e3a8a 60%, #2563eb 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm text-white/80">
              <Clock size={14} />
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              {greeting()}, <span className="text-cyan-300">{firstName(ctx?.user.name) || "bem-vindo"}</span> 👋
            </h1>
            <p className="mt-1 text-sm text-white/85">
              Visão geral de {data?.organization.name ?? ctx?.organization.name}.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {heroStats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <Icon size={18} className="mb-1 text-cyan-300" />
                  <p className="text-xl font-bold leading-none">{s.value}</p>
                  <p className="mt-1 text-[11px] text-white/75">{s.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/usuarios"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
        >
          <UserPlus size={16} /> Novo usuário
        </Link>
        <Link
          href="/acessos"
          className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-low"
        >
          <Settings2 size={16} /> Gerenciar acessos
        </Link>
        <Link
          href="/modulos-contratados"
          className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-low"
        >
          <Blocks size={16} /> Ver módulos
        </Link>
        <Link
          href="/auditoria"
          className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-low"
        >
          <ScrollText size={16} /> Ver auditoria
        </Link>
      </div>

      {isManager &&
        (error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>
        ) : (
          <>
            {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map((k) => {
              const st = KPI_STYLES[k.key];
              const Icon = k.icon;
              return (
                <Link
                  key={k.key}
                  href={k.href}
                  className="group rounded-xl border bg-surface-container-lowest p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${st.bg} ${st.text} ${st.ring}`}>
                    <Icon size={19} />
                  </div>
                  <p className="text-2xl font-bold leading-none text-on-surface">{k.value}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
                    {k.label}
                    <ArrowUpRight size={12} className="text-on-surface-variant opacity-0 transition group-hover:opacity-100" />
                  </p>
                </Link>
              );
            })}
          </div>

          {/* Atividade + visão rápida */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border bg-surface-container-lowest p-5 shadow-sm lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-medium text-on-surface">Últimas alterações</h2>
                <Link href="/auditoria" className="text-sm font-medium text-primary-700 hover:underline">
                  Ver auditoria completa
                </Link>
              </div>
              {data && data.recent_activity.length ? (
                <ul className="divide-y">
                  {data.recent_activity.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary-600" />
                        <span className="font-medium text-on-surface">{actionLabel(a.action)}</span>
                        {a.actor_email && (
                          <span className="truncate text-on-surface-variant">— {a.actor_email}</span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-on-surface-variant">{formatRelative(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-on-surface-variant">Nenhuma atividade recente.</p>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border bg-surface-container-lowest p-5 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 font-medium text-on-surface">
                  <Building2 size={16} className="text-primary-700" /> Órgão
                </h2>
                <p className="font-semibold text-on-surface">{data?.organization.name ?? ctx?.organization.name}</p>
                <p className="text-xs text-on-surface-variant">@{data?.organization.slug ?? ctx?.organization.slug}</p>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">Gestores ativos</span>
                    <span className="font-semibold text-on-surface">{counts?.managers_active ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">Pendências de revisão</span>
                    <span className="font-semibold text-amber-600">{counts?.grants_pending_review ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </>
        ))}

        {/* Meus módulos */}
        <div className="rounded-xl border bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <Blocks size={18} className="text-primary-700" />
            <h2 className="font-medium text-on-surface">Meus módulos</h2>
          </div>
          <p className="mb-4 text-sm text-on-surface-variant">
            Use a estrela para fixar seus módulos favoritos no topo.
          </p>

          {modules.length === 0 ? (
            <p className="rounded-lg bg-surface-container-low px-4 py-6 text-center text-sm text-on-surface-variant">
              Nenhum módulo liberado para você. Fale com o gestor do órgão para vincular seus acessos.
            </p>
          ) : (
            <div className="space-y-6">
              {favModules.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {favModules.map((m) => (
                    <div key={m.slug} className="relative">
                      <button
                        onClick={() => toggleFavorite(m.slug)}
                        aria-label={favorites.includes(m.slug) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        className="absolute right-3 top-3 z-10 rounded-lg bg-white/80 p-1.5 text-amber-500 shadow-sm transition hover:bg-white"
                      >
                        <Star size={16} fill="currentColor" />
                      </button>
                      <ModuleCard
                        slug={m.slug}
                        name={m.name}
                        description={m.description}
                        version={m.version}
                        is_active={m.is_active}
                        authorized={m.authorized}
                        requires_review={m.requires_review}
                        opening={opening === m.slug}
                        onOpen={() => openModule(m)}
                      />
                    </div>
                  ))}
                </div>
              )}
              {otherModules.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {otherModules.map((m) => (
                    <div key={m.slug} className="relative">
                      <button
                        onClick={() => toggleFavorite(m.slug)}
                        aria-label="Adicionar aos favoritos"
                        className="absolute right-3 top-3 z-10 rounded-lg bg-white/80 p-1.5 text-on-surface-variant shadow-sm transition hover:bg-white hover:text-amber-500"
                      >
                        <Star size={16} />
                      </button>
                      <ModuleCard
                        slug={m.slug}
                        name={m.name}
                        description={m.description}
                        version={m.version}
                        is_active={m.is_active}
                        authorized={m.authorized}
                        requires_review={m.requires_review}
                        opening={opening === m.slug}
                        onOpen={() => openModule(m)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        </div>
    </div>
  );
}

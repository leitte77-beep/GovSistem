"use client";
import { useEffect, useState } from "react";
import { Users, Activity, AlertTriangle, RefreshCcw } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import ModuleCard, { moduleVisual } from "@/components/module-card";

interface ContractedModule {
  slug: string;
  name: string;
  description?: string | null;
  version: string;
  is_active: boolean;
  status: string;
  module_url?: string | null;
  users_with_grant: number;
  roles_in_use: string[];
  pending_review: number;
}

export default function ContractedModulesPage() {
  const [modules, setModules] = useState<ContractedModule[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ContractedModule[]>("/tenant/contracted-modules")
      .then(setModules)
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar módulos"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Módulos contratados</h1>
        <p className="text-sm text-on-surface-variant">
          Sistemas contratados pelo órgão, com usuários, roles em uso e pendências.
        </p>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-2 rounded-xl border bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
          <RefreshCcw size={16} className="animate-spin" /> Carregando módulos...
        </p>
      ) : modules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center">
          <p className="text-sm font-semibold text-on-surface">Nenhum módulo contratado</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-on-surface-variant">
            Este órgão ainda não contratou módulos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => {
            const Visual = moduleVisual(m.slug).icon;
            const statusOk = m.status === "Operacional";
            return (
              <ModuleCard
                key={m.slug}
                slug={m.slug}
                name={m.name}
                description={m.description}
                version={m.version}
                is_active={m.is_active}
                authorized
                disabled={!m.is_active}
                footer={
                  <div className="flex w-full flex-col gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusOk ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusOk ? "bg-green-500" : "bg-amber-500"}`} />
                        {m.status}
                      </span>
                      <div className="flex items-center gap-3 text-on-surface-variant">
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Users size={14} className="text-primary-700" /> {m.users_with_grant}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Activity size={14} className="text-primary-700" /> {m.roles_in_use.length} roles
                        </span>
                      </div>
                    </div>

                    {m.roles_in_use.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.roles_in_use.slice(0, 4).map((r) => (
                          <span key={r} className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                            {r}
                          </span>
                        ))}
                        {m.roles_in_use.length > 4 && (
                          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] text-on-surface-variant">
                            +{m.roles_in_use.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    {m.pending_review > 0 && (
                      <p className="flex items-center gap-1 text-xs text-amber-700">
                        <AlertTriangle size={13} /> {m.pending_review} permissões pendentes de revisão
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Link
                        href="/acessos"
                        className="rounded-lg border border-outline-variant px-3 py-2 text-center text-xs font-medium text-on-surface hover:bg-surface-container-low"
                      >
                        Gerenciar usuários
                      </Link>
                      <Link
                        href="/acessos"
                        className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-700"
                      >
                        <Visual size={13} /> Ver permissões
                      </Link>
                    </div>
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

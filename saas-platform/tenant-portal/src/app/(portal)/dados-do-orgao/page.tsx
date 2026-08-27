"use client";
import { useEffect, useState } from "react";
import { Building2, RefreshCcw } from "lucide-react";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";

interface OrgInfo {
  organization_id: string;
  slug: string;
  name: string;
  cnpj?: string | null;
  is_active: boolean;
  created_at?: string | null;
}

export default function OrgInfoPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<OrgInfo>("/tenant/org")
      .then(setOrg)
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar dados do órgão"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Dados do órgão</h1>
        <p className="text-sm text-on-surface-variant">Informações gerais da organização.</p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 rounded-xl border bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
          <RefreshCcw size={16} className="animate-spin" /> Carregando...
        </p>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>
      ) : (
        <div className="max-w-2xl rounded-xl border bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
            <Building2 size={24} />
          </div>
          <h2 className="text-xl font-semibold text-on-surface">{org?.name}</h2>
          <p className="text-sm text-on-surface-variant">@{org?.slug}</p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-on-surface-variant">CNPJ</p>
              <p className="font-medium text-on-surface">{org?.cnpj ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Situação</p>
              <p className="font-medium text-on-surface">{org?.is_active ? "Ativa" : "Inativa"}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Criada em</p>
              <p className="font-medium text-on-surface">{formatDate(org?.created_at)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

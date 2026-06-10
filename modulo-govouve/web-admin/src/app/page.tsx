"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Secretaria, DashboardData } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { Building2, Plus, Activity, CheckCircle, AlertTriangle } from "lucide-react";

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [dashData, setDashData] = useState<DashboardData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [secs, dd] = await Promise.all([
          api.listSecretarias(),
          api.getDashboard(),
        ]);
        setSecretarias(secs);
        setDashData(dd);
      } catch (e: any) {
        toast.error("Erro ao carregar dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse h-10 w-64 bg-[#E4E7EC] rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse h-28 bg-white rounded-card shadow-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-h1 text-[#101828] tracking-tight">
            Bem-vindo{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-body text-[#475467] mt-1">
            GovOuve — Avaliacao e Ouvidoria Municipal
          </p>
        </div>
        {hasRole("ADMIN", "OUVIDOR_GERAL") && (
          <Link href="/secretarias/nova" className="btn-primary">
            <Plus className="w-4 h-4" /> Nova Secretaria
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-card shadow-card p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-meta text-[#98A2B3]">Secretarias</p>
              <p className="text-h2 text-[#101828]">{dashData?.total_secretarias || 0}</p>
            </div>
          </div>
          <p className="text-meta text-[#667085] mt-3">
            {dashData?.secretarias_ativas || 0} ativas
          </p>
        </div>

        <div className="bg-white rounded-card shadow-card p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FEF0C7] flex items-center justify-center">
              <Activity className="w-5 h-5 text-[#B54708]" />
            </div>
            <div>
              <p className="text-meta text-[#98A2B3]">Manifestacoes em Aberto</p>
              <p className="text-h2 text-[#101828]">{dashData?.manifestacoes_abertas || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-card shadow-card p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FEE4E2] flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-[#B42318]" />
            </div>
            <div>
              <p className="text-meta text-[#98A2B3]">Vencidas</p>
              <p className="text-h2 text-[#101828]">{dashData?.manifestacoes_vencidas || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-card shadow-card p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#ECFDF3] flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-[#067647]" />
            </div>
            <div>
              <p className="text-meta text-[#98A2B3]">Avaliacoes Coletadas</p>
              <p className="text-h2 text-[#101828]">{dashData?.avaliacoes_coletadas || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {secretarias.length > 0 && (
        <div className="bg-white rounded-card shadow-card p-6">
          <h2 className="font-semibold text-[#101828] mb-4 text-lg">Secretarias</h2>
          <div className="space-y-2">
            {secretarias.map((s) => (
              <Link
                key={s.id}
                href={`/secretarias/${s.id}`}
                className="flex items-center justify-between p-4 rounded-card border border-[#E4E7EC] hover:bg-[#F6F7F9] hover:border-[#1D4ED8]/30 transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-semibold text-[#101828]">{s.nome}</p>
                  <p className="text-meta text-[#98A2B3]">{s.slug}.govsistem.com.br</p>
                </div>
                <span className={`status-pill ${s.ativo ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#F2F4F7] text-[#667085]"}`}>
                  {s.ativo ? "Ativa" : "Inativa"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

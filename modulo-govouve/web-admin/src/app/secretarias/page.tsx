"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, Secretaria } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";

export default function ListaSecretarias() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listSecretarias()
      .then(setSecretarias)
      .catch((e) => toast.error("Erro ao carregar secretarias"))
      .finally(() => setLoading(false));
  }, []);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 text-[#101828]">Secretarias</h1>
          <p className="text-body-sm text-[#667085] mt-1">Gerencie as secretarias do modulo de ouvidoria</p>
        </div>
        <Link href="/secretarias/nova" className="btn-primary">Nova Secretaria</Link>
      </div>

      {secretarias.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-12 text-center">
          <p className="text-body text-[#98A2B3]">Nenhuma secretaria cadastrada</p>
          <Link href="/secretarias/nova" className="btn-primary mt-4 inline-flex">Criar primeira secretaria</Link>
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-[#E4E7EC] text-left text-[#667085] text-meta">
                  <th className="py-3 px-4 font-medium">Nome</th>
                  <th className="py-3 px-4 font-medium">Slug</th>
                  <th className="py-3 px-4 font-medium">Ouvidor</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {secretarias.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-[#E4E7EC] hover:bg-[#F6F7F9] cursor-pointer"
                    onClick={() => router.push(`/secretarias/${s.id}`)}
                  >
                    <td className="py-3 px-4 font-medium text-[#101828]">{s.nome}</td>
                    <td className="py-3 px-4 text-[#475467] font-mono text-meta">{s.slug}</td>
                    <td className="py-3 px-4 text-[#475467]">{s.ouvidor_responsavel || "—"}</td>
                    <td className="py-3 px-4">
                      <span className={`status-pill ${s.ativo ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#F2F4F7] text-[#667085]"}`}>
                        {s.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

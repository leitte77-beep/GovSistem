"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, Secretaria } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { ArrowLeft, Trash2 } from "lucide-react";

export default function DetalheSecretaria() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [secretaria, setSecretaria] = useState<Secretaria | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.getSecretaria(id)
      .then(setSecretaria)
      .catch(() => toast.error("Erro ao carregar secretaria"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("Tem certeza que deseja excluir esta secretaria? Esta acao nao pode ser desfeita.")) return;
    setDeleting(true);
    try {
      await api.deleteSecretaria(id);
      toast.success("Secretaria excluida com sucesso!");
      router.push("/secretarias");
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir secretaria");
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || !secretaria) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href="/secretarias"
          className="inline-flex items-center gap-1.5 text-body-sm text-[#475467] hover:text-[#1D4ED8] transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Secretarias
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-h2 text-[#101828]">{secretaria.nome}</h1>
            <p className="text-body-sm text-[#667085] mt-1">
              {secretaria.slug}.govsistem.com.br
            </p>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-danger"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-card shadow-card p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-meta text-[#98A2B3] mb-1">Status</p>
            <span className={`status-pill ${secretaria.ativo ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#F2F4F7] text-[#667085]"}`}>
              {secretaria.ativo ? "Ativa" : "Inativa"}
            </span>
          </div>
          <div>
            <p className="text-meta text-[#98A2B3] mb-1">CNPJ</p>
            <p className="text-body-sm text-[#101828]">{secretaria.cnpj || "—"}</p>
          </div>
          <div>
            <p className="text-meta text-[#98A2B3] mb-1">Ouvidor Responsavel</p>
            <p className="text-body-sm text-[#101828]">{secretaria.ouvidor_responsavel || "—"}</p>
          </div>
          <div>
            <p className="text-meta text-[#98A2B3] mb-1">Criada em</p>
            <p className="text-body-sm text-[#101828]">
              {new Date(secretaria.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>

        {secretaria.descricao && (
          <div>
            <p className="text-meta text-[#98A2B3] mb-1">Descricao</p>
            <p className="text-body-sm text-[#475467]">{secretaria.descricao}</p>
          </div>
        )}
      </div>
    </div>
  );
}

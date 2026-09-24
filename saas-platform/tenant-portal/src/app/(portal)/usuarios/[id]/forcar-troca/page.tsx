"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCcw, Loader2, Info } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/toast";

export default function ForcarTrocaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/tenant/users/${id}/force-password-reset`, { method: "POST" });
      toast("success", "Troca de senha obrigatória no próximo acesso.");
      router.push("/usuarios");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na operação";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/usuarios" className="mb-3 inline-flex items-center gap-1 text-sm text-on-surface-variant transition hover:text-primary-700">
          <ArrowLeft size={15} /> Voltar para usuários
        </Link>
        <h1 className="text-2xl font-semibold text-on-surface">Forçar troca de senha</h1>
        <p className="text-sm text-on-surface-variant">Obrigue o usuário a definir uma nova senha no próximo acesso.</p>
      </div>

      <div className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <RefreshCcw size={22} />
          </span>
          <div>
            <h2 className="font-semibold text-on-surface">O que esta ação faz</h2>
            <p className="text-sm text-on-surface-variant">Uma visão geral do impacto desta operação.</p>
          </div>
        </div>

        <div className="space-y-2 text-sm text-on-surface-variant">
          <p className="flex gap-2">
            <span className="font-medium text-on-surface">1.</span> Exige que o usuário crie uma nova senha no próximo login.
          </p>
          <p className="flex gap-2">
            <span className="font-medium text-on-surface">2.</span> Útil quando há suspeita de acesso indevido ou por política de segurança.
          </p>
          <p className="flex gap-2">
            <span className="font-medium text-on-surface">3.</span> Não altera a senha atual nem bloqueia o usuário — apenas exige a troca.
          </p>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50/30 p-4 text-sm text-on-surface-variant">
          <Info size={18} className="mt-0.5 shrink-0 text-primary-700" />
          <p>
            Use quando quiser <strong className="text-on-surface">garantir</strong> que o usuário troque a senha logo no
            próximo acesso. Se apenas precisa que ele <strong className="text-on-surface">recupere</strong> uma senha esquecida, prefira "Redefinir senha".
          </p>
        </div>

        {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Link href="/usuarios" className="rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-medium text-on-surface transition hover:bg-surface-container-low">
          Cancelar
        </Link>
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
        >
          {busy ? (<><Loader2 size={16} className="animate-spin" /> Processando...</>) : (<><RefreshCcw size={16} /> Forçar troca</>)}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, X } from "lucide-react";
import { Ocorrencia, api } from "@/lib/api";

export function ModalResolver({
  ocorrencia,
  onClose,
  onSalvo,
}: {
  ocorrencia: Ocorrencia;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [resolucao, setResolucao] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (resolucao.trim().length < 3) {
      toast.error("Descreva a solução aplicada.");
      return;
    }
    setSalvando(true);
    try {
      await api.resolverOcorrencia(ocorrencia.id, resolucao);
      toast.success("Ocorrência resolvida.");
      onSalvo();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form onSubmit={enviar} className="relative w-full max-w-md rounded-card border border-surface-border bg-white p-5 shadow-elevated">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-h3 text-text-title">Resolver ocorrência</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <p className="mb-4 text-body-sm text-text-subtle">
          {ocorrencia.veiculo_placa ?? "Veículo"} — a solução será registrada em auditoria.
        </p>
        <label className="block text-meta">
          Solução aplicada *
          <textarea required rows={4} minLength={3} value={resolucao} onChange={(e) => setResolucao(e.target.value)} className="input mt-1" placeholder="Descreva como o problema foi resolvido" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>
            {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : "Confirmar resolução"}
          </button>
        </div>
      </form>
    </div>
  );
}

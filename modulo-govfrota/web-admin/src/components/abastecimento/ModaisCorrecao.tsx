"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, X } from "lucide-react";
import { Abastecimento, api } from "@/lib/api";
import { formatarLitros } from "@/lib/abastecimentos";

export function ModalCorrigir({
  abastecimento,
  onClose,
  onSalvo,
}: {
  abastecimento: Abastecimento;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [litros, setLitros] = useState(Number(abastecimento.quantidade_litros));
  const [km, setKm] = useState(abastecimento.quilometragem);
  const [justificativa, setJustificativa] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (justificativa.trim().length < 5) {
      toast.error("Informe uma justificativa (mínimo 5 caracteres).");
      return;
    }
    setSalvando(true);
    try {
      await api.corrigirAbastecimento(abastecimento.id, {
        quantidade_litros: String(litros),
        quilometragem: km,
        justificativa,
      });
      toast.success("Abastecimento corrigido.");
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
          <h3 className="text-h3 text-text-title">Corrigir abastecimento</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <p className="mb-4 text-body-sm text-text-subtle">
          {abastecimento.veiculo_placa ?? "Veículo"} · {abastecimento.combustivel_nome ?? ""} — a correção é rastreada em auditoria.
        </p>
        <label className="text-meta">
          Litros (atual: {formatarLitros(abastecimento.quantidade_litros)})
          <input required type="number" step="0.01" min="0.01" value={litros} onChange={(e) => setLitros(Number(e.target.value))} className="input mt-1" />
        </label>
        <label className="mt-3 block text-meta">
          {abastecimento.veiculo_usa_horimetro ? "Horímetro" : "Quilometragem"}
          <input required type="number" min="0" step={abastecimento.veiculo_usa_horimetro ? "0.1" : "1"} value={km} onChange={(e) => setKm(Number(e.target.value))} className="input mt-1" />
        </label>
        <label className="mt-3 block text-meta">
          Justificativa *
          <textarea required rows={3} minLength={5} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="input mt-1" placeholder="Motivo da correção" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>
            {salvando ? <><Loader2 size={14} className="animate-spin" /> Corrigindo…</> : "Confirmar correção"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ModalCancelar({
  abastecimento,
  onClose,
  onSalvo,
}: {
  abastecimento: Abastecimento;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (justificativa.trim().length < 5) {
      toast.error("Informe uma justificativa (mínimo 5 caracteres).");
      return;
    }
    setSalvando(true);
    try {
      await api.cancelarAbastecimento(abastecimento.id, justificativa);
      toast.success("Abastecimento cancelado e estoque estornado.");
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
          <h3 className="text-h3 text-text-title">Cancelar abastecimento</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <p className="mb-4 text-body-sm text-text-subtle">
          {abastecimento.veiculo_placa ?? "Veículo"} · {formatarLitros(abastecimento.quantidade_litros)}
        </p>
        <div className="mb-4 rounded-card border border-error/20 bg-error/5 p-3 text-body-sm text-text-body">
          Ao cancelar, o combustível será devolvido ao estoque (movimentação inversa) e o registro será auditado.
        </div>
        <label className="block text-meta">
          Justificativa do cancelamento *
          <textarea required rows={3} minLength={5} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="input mt-1" placeholder="Motivo do cancelamento" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={salvando}>Voltar</button>
          <button type="submit" className="btn btn-danger btn-sm" disabled={salvando}>
            {salvando ? <><Loader2 size={14} className="animate-spin" /> Cancelando…</> : "Cancelar abastecimento"}
          </button>
        </div>
      </form>
    </div>
  );
}

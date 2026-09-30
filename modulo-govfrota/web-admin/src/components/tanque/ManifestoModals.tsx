"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link2 } from "lucide-react";
import { api, ManifestoEntrada, Tanque } from "@/lib/api";
import { Label, Modal } from "@/components/tanque/Drawer";

interface VincularProps {
  manifesto: ManifestoEntrada | null;
  tanques: Tanque[];
  onClose: () => void;
  onConcluido: () => void;
}

/** Confirma a descarga de uma NF-e pendente em um tanque, gerando a entrada. */
export function VincularManifestoModal({ manifesto, tanques, onClose, onConcluido }: VincularProps) {
  const [tanqueId, setTanqueId] = useState("");
  const [litros, setLitros] = useState("");
  const [valorUnitario, setValorUnitario] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (manifesto) {
      setTanqueId("");
      setLitros(manifesto.quantidade_litros ? String(manifesto.quantidade_litros) : "");
      setValorUnitario(manifesto.valor_unitario ? String(manifesto.valor_unitario) : "");
      setValorTotal(manifesto.valor_total ? String(manifesto.valor_total) : "");
      setData(new Date().toISOString().slice(0, 10));
      setSalvando(false);
    }
  }, [manifesto]);

  const tanquesCompativeis = useMemo(() => {
    if (!manifesto?.combustivel_id) return tanques.filter((t) => t.ativo);
    const filtrados = tanques.filter((t) => t.combustivel_id === manifesto.combustivel_id && t.ativo);
    return filtrados.length ? filtrados : tanques.filter((t) => t.ativo);
  }, [manifesto, tanques]);

  const tanque = tanques.find((t) => t.id === tanqueId);
  const qtd = Number(litros || 0);
  const total = Number(valorTotal || 0);
  const unitario = Number(valorUnitario || 0);
  const porLitro = unitario > 0 ? unitario : qtd > 0 && total > 0 ? total / qtd : null;

  async function confirmar() {
    if (!manifesto) return;
    if (!tanque) return toast.error("Selecione o tanque de descarga.");
    setSalvando(true);
    try {
      await api.vincularManifesto(manifesto.id, {
        tanque_id: tanque.id,
        quantidade_litros: qtd > 0 ? qtd : undefined,
        valor_unitario: unitario > 0 ? unitario : undefined,
        valor_total: total > 0 ? total : undefined,
        data_entrada: data,
      });
      toast.success("Manifesto vinculado — estoque atualizado.");
      onConcluido();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={!!manifesto}
      onClose={onClose}
      titulo="Vincular e registrar entrada"
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            <Link2 size={15} /> {salvando ? "Registrando…" : "Registrar entrada"}
          </button>
        </>
      }
    >
      {manifesto && (
        <div className="space-y-4">
          <div className="rounded-btn border border-surface-border bg-surface-bg p-3 text-body-sm">
            <p className="font-semibold text-text-title">NF-e {manifesto.numero ?? "—"}</p>
            <p className="text-meta text-text-subtle">{manifesto.emitente_nome ?? "Emitente não identificado"}</p>
            <p className="mt-1 text-meta text-text-body">
              {manifesto.descricao_item ?? manifesto.combustivel_nome ?? "Combustível"} •{" "}
              {manifesto.quantidade_litros ? `${Number(manifesto.quantidade_litros).toLocaleString("pt-BR")} L` : "quantidade a informar"}
            </p>
          </div>

          <Label texto="Tanque de descarga *">
            <select className="input" value={tanqueId} onChange={(e) => setTanqueId(e.target.value)}>
              <option value="">Selecione o tanque…</option>
              {tanquesCompativeis.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} ({t.combustivel_nome})
                </option>
              ))}
            </select>
          </Label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Label texto="Litros *">
              <input type="number" step="0.01" min={0} className="input" value={litros} onChange={(e) => setLitros(e.target.value)} />
            </Label>
            <Label texto="Data da entrada">
              <input type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} />
            </Label>
            <Label texto="Valor unitário (R$/L)">
              <input type="number" step="0.0001" min={0} className="input" value={valorUnitario} onChange={(e) => setValorUnitario(e.target.value)} />
            </Label>
            <Label texto="Valor total (R$)">
              <input type="number" step="0.01" min={0} className="input" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} />
            </Label>
          </div>

          {porLitro !== null && (
            <div className="rounded-btn bg-[#EFF6FF] px-3 py-2 text-body-sm text-[#1D4ED8]">
              Valor por litro: <strong>R$ {porLitro.toFixed(4).replace(".", ",")}</strong>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

interface IgnorarProps {
  manifesto: ManifestoEntrada | null;
  onClose: () => void;
  onConcluido: () => void;
}

export function IgnorarManifestoModal({ manifesto, onClose, onConcluido }: IgnorarProps) {
  const [justificativa, setJustificativa] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (manifesto) {
      setJustificativa("");
      setSalvando(false);
    }
  }, [manifesto]);

  async function confirmar() {
    if (!manifesto) return;
    setSalvando(true);
    try {
      await api.ignorarManifesto(manifesto.id, justificativa || undefined);
      toast.success("Manifesto ignorado.");
      onConcluido();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={!!manifesto}
      onClose={onClose}
      titulo="Ignorar manifesto"
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={confirmar} disabled={salvando}>
            {salvando ? "Processando…" : "Ignorar"}
          </button>
        </>
      }
    >
      <p className="text-body-sm text-text-body">
        A NF-e {manifesto?.numero ?? ""} deixará de aparecer como pendente. O registro é preservado para auditoria.
      </p>
      <label className="mt-3 block text-meta">
        Justificativa (opcional)
        <textarea
          rows={2}
          className="input mt-1"
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Ex.: nota emitida em duplicidade"
        />
      </label>
    </Modal>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, formatDate, STATUS_REPASSE_LABELS, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import type { Repasse } from "@/types/govtask";
import { Plus, X, CheckCircle } from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };

export function RepassesTab({ convenioId, canEdit }: Props) {
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [form, setForm] = useState({ parcela: "", valor_previsto: "", data_prevista: "", conta_destino: "" });
  const [recebendo, setRecebendo] = useState<string | null>(null);
  const [valorRecebido, setValorRecebido] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRepasses(await api.listRepasses(convenioId));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    if (!form.parcela) return notify.error("Informe o número da parcela");
    try {
      await api.criarRepasse(convenioId, {
        parcela: Number(form.parcela),
        valor_previsto: form.valor_previsto ? Number(form.valor_previsto) : undefined,
        data_prevista: form.data_prevista || undefined,
        conta_destino: form.conta_destino || undefined,
      });
      notify.success("Parcela prevista cadastrada!");
      setShowCriar(false);
      setForm({ parcela: "", valor_previsto: "", data_prevista: "", conta_destino: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const receber = async (id: string) => {
    if (!valorRecebido || isNaN(Number(valorRecebido))) return notify.error("Informe o valor recebido");
    try {
      await api.receberRepasse(convenioId, id, { valor_recebido: Number(valorRecebido) });
      notify.success("Repasse recebido!");
      setRecebendo(null);
      setValorRecebido("");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-body">Parcelas de repasse do recurso.</p>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setShowCriar(true)}>Prever Parcela</Button>}
      </div>

      {loading ? (
        <div className="skeleton h-24 rounded-card" />
      ) : repasses.length === 0 ? (
        <EmptyState icon="inbox" title="Nenhum repasse" description="Cadastre as parcelas previstas e recebidas do recurso." />
      ) : (
        <div className="space-y-3">
          {repasses.map((r) => (
            <Card key={r.id} padding="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body font-semibold text-text-title">Parcela {r.parcela}</span>
                    <Badge label={STATUS_REPASSE_LABELS[r.status] || r.status} color={RECURSOS_STATUS_COLORS[r.status] || "bg-[#F6F7F9] text-[#667085]"} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-body-sm">
                    <div><span className="text-meta text-text-subtle">Previsto: </span><span className="tabular-nums text-text-title">{formatCurrency(r.valor_previsto)}</span></div>
                    <div><span className="text-meta text-text-subtle">Recebido: </span><span className="tabular-nums text-[#067647] font-medium">{formatCurrency(r.valor_recebido)}</span></div>
                    <div><span className="text-meta text-text-subtle">Data prevista: </span>{formatDate(r.data_prevista)}</div>
                  </div>
                  {r.data_recebida && <p className="text-meta text-text-subtle mt-1">Recebido em {formatDate(r.data_recebida)}</p>}
                  {r.conta_destino && <p className="text-meta text-text-subtle mt-0.5">Conta: {r.conta_destino}</p>}
                </div>
                {canEdit && r.status === "PREVISTO" && (
                  <Button variant="secondary" size="sm" icon={CheckCircle} onClick={() => setRecebendo(r.id)}>
                    Receber
                  </Button>
                )}
              </div>
              {recebendo === r.id && (
                <div className="mt-3 pt-3 border-t border-surface-border flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-label text-text-body mb-1 block">Valor recebido (R$) *</label>
                    <input type="number" step="0.01" value={valorRecebido} onChange={(e) => setValorRecebido(e.target.value)} className={inputCls} />
                  </div>
                  <Button size="sm" onClick={() => receber(r.id)}>Confirmar</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setRecebendo(null); setValorRecebido(""); }}>Cancelar</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showCriar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-6 w-full max-w-md shadow-elevated">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-h3 text-text-title">Prever Parcela de Repasse</h3>
              <button onClick={() => setShowCriar(false)} className="text-text-subtle hover:text-text-title"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-label text-text-body mb-1 block">Número da parcela *</label>
                <input type="number" min="1" value={form.parcela} onChange={(e) => setForm({ ...form, parcela: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-label text-text-body mb-1 block">Valor previsto (R$)</label>
                <input type="number" step="0.01" value={form.valor_previsto} onChange={(e) => setForm({ ...form, valor_previsto: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-label text-text-body mb-1 block">Data prevista</label>
                <input type="date" value={form.data_prevista} onChange={(e) => setForm({ ...form, data_prevista: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-label text-text-body mb-1 block">Conta destino</label>
                <input value={form.conta_destino} onChange={(e) => setForm({ ...form, conta_destino: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <Button variant="secondary" onClick={() => setShowCriar(false)}>Cancelar</Button>
              <Button icon={Plus} onClick={criar}>Cadastrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

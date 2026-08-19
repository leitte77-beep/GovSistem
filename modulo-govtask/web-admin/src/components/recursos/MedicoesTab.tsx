"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, formatDate, STATUS_MEDICAO_LABELS, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import type { Medicao } from "@/types/govtask";
import { Plus, X, CheckCircle } from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };

export function MedicoesTab({ convenioId, canEdit }: Props) {
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [form, setForm] = useState({
    numero: "", periodo_inicio: "", periodo_fim: "", data: "", valor: "", percentual: "", percentual_acumulado: "", observacao: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMedicoes(await api.listMedicoes(convenioId));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    if (!form.numero) return notify.error("Informe o número da medição");
    try {
      await api.criarMedicao(convenioId, {
        numero: Number(form.numero),
        periodo_inicio: form.periodo_inicio || undefined,
        periodo_fim: form.periodo_fim || undefined,
        data: form.data || undefined,
        valor: form.valor ? Number(form.valor) : undefined,
        percentual: form.percentual ? Number(form.percentual) : undefined,
        percentual_acumulado: form.percentual_acumulado ? Number(form.percentual_acumulado) : undefined,
        observacao: form.observacao || undefined,
      });
      notify.success("Medição registrada!");
      setShowCriar(false);
      setForm({ numero: "", periodo_inicio: "", periodo_fim: "", data: "", valor: "", percentual: "", percentual_acumulado: "", observacao: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const aprovar = async (id: string) => {
    if (!window.confirm("Aprovar esta medição?")) return;
    try {
      await api.aprovarMedicao(convenioId, id);
      notify.success("Medição aprovada!");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-body">Medições da obra/execução. Aprovações liberam o fluxo financeiro.</p>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setShowCriar(true)}>Registrar Medição</Button>}
      </div>

      {loading ? (
        <div className="skeleton h-24 rounded-card" />
      ) : medicoes.length === 0 ? (
        <EmptyState icon="inbox" title="Nenhuma medição" description="Quando a execução da obra iniciar, as medições aparecerão aqui." />
      ) : (
        <div className="space-y-3">
          {medicoes.map((m) => (
            <Card key={m.id} padding="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body font-semibold text-text-title">Medição nº {m.numero}</span>
                    <Badge label={STATUS_MEDICAO_LABELS[m.status] || m.status} color={RECURSOS_STATUS_COLORS[m.status] || "bg-[#F6F7F9] text-[#667085]"} />
                    {m.data && <span className="text-meta text-text-subtle">{formatDate(m.data)}</span>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-body-sm">
                    <div><span className="text-meta text-text-subtle">Valor: </span><span className="tabular-nums text-text-title font-medium">{formatCurrency(m.valor)}</span></div>
                    <div><span className="text-meta text-text-subtle">%: </span>{m.percentual ?? "—"}%</div>
                    <div><span className="text-meta text-text-subtle">Acumulado: </span>{m.percentual_acumulado ?? "—"}%</div>
                  </div>
                  {m.periodo_inicio && m.periodo_fim && (
                    <p className="text-meta text-text-subtle mt-1">Período: {formatDate(m.periodo_inicio)} a {formatDate(m.periodo_fim)}</p>
                  )}
                  {m.observacao && <p className="text-body-sm text-text-body mt-1">{m.observacao}</p>}
                </div>
                {canEdit && m.status === "REGISTRADA" && (
                  <Button variant="secondary" size="sm" icon={CheckCircle} onClick={() => aprovar(m.id)}>Aprovar</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCriar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-6 w-full max-w-lg shadow-elevated max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-h3 text-text-title">Registrar Medição</h3>
              <button onClick={() => setShowCriar(false)} className="text-text-subtle hover:text-text-title"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-label text-text-body mb-1 block">Número *</label>
                  <input type="number" min="1" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-label text-text-body mb-1 block">Valor (R$)</label>
                  <input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-label text-text-body mb-1 block">Data</label>
                  <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-label text-text-body mb-1 block">Período início</label>
                  <input type="date" value={form.periodo_inicio} onChange={(e) => setForm({ ...form, periodo_inicio: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-label text-text-body mb-1 block">Período fim</label>
                  <input type="date" value={form.periodo_fim} onChange={(e) => setForm({ ...form, periodo_fim: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-label text-text-body mb-1 block">Percentual (%)</label>
                  <input type="number" step="0.01" value={form.percentual} onChange={(e) => setForm({ ...form, percentual: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-label text-text-body mb-1 block">Percentual acumulado (%)</label>
                  <input type="number" step="0.01" value={form.percentual_acumulado} onChange={(e) => setForm({ ...form, percentual_acumulado: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-label text-text-body mb-1 block">Observação</label>
                <textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} rows={2} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <Button variant="secondary" onClick={() => setShowCriar(false)}>Cancelar</Button>
              <Button icon={Plus} onClick={criar}>Registrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

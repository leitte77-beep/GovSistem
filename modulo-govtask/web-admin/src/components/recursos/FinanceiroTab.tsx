"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, formatDate, TIPO_MOVIMENTO_LABELS } from "@/lib/utils";
import type { ResumoFinanceiro, MovimentoFinanceiro } from "@/types/govtask";
import { Plus, X, TrendingUp } from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };

export function FinanceiroTab({ convenioId, canEdit }: Props) {
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [movimentos, setMovimentos] = useState<MovimentoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [form, setForm] = useState({
    tipo: "EMPENHO", numero: "", data: "", valor: "", favorecido: "", descricao: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([
        api.resumoFinanceiro(convenioId),
        api.listMovimentos(convenioId),
      ]);
      setResumo(r);
      setMovimentos(m);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    if (!form.valor || isNaN(Number(form.valor))) return notify.error("Informe um valor válido");
    try {
      await api.criarMovimento(convenioId, {
        tipo: form.tipo,
        numero: form.numero || undefined,
        data: form.data || undefined,
        valor: Number(form.valor),
        favorecido: form.favorecido || undefined,
        descricao: form.descricao || undefined,
      });
      notify.success("Movimento registrado!");
      setShowCriar(false);
      setForm({ tipo: "EMPENHO", numero: "", data: "", valor: "", favorecido: "", descricao: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  const cards = resumo ? [
    { label: "Valor Aprovado", value: formatCurrency(resumo.valor_aprovado) },
    { label: "Valor Recebido", value: formatCurrency(resumo.valor_recebido) },
    { label: "Empenhado", value: formatCurrency(resumo.empenhado) },
    { label: "Liquidado", value: formatCurrency(resumo.liquidado) },
    { label: "Pago", value: formatCurrency(resumo.pago) },
    { label: "Saldo Disponível", value: formatCurrency(resumo.saldo) },
  ] : [];

  const progress = (pct: number | null) =>
    pct == null ? null : Math.min(100, Math.max(0, pct));

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-2"><div className="skeleton h-32 rounded-card" /><div className="skeleton h-40 rounded-card" /></div>
      ) : (
        <>
          {resumo && (
            <>
              {/* KPIs principais: Aprovado / Recebido / Liquidado / Pago */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Aprovado", value: resumo.valor_aprovado, color: "#1D4ED8" },
                  { label: "Recebido", value: resumo.valor_recebido, color: "#067647" },
                  { label: "Liquidado", value: resumo.liquidado, color: "#475467" },
                  { label: "Pago", value: resumo.pago, color: "#067647" },
                ].map((c) => (
                  <div key={c.label} className="p-4 bg-[#F6F7F9] rounded-btn">
                    <p className="text-meta text-text-subtle">{c.label}</p>
                    <p className="text-body font-bold text-text-title tabular-nums mt-0.5">{formatCurrency(c.value)}</p>
                  </div>
                ))}
              </div>

              <Card padding="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-[#1D4ED8]" />
                  <h3 className="text-h3 text-text-title">Painel Financeiro do Recurso</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {cards.map((c) => (
                    <div key={c.label} className="p-3 bg-[#F6F7F9] rounded-btn">
                      <p className="text-meta text-text-subtle">{c.label}</p>
                      <p className="text-body font-semibold text-text-title tabular-nums mt-0.5">{c.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <div className="flex justify-between text-meta text-text-subtle mb-1">
                      <span>Execução financeira</span>
                      <span>{resumo.percentual_executado ?? 0}%</span>
                    </div>
                    <div className="h-2 bg-[#F6F7F9] rounded-pill overflow-hidden">
                      <div className="h-full bg-[#1D4ED8] transition-all duration-700" style={{ width: `${progress(resumo.percentual_executado) ?? 0}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-meta text-text-subtle mb-1">
                      <span>Percentual pago</span>
                      <span>{resumo.percentual_pago ?? 0}%</span>
                    </div>
                    <div className="h-2 bg-[#F6F7F9] rounded-pill overflow-hidden">
                      <div className="h-full bg-[#067647] transition-all duration-700" style={{ width: `${progress(resumo.percentual_pago) ?? 0}%` }} />
                    </div>
                  </div>
                </div>
              </Card>
            </>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-h3 text-text-title">Movimentações</h3>
            {canEdit && (
              <Button size="sm" icon={Plus} onClick={() => setShowCriar(true)}>
                Registrar Movimento
              </Button>
            )}
          </div>

          {movimentos.length === 0 ? (
            <EmptyState icon="inbox" title="Nenhuma movimentação" description="Registre empenhos, liquidações e pagamentos para acompanhar a execução do recurso." />
          ) : (
            <Card padding="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-meta text-text-subtle text-left border-b border-surface-border">
                      <th className="py-2 pr-3">Tipo</th>
                      <th className="py-2 pr-3">Número</th>
                      <th className="py-2 pr-3">Data</th>
                      <th className="py-2 pr-3">Favorecido</th>
                      <th className="py-2 pr-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map((m) => (
                      <tr key={m.id} className="border-b border-surface-border last:border-0">
                        <td className="py-2 pr-3 font-medium text-text-title">{TIPO_MOVIMENTO_LABELS[m.tipo] || m.tipo}</td>
                        <td className="py-2 pr-3 text-text-body">{m.numero || "—"}</td>
                        <td className="py-2 pr-3 text-text-body">{formatDate(m.data || m.created_at)}</td>
                        <td className="py-2 pr-3 text-text-body">{m.favorecido || "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-text-title font-medium">{formatCurrency(m.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {showCriar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-6 w-full max-w-lg shadow-elevated max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-h3 text-text-title">Registrar Movimento Financeiro</h3>
              <button onClick={() => setShowCriar(false)} className="text-text-subtle hover:text-text-title"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-label text-text-body mb-1 block">Tipo *</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className={inputCls}>
                  {Object.entries(TIPO_MOVIMENTO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-label text-text-body mb-1 block">Número</label>
                  <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={inputCls} placeholder="Ex: 2026NE0001" />
                </div>
                <div>
                  <label className="text-label text-text-body mb-1 block">Data</label>
                  <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-label text-text-body mb-1 block">Valor (R$) *</label>
                <input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-label text-text-body mb-1 block">Favorecido</label>
                <input value={form.favorecido} onChange={(e) => setForm({ ...form, favorecido: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-label text-text-body mb-1 block">Descrição</label>
                <textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} className={inputCls} />
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

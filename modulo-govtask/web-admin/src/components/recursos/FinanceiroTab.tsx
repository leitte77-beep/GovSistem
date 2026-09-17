"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { cn, formatCurrency, formatDate, pct, TIPO_MOVIMENTO_LABELS } from "@/lib/utils";
import type { ResumoFinanceiro, MovimentoFinanceiro } from "@/types/govtask";
import { Plus, Trash2 } from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };

/** Cor de cada tipo de movimento na listagem, seguindo o padrão da tela. */
const TIPO_CORES: Record<string, string> = {
  REPASSE_RECEBIDO: "text-[#067647]",
  RENDIMENTO: "text-[#067647]",
  EMPENHO: "text-[#175CD3]",
  LIQUIDACAO: "text-[#175CD3]",
  PAGAMENTO: "text-[#7A5AF8]",
  DEVOLUCAO: "text-[#B42318]",
  OUTRO: "text-[#475467]",
};

export function FinanceiroTab({ convenioId, canEdit }: Props) {
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [movimentos, setMovimentos] = useState<MovimentoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    tipo: "REPASSE_RECEBIDO",
    valor: "0",
    numero: "",
    data: "",
    favorecido: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([api.resumoFinanceiro(convenioId), api.listMovimentos(convenioId)]);
      setResumo(r);
      setMovimentos(m);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => {
    load();
  }, [load]);

  const criar = async () => {
    if (!form.valor || isNaN(Number(form.valor))) return notify.error("Informe um valor válido");
    setSalvando(true);
    try {
      await api.criarMovimento(convenioId, {
        tipo: form.tipo,
        numero: form.numero || undefined,
        data: form.data || undefined,
        valor: Number(form.valor),
        favorecido: form.favorecido || undefined,
      });
      notify.success("Movimentação registrada!");
      setForm({ tipo: "REPASSE_RECEBIDO", valor: "0", numero: "", data: "", favorecido: "" });
      setShowForm(false);
      load();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (m: MovimentoFinanceiro) => {
    if (!window.confirm("Excluir esta movimentação?")) return;
    try {
      await api.excluirMovimento(convenioId, m.id);
      notify.success("Movimentação excluída!");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-[#E4E7EC] bg-white px-3.5 py-2.5 text-[14px] text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";
  const labelCls = "block text-[13px] text-[#475467] mb-1.5";

  // O saldo é exibido como proporção do total disponível.
  const totalDisponivel = Number(resumo?.total_disponivel ?? resumo?.valor_aprovado ?? 0);
  const saldo = Number(resumo?.saldo ?? 0);
  const saldoPct = totalDisponivel > 0 ? (saldo / totalDisponivel) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-[#101828]">Movimentações financeiras</h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
          >
            <Plus className="w-4 h-4" /> Registrar movimentação
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Aprovado" valor={formatCurrency(resumo?.valor_aprovado)} cor="text-[#101828]" />
            <Kpi label="Recebido" valor={formatCurrency(resumo?.valor_recebido)} cor="text-[#067647]" />
            <Kpi label="Liquidado" valor={formatCurrency(resumo?.liquidado)} cor="text-[#175CD3]" />
            <Kpi label="Pago" valor={formatCurrency(resumo?.pago)} cor="text-[#7A5AF8]" />
          </div>

          {/* Execução e saldo */}
          <div className="bg-white border border-[#E4E7EC] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-[#667085]">Execução financeira</span>
                <span className="text-[12px] text-[#475467] tabular-nums">
                  {Math.round(pct(resumo?.percentual_executado))}%
                </span>
              </div>
              <div className="h-1.5 bg-[#F2F4F7] rounded-pill overflow-hidden">
                <div
                  className="h-full bg-[#12B76A] rounded-pill transition-all duration-700"
                  style={{ width: `${pct(resumo?.percentual_executado)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-[#667085]">Saldo disponível</span>
                <span className="text-[12px] text-[#475467] tabular-nums">{formatCurrency(resumo?.saldo)}</span>
              </div>
              <div className="h-1.5 bg-[#F2F4F7] rounded-pill overflow-hidden">
                <div
                  className="h-full bg-[#06AED4] rounded-pill transition-all duration-700"
                  style={{ width: `${pct(saldoPct)}%` }}
                />
              </div>
            </div>
          </div>

          {showForm && canEdit && (
            <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Tipo *</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className={inputCls}
                  >
                    {Object.entries(TIPO_MOVIMENTO_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Número</label>
                  <input
                    value={form.numero}
                    onChange={(e) => setForm({ ...form, numero: e.target.value })}
                    placeholder="Nº empenho, OP..."
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Data</label>
                  <input
                    type="date"
                    value={form.data}
                    onChange={(e) => setForm({ ...form, data: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Fornecedor</label>
                  <input
                    value={form.favorecido}
                    onChange={(e) => setForm({ ...form, favorecido: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={criar}
                  disabled={salvando || !form.valor || Number(form.valor) <= 0}
                  className="rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] disabled:bg-[#A4BCFD] disabled:cursor-not-allowed transition-colors"
                >
                  Registrar
                </button>
              </div>
            </div>
          )}

          {/* Movimentações */}
          {movimentos.length === 0 ? (
            <p className="text-[13px] text-[#98A2B3] text-center py-10">
              Nenhuma movimentação registrada neste processo.
            </p>
          ) : (
            <div className="bg-white border border-[#E4E7EC] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#F9FAFB] text-[12px] uppercase tracking-wide text-[#667085] text-left">
                      <th className="py-3 px-4 font-medium">Tipo</th>
                      <th className="py-3 px-4 font-medium">Número</th>
                      <th className="py-3 px-4 font-medium">Fornecedor</th>
                      <th className="py-3 px-4 font-medium text-right">Valor</th>
                      <th className="py-3 px-4 font-medium">Data</th>
                      {canEdit && <th className="py-3 px-4" />}
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map((m) => (
                      <tr key={m.id} className="border-t border-[#F2F4F7]">
                        <td className={cn("py-3 px-4 font-medium", TIPO_CORES[m.tipo] || "text-[#475467]")}>
                          {TIPO_MOVIMENTO_LABELS[m.tipo] || m.tipo}
                        </td>
                        <td className="py-3 px-4 text-[#475467]">{m.numero || "—"}</td>
                        <td className="py-3 px-4 text-[#475467]">{m.favorecido || "—"}</td>
                        <td
                          className={cn(
                            "py-3 px-4 text-right tabular-nums font-medium",
                            TIPO_CORES[m.tipo] || "text-[#101828]"
                          )}
                        >
                          {formatCurrency(m.valor)}
                        </td>
                        <td className="py-3 px-4 text-[#475467] tabular-nums whitespace-nowrap">
                          {formatDate(m.data || m.created_at)}
                        </td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => excluir(m)}
                              className="p-1.5 rounded-lg text-[#98A2B3] hover:text-[#B42318] hover:bg-[#B42318]/5 transition-colors"
                              title="Excluir movimentação"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div className="bg-white border border-[#E4E7EC] rounded-xl p-4">
      <p className="text-[12px] text-[#98A2B3]">{label}</p>
      <p className={cn("text-[18px] font-bold tabular-nums mt-1", cor)}>{valor}</p>
    </div>
  );
}

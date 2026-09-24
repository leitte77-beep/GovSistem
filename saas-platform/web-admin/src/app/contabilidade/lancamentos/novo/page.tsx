"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
  nature: string;
}

interface LineItem {
  account_id: string;
  account_code: string;
  account_name: string;
  debit_cents: string;
  credit_cents: string;
  history: string;
}

const defaultLines: LineItem[] = [
  { account_id: "", account_code: "", account_name: "", debit_cents: "", credit_cents: "", history: "" },
  { account_id: "", account_code: "", account_name: "", debit_cents: "", credit_cents: "", history: "" },
];

export default function NewLancamentoPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().substring(0, 10),
    competence_date: new Date().toISOString().substring(0, 10),
    description: "",
    origin: "manual",
  });
  const [lines, setLines] = useState<LineItem[]>([...defaultLines.map(l => ({ ...l }))]);

  useEffect(() => {
    api<{ data: Account[] }>("/chart-of-accounts?per_page=200")
      .then((res) => setAccounts(res.data))
      .catch(() => toast.error("Erro ao carregar contas"))
      .finally(() => setLoadingAccounts(false));
  }, []);

  const addLine = () => setLines([...lines, { account_id: "", account_code: "", account_name: "", debit_cents: "", credit_cents: "", history: "" }]);
  const removeLine = (idx: number) => { if (lines.length > 2) setLines(lines.filter((_, i) => i !== idx)); };

  const selectAccount = (idx: number, accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    const updated = lines.map((l, i) => i === idx ? { ...l, account_id: accountId, account_code: acc?.code || "", account_name: acc?.name || "" } : l);
    setLines(updated);
  };

  const updateLine = (idx: number, field: keyof LineItem, value: string) => {
    const updated = lines.map((l, i) => i === idx ? { ...l, [field]: value } : l);
    setLines(updated);
  };

  const totalLine = (field: "debit_cents" | "credit_cents") =>
    lines.reduce((s, l) => s + (parseInt(l[field]) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) { toast.error("Descricao e obrigatoria"); return; }
    const validLines = lines.filter(l => l.account_id && (parseInt(l.debit_cents) || parseInt(l.credit_cents)));
    if (validLines.length < 2) { toast.error("Minimo 2 linhas com conta e valor"); return; }
    const td = validLines.reduce((s, l) => s + (parseInt(l.debit_cents) || 0), 0);
    const tc = validLines.reduce((s, l) => s + (parseInt(l.credit_cents) || 0), 0);
    if (td !== tc) { toast.error(`Partidas nao batem: Debito R$ ${(td / 100).toFixed(2)} ≠ Credito R$ ${(tc / 100).toFixed(2)}`); return; }

    setSaving(true);
    try {
      await api("/journal-entries", {
        method: "POST",
        body: {
          entry_date: form.entry_date,
          competence_date: form.competence_date,
          description: form.description.trim(),
          origin: form.origin,
          lines: validLines.map(l => ({
            account_id: l.account_id,
            debit_cents: parseInt(l.debit_cents) || 0,
            credit_cents: parseInt(l.credit_cents) || 0,
            history: l.history.trim() || undefined,
          })),
        },
      });
      toast.success("Lancamento contabil criado!");
      router.push("/contabilidade/lancamentos");
    } catch (err: any) { toast.error(err.message || "Erro ao criar lancamento"); }
    finally { setSaving(false); }
  };

  const groupedAccounts = accounts.reduce((acc, a) => {
    if (!acc[a.account_type]) acc[a.account_type] = [];
    acc[a.account_type].push(a);
    return acc;
  }, {} as Record<string, Account[]>);

  const typeLabel: Record<string, string> = {
    asset: "Ativo", liability: "Passivo", equity: "PL",
    revenue: "Receita", expense: "Despesa", deduction: "Deducao", cost: "Custo",
  };

  return (
    <AppLayout title="Novo Lancamento Contabil">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/contabilidade/lancamentos" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Novo Lancamento Contabil</h2>
            <p className="text-sm text-gray-500">Partidas dobradas — Debito deve ser igual ao Credito.</p>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Competencia</label>
                <input type="date" value={form.competence_date} onChange={(e) => setForm({ ...form, competence_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Origem</label>
                <select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="manual">Manual</option>
                  <option value="invoice">Fatura</option>
                  <option value="payment">Pagamento</option>
                  <option value="closing">Fechamento</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Descricao do lancamento" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Partidas (linhas)</h3>
                <button type="button" onClick={addLine}
                  className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700">
                  <Plus size={14} /> Adicionar linha
                </button>
              </div>

              {loadingAccounts ? (
                <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
              ) : (
                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <select value={line.account_id} onChange={(e) => selectAccount(idx, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white">
                          <option value="">Selecione a conta...</option>
                          {Object.entries(groupedAccounts).map(([type, accs]) => (
                            <optgroup key={type} label={typeLabel[type] || type}>
                              {accs.map((a) => (
                                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        {line.account_code && (
                          <p className="text-[10px] text-gray-400 mt-0.5 px-1">{line.account_code} - {line.account_name}</p>
                        )}
                      </div>
                      <div className="w-28">
                        <input type="number" value={line.debit_cents} onChange={(e) => updateLine(idx, "debit_cents", e.target.value)}
                          placeholder="Debito" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs" />
                      </div>
                      <div className="w-28">
                        <input type="number" value={line.credit_cents} onChange={(e) => updateLine(idx, "credit_cents", e.target.value)}
                          placeholder="Credito" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs" />
                      </div>
                      <div className="flex-1">
                        <input value={line.history} onChange={(e) => updateLine(idx, "history", e.target.value)}
                          placeholder="Historico" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs" />
                      </div>
                      <button type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 2}
                        className="p-2 text-red-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-6 mt-3 text-sm font-medium">
                <span className={totalLine("debit_cents") === totalLine("credit_cents") ? "text-green-600" : "text-red-600"}>
                  Debito: R$ {(totalLine("debit_cents") / 100).toFixed(2)}
                </span>
                <span className={totalLine("debit_cents") === totalLine("credit_cents") ? "text-green-600" : "text-red-600"}>
                  Credito: R$ {(totalLine("credit_cents") / 100).toFixed(2)}
                </span>
                {totalLine("debit_cents") !== totalLine("credit_cents") && (
                  <span className="text-red-500">Diferenca: R$ {(Math.abs(totalLine("debit_cents") - totalLine("credit_cents")) / 100).toFixed(2)}</span>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Link href="/contabilidade/lancamentos"
                className="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</Link>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? "Salvando..." : "Criar Lancamento"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}

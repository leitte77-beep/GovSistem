"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { FileText, Plus, CheckCircle, RotateCcw, Loader2, Eye } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDateOnly } from "@/lib/utils";

interface Account {
  id: string;
  code: string;
  name: string;
}

interface JournalLine {
  id: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  debit_cents: number;
  credit_cents: number;
  history: string | null;
}

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  competence_date: string;
  description: string;
  origin: string;
  status: string;
  posted_at: string | null;
  lines: JournalLine[];
  created_at: string;
}

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "draft", label: "Rascunho" },
  { value: "posted", label: "Contabilizado" },
  { value: "reversed", label: "Estornado" },
];

const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
  switch (s) {
    case "posted": return "success";
    case "draft": return "info";
    case "reversed": return "danger";
    default: return "default";
  }
};

const statusLabel = (s: string): string => {
  switch (s) {
    case "posted": return "Contabilizado";
    case "draft": return "Rascunho";
    case "reversed": return "Estornado";
    default: return s;
  }
};

const originLabel = (s: string): string => {
  switch (s) {
    case "payment": return "Pagamento";
    case "manual": return "Manual";
    case "reversal": return "Estorno";
    case "invoice": return "Fatura";
    case "closing": return "Fechamento";
    default: return s;
  }
};

export default function LancamentosPage() {
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);
  const perPage = 15;

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [jeRes, accRes] = await Promise.all([
        api<{ data: JournalEntry[]; total: number }>(`/journal-entries?page=${page}&per_page=${perPage}${status ? `&status=${status}` : ""}`),
        api<{ data: Account[] }>("/chart-of-accounts?per_page=200"),
      ]);
      const entries = jeRes.data.map((entry) => ({
        ...entry,
        lines: entry.lines.map((line) => {
          const acc = accRes.data.find((a) => a.id === line.account_id);
          return { ...line, account_code: acc?.code, account_name: acc?.name };
        }),
      }));
      setItems(entries);
      setTotal(jeRes.total);
      setAccounts(accRes.data);
    } catch { toast.error("Erro ao carregar lancamentos"); }
    finally { setLoading(false); }
  }, [page, status]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handlePost = async (id: string) => {
    setActionId(id);
    try {
      await api(`/journal-entries/${id}/post`, { method: "POST" });
      toast.success("Lancamento contabilizado!");
      setPostId(null);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao contabilizar"); }
    finally { setActionId(null); }
  };

  const handleReverse = async (id: string) => {
    if (!reverseReason.trim()) { toast.error("Informe o motivo do estorno"); return; }
    setActionId(id);
    try {
      await api(`/journal-entries/${id}/reverse`, {
        method: "POST",
        body: { reason: reverseReason },
      });
      toast.success("Lancamento estornado!");
      setReverseId(null);
      setReverseReason("");
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao estornar"); }
    finally { setActionId(null); }
  };

  const columns: Column<JournalEntry>[] = [
    { key: "entry_number", label: "Numero", sortable: true },
    { key: "entry_date", label: "Data", render: (v: string) => formatDateOnly(v) },
    { key: "description", label: "Descricao" },
    { key: "origin", label: "Origem", render: (v: string) => <Badge variant="default">{originLabel(v)}</Badge> },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{statusLabel(v)}</Badge> },
    { key: "lines", label: "Contas", render: (_: JournalLine[]) => (
      <span className="text-xs text-gray-500">{_?.length || 0} linhas</span>
    )},
    { key: "actions", label: "Acoes", render: (_: any, row: JournalEntry) => (
      <div className="flex gap-1">
        <button onClick={(e) => { e.stopPropagation(); setDetailEntry(row); }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <Eye size={13} /> Ver
        </button>
        {row.status === "draft" && (
          <button onClick={(e) => { e.stopPropagation(); setPostId(row.id); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors">
            <CheckCircle size={13} /> Contabilizar
          </button>
        )}
        {row.status === "posted" && (
          <button onClick={(e) => { e.stopPropagation(); setReverseId(row.id); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors">
            <RotateCcw size={13} /> Estornar
          </button>
        )}
      </div>
    )},
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Lancamentos Contabeis">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Lancamentos Contabeis</h2>
          <p className="text-sm text-gray-500">{total} lancamentos em partidas dobradas</p>
        </div>
        <Link href="/contabilidade/lancamentos/novo"
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> Novo Lancamento
        </Link>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-6">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <Table columns={columns} data={items} loading={loading}
          emptyMessage="Nenhum lancamento contabil encontrado." />
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <span className="text-sm text-gray-500">Pagina {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50">Anterior</button>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50">Proximo</button>
            </div>
          </div>
        )}
      </Card>

      <Modal open={!!postId} onClose={() => setPostId(null)} title="Contabilizar Lancamento" size="sm">
        <p className="text-gray-600 mb-6">Confirmar contabilizacao deste lancamento? Partidas dobradas serao validadas.</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setPostId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={() => postId && handlePost(postId)} disabled={actionId === postId}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            {actionId === postId ? "..." : "Contabilizar"}
          </button>
        </div>
      </Modal>

      <Modal open={!!reverseId} onClose={() => { setReverseId(null); setReverseReason(""); }} title="Estornar Lancamento" size="md">
        <div className="space-y-4">
          <p className="text-gray-600">Informe o motivo do estorno. Um novo lancamento sera criado com os valores invertidos.</p>
          <textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} rows={3}
            placeholder="Motivo do estorno (obrigatorio)"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm resize-none" />
          <div className="flex justify-end gap-3">
            <button onClick={() => { setReverseId(null); setReverseReason(""); }}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={() => reverseId && handleReverse(reverseId)} disabled={actionId === reverseId || !reverseReason.trim()}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              {actionId === reverseId ? "..." : "Confirmar Estorno"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detailEntry} onClose={() => setDetailEntry(null)} title={`Lancamento ${detailEntry?.entry_number || ""}`} size="lg">
        {detailEntry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><span className="text-gray-500">Data:</span> <span className="font-medium">{formatDateOnly(detailEntry.entry_date)}</span></div>
              <div><span className="text-gray-500">Competencia:</span> <span className="font-medium">{formatDateOnly(detailEntry.competence_date)}</span></div>
              <div><span className="text-gray-500">Status:</span> <Badge variant={statusVariant(detailEntry.status)}>{statusLabel(detailEntry.status)}</Badge></div>
              <div><span className="text-gray-500">Origem:</span> <span className="font-medium">{originLabel(detailEntry.origin)}</span></div>
            </div>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{detailEntry.description}</p>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-500">Codigo</th>
                  <th className="text-left py-2 font-medium text-gray-500">Conta</th>
                  <th className="text-right py-2 font-medium text-gray-500">Debito</th>
                  <th className="text-right py-2 font-medium text-gray-500">Credito</th>
                  <th className="text-left py-2 font-medium text-gray-500">Historico</th>
                </tr>
              </thead>
              <tbody>
                {detailEntry.lines.map((line, idx) => (
                  <tr key={idx} className="border-b border-gray-50">
                    <td className="py-2 font-mono text-gray-500">{line.account_code || line.account_id.substring(0, 8)}</td>
                    <td className="py-2">{line.account_name || "—"}</td>
                    <td className="py-2 text-right font-medium text-red-600">{line.debit_cents > 0 ? formatCurrency(line.debit_cents) : ""}</td>
                    <td className="py-2 text-right font-medium text-green-600">{line.credit_cents > 0 ? formatCurrency(line.credit_cents) : ""}</td>
                    <td className="py-2 text-gray-500 text-xs">{line.history || ""}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-gray-300">
                  <td colSpan={2} className="py-2 text-right">Totais</td>
                  <td className="py-2 text-right text-red-600">{formatCurrency(detailEntry.lines.reduce((s, l) => s + l.debit_cents, 0))}</td>
                  <td className="py-2 text-right text-green-600">{formatCurrency(detailEntry.lines.reduce((s, l) => s + l.credit_cents, 0))}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

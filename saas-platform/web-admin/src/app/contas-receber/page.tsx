"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Plus, Search, CheckCircle, XCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDateOnly } from "@/lib/utils";

interface Receivable {
  id: string;
  customer_name: string;
  description: string;
  amount_cents: number;
  open_amount_cents: number;
  due_date: string;
  status: string;
  aging_days: number;
}

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "overdue", label: "Vencido" },
  { value: "paid", label: "Pago" },
  { value: "written_off", label: "Baixado" },
];

export default function ContasReceberPage() {
  const [items, setItems] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [writeOffId, setWriteOffId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const perPage = 10;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/receivables?page=${page}&per_page=${perPage}`;
      if (status) url += `&status=${status}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (dateFrom) url += `&date_from=${dateFrom}`;
      if (dateTo) url += `&date_to=${dateTo}`;
      const res = await api<{ data: Receivable[]; total: number }>(url);
      setItems(res.data);
      setTotal(res.total);
    } catch { toast.error("Erro ao carregar contas a receber"); }
    finally { setLoading(false); }
  }, [page, status, search, dateFrom, dateTo]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleMarkPaid = async (id: string) => {
    setActionId(id);
    try {
      await api(`/receivables/${id}/mark-paid`, { method: "POST" });
      toast.success("Conta marcada como paga!");
      setMarkPaidId(null);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao marcar como paga"); }
    finally { setActionId(null); }
  };

  const handleWriteOff = async (id: string) => {
    setActionId(id);
    try {
      await api(`/receivables/${id}/write-off`, { method: "POST" });
      toast.success("Conta baixada!");
      setWriteOffId(null);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao baixar"); }
    finally { setActionId(null); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setActionId(deleteId);
    try {
      await api(`/receivables/${deleteId}`, { method: "DELETE" });
      toast.success("Conta removida!");
      setDeleteId(null);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao remover"); }
    finally { setActionId(null); }
  };

  const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
    switch (s) {
      case "paid": return "success";
      case "written_off": return "warning";
      case "overdue": return "danger";
      case "pending": return "info";
      default: return "default";
    }
  };

  const statusLabel = (s: string): string => {
    switch (s) {
      case "paid": return "Pago";
      case "written_off": return "Baixado";
      case "overdue": return "Vencido";
      case "pending": return "Pendente";
      default: return s;
    }
  };

  const agingBadge = (days: number) => {
    if (days <= 0) return <Badge variant="success">Em dia</Badge>;
    if (days <= 30) return <Badge variant="warning">{days}d</Badge>;
    if (days <= 60) return <Badge variant="warning">{days}d</Badge>;
    return <Badge variant="danger">{days}d</Badge>;
  };

  const columns: Column<Receivable>[] = [
    { key: "customer_name", label: "Cliente", sortable: true },
    { key: "amount_cents", label: "Valor", render: (v: number) => formatCurrency(v) },
    { key: "open_amount_cents", label: "Saldo Aberto", render: (v: number) => formatCurrency(v) },
    { key: "due_date", label: "Vencimento", render: (v: string) => formatDateOnly(v) },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{statusLabel(v)}</Badge> },
    { key: "aging_days", label: "Aging", render: (v: number) => agingBadge(v) },
    { key: "actions", label: "Acoes", render: (_: any, row: Receivable) => (
      <div className="flex gap-1">
        {(row.status === "pending" || row.status === "overdue" || row.status === "open") && (
          <>
            <button onClick={(e) => { e.stopPropagation(); setMarkPaidId(row.id); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors">
              <CheckCircle size={13} /> Pagar
            </button>
            <button onClick={(e) => { e.stopPropagation(); setWriteOffId(row.id); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors">
              <XCircle size={13} /> Baixar
            </button>
          </>
        )}
        <Link href={`/contas-receber/${row.id}/edit`} onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <Pencil size={13} />
        </Link>
        <button onClick={(e) => { e.stopPropagation(); setDeleteId(row.id); }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    )},
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Contas a Receber">
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Buscar cliente..." value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full sm:w-48 pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            </div>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          </div>
          <Link href="/contas-receber/new" className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Nova Conta
          </Link>
        </div>
        <Table columns={columns} data={items} loading={loading} />
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <span className="text-sm text-gray-500">Pagina {page} de {totalPages} ({total} registros)</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50">Anterior</button>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50">Proximo</button>
            </div>
          </div>
        )}
      </Card>
      <Modal open={!!markPaidId} onClose={() => setMarkPaidId(null)} title="Confirmar Pagamento" size="sm">
        <p className="text-gray-600 mb-6">Tem certeza que deseja marcar esta conta como paga?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setMarkPaidId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={() => markPaidId && handleMarkPaid(markPaidId)} disabled={actionId === markPaidId}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            {actionId === markPaidId ? "..." : "Confirmar Pagamento"}
          </button>
        </div>
      </Modal>
      <Modal open={!!writeOffId} onClose={() => setWriteOffId(null)} title="Confirmar Baixa" size="sm">
        <p className="text-gray-600 mb-6">Tem certeza que deseja baixar esta conta?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setWriteOffId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={() => writeOffId && handleWriteOff(writeOffId)} disabled={actionId === writeOffId}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            {actionId === writeOffId ? "..." : "Confirmar Baixa"}
          </button>
        </div>
      </Modal>
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Remover Conta" size="sm">
        <p className="text-gray-600 mb-6">Tem certeza que deseja remover esta conta?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleDelete} disabled={actionId === deleteId}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            {actionId === deleteId ? "..." : "Remover"}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}

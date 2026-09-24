"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Plus, CheckCircle, ThumbsUp, ThumbsDown, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDateOnly } from "@/lib/utils";

interface Payable {
  id: string;
  supplier_name: string;
  description: string;
  amount_cents: number;
  due_date: string;
  status: string;
  category: string;
  days_until_due: number;
}

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "approved", label: "Aprovado" },
  { value: "rejected", label: "Rejeitado" },
  { value: "paid", label: "Pago" },
];

const categoryOptions = [
  { value: "", label: "Todas" },
  { value: "supplies", label: "Suprimentos" },
  { value: "services", label: "Servicos" },
  { value: "utilities", label: "Utilidades" },
  { value: "taxes", label: "Impostos" },
  { value: "other", label: "Outros" },
];

export default function ContasPagarPage() {
  const [items, setItems] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const perPage = 10;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/payables?page=${page}&per_page=${perPage}`;
      if (status) url += `&status=${status}`;
      if (category) url += `&category=${category}`;
      const res = await api<{ data: Payable[]; total: number }>(url);
      setItems(res.data);
      setTotal(res.total);
    } catch { toast.error("Erro ao carregar contas a pagar"); }
    finally { setLoading(false); }
  }, [page, status, category]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleApprove = async (id: string) => {
    setActionId(id);
    try {
      await api(`/payables/${id}/approve`, { method: "POST" });
      toast.success("Conta aprovada!");
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao aprovar"); }
    finally { setActionId(null); }
  };

  const handleReject = async (id: string) => {
    setActionId(id);
    try {
      await api(`/payables/${id}/reject`, { method: "POST" });
      toast.success("Conta rejeitada!");
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao rejeitar"); }
    finally { setActionId(null); }
  };

  const handlePay = async (id: string) => {
    setActionId(id);
    try {
      await api(`/payables/${id}/mark-paid`, { method: "POST" });
      toast.success("Conta paga!");
      setPayId(null);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao pagar"); }
    finally { setActionId(null); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setActionId(deleteId);
    try {
      await api(`/payables/${deleteId}`, { method: "DELETE" });
      toast.success("Conta removida!");
      setDeleteId(null);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao remover"); }
    finally { setActionId(null); }
  };

  const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
    switch (s) {
      case "paid": return "success";
      case "approved": return "info";
      case "rejected": return "danger";
      case "pending": return "warning";
      default: return "default";
    }
  };

  const statusLabel = (s: string): string => {
    switch (s) {
      case "paid": return "Pago";
      case "approved": return "Aprovado";
      case "rejected": return "Rejeitado";
      case "pending": return "Pendente";
      default: return s;
    }
  };

  const daysBadge = (days: number) => {
    if (days < 0) return <Badge variant="danger">Vencido ha {Math.abs(days)}d</Badge>;
    if (days === 0) return <Badge variant="warning">Vence hoje</Badge>;
    if (days <= 7) return <Badge variant="warning">{days}d</Badge>;
    return <Badge variant="success">{days}d</Badge>;
  };

  const columns: Column<Payable>[] = [
    { key: "supplier_name", label: "Fornecedor", sortable: true },
    { key: "description", label: "Descricao", sortable: true },
    { key: "amount_cents", label: "Valor", render: (v: number) => formatCurrency(v) },
    { key: "due_date", label: "Vencimento", render: (v: string) => formatDateOnly(v) },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{statusLabel(v)}</Badge> },
    { key: "days_until_due", label: "Prazo", render: (v: number) => daysBadge(v) },
    { key: "actions", label: "Acoes", render: (_: any, row: Payable) => (
      <div className="flex gap-1">
        {row.status === "pending" && (
          <>
            <button onClick={(e) => { e.stopPropagation(); handleApprove(row.id); }} disabled={actionId === row.id}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50">
              <ThumbsUp size={13} /> {actionId === row.id ? "..." : "Aprovar"}
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleReject(row.id); }} disabled={actionId === row.id}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50">
              <ThumbsDown size={13} /> {actionId === row.id ? "..." : "Rejeitar"}
            </button>
          </>
        )}
        {row.status === "approved" && (
          <button onClick={(e) => { e.stopPropagation(); setPayId(row.id); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors">
            <CheckCircle size={13} /> Pagar
          </button>
        )}
        {row.status !== "paid" && (
          <>
            <Link href={`/contas-pagar/${row.id}/edit`} onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <Pencil size={13} />
            </Link>
            <button onClick={(e) => { e.stopPropagation(); setDeleteId(row.id); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors">
              <Trash2 size={13} />
            </button>
          </>
        )}
        {(row.status === "paid" || row.status === "rejected") && (
          <>
            <Link href={`/contas-pagar/${row.id}/edit`} onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <Pencil size={13} />
            </Link>
            <button onClick={(e) => { e.stopPropagation(); setDeleteId(row.id); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors">
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    )},
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Contas a Pagar">
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
              {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <Link href="/contas-pagar/new" className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
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
      <Modal open={!!payId} onClose={() => setPayId(null)} title="Confirmar Pagamento" size="sm">
        <p className="text-gray-600 mb-6">Tem certeza que deseja marcar esta conta como paga?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setPayId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={() => payId && handlePay(payId)} disabled={actionId === payId}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            {actionId === payId ? "..." : "Confirmar Pagamento"}
          </button>
        </div>
      </Modal>
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Remover Conta" size="sm">
        <p className="text-gray-600 mb-6">Tem certeza que deseja remover esta conta? Esta acao pode ser desfeita.</p>
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

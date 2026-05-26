"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { CreditCard, ExternalLink, Plus, Loader2, Copy, Check } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDateOnly } from "@/lib/utils";

interface CardCharge {
  id: string;
  billing_type: string;
  amount_cents: number;
  due_date: string;
  status: string;
  invoice_url: string | null;
  external_id: string;
  created_at: string;
}

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmado" },
  { value: "received", label: "Pago" },
  { value: "overdue", label: "Vencido" },
  { value: "refunded", label: "Reembolsado" },
  { value: "canceled", label: "Cancelado" },
];

const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
  switch (s) {
    case "received": case "confirmed": return "success";
    case "pending": return "info";
    case "overdue": return "danger";
    case "refunded": return "warning";
    case "canceled": return "default";
    default: return "default";
  }
};

const statusLabel = (s: string): string => {
  switch (s) {
    case "received": return "Pago";
    case "confirmed": return "Confirmado";
    case "pending": return "Pendente";
    case "overdue": return "Vencido";
    case "refunded": return "Reembolsado";
    case "canceled": return "Cancelado";
    default: return s;
  }
};

export default function CartoesPage() {
  const [items, setItems] = useState<CardCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_name: "", customer_document: "", customer_email: "", customer_phone: "",
    amount: "", due_date: "", description: "",
  });
  const perPage = 10;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/charges?page=${page}&per_page=${perPage}&billing_type=CREDIT_CARD`;
      if (status) url += `&status=${status}`;
      const res = await api<{ data: CardCharge[]; total: number }>(url);
      setItems(res.data);
      setTotal(res.total);
    } catch { toast.error("Erro ao carregar cartoes"); }
    finally { setLoading(false); }
  }, [page, status]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(form.amount.replace(",", "."));
    if (!form.customer_name || !form.customer_document || !form.amount || isNaN(amountNum) || amountNum <= 0 || !form.due_date) {
      toast.error("Preencha todos os campos obrigatorios");
      return;
    }
    setSaving(true);
    try {
      const amountCents = Math.round(amountNum * 100);
      const res = await api<CardCharge>("/charges", {
        method: "POST",
        body: {
          billing_type: "CREDIT_CARD",
          amount_cents: amountCents,
          due_date: form.due_date,
          description: form.description || "Cobranca cartao",
          customer_name: form.customer_name.trim(),
          customer_document: form.customer_document.replace(/\D/g, ""),
          customer_email: form.customer_email || `${form.customer_name}@email.com`,
          customer_phone: form.customer_phone || undefined,
          customer_document_type: form.customer_document.length > 11 ? "cnpj" : "cpf",
        },
      });
      toast.success("Link de pagamento criado no Asaas!");

      if (res.invoice_url) {
        window.open(res.invoice_url, "_blank");
      }

      setShowCreate(false);
      setForm({ customer_name: "", customer_document: "", customer_email: "", customer_phone: "", amount: "", due_date: "", description: "" });
      fetchItems();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar cobranca");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url);
      toast.success("Link copiado!");
      setTimeout(() => setCopiedUrl(null), 2000);
    }).catch(() => toast.error("Erro ao copiar"));
  };

  const columns: Column<CardCharge>[] = [
    { key: "amount_cents", label: "Valor", render: (v: number) => formatCurrency(v) },
    { key: "due_date", label: "Vencimento", render: (v: string) => formatDateOnly(v) },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{statusLabel(v)}</Badge> },
    { key: "actions", label: "Link Pagamento", render: (_: any, row: CardCharge) => (
      <div className="flex gap-2">
        {row.invoice_url && (
          <>
            <a href={row.invoice_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-50 text-primary-600 hover:bg-primary-100 rounded-lg transition-colors">
              <ExternalLink size={14} /> Pagar
            </a>
            <button onClick={() => handleCopyUrl(row.invoice_url!)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              {copiedUrl === row.invoice_url ? <Check size={14} /> : <Copy size={14} />}
              {copiedUrl === row.invoice_url ? "Copiado" : "Link"}
            </button>
          </>
        )}
        {!row.invoice_url && <span className="text-xs text-gray-400">Nao disponivel</span>}
      </div>
    )},
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Cartao de Credito">
      <div className="flex gap-4 mb-6">
        <Card padding={false} className="flex-1">
          <div className="p-4 border-l-4 border-l-blue-500">
            <p className="text-xs text-gray-500 uppercase font-semibold">Total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{total}</p>
          </div>
        </Card>
        <Card padding={false} className="flex-1">
          <div className="p-4 border-l-4 border-l-yellow-500">
            <p className="text-xs text-gray-500 uppercase font-semibold">Pendentes</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{items.filter((i) => i.status === "pending").length}</p>
          </div>
        </Card>
        <Card padding={false} className="flex-1">
          <div className="p-4 border-l-4 border-l-green-500">
            <p className="text-xs text-gray-500 uppercase font-semibold">Pagos</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{items.filter((i) => i.status === "received" || i.status === "confirmed").length}</p>
          </div>
        </Card>
      </div>
      <Card>
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Novo Link de Pagamento
          </button>
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Novo Link de Pagamento (Cartao)" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
              <input name="customer_name" required value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                placeholder="Nome completo" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ *</label>
              <input name="customer_document" required value={form.customer_document}
                onChange={(e) => setForm({ ...form, customer_document: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                placeholder="So numeros" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input name="customer_email" type="email" value={form.customer_email}
                onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                placeholder="email@provedor.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
              <input name="amount" required value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                placeholder="0,00" inputMode="decimal" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento *</label>
              <input name="due_date" type="date" required value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-400">
                <CreditCard size={12} className="inline mr-1" />
                Nenhum dado de cartao e armazenado. O pagamento e processado com seguranca via Asaas.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowCreate(false)}
              className="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
              {saving ? "Criando..." : "Gerar Link"}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}

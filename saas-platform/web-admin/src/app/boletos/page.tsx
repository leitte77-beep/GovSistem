"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { FileText, Plus, Loader2, Copy, Check } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDateOnly } from "@/lib/utils";

interface Charge {
  id: string;
  billing_type: string;
  amount_cents: number;
  due_date: string;
  status: string;
  bank_slip_url: string | null;
  boleto_barcode: string | null;
  boleto_identification_field: string | null;
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
  { value: "canceled", label: "Cancelado" },
];

const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
  switch (s) {
    case "received": case "confirmed": return "success";
    case "pending": return "info";
    case "overdue": return "danger";
    case "canceled": return "warning";
    default: return "default";
  }
};

const statusLabel = (s: string): string => {
  switch (s) {
    case "received": return "Pago";
    case "confirmed": return "Confirmado";
    case "pending": return "Pendente";
    case "overdue": return "Vencido";
    case "canceled": return "Cancelado";
    default: return s;
  }
};

export default function BoletosPage() {
  const [items, setItems] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_name: "", customer_document: "", customer_email: "", customer_phone: "",
    amount: "", due_date: "", description: "",
  });
  const perPage = 10;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/charges?page=${page}&per_page=${perPage}&billing_type=BOLETO`;
      if (status) url += `&status=${status}`;
      const res = await api<{ data: Charge[]; total: number }>(url);
      setItems(res.data);
      setTotal(res.total);
    } catch { toast.error("Erro ao carregar boletos"); }
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
      await api<Charge>("/charges", {
        method: "POST",
        body: {
          billing_type: "BOLETO",
          amount_cents: amountCents,
          due_date: form.due_date,
          description: form.description || "Boleto",
          customer_name: form.customer_name.trim(),
          customer_document: form.customer_document.replace(/\D/g, ""),
          customer_email: form.customer_email || `${form.customer_name}@email.com`,
          customer_phone: form.customer_phone || undefined,
          customer_document_type: form.customer_document.length > 11 ? "cnpj" : "cpf",
        },
      });
      toast.success("Boleto criado no Asaas!");
      setShowCreate(false);
      setForm({ customer_name: "", customer_document: "", customer_email: "", customer_phone: "", amount: "", due_date: "", description: "" });
      fetchItems();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar boleto");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyField = (field: string) => {
    navigator.clipboard.writeText(field).then(() => {
      setCopiedField(field);
      toast.success("Codigo copiado!");
      setTimeout(() => setCopiedField(null), 2000);
    }).catch(() => toast.error("Erro ao copiar"));
  };

  const columns: Column<Charge>[] = [
    { key: "amount_cents", label: "Valor", render: (v: number) => formatCurrency(v) },
    { key: "due_date", label: "Vencimento", render: (v: string) => formatDateOnly(v) },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{statusLabel(v)}</Badge> },
    { key: "boleto_identification_field", label: "Codigo de Barras", render: (v: string | null) => v ? (
      <span className="font-mono text-xs cursor-pointer hover:text-primary-600" onClick={() => handleCopyField(v)}>
        {copiedField === v ? "Copiado!" : v.length > 20 ? v.substring(0, 20) + "..." : v}
      </span>
    ) : "-" },
    { key: "actions", label: "Acoes", render: (_: any, row: Charge) => (
      <div className="flex gap-2">
        {row.bank_slip_url && (
          <a href={row.bank_slip_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors">
            <FileText size={14} /> PDF
          </a>
        )}
        {row.boleto_identification_field && (
          <button onClick={() => handleCopyField(row.boleto_identification_field!)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            {copiedField === row.boleto_identification_field ? <Check size={14} /> : <Copy size={14} />}
            {copiedField === row.boleto_identification_field ? "Copiado" : "Linha"}
          </button>
        )}
      </div>
    )},
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Boletos">
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
            <Plus size={16} /> Novo Boleto
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Novo Boleto" size="md">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
              <input name="description" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                placeholder="Descricao do boleto" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowCreate(false)}
              className="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? "Criando..." : "Criar Boleto"}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}

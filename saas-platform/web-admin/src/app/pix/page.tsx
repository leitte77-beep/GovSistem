"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { QrCode, Copy, Check, Plus, Loader2, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDateOnly } from "@/lib/utils";

interface Charge {
  id: string;
  billing_type: string;
  amount_cents: number;
  due_date: string;
  status: string;
  invoice_url: string | null;
  bank_slip_url: string | null;
  pix_qr_code_base64: string | null;
  pix_copy_paste: string | null;
  external_id: string;
  created_at: string;
}

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmado" },
  { value: "received", label: "Recebido" },
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
    case "received": return "Recebido";
    case "confirmed": return "Confirmado";
    case "pending": return "Pendente";
    case "overdue": return "Vencido";
    case "canceled": return "Cancelado";
    case "refunded": return "Estornado";
    default: return s;
  }
};

export default function PixPage() {
  const [items, setItems] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [qrModal, setQrModal] = useState<Charge | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_name: "", customer_document: "", customer_email: "", customer_phone: "",
    amount: "", due_date: "", description: "",
  });
  const perPage = 10;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/charges?page=${page}&per_page=${perPage}&billing_type=PIX`;
      if (status) url += `&status=${status}`;
      const res = await api<{ data: Charge[]; total: number }>(url);
      setItems(res.data);
      setTotal(res.total);
    } catch { toast.error("Erro ao carregar cobrancas Pix"); }
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
      const res = await api<Charge>("/charges", {
        method: "POST",
        body: {
          billing_type: "PIX",
          amount_cents: amountCents,
          due_date: form.due_date,
          description: form.description || "Cobranca Pix",
          customer_name: form.customer_name.trim(),
          customer_document: form.customer_document.replace(/\D/g, ""),
          customer_email: form.customer_email || `${form.customer_name}@email.com`,
          customer_phone: form.customer_phone || undefined,
          customer_document_type: form.customer_document.length > 11 ? "cnpj" : "cpf",
        },
      });
      toast.success("Cobranca Pix criada!");
      setShowCreate(false);
      setForm({ customer_name: "", customer_document: "", customer_email: "", customer_phone: "", amount: "", due_date: "", description: "" });
      fetchItems();
      setTimeout(() => {
        setQrModal(res);
      }, 300);
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar cobranca Pix");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyQrCode = async () => {
    if (!qrModal?.pix_copy_paste) return;
    try {
      await navigator.clipboard.writeText(qrModal.pix_copy_paste);
      setCopied(true);
      toast.success("Codigo Pix copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Erro ao copiar"); }
  };

  const columns: Column<Charge>[] = [
    { key: "amount_cents", label: "Valor", render: (v: number) => formatCurrency(v) },
    { key: "due_date", label: "Vencimento", render: (v: string) => formatDateOnly(v) },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{statusLabel(v)}</Badge> },
    { key: "created_at", label: "Criada Em", render: (v: string) => formatDateOnly(v) },
    { key: "actions", label: "Acoes", render: (_: any, row: Charge) => (
      <div className="flex gap-2">
        <button onClick={(e) => { e.stopPropagation(); setQrModal(row); }}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-50 text-primary-600 hover:bg-primary-100 rounded-lg transition-colors">
          <QrCode size={14} /> QR Code
        </button>
      </div>
    )},
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Cobrancas Pix">
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
            <Plus size={16} /> Nova Cobranca Pix
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nova Cobranca Pix" size="md">
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
                placeholder="Descricao da cobranca" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowCreate(false)}
              className="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? "Criando..." : "Criar Pix"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!qrModal} onClose={() => { setQrModal(null); setCopied(false); }} title="QR Code Pix" size="md">
        {qrModal && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-4 inline-block">
                {qrModal.pix_qr_code_base64 ? (
                  <img src={`data:image/png;base64,${qrModal.pix_qr_code_base64}`} alt="QR Code Pix" className="w-48 h-48" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-gray-50 rounded-lg">
                    <QrCode size={64} className="text-gray-300" />
                  </div>
                )}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Codigo Pix Copia e Cola</span>
                <button onClick={handleCopyQrCode}
                  className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <p className="text-xs text-gray-600 break-all font-mono bg-white rounded p-3 border">
                {qrModal.pix_copy_paste || "Indisponivel"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Valor:</span>
                <p className="font-medium">{formatCurrency(qrModal.amount_cents)}</p>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>
                <p><Badge variant={statusVariant(qrModal.status)}>{statusLabel(qrModal.status)}</Badge></p>
              </div>
              <div>
                <span className="text-gray-500">Vencimento:</span>
                <p className="font-medium">{formatDateOnly(qrModal.due_date)}</p>
              </div>
              <div>
                <span className="text-gray-500">ID externo:</span>
                <p className="font-mono text-xs">{qrModal.external_id}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

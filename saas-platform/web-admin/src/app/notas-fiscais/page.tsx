"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { FileText, FileCode, XCircle, Plus, Loader2, ExternalLink } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDateOnly } from "@/lib/utils";

interface NfseDoc {
  id: string;
  nfse_number: string | null;
  rps_number: string | null;
  status: string;
  service_description: string;
  gross_amount_cents: number;
  net_amount_cents: number;
  verification_code: string | null;
  access_key: string | null;
  issue_date: string | null;
  rejection_reason: string | null;
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  amount_cents: number;
}

const statusOptions = [
  { value: "", label: "Todas" },
  { value: "pending", label: "Pendente" },
  { value: "authorized", label: "Autorizada" },
  { value: "issued", label: "Emitida" },
  { value: "rejected", label: "Rejeitada" },
  { value: "canceled", label: "Cancelada" },
];

const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
  switch (s) {
    case "authorized": case "issued": return "success";
    case "pending": return "info";
    case "rejected": return "danger";
    case "canceled": return "warning";
    default: return "default";
  }
};

const statusLabel = (s: string): string => {
  switch (s) {
    case "authorized": return "Autorizada";
    case "issued": return "Emitida";
    case "pending": return "Pendente";
    case "rejected": return "Rejeitada";
    case "canceled": return "Cancelada";
    case "draft": return "Rascunho";
    default: return s;
  }
};

export default function NotasFiscaisPage() {
  const [items, setItems] = useState<NfseDoc[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const perPage = 10;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/nfse?page=${page}&per_page=${perPage}`;
      if (status) url += `&status=${status}`;
      const res = await api<{ data: NfseDoc[]; total: number }>(url);
      setItems(res.data);
      setTotal(res.total);
    } catch { toast.error("Erro ao carregar notas fiscais"); }
    finally { setLoading(false); }
  }, [page, status]);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await api<{ data: Invoice[]; total: number }>("/invoices?per_page=100&status=paid");
      setInvoices(res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { if (showIssue) fetchInvoices(); }, [showIssue, fetchInvoices]);

  const handleIssue = async () => {
    if (!selectedInvoice) { toast.error("Selecione uma fatura"); return; }
    setSaving(true);
    try {
      const res = await api<NfseDoc>("/nfse/issue", {
        method: "POST",
        body: { invoice_id: selectedInvoice },
      });
      toast.success(`NFS-e emitida! ${res.nfse_number ? `No ${res.nfse_number}` : ""}`);
      setShowIssue(false);
      setSelectedInvoice("");
      fetchItems();
    } catch (err: any) {
      toast.error(err.message || "Erro ao emitir NFS-e");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    setActionId(id);
    try {
      await api(`/nfse/${id}/cancel`, {
        method: "POST",
        body: { reason: "Cancelamento a pedido do contratante" },
      });
      toast.success("NFS-e cancelada!");
      setCancelId(null);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao cancelar NFS-e"); }
    finally { setActionId(null); }
  };

  const columns: Column<NfseDoc>[] = [
    { key: "nfse_number", label: "Numero", render: (v: string | null) => v || "-" },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{statusLabel(v)}</Badge> },
    { key: "service_description", label: "Servico" },
    { key: "gross_amount_cents", label: "Valor Bruto", render: (v: number) => formatCurrency(v) },
    { key: "verification_code", label: "Cod. Verificacao", render: (v: string | null) => v ? <span className="font-mono text-xs">{v}</span> : "-" },
    { key: "issue_date", label: "Emissao", render: (v: string | null) => v ? formatDateOnly(v) : "-" },
    { key: "actions", label: "Acoes", render: (_: any, row: NfseDoc) => (
      <div className="flex gap-1">
        {(row.status === "authorized" || row.status === "issued") && (
          <>
            <a href={`/api/v1/nfse/${row.id}/xml`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors">
              <FileCode size={13} /> XML
            </a>
            <a href={`/api/v1/nfse/${row.id}/pdf`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors">
              <FileText size={13} /> PDF
            </a>
            <button onClick={(e) => { e.stopPropagation(); setCancelId(row.id); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors">
              <XCircle size={13} /> Cancelar
            </button>
          </>
        )}
        {row.status === "rejected" && (
          <span className="text-xs text-red-500" title={row.rejection_reason || ""}>
            {row.rejection_reason?.substring(0, 40) || "Rejeitada"}
          </span>
        )}
        {row.status === "canceled" && <span className="text-xs text-gray-400">Cancelada</span>}
        {row.status === "pending" && <span className="text-xs text-gray-400">Processando</span>}
      </div>
    )},
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Notas Fiscais (NFS-e)">
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={() => setShowIssue(true)}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Emitir NFS-e
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

      <Modal open={showIssue} onClose={() => { setShowIssue(false); setSelectedInvoice(""); }}
        title="Emitir NFS-e" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fatura Paga *</label>
            <select value={selectedInvoice} onChange={(e) => setSelectedInvoice(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
              <option value="">Selecione uma fatura...</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  #{inv.number} - {formatCurrency(inv.amount_cents)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => { setShowIssue(false); setSelectedInvoice(""); }}
              className="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
            <button onClick={handleIssue} disabled={saving || !selectedInvoice}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
              {saving ? "Emitindo..." : "Emitir NFS-e"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!cancelId} onClose={() => setCancelId(null)} title="Confirmar Cancelamento" size="sm">
        <p className="text-gray-600 mb-2">Tem certeza que deseja cancelar esta NFS-e?</p>
        <p className="text-xs text-gray-500 mb-6">Esta acao pode ter implicacoes fiscais. O cancelamento sera registrado no provedor.</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setCancelId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={() => cancelId && handleCancel(cancelId)} disabled={actionId === cancelId}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            {actionId === cancelId ? "..." : "Confirmar Cancelamento"}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}

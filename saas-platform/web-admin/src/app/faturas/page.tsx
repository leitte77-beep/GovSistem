"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDateOnly } from "@/lib/utils";
import { RefreshCw, QrCode, FileText, CreditCard, Loader2 } from "lucide-react";

interface Invoice {
  id: string;
  number: string;
  status: string;
  amount_cents: number;
  due_date: string;
  paid_at: string | null;
}

interface ChargeResult {
  id: string;
  billing_type: string;
  pix_qr_code_base64: string | null;
  pix_copy_paste: string | null;
  bank_slip_url: string | null;
  boleto_identification_field: string | null;
  invoice_url: string | null;
}

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Paga" },
  { value: "overdue", label: "Vencida" },
  { value: "canceled", label: "Cancelada" },
];

const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
  switch (s) {
    case "paid": return "success";
    case "pending": return "info";
    case "overdue": return "danger";
    case "canceled": return "warning";
    default: return "default";
  }
};

const statusLabel = (s: string): string => {
  switch (s) {
    case "paid": return "Paga";
    case "pending": return "Pendente";
    case "overdue": return "Vencida";
    case "canceled": return "Cancelada";
    default: return s;
  }
};

export default function FaturasPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [chargeResult, setChargeResult] = useState<ChargeResult | null>(null);
  const [chargeType, setChargeType] = useState<"PIX" | "BOLETO" | "CREDIT_CARD">("PIX");
  const perPage = 10;

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: Invoice[]; total: number }>(
        `/invoices?page=${page}&per_page=${perPage}${status ? `&status=${status}` : ""}`
      );
      setInvoices(res.data);
      setTotal(res.total);
    } catch { toast.error("Erro ao carregar faturas"); }
    finally { setLoading(false); }
  }, [page, status]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleAutoGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api<Invoice[]>("/invoices/auto-generate", { method: "POST" });
      toast.success(`${res.length} fatura(s) gerada(s) automaticamente!`);
      fetchInvoices();
    } catch (err: any) { toast.error(err.message || "Erro ao gerar faturas"); }
    finally { setGenerating(false); }
  };

  const handleGenerateCharge = async (invoice: Invoice, billingType: "PIX" | "BOLETO" | "CREDIT_CARD") => {
    setActionId(invoice.id);
    setChargeType(billingType);
    try {
      const res = await api<ChargeResult>("/charges", {
        method: "POST",
        body: {
          billing_type: billingType,
          amount_cents: invoice.amount_cents,
          due_date: invoice.due_date.substring(0, 10),
          description: `Fatura ${invoice.number}`,
          customer_name: "Cliente",
          customer_document: "00000000000",
          customer_email: "cliente@email.com",
          invoice_id: invoice.id,
        },
      });
      setChargeResult(res);
      toast.success(`${billingType === "PIX" ? "Pix" : "Boleto"} gerado com sucesso!`);
    } catch (err: any) {
      toast.error(err.message || `Erro ao gerar ${billingType}`);
    } finally {
      setActionId(null);
    }
  };

  const columns: Column<Invoice>[] = [
    { key: "number", label: "Numero", sortable: true },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{statusLabel(v)}</Badge> },
    { key: "amount_cents", label: "Valor", render: (v: number) => formatCurrency(v) },
    { key: "due_date", label: "Vencimento", render: (v: string) => formatDateOnly(v) },
    { key: "paid_at", label: "Pagamento", render: (v: string | null) => v ? formatDateOnly(v) : "-" },
    { key: "actions", label: "Acoes", render: (_: any, row: Invoice) => (
      <div className="flex gap-1">
        {(row.status === "pending" || row.status === "overdue") && (
          <>
            <button onClick={(e) => { e.stopPropagation(); handleGenerateCharge(row, "PIX"); }} disabled={actionId === row.id}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50">
              {actionId === row.id && chargeType === "PIX" ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />}
              Pix
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleGenerateCharge(row, "BOLETO"); }} disabled={actionId === row.id}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50">
              {actionId === row.id && chargeType === "BOLETO" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
              Boleto
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleGenerateCharge(row, "CREDIT_CARD"); }} disabled={actionId === row.id}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50">
              {actionId === row.id && chargeType === "CREDIT_CARD" ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
              Cartao
            </button>
          </>
        )}
        {row.status === "paid" && <span className="text-xs text-green-600 font-medium">Paga</span>}
        {row.status === "canceled" && <span className="text-xs text-gray-400">Cancelada</span>}
      </div>
    )},
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Faturas">
      <Card>
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="text-sm text-gray-500">{total} faturas</span>
          </div>
          <button onClick={handleAutoGenerate} disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 border border-primary-300 text-primary-600 hover:bg-primary-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            <RefreshCw size={16} className={generating ? "animate-spin" : ""} />
            {generating ? "Gerando..." : "Gerar Faturas Pendentes"}
          </button>
        </div>
        <Table columns={columns} data={invoices} loading={loading} />
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

      <Modal open={!!chargeResult} onClose={() => setChargeResult(null)}
        title={chargeType === "PIX" ? "QR Code Pix" : chargeType === "CREDIT_CARD" ? "Link de Pagamento" : "Boleto Gerado"} size="md">
        {chargeResult && (
          <div className="space-y-4">
            {chargeType === "PIX" && chargeResult.pix_qr_code_base64 && (
              <div className="flex justify-center">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-4 inline-block">
                  <img src={`data:image/png;base64,${chargeResult.pix_qr_code_base64}`}
                    alt="QR Code Pix" className="w-48 h-48" />
                </div>
              </div>
            )}
            {chargeType === "PIX" && chargeResult.pix_copy_paste && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Copia e Cola</p>
                <p className="text-xs text-gray-600 break-all font-mono bg-white rounded p-3 border">
                  {chargeResult.pix_copy_paste}
                </p>
              </div>
            )}
            {chargeType === "BOLETO" && chargeResult.bank_slip_url && (
              <div className="text-center">
                <a href={chargeResult.bank_slip_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <FileText size={18} /> Abrir Boleto PDF
                </a>
              </div>
            )}
            {chargeType === "BOLETO" && chargeResult.boleto_identification_field && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Linha Digitavel</p>
                <p className="text-sm font-mono bg-white rounded p-3 border break-all">
                  {chargeResult.boleto_identification_field}
                </p>
              </div>
            )}
            {chargeType === "CREDIT_CARD" && chargeResult.invoice_url && (
              <div className="text-center space-y-4">
                <p className="text-sm text-gray-600">Link de pagamento via cartao de credito gerado com sucesso.</p>
                <a href={chargeResult.invoice_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                  <CreditCard size={18} /> Pagar com Cartao
                </a>
                <p className="text-xs text-gray-400">
                  Nenhum dado de cartao e armazenado. Pagamento seguro via Asaas.
                </p>
              </div>
            )}
            <div className="flex justify-center">
              {chargeResult.invoice_url && chargeType !== "CREDIT_CARD" && (
                <a href={chargeResult.invoice_url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-primary-600 hover:text-primary-700 underline">
                  Abrir pagina de pagamento no Asaas
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

"use client";
import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import { Download, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface ClosingStatus {
  ready_for_closing: boolean;
  pending_invoices: number;
  overdue_receivables: number;
  unbalanced_entries: number;
  pending_nfse: number;
}

export default function ContadorPage() {
  const [status, setStatus] = useState<ClosingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const res = await api<ClosingStatus>(
          `/closing/check-readiness?month=${now.getMonth() + 1}&year=${now.getFullYear()}`
        ).catch(() => null);
        setStatus(res);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const handleExport = async (type: string) => {
    setExporting(type);
    try {
      const token = localStorage.getItem("saas_access_token");
      const now = new Date();
      const url = `/api/v1/exports/${type}?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erro ao exportar");
      const blob = await res.blob();
      const url2 = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url2; a.download = `${type}_${now.getFullYear()}_${now.getMonth() + 1}.csv`;
      a.click(); URL.revokeObjectURL(url2);
      toast.success("Exportado com sucesso!");
    } catch (err: any) { toast.error(err.message || "Erro ao exportar"); }
    finally { setExporting(null); }
  };

  const items = [
    { label: "Faturas", type: "invoices", icon: <FileText size={18} /> },
    { label: "Lançamentos Contábeis", type: "journal-entries", icon: <FileText size={18} /> },
    { label: "Contas a Receber", type: "receivables", icon: <FileSpreadsheet size={18} /> },
  ];

  return (
    <AppLayout title="Portal do Contador">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card padding={false} className="flex-1">
          <div className={`p-4 border-l-4 ${status?.ready_for_closing ? "border-l-green-500" : "border-l-yellow-500"}`}>
            <p className="text-xs text-gray-500 uppercase font-semibold">Status Fechamento</p>
            <p className={`text-lg font-bold mt-1 ${status?.ready_for_closing ? "text-green-600" : "text-yellow-600"}`}>
              {loading ? "..." : status?.ready_for_closing ? "Pronto" : "Pendências"}
            </p>
          </div>
        </Card>
        <Card padding={false} className="flex-1">
          <div className="p-4 border-l-4 border-l-blue-500">
            <p className="text-xs text-gray-500 uppercase font-semibold">Faturas Pendentes</p>
            <p className="text-2xl font-bold mt-1">{status?.pending_invoices ?? "-"}</p>
          </div>
        </Card>
        <Card padding={false} className="flex-1">
          <div className="p-4 border-l-4 border-l-red-500">
            <p className="text-xs text-gray-500 uppercase font-semibold">Recebíveis Vencidos</p>
            <p className="text-2xl font-bold mt-1">{status?.overdue_receivables ?? "-"}</p>
          </div>
        </Card>
        <Card padding={false} className="flex-1">
          <div className="p-4 border-l-4 border-l-purple-500">
            <p className="text-xs text-gray-500 uppercase font-semibold">Lançamentos Desbalanceados</p>
            <p className="text-2xl font-bold mt-1">{status?.unbalanced_entries ?? "-"}</p>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="text-headline-sm text-[#001631] mb-4">Exportar Pacote Mensal</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {items.map((item) => (
            <button key={item.type} onClick={() => handleExport(item.type)} disabled={exporting === item.type}
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-left">
              <div className="p-3 rounded-full bg-primary-50 text-primary-600">{item.icon}</div>
              <div className="flex-1">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-gray-400">CSV</p>
              </div>
              {exporting === item.type ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} className="text-gray-400" />}
            </button>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-headline-sm text-[#001631] mb-2">Documentos Fiscais</h3>
          <p className="text-sm text-gray-500 mb-4">Acesse NFS-e, XML e PDF dos documentos fiscais.</p>
          <a href="/notas-fiscais" className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 underline">
            Ir para Notas Fiscais →
          </a>
        </Card>
        <Card>
          <h3 className="text-headline-sm text-[#001631] mb-2">Relatórios Contábeis</h3>
          <p className="text-sm text-gray-500 mb-4">DRE, balancete e razão contábil mensal.</p>
          <a href="/contabilidade" className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 underline">
            Ir para Contabilidade →
          </a>
        </Card>
      </div>
    </AppLayout>
  );
}

"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatDate } from "@/lib/utils";

interface ApprovalRequest {
  id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  current_step: number;
  requested_at: string;
}

export default function AprovacoesPage() {
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showModal, setShowModal] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try { setItems(await api("/approval-workflows/requests/pending")); }
    catch { toast.error("Erro ao carregar"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDecision = async (id: string, decision: string) => {
    setActionId(id);
    try {
      await api(`/approval-workflows/requests/${id}/decide`, {
        method: "POST",
        body: { decision, reason: reason || undefined },
      });
      toast.success(decision === "approved" ? "Aprovado!" : "Rejeitado");
      setShowModal(null); setReason(""); fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro"); }
    finally { setActionId(null); }
  };

  const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
    switch (s) {
      case "approved": return "success";
      case "rejected": return "danger";
      case "pending": return "warning";
      default: return "default";
    }
  };

  const columns: Column<ApprovalRequest>[] = [
    { key: "entity_type", label: "Tipo" },
    { key: "entity_id", label: "ID", render: (v: string) => v.substring(0, 8) + "..." },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{v}</Badge> },
    { key: "current_step", label: "Etapa" },
    { key: "requested_at", label: "Solicitado", render: (v: string) => formatDate(v) },
    { key: "actions", label: "Ações", render: (_: any, row: ApprovalRequest) => (
      row.status === "pending" ? (
        <div className="flex gap-2">
          <button onClick={() => setShowModal(row.id)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-50 text-green-600 hover:bg-green-100 rounded-lg">
            <CheckCircle size={14} /> Aprovar
          </button>
          <button onClick={() => { setShowModal(row.id); }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg">
            <XCircle size={14} /> Rejeitar
          </button>
        </div>
      ) : <span className="text-xs text-gray-400">{row.status}</span>
    )},
  ];

  return (
    <AppLayout title="Aprovações Pendentes">
      <Card>
        <Table columns={columns} data={items} loading={loading} />
        {!loading && items.length === 0 && (
          <div className="text-center py-12 text-gray-400">Nenhuma aprovação pendente</div>
        )}
      </Card>

      <Modal open={!!showModal} onClose={() => { setShowModal(null); setReason(""); }} title="Decisão de Aprovação" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Justificativa (opcional):</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Motivo da decisão..." />
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setShowModal(null); setReason(""); }} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={() => showModal && handleDecision(showModal, "approved")} disabled={actionId === showModal}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {actionId === showModal ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Aprovar
            </button>
            <button onClick={() => showModal && handleDecision(showModal, "rejected")} disabled={actionId === showModal}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              {actionId === showModal ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Rejeitar
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

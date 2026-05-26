"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Table, { Column } from "@/components/ui/Table";
import Modal from "@/components/ui/Modal";
import { Calendar, Lock, Unlock, Loader2 } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatDateOnly } from "@/lib/utils";

interface Period {
  id: string;
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  status: string;
  closed_at: string | null;
  closed_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
  switch (s) {
    case "open": return "success";
    case "closed": return "warning";
    default: return "default";
  }
};

export default function PeriodosPage() {
  const [items, setItems] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [showOpen, setShowOpen] = useState(false);
  const [openMonth, setOpenMonth] = useState("");
  const [openYear, setOpenYear] = useState(yearFilter);
  const [saving, setSaving] = useState(false);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [reopenId, setReopenId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/accounting-periods";
      if (yearFilter) url += `?year=${yearFilter}`;
      const res = await api<{ data: Period[]; total: number }>(url);
      setItems(res.data);
    } catch { toast.error("Erro ao carregar periodos"); }
    finally { setLoading(false); }
  }, [yearFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleOpen = async () => {
    if (!openMonth || !openYear) { toast.error("Selecione mes e ano"); return; }
    setSaving(true);
    try {
      await api(`/accounting-periods/open?year=${openYear}&month=${openMonth}`, { method: "POST" });
      toast.success(`Periodo ${openMonth}/${openYear} aberto!`);
      setShowOpen(false);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao abrir periodo"); }
    finally { setSaving(false); }
  };

  const handleClose = async (id: string) => {
    setActionId(id);
    try {
      await api(`/accounting-periods/${id}/close`, { method: "POST" });
      toast.success("Periodo fechado!");
      setCloseId(null);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao fechar"); }
    finally { setActionId(null); }
  };

  const handleReopen = async (id: string) => {
    if (!reopenReason.trim()) { toast.error("Motivo da reabertura e obrigatorio"); return; }
    setActionId(id);
    try {
      await api(`/accounting-periods/${id}/reopen`, {
        method: "POST",
        body: { reason: reopenReason },
      });
      toast.success("Periodo reaberto!");
      setReopenId(null);
      setReopenReason("");
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao reabrir"); }
    finally { setActionId(null); }
  };

  const columns: Column<Period>[] = [
    { key: "month", label: "Periodo", render: (_: any, row: Period) => `${MONTHS[row.month - 1]} / ${row.year}` },
    { key: "start_date", label: "Inicio", render: (v: string) => formatDateOnly(v) },
    { key: "end_date", label: "Fim", render: (v: string) => formatDateOnly(v) },
    { key: "status", label: "Status", render: (v: string) => (
      <div className="flex items-center gap-2">
        {v === "open" ? <Unlock size={14} className="text-green-500" /> : <Lock size={14} className="text-amber-500" />}
        <Badge variant={statusVariant(v)}>{v === "open" ? "Aberto" : "Fechado"}</Badge>
      </div>
    )},
    { key: "closed_at", label: "Fechado Em", render: (v: string | null) => v ? formatDateOnly(v) : "-" },
    { key: "actions", label: "Acoes", render: (_: any, row: Period) => (
      <div className="flex gap-1">
        {row.status === "open" && (
          <button onClick={(e) => { e.stopPropagation(); setCloseId(row.id); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors">
            <Lock size={13} /> Fechar
          </button>
        )}
        {row.status === "closed" && (
          <button onClick={(e) => { e.stopPropagation(); setReopenId(row.id); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors">
            <Unlock size={13} /> Reabrir
          </button>
        )}
      </div>
    )},
  ];

  return (
    <AppLayout title="Periodos Contabeis">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Periodos Contabeis</h2>
          <p className="text-sm text-gray-500">{items.length} periodos</p>
        </div>
        <button onClick={() => setShowOpen(true)}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
          <Calendar size={16} /> Abrir Novo Periodo
        </button>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-6">
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <Table columns={columns} data={items} loading={loading}
          emptyMessage="Nenhum periodo contabil encontrado. Abra o primeiro periodo." />
      </Card>

      <Modal open={showOpen} onClose={() => setShowOpen(false)} title="Abrir Novo Periodo" size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
              <select value={openMonth} onChange={(e) => setOpenMonth(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
                <option value="">Selecione...</option>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
              <input type="number" value={openYear} onChange={(e) => setOpenYear(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <p className="text-xs text-gray-500">O periodo sera criado com status &quot;aberto&quot;.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowOpen(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={handleOpen} disabled={saving}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {saving ? "Abrindo..." : "Abrir Periodo"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!closeId} onClose={() => setCloseId(null)} title="Fechar Periodo" size="sm">
        <p className="text-gray-600 mb-6">Ao fechar o periodo, novos lancamentos contabeis serao bloqueados. Deseja continuar?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setCloseId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={() => closeId && handleClose(closeId)} disabled={actionId === closeId}
            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {actionId === closeId ? "..." : "Fechar Periodo"}
          </button>
        </div>
      </Modal>

      <Modal open={!!reopenId} onClose={() => { setReopenId(null); setReopenReason(""); }} title="Reabrir Periodo" size="md">
        <div className="space-y-4">
          <p className="text-gray-600">Informe o motivo da reabertura. Esta acao sera registrada em auditoria.</p>
          <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={3}
            placeholder="Motivo da reabertura (obrigatorio)"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm resize-none" />
          <div className="flex justify-end gap-3">
            <button onClick={() => { setReopenId(null); setReopenReason(""); }}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={() => reopenId && handleReopen(reopenId)} disabled={actionId === reopenId || !reopenReason.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {actionId === reopenId ? "..." : "Reabrir Periodo"}
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

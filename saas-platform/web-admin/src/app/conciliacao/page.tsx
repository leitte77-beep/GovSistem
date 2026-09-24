"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Upload, Link, CheckCircle, Undo2, RefreshCw, Banknote } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDateOnly } from "@/lib/utils";

interface BankStatementLine {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  status: string;
  matched_receivable_id?: string;
  matched_receivable_description?: string;
  match_reason?: string;
  suggestions?: any[];
}

interface MatchSuggestion {
  id: string;
  type: string;
  description: string;
  amount_cents: number;
  date: string;
  score: number;
  match_reason: string;
}

interface PendingReport {
  total: number;
  unreconciled: number;
  suggested: number;
  reconciled: number;
  completion_percent: number;
  unreconciled_amount_cents: number;
  oldest_unreconciled_date: string | null;
}

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "unreconciled", label: "Nao Conciliado" },
  { value: "suggested", label: "Sugerido" },
  { value: "reconciled", label: "Conciliado" },
];

export default function ConciliacaoPage() {
  const [items, setItems] = useState<BankStatementLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [showProviderImport, setShowProviderImport] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [report, setReport] = useState<PendingReport | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const perPage = 10;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/bank-statements?page=${page}&per_page=${perPage}`;
      if (status) url += `&status=${status}`;
      const res = await api<{ data: BankStatementLine[]; total: number }>(url);
      setItems(res.data);
      setTotal(res.total);
    } catch { toast.error("Erro ao carregar extrato bancario"); }
    finally { setLoading(false); }
  }, [page, status]);

  const fetchReport = useCallback(async () => {
    try {
      const res = await api<PendingReport>("/bank-statements/reports/pending");
      setReport(res);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchItems(); fetchReport(); }, [fetchItems, fetchReport]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/v1/bank-statements/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("saas_access_token")}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Erro ao importar" }));
        throw new Error(err.detail || "Erro ao importar");
      }
      toast.success("Extrato importado com sucesso!");
      setShowImport(false);
      fetchItems();
      fetchReport();
    } catch (err: any) { toast.error(err.message || "Erro ao importar extrato"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const handleProviderImport = async () => {
    if (!periodStart || !periodEnd) {
      toast.error("Selecione periodo de inicio e fim");
      return;
    }
    setUploading(true);
    try {
      await api("/bank-statements/import-provider", {
        method: "POST",
        body: { period_start: periodStart, period_end: periodEnd, account_id: "default" },
      });
      toast.success("Extrato do Asaas importado com sucesso!");
      setShowProviderImport(false);
      fetchItems();
      fetchReport();
    } catch (err: any) { toast.error(err.message || "Erro ao importar do provedor"); }
    finally { setUploading(false); }
  };

  const handleManualMatch = async (id: string, recId?: string) => {
    setActionId(id);
    try {
      let url = `/bank-statements/${id}/manual-match`;
      if (recId) url += `?receivable_id=${recId}`;
      await api(url, { method: "POST" });
      toast.success("Conciliacao manual realizada!");
      setMatchId(null);
      setSuggestions([]);
      fetchItems();
      fetchReport();
    } catch (err: any) { toast.error(err.message || "Erro ao conciliar"); }
    finally { setActionId(null); }
  };

  const handleAcceptSuggestion = async (id: string) => {
    setActionId(id);
    try {
      await api(`/bank-statements/${id}/accept-match`, { method: "POST" });
      toast.success("Sugestao aceita!");
      fetchItems();
      fetchReport();
    } catch (err: any) { toast.error(err.message || "Erro ao aceitar sugestao"); }
    finally { setActionId(null); }
  };

  const handleUndo = async (id: string) => {
    setActionId(id);
    try {
      await api(`/bank-statements/${id}/undo`, { method: "POST" });
      toast.success("Conciliacao desfeita!");
      fetchItems();
      fetchReport();
    } catch (err: any) { toast.error(err.message || "Erro ao desfazer"); }
    finally { setActionId(null); }
  };

  const handleShowSuggestions = async (id: string) => {
    setMatchId(id);
    setLoadingSuggestions(true);
    try {
      const res = await api<MatchSuggestion[]>(`/bank-statements/${id}/suggestions`);
      setSuggestions(res);
    } catch (err: any) { toast.error(err.message || "Erro ao buscar sugerencias"); setSuggestions([]); }
    finally { setLoadingSuggestions(false); }
  };

  const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
    switch (s) {
      case "reconciled": return "success";
      case "suggested": return "info";
      case "unreconciled": return "warning";
      default: return "default";
    }
  };

  const columns: Column<BankStatementLine>[] = [
    { key: "date", label: "Data", render: (v: string) => formatDateOnly(v) },
    { key: "description", label: "Descricao", sortable: true },
    { key: "amount_cents", label: "Valor", render: (v: number) => formatCurrency(v) },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{v}</Badge> },
    { key: "matched_receivable_description", label: "Correspondencia", render: (v: string | undefined, row: BankStatementLine) => (
      <div>
        <span className="text-sm">{v || "-"}</span>
        {row.match_reason && <span className="text-xs text-gray-400 block">{row.match_reason}</span>}
      </div>
    )},
    { key: "actions", label: "Acoes", render: (_: any, row: BankStatementLine) => (
      <div className="flex gap-2">
        {row.status === "suggested" && (
          <button onClick={(e) => { e.stopPropagation(); handleAcceptSuggestion(row.id); }} disabled={actionId === row.id}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50">
            <CheckCircle size={14} /> {actionId === row.id ? "..." : "Aceitar"}
          </button>
        )}
        {row.status === "unreconciled" && (
          <button onClick={(e) => { e.stopPropagation(); handleShowSuggestions(row.id); }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-yellow-50 text-yellow-600 hover:bg-yellow-100 rounded-lg transition-colors">
            <Link size={14} /> Conciliar
          </button>
        )}
        {row.status === "reconciled" && (
          <div className="flex gap-1">
            <span className="text-xs text-green-600 font-medium px-2 py-1.5 bg-green-50 rounded-lg">Conciliado</span>
            <button onClick={(e) => { e.stopPropagation(); handleUndo(row.id); }} disabled={actionId === row.id}
              className="flex items-center gap-1 px-2 py-1.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
              title="Desfazer conciliacao">
              <Undo2 size={14} />
            </button>
          </div>
        )}
      </div>
    )},
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Conciliacao Bancaria">
      <div className="flex gap-4 mb-6">
        <Card padding={false} className="flex-1">
          <div className="p-4 border-l-4 border-l-yellow-500">
            <p className="text-xs text-gray-500 uppercase font-semibold">Nao Conciliados</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{report?.unreconciled ?? "-"}</p>
            {report && <p className="text-xs text-gray-400 mt-1">{formatCurrency(report.unreconciled_amount_cents)}</p>}
          </div>
        </Card>
        <Card padding={false} className="flex-1">
          <div className="p-4 border-l-4 border-l-blue-500">
            <p className="text-xs text-gray-500 uppercase font-semibold">Sugeridos</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{report?.suggested ?? "-"}</p>
          </div>
        </Card>
        <Card padding={false} className="flex-1">
          <div className="p-4 border-l-4 border-l-green-500">
            <p className="text-xs text-gray-500 uppercase font-semibold">Conciliados</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{report?.reconciled ?? "-"}</p>
            {report && <p className="text-xs text-gray-400 mt-1">{report.completion_percent}% completo</p>}
          </div>
        </Card>
      </div>
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={fetchItems} className="p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" title="Atualizar">
              <RefreshCw size={16} className="text-gray-500" />
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowProviderImport(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
              <Banknote size={16} /> Importar Asaas
            </button>
            <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
              <Upload size={16} /> Importar Extrato
            </button>
          </div>
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

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar Extrato Bancario" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Selecione um arquivo OFX ou CSV do extrato bancario para importar.</p>
          <input type="file" ref={fileRef} accept=".ofx,.qfx,.csv" onChange={handleFileUpload}
            className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-600 hover:file:bg-primary-100" />
          {uploading && <p className="text-sm text-gray-500">Importando...</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowImport(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      </Modal>

      <Modal open={showProviderImport} onClose={() => setShowProviderImport(false)} title="Importar Extrato do Asaas" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Selecione o periodo para buscar pagamentos no Asaas.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Periodo Inicio</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Periodo Fim</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowProviderImport(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={handleProviderImport} disabled={uploading}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {uploading ? "Importando..." : "Importar"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!matchId} onClose={() => { setMatchId(null); setSuggestions([]); }} title="Conciliar Lancamento" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Selecione um recebivel correspondente ou concilie manualmente.</p>

          {loadingSuggestions && <p className="text-sm text-gray-500">Buscando sugestoes...</p>}

          {!loadingSuggestions && suggestions.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {suggestions.map((s) => (
                <div key={s.id} onClick={() => handleManualMatch(matchId!, s.id)}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-blue-50 cursor-pointer transition-colors">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{s.description}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-gray-500">{formatCurrency(s.amount_cents)}</span>
                      <span className="text-xs text-gray-500">{formatDateOnly(s.date)}</span>
                      <span className="text-xs text-blue-600">Score: {s.score}%</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{s.match_reason}</p>
                  </div>
                  <button className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100">
                    Vincular
                  </button>
                </div>
              ))}
            </div>
          )}

          {!loadingSuggestions && suggestions.length === 0 && (
            <p className="text-sm text-gray-400 italic">Nenhuma sugestao automatica encontrada.</p>
          )}

          <div className="border-t pt-3">
            <button onClick={() => handleManualMatch(matchId!)} disabled={actionId === matchId}
              className="w-full px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50">
              {actionId === matchId ? "..." : "Conciliar sem vinculo (lancamento geral)"}
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setMatchId(null); setSuggestions([]); }} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

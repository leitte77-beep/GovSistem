"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import { Plus, Search } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Subscription {
  id: string;
  organization_name: string;
  plan_name: string;
  status: string;
  start_date: string;
  end_date: string;
  amount_cents: number;
}

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "active", label: "Ativa" },
  { value: "trial", label: "Trial" },
  { value: "past_due", label: "Inadimplente" },
  { value: "canceled", label: "Cancelada" },
  { value: "expired", label: "Expirada" },
];

export default function AssinaturasPage() {
  const router = useRouter();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 10;

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(perPage) });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      let url = `/subscriptions?page=${page}&per_page=${perPage}`;
      if (status) url += `&status=${status}`;
      const res = await api<{ data: Subscription[]; total: number }>(url);
      setSubs(res.data);
      setTotal(res.total);
    } catch { toast.error("Erro ao carregar assinaturas"); }
    finally { setLoading(false); }
  }, [page, search, status]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
    switch (s) {
      case "active": return "success";
      case "trial": return "info";
      case "past_due": return "warning";
      case "canceled": case "expired": return "danger";
      default: return "default";
    }
  };

  const columns: Column<Subscription>[] = [
    { key: "organization_name", label: "Orgao", sortable: true },
    { key: "plan_name", label: "Plano", sortable: true },
    { key: "status", label: "Status", render: (v: string) => <Badge variant={statusVariant(v)}>{v}</Badge> },
    { key: "start_date", label: "Inicio", render: (v: string) => formatDate(v) },
    { key: "end_date", label: "Fim Periodo", render: (v: string) => v ? formatDate(v) : "-" },
    { key: "amount_cents", label: "Valor", render: (v: number) => formatCurrency(v) },
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Assinaturas">
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Buscar orgao..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full sm:w-64 pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            </div>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={() => router.push("/assinaturas/new")} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Nova Assinatura
          </button>
        </div>
        <Table columns={columns} data={subs} loading={loading} />
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
    </AppLayout>
  );
}

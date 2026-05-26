"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatDate } from "@/lib/utils";

interface AuditEvent {
  id: string;
  actor_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const actionOptions = [
  { value: "", label: "Todas" },
  { value: "create", label: "Criacao" },
  { value: "update", label: "Atualizacao" },
  { value: "delete", label: "Exclusao" },
  { value: "login", label: "Login" },
  { value: "module_access", label: "Acesso Modulo" },
  { value: "backup_start", label: "Inicio Backup" },
];

const actionVariant = (a: string): "success" | "warning" | "danger" | "info" | "default" => {
  switch (a) {
    case "create": return "success";
    case "update": return "info";
    case "delete": return "danger";
    case "login": return "default";
    case "module_access": return "warning";
    default: return "default";
  }
};

export default function AuditoriaPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 20;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/audit/events?page=${page}&per_page=${perPage}`;
      if (action) url += `&action=${action}`;
      const res = await api<{ data: AuditEvent[]; total: number }>(url);
      setEvents(res.data);
      setTotal(res.total);
    } catch { toast.error("Erro ao carregar eventos"); }
    finally { setLoading(false); }
  }, [page, action]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const columns: Column<AuditEvent>[] = [
    { key: "created_at", label: "Data", render: (v: string) => formatDate(v), sortable: true },
    { key: "actor_email", label: "Usuario" },
    { key: "action", label: "Acao", render: (v: string) => <Badge variant={actionVariant(v)}>{v}</Badge> },
    { key: "resource_type", label: "Recurso" },
    { key: "resource_id", label: "ID", render: (v: string | null) => v ? <span className="text-xs font-mono">{v.slice(0, 8)}...</span> : "-" },
    { key: "ip_address", label: "IP" },
  ];

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="Auditoria">
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
            {actionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="text-sm text-gray-500">{total} eventos</span>
        </div>
        <Table columns={columns} data={events} loading={loading} emptyMessage="Nenhum evento encontrado." />
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <span className="text-sm text-gray-500">Pagina {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50">Anterior</button>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50">Proximo</button>
            </div>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}

"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import { Plus, Play } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatDate } from "@/lib/utils";

interface BackupConfig {
  id: string;
  name: string;
  organization_name: string;
  enabled: boolean;
  frequency: string;
  last_run: string | null;
}

interface BackupLog {
  id: string;
  config_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  size_bytes: number;
  error_message: string | null;
}

type Tab = "configs" | "logs";

export default function BackupsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("configs");
  const [configs, setConfigs] = useState<BackupConfig[]>([]);
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: BackupConfig[] }>("/backups/configs");
      setConfigs(res.data);
    } catch { toast.error("Erro ao carregar configuracoes"); }
    finally { setLoading(false); }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: BackupLog[] }>("/backups/logs");
      setLogs(res.data);
    } catch { toast.error("Erro ao carregar logs"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "configs") fetchConfigs();
    else fetchLogs();
  }, [tab, fetchConfigs, fetchLogs]);

  const handleRun = async (configId: string, configName: string) => {
    setRunning(configId);
    try {
      await api(`/backups/configs/${configId}/run`, { method: "POST" });
      toast.success(`Backup "${configName}" iniciado!`);
    } catch (err: any) { toast.error(err.message || "Erro ao executar backup"); }
    finally { setRunning(null); }
  };

  const configColumns: Column<BackupConfig>[] = [
    { key: "name", label: "Nome", sortable: true },
    { key: "organization_name", label: "Orgao" },
    { key: "enabled", label: "Status", render: (v: boolean) => <Badge variant={v ? "success" : "danger"}>{v ? "Habilitado" : "Desabilitado"}</Badge> },
    { key: "frequency", label: "Frequencia" },
    { key: "last_run", label: "Ultima Execucao", render: (v: string | null) => v ? formatDate(v) : "-" },
    { key: "actions", label: "Acoes", render: (_: any, row: BackupConfig) => (
      <button
        onClick={(e) => { e.stopPropagation(); handleRun(row.id, row.name); }}
        disabled={running === row.id}
        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-50 text-primary-600 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50"
      >
        <Play size={14} /> {running === row.id ? "..." : "Executar"}
      </button>
    )},
  ];

  const logColumns: Column<BackupLog>[] = [
    { key: "config_name", label: "Configuracao" },
    { key: "status", label: "Status", render: (v: string) => {
      const variant = v === "success" ? "success" : v === "failed" ? "danger" : "default";
      return <Badge variant={variant}>{v}</Badge>;
    }},
    { key: "started_at", label: "Inicio", render: (v: string) => formatDate(v) },
    { key: "completed_at", label: "Termino", render: (v: string | null) => v ? formatDate(v) : "-" },
    { key: "error_message", label: "Erro", render: (v: string | null) => v ? <span className="text-red-600 text-xs">{v}</span> : "-" },
  ];

  const tabClasses = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? "bg-primary-600 text-white" : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <AppLayout title="Backups">
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <button onClick={() => setTab("configs")} className={tabClasses("configs")}>Configuracoes</button>
            <button onClick={() => setTab("logs")} className={tabClasses("logs")}>Logs</button>
          </div>
          {tab === "configs" && (
            <button onClick={() => router.push("/backups/new")} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
              <Plus size={16} /> Nova Config
            </button>
          )}
        </div>
        {tab === "configs" ? (
          <Table columns={configColumns} data={configs} loading={loading} emptyMessage="Nenhuma configuracao de backup encontrada." />
        ) : (
          <Table columns={logColumns} data={logs} loading={loading} emptyMessage="Nenhum log de backup encontrado." />
        )}
      </Card>
    </AppLayout>
  );
}

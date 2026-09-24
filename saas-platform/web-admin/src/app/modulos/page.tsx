"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { ArrowRight, ExternalLink, Plus, Pencil, Trash2 } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface Module {
  id: string;
  name: string;
  slug: string;
  version: string;
  is_active: boolean;
  base_url: string;
}

export default function ModulosPage() {
  const router = useRouter();
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Module | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingModuleId, setOpeningModuleId] = useState<string | null>(null);

  const fetchModules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Module[]>("/modules");
      setModules(Array.isArray(res) ? res : (res as any).data || []);
    } catch { toast.error("Erro ao carregar modulos"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchModules(); }, [fetchModules]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/modules/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Modulo excluido com sucesso!");
      setDeleteTarget(null);
      fetchModules();
    } catch (err: any) { toast.error(err.message || "Erro ao excluir"); }
    finally { setDeleting(false); }
  };

  const handleOpenModule = async (mod: Module) => {
    setOpeningModuleId(mod.id);
    try {
      const res = await api<{ module_token: string; module_url: string }>("/auth/module-access", {
        method: "POST",
        body: { module_slug: mod.slug },
      });
      const joiner = res.module_url.includes("?") ? "&" : "?";
      window.location.href = `${res.module_url}${joiner}token=${encodeURIComponent(res.module_token)}`;
    } catch (err: any) {
      toast.error(err.message || "Erro ao abrir modulo");
    } finally {
      setOpeningModuleId(null);
    }
  };

  const columns: Column<Module>[] = [
    { key: "name", label: "Nome", sortable: true },
    { key: "slug", label: "Slug", sortable: true },
    { key: "version", label: "Versao" },
    { key: "is_active", label: "Status", render: (v: boolean) => <Badge variant={v ? "success" : "danger"}>{v ? "Ativo" : "Inativo"}</Badge> },
    { key: "base_url", label: "URL Base" },
    { key: "actions", label: "Acoes", render: (_: any, row: Module) => (
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); handleOpenModule(row); }}
          disabled={openingModuleId === row.id}
          className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-50"
          title="Abrir modulo"
        >
          {openingModuleId === row.id ? <ArrowRight size={16} className="animate-pulse" /> : <ExternalLink size={16} />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); router.push(`/modulos/${row.id}/edit`); }} className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Pencil size={16} /></button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
      </div>
    )},
  ];

  return (
    <AppLayout title="Modulos">
      <Card>
        <div className="flex justify-end mb-6">
          <button onClick={() => router.push("/modulos/new")} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Novo Modulo
          </button>
        </div>
        <Table columns={columns} data={modules} loading={loading} />
      </Card>
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmar Exclusao" size="sm">
        <p className="text-gray-600 mb-4">Tem certeza que deseja excluir o modulo <strong>{deleteTarget?.name}</strong>?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? "Excluindo..." : "Excluir"}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}

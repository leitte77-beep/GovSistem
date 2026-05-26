"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Trash2, Loader2, Power } from "lucide-react";
import Link from "next/link";

interface Organization {
  id: string;
  name: string;
  is_active: boolean;
}

interface AssignedOrg {
  organization_id: string;
  name: string;
  is_active: boolean;
}

export default function EditModuloPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<any>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [assignedOrgs, setAssignedOrgs] = useState<AssignedOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    Promise.all([
      api<any>(`/modules/${id}`),
      api<{ data: Organization[] }>("/organizations?limit=500"),
      api<{ data: AssignedOrg[] }>(`/modules/${id}/organizations`).catch(() => ({ data: [] })),
    ])
      .then(([mod, orgsRes, assignedRes]) => {
        setForm({
          name: mod.name || "", slug: mod.slug || "", description: mod.description || "",
          icon: mod.icon || "", base_url: mod.base_url || "", api_url: mod.api_url || "",
          admin_url: mod.admin_url || "", public_url: mod.public_url || "",
          is_active: mod.is_active ?? true, version: mod.version || "1.0.0",
        });
        setOrgs(orgsRes.data);
        setAssignedOrgs(assignedRes.data || []);
      })
      .catch(() => toast.error("Erro ao carregar dados"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev: any) => prev ? { ...prev, [name]: (e.target as HTMLInputElement).checked } : prev);
    } else {
      setForm((prev: any) => prev ? { ...prev, [name]: value } : prev);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/modules/${id}`, { method: "PUT", body: form });
      toast.success("Modulo atualizado com sucesso!");
      router.push("/modulos");
    } catch (err: any) { toast.error(err.message || "Erro ao atualizar"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/modules/${id}`, { method: "DELETE" });
      toast.success("Modulo excluido com sucesso!");
      router.push("/modulos");
    } catch (err: any) { toast.error(err.message || "Erro ao excluir"); }
    finally { setDeleting(false); setShowDelete(false); }
  };

  const toggleAssign = async (orgId: string) => {
    setAssigning(true);
    try {
      const isAssigned = assignedOrgs.some((a) => a.organization_id === orgId);
      if (isAssigned) {
        await api(`/modules/${id}/organizations/${orgId}`, { method: "DELETE" });
        setAssignedOrgs((prev) => prev.filter((a) => a.organization_id !== orgId));
        toast.success("Orgao desassociado");
      } else {
        await api(`/modules/${id}/organizations`, { method: "POST", body: { organization_id: orgId } });
        const org = orgs.find((o) => o.id === orgId);
        setAssignedOrgs((prev) => [...prev, { organization_id: orgId, name: org?.name || "", is_active: true }]);
        toast.success("Orgao associado");
      }
    } catch (err: any) { toast.error(err.message || "Erro ao alterar associacao"); }
    finally { setAssigning(false); }
  };

  const inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm";

  if (loading) return <AppLayout title="Editar Modulo"><div className="flex justify-center py-16"><Spinner /></div></AppLayout>;
  if (!form) return <AppLayout title="Editar Modulo"><p className="text-gray-500">Modulo nao encontrado.</p></AppLayout>;

  return (
    <AppLayout title="Editar Modulo">
      <div className="max-w-3xl space-y-6">
        <form onSubmit={handleSubmit}>
          <Card title="Dados do Modulo">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label><input name="name" value={form.name} onChange={handleChange} required className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label><input name="slug" value={form.slug} onChange={handleChange} required className={inputClass} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label><textarea name="description" value={form.description || ""} onChange={handleChange} rows={3} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Icone</label><input name="icon" value={form.icon || ""} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Versao</label><input name="version" value={form.version} onChange={handleChange} className={inputClass} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">URL Base</label><input name="base_url" value={form.base_url || ""} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">API URL</label><input name="api_url" value={form.api_url || ""} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Admin URL</label><input name="admin_url" value={form.admin_url || ""} onChange={handleChange} className={inputClass} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">URL Publica</label><input name="public_url" value={form.public_url || ""} onChange={handleChange} className={inputClass} /></div>
            </div>
            <div className="mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Ativo</span>
              </label>
            </div>
          </Card>

          <div className="flex items-center gap-3 mt-6">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar
            </button>
            <Link href="/modulos" className="flex items-center gap-2 border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              <ArrowLeft size={18} /> Cancelar
            </Link>
            <button type="button" onClick={() => setShowDelete(true)} className="flex items-center gap-2 border border-red-300 text-red-600 px-4 py-2.5 rounded-lg font-medium hover:bg-red-50 transition-colors ml-auto">
              <Trash2 size={18} /> Excluir
            </button>
          </div>
        </form>

        <Card title="Atribuir a Orgaos">
          <p className="text-sm text-gray-500 mb-4">Ative ou desative modulos para cada orgao.</p>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {orgs.map((org) => {
              const isAssigned = assignedOrgs.some((a) => a.organization_id === org.id);
              return (
                <div key={org.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{org.name}</p>
                    <Badge variant={org.is_active ? "success" : "danger"}>{org.is_active ? "Ativo" : "Inativo"}</Badge>
                  </div>
                  <button
                    type="button"
                    disabled={assigning}
                    onClick={() => toggleAssign(org.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      isAssigned ? "bg-primary-100 text-primary-600 hover:bg-primary-200" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                    }`}
                  >
                    <Power size={18} className={isAssigned ? "fill-primary-600" : ""} />
                  </button>
                </div>
              );
            })}
            {orgs.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nenhum orgao encontrado.</p>}
          </div>
        </Card>
      </div>

      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Confirmar Exclusao" size="sm">
        <p className="text-gray-600 mb-4">Tem certeza que deseja excluir este modulo?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? "Excluindo..." : "Excluir"}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}

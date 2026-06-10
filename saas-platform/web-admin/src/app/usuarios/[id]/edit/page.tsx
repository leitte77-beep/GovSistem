"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

interface Organization {
  id: string;
  name: string;
}

interface Module {
  id: string;
  slug: string;
  name: string;
}

interface RoleCatalogItem {
  name: string;
  label: string;
}

type RoleCatalog = Record<string, RoleCatalogItem[]>;
type Grants = Record<string, string[]>;

const roles = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "PLATFORM_ADMIN", label: "Admin da Plataforma" },
  { value: "BILLING_MANAGER", label: "Gestor de Cobranca" },
  { value: "SUPPORT", label: "Suporte" },
  { value: "AUDITOR", label: "Auditor" },
];

export default function EditUsuarioPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [catalog, setCatalog] = useState<RoleCatalog>({});
  const [grants, setGrants] = useState<Grants>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([
      api<any>(`/users/${id}`),
      api<{ data: Organization[] }>("/organizations?limit=200"),
      api<Module[]>("/modules?is_active=true"),
      api<RoleCatalog>("/users/roles/catalog"),
      api<{ grants: Grants }>(`/users/${id}/grants`),
    ])
      .then(([user, orgsRes, modulesRes, catalogRes, grantsRes]) => {
        setForm({
          name: user.name || "",
          email: user.email || "",
          cpf: user.cpf || "",
          phone: user.phone || "",
          is_platform_admin: user.is_platform_admin ?? false,
          is_organization_admin: user.is_organization_admin ?? false,
          platform_role: user.platform_role || "",
          organization_id: user.organization_id || "",
          is_active: user.is_active ?? true,
          module_permissions: user.module_permissions || [],
        });
        setOrgs(orgsRes.data);
        setModules(modulesRes || []);
        setCatalog(catalogRes || {});
        setGrants(grantsRes.grants || {});
      })
      .catch(() => toast.error("Erro ao carregar dados"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev: any) => prev ? { ...prev, [name]: (e.target as HTMLInputElement).checked } : prev);
    } else {
      setForm((prev: any) => prev ? { ...prev, [name]: value } : prev);
    }
  };

  const toggleRole = (slug: string, role: string) => {
    setGrants((prev) => {
      const current = prev[slug] || [];
      const updated = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role];
      const next = { ...prev };
      if (updated.length > 0) next[slug] = updated;
      else delete next[slug];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Module access is derived from grants: a module with at least one role.
      const moduleSlugs = Object.keys(grants).filter((s) => (grants[s] || []).length > 0);
      const body = {
        ...form,
        cpf: form.cpf?.replace(/\D/g, "") || null,
        organization_id: form.organization_id || null,
        email: form.email || null,
        module_permissions: moduleSlugs,
      };
      if (password) body.password = password;
      await api(`/users/${id}`, { method: "PUT", body });
      await api(`/users/${id}/grants`, { method: "PUT", body: { grants } });
      toast.success("Usuario atualizado com sucesso!");
      router.push("/usuarios");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/users/${id}`, { method: "DELETE" });
      toast.success("Usuario excluido com sucesso!");
      router.push("/usuarios");
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm";

  if (loading) {
    return <AppLayout title="Editar Usuario"><div className="flex justify-center py-16"><Spinner /></div></AppLayout>;
  }

  if (!form) {
    return <AppLayout title="Editar Usuario"><p className="text-gray-500">Usuario nao encontrado.</p></AppLayout>;
  }

  return (
    <AppLayout title="Editar Usuario">
      <div className="max-w-3xl">
        <form onSubmit={handleSubmit}>
          <Card title="Dados do Usuario">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input name="name" value={form.name} onChange={handleChange} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nova senha"
                    className={`${inputClass} pr-12`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                <input name="cpf" value={form.cpf || ""} onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  const masked = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").slice(0, 14);
                  setForm({ ...form, cpf: masked });
                }} placeholder="000.000.000-00" maxLength={14} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input name="phone" value={form.phone || ""} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Funcao</label>
                <select name="platform_role" value={form.platform_role || ""} onChange={handleChange} className={inputClass}>
                  <option value="">Selecione...</option>
                  {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orgao</label>
                <select name="organization_id" value={form.organization_id || ""} onChange={handleChange} className={inputClass}>
                  <option value="">Nenhum</option>
                  {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="is_platform_admin" checked={form.is_platform_admin} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Admin da Plataforma (acesso total)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="is_organization_admin" checked={form.is_organization_admin} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Admin do Orgão (gerencia módulos)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Ativo</span>
              </label>
            </div>

            {!form.is_platform_admin && form.organization_id && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                <p className="text-sm font-medium text-gray-700 mb-1">Acessos por módulo</p>
                <p className="text-xs text-gray-500 mb-4">
                  Marque o que este usuário pode fazer em cada módulo. Sem nenhuma
                  marcação, ele não tem acesso ao módulo.
                </p>
                {modules.length === 0 && <p className="text-sm text-gray-400">Nenhum módulo ativo.</p>}
                <div className="space-y-4">
                  {modules.map((mod) => {
                    const roles = catalog[mod.slug] || [];
                    if (roles.length === 0) return null;
                    const selected = grants[mod.slug] || [];
                    return (
                      <div key={mod.slug} className="bg-white rounded-lg border p-3">
                        <p className="text-sm font-semibold text-gray-800 mb-2">{mod.name}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {roles.map((role) => (
                            <label key={role.name} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selected.includes(role.name)}
                                onChange={() => toggleRole(mod.slug, role.name)}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-sm text-gray-700">{role.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <div className="flex items-center gap-3 mt-6">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar
            </button>
            <Link href="/usuarios" className="flex items-center gap-2 border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              <ArrowLeft size={18} /> Cancelar
            </Link>
            <button type="button" onClick={() => setShowDelete(true)} className="flex items-center gap-2 border border-red-300 text-red-600 px-4 py-2.5 rounded-lg font-medium hover:bg-red-50 transition-colors ml-auto">
              <Trash2 size={18} /> Excluir
            </button>
          </div>
        </form>
      </div>

      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Confirmar Exclusao" size="sm">
        <p className="text-gray-600 mb-4">Tem certeza que deseja excluir este usuario?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? "Excluindo..." : "Excluir"}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}

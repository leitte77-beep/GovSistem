"use client";
import React, { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Trash2, Loader2, Eye, EyeOff, History, Undo2, Upload } from "lucide-react";
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

interface HistoryEntry {
  id: string;
  action: string;
  actor_email: string;
  details: Record<string, any> | null;
  ip_address: string;
  created_at: string;
}

const roles = [
  { value: "", label: "Nenhuma" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "PLATFORM_ADMIN", label: "Admin da Plataforma" },
  { value: "BILLING_MANAGER", label: "Gestor de Cobranca" },
  { value: "SUPPORT", label: "Suporte" },
  { value: "AUDITOR", label: "Auditor" },
];

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "—", color: "bg-gray-200" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { score, label: "Fraca", color: "bg-red-500" };
  if (score <= 4) return { score, label: "Media", color: "bg-yellow-500" };
  return { score, label: "Forte", color: "bg-green-500" };
}

const actionLabels: Record<string, string> = {
  create: "Criacao",
  update: "Edicao",
  delete: "Exclusao",
  restore: "Restauracao",
  update_profile: "Atualizacao de perfil",
  change_password: "Troca de senha",
  login: "Login",
};

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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [tab, setTab] = useState<"dados" | "historico">("dados");
  const fileRef = useRef<HTMLInputElement>(null);

  const passwordStrength = getPasswordStrength(password);

  useEffect(() => {
    Promise.all([
      api<any>(`/users/${id}`),
      api<{ data: Organization[] }>("/organizations?limit=200"),
      api<Module[]>("/modules?is_active=true"),
      api<RoleCatalog>("/users/roles/catalog"),
      api<{ grants: Grants }>(`/users/${id}/grants`),
      api<HistoryEntry[]>(`/users/${id}/history`).catch(() => [] as HistoryEntry[]),
    ])
      .then(([user, orgsRes, modulesRes, catalogRes, grantsRes, historyRes]) => {
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
          force_password_reset: user.force_password_reset ?? false,
        });
        setOrgs(orgsRes.data);
        setModules(modulesRes || []);
        setCatalog(catalogRes || {});
        setGrants(grantsRes.grants || {});
        setHistory(historyRes || []);
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

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    let masked = digits;
    if (digits.length > 0) masked = `(${digits.slice(0, 2)}`;
    if (digits.length > 2) masked += `) ${digits.slice(2, 7)}`;
    if (digits.length > 7) masked += `-${digits.slice(7, 11)}`;
    setForm((prev: any) => prev ? { ...prev, phone: masked.slice(0, 15) } : prev);
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
      const moduleSlugs = Object.keys(grants).filter((s) => (grants[s] || []).length > 0);
      const body = {
        ...form,
        cpf: form.cpf?.replace(/\D/g, "") || null,
        phone: form.phone?.replace(/\D/g, "") || null,
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

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await api(`/users/${id}/restore`, { method: "PATCH" });
      toast.success("Usuario restaurado com sucesso!");
      router.push("/usuarios");
    } catch (err: any) {
      toast.error(err.message || "Erro ao restaurar");
    } finally {
      setRestoring(false);
    }
  };

  const handleExportCSV = () => {
    window.open(`/api/v1/users/export/csv`, "_blank");
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const result = await api<{ created: number; skipped: number; errors: string[] }>("/users/import/csv", {
        method: "POST",
        body: formData,
        headers: {},
      });
      let msg = `${result.created} usuarios criados.`;
      if (result.skipped > 0) msg += ` ${result.skipped} ignorados.`;
      toast.success(msg);
      if (result.errors.length > 0) {
        console.warn("Import errors:", result.errors);
        if (result.errors.length <= 5) {
          result.errors.forEach((err) => toast.error(err));
        } else {
          toast.error(`${result.errors.length} erros. Verifique o console.`);
        }
      }
      router.push("/usuarios");
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
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
        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab("dados")}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === "dados" ? "border-primary-600 text-primary-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Dados
          </button>
          <button
            type="button"
            onClick={() => setTab("historico")}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              tab === "historico" ? "border-primary-600 text-primary-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <History size={16} /> Historico
          </button>
        </div>

        {tab === "dados" && (
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
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${passwordStrength.color}`}
                          style={{ width: `${(passwordStrength.score / 6) * 100}%` }} />
                      </div>
                      <span className="text-xs font-medium">{passwordStrength.label}</span>
                    </div>
                  )}
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
                  <input name="phone" value={form.phone || ""} onChange={handlePhoneChange} className={inputClass} placeholder="(00) 00000-0000" maxLength={15} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Funcao</label>
                  <select name="platform_role" value={form.platform_role || ""} onChange={handleChange} className={inputClass}>
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
                  <span className="text-sm text-gray-700">Admin do Orgao (gerencia modulos)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-gray-700">Ativo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="force_password_reset" checked={form.force_password_reset} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-gray-700">Forcar reset de senha no proximo login</span>
                </label>
              </div>

              {!form.is_platform_admin && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                  <p className="text-sm font-medium text-gray-700 mb-1">Acessos por modulo</p>
                  <p className="text-xs text-gray-500 mb-4">
                    Marque o que este usuario pode fazer em cada modulo. Sem nenhuma marcacao, ele nao tem acesso ao modulo.
                  </p>
                  {modules.length === 0 && <p className="text-sm text-gray-400">Nenhum modulo ativo.</p>}
                  <div className="space-y-4">
                    {modules.map((mod) => {
                      const modRoles = catalog[mod.slug] || [];
                      if (modRoles.length === 0) return null;
                      const selected = grants[mod.slug] || [];
                      return (
                        <div key={mod.slug} className="bg-white rounded-lg border p-3">
                          <p className="text-sm font-semibold text-gray-800 mb-2">{mod.name}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {modRoles.map((role) => (
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
              <div className="flex gap-2 ml-auto">
                <button type="button" onClick={handleRestore} disabled={restoring}
                  className="flex items-center gap-2 border border-green-300 text-green-600 px-4 py-2.5 rounded-lg font-medium hover:bg-green-50 transition-colors disabled:opacity-50">
                  <Undo2 size={18} /> {restoring ? "Restaurando..." : "Restaurar"}
                </button>
                <button type="button" onClick={() => setShowDelete(true)} className="flex items-center gap-2 border border-red-300 text-red-600 px-4 py-2.5 rounded-lg font-medium hover:bg-red-50 transition-colors">
                  <Trash2 size={18} /> Excluir
                </button>
              </div>
            </div>
          </form>
        )}

        {tab === "historico" && (
          <Card title="Historico de Alteracoes">
            {history.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">Nenhum evento de auditoria encontrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-3 px-2 font-semibold text-gray-600">Acao</th>
                      <th className="py-3 px-2 font-semibold text-gray-600">Autor</th>
                      <th className="py-3 px-2 font-semibold text-gray-600">Detalhes</th>
                      <th className="py-3 px-2 font-semibold text-gray-600">IP</th>
                      <th className="py-3 px-2 font-semibold text-gray-600">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2.5 px-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            entry.action === "create" ? "bg-green-100 text-green-700" :
                            entry.action === "delete" ? "bg-red-100 text-red-700" :
                            entry.action === "restore" ? "bg-blue-100 text-blue-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>
                            {actionLabels[entry.action] || entry.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-gray-700">{entry.actor_email || "—"}</td>
                        <td className="py-2.5 px-2 text-gray-500 text-xs max-w-[250px] truncate">
                          {entry.details ? Object.entries(entry.details).map(([k, v]) => `${k}: ${v}`).join(", ") : "—"}
                        </td>
                        <td className="py-2.5 px-2 text-gray-500 text-xs">{entry.ip_address || "—"}</td>
                        <td className="py-2.5 px-2 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(entry.created_at).toLocaleString("pt-BR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Delete modal */}
      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Confirmar Exclusao" size="sm">
        <p className="text-gray-600 mb-4">Tem certeza que deseja excluir este usuario?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            {deleting ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </Modal>

      {/* Hidden file input for CSV import */}
      <input ref={fileRef} type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
    </AppLayout>
  );
}

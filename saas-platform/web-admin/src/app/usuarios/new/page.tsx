"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Loader2, User, Shield, Puzzle } from "lucide-react";
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

const platformRoles = [
  { value: "", label: "Selecione o nivel de acesso..." },
  { value: "SUPER_ADMIN", label: "Super Admin — acesso total a plataforma" },
  { value: "PLATFORM_ADMIN", label: "Admin da Plataforma — gerencia usuarios e orgaos" },
  { value: "BILLING_MANAGER", label: "Gestor de Cobranca — gerencia planos e faturas" },
  { value: "SUPPORT", label: "Suporte — atende tickets e auxilia usuarios" },
  { value: "AUDITOR", label: "Auditor — consulta logs e auditoria" },
];

const MODULE_ICONS: Record<string, string> = {
  diario: "📰",
  financeiro: "💰",
  chatgov: "💬",
  govtask: "📋",
  govouve: "📢",
};

export default function NewUsuarioPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", email: "", password: "", cpf: "", phone: "",
    is_platform_admin: false, is_organization_admin: false, platform_role: "", organization_id: "",
    is_active: true, module_permissions: [] as string[],
  });
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [catalog, setCatalog] = useState<RoleCatalog>({});
  const [grants, setGrants] = useState<Grants>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ data: Organization[] }>("/organizations?limit=200").then((r) => setOrgs(r.data)).catch(() => {});
    api<Module[]>("/modules?is_active=true").then((r) => setModules(r || [])).catch(() => {});
    api<RoleCatalog>("/users/roles/catalog").then((r) => setCatalog(r || {})).catch(() => {});
  }, []);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const moduleSlugs = Object.keys(grants).filter((s) => (grants[s] || []).length > 0);
      const body = {
        ...form,
        cpf: form.cpf.replace(/\D/g, "") || undefined,
        organization_id: form.organization_id || null,
        module_permissions: moduleSlugs.length > 0 ? moduleSlugs : undefined,
      };
      const created = await api<{ id: string }>("/users", { method: "POST", body });
      if (created?.id && moduleSlugs.length > 0) {
        await api(`/users/${created.id}/grants`, { method: "PUT", body: { grants } });
      }
      toast.success("Usuario criado com sucesso!");
      router.push("/usuarios");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuario");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-4 py-3 border border-outline-variant bg-white rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none text-sm text-on-surface placeholder:text-on-surface-variant/60 transition-colors";
  const labelClass = "block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5";

  const activeModules = modules.filter((mod) => (catalog[mod.slug] || []).length > 0);

  return (
    <AppLayout title="Novo Usuario">
      <form onSubmit={handleSubmit} className="max-w-4xl">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">Novo Usuario</h1>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Crie um novo perfil de acesso ao sistema governamental.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/usuarios"
              className="px-5 py-2.5 border border-outline-variant rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={16} /> Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 active:scale-[0.98] transition-all shadow-md shadow-primary-600/20 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
              {saving ? "Salvando..." : "Salvar Usuario"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Section 1: Informações Pessoais */}
          <div className="bg-white/80 backdrop-blur-sm border border-outline-variant rounded-xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-outline-variant">
              <User size={20} className="text-primary-600" />
              <h3 className="text-lg font-bold text-on-surface">Informacoes Pessoais</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <label className={labelClass}>Nome Completo *</label>
                <input name="name" value={form.name} onChange={handleChange} required className={inputClass} placeholder="Ex: Joao da Silva" />
              </div>
              <div>
                <label className={labelClass}>E-mail Corporativo *</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} required className={inputClass} placeholder="email@gov.br" />
              </div>
              <div>
                <label className={labelClass}>CPF *</label>
                <input name="cpf" value={form.cpf} onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  const masked = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").slice(0, 14);
                  setForm({ ...form, cpf: masked });
                }} placeholder="000.000.000-00" maxLength={14} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Telefone</label>
                <input name="phone" value={form.phone} onChange={handleChange} className={inputClass} placeholder="(00) 00000-0000" />
              </div>
              <div>
                <label className={labelClass}>Orgao</label>
                <select name="organization_id" value={form.organization_id} onChange={handleChange} className={`${inputClass} appearance-none`}>
                  <option value="">Selecione o orgao...</option>
                  {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Seguranca e Acessos */}
          <div className="bg-white/80 backdrop-blur-sm border border-outline-variant rounded-xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-outline-variant">
              <Shield size={20} className="text-primary-600" />
              <h3 className="text-lg font-bold text-on-surface">Seguranca e Acessos</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
              <div>
                <label className={labelClass}>Senha Temporaria *</label>
                <input name="password" type="password" value={form.password} onChange={handleChange} required className={inputClass} placeholder="••••••••" />
              </div>
              <div>
                <label className={labelClass}>Confirmar Senha *</label>
                <input type="password" value={form.password} readOnly className={inputClass} placeholder="••••••••" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Funcao no Sistema</label>
                <select name="platform_role" value={form.platform_role} onChange={handleChange} className={`${inputClass} appearance-none`}>
                  {platformRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Permissoes de Diretorio</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-start gap-4 p-4 rounded-xl border border-outline-variant hover:bg-surface-container-low transition-colors cursor-pointer">
                  <input type="checkbox" name="is_platform_admin" checked={form.is_platform_admin} onChange={handleChange} className="w-5 h-5 mt-0.5 rounded border-outline text-primary-600 focus:ring-primary-500" />
                  <div>
                    <p className="text-sm font-semibold text-on-surface">Admin da Plataforma</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">Acesso total a todas as configuracoes globais.</p>
                  </div>
                </label>
                <label className="flex items-start gap-4 p-4 rounded-xl border border-outline-variant hover:bg-surface-container-low transition-colors cursor-pointer">
                  <input type="checkbox" name="is_organization_admin" checked={form.is_organization_admin} onChange={handleChange} className="w-5 h-5 mt-0.5 rounded border-outline text-primary-600 focus:ring-primary-500" />
                  <div>
                    <p className="text-sm font-semibold text-on-surface">Admin do Orgao</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">Gerencia modulos apenas dentro do orgao.</p>
                  </div>
                </label>
              </div>
              <label className="flex items-start gap-4 p-4 rounded-xl bg-primary-50/60 border border-primary-100 transition-colors cursor-pointer">
                <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="w-5 h-5 mt-0.5 rounded border-outline text-primary-600 focus:ring-primary-500" />
                <div>
                  <p className="text-sm font-semibold text-on-surface">Ativo</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Define se o usuario tera permissao para logar imediatamente.</p>
                </div>
              </label>
            </div>
          </div>

          {/* Section 3: Acessos por modulo */}
          <div className="bg-white/80 backdrop-blur-sm border border-outline-variant rounded-xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-outline-variant">
              <Puzzle size={20} className="text-primary-600" />
              <h3 className="text-lg font-bold text-on-surface">Acessos por modulo</h3>
            </div>

            {activeModules.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-8 text-center">
                Nenhum modulo ativo com papeis disponiveis.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeModules.map((mod) => {
                  const modRoles = catalog[mod.slug] || [];
                  const selected = grants[mod.slug] || [];
                  return (
                    <div key={mod.slug} className="border border-outline-variant rounded-xl overflow-hidden bg-surface">
                      <div className="bg-surface-container-low px-4 py-3 border-b border-outline-variant flex items-center gap-2.5">
                        <span className="text-lg">{MODULE_ICONS[mod.slug] || "📦"}</span>
                        <span className="text-sm font-semibold text-on-surface">{mod.name}</span>
                      </div>
                      <div>
                        {modRoles.map((role, i) => (
                          <label
                            key={role.name}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-container-lowest transition-colors ${
                              i < modRoles.length - 1 ? "border-b border-outline-variant/50" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(role.name)}
                              onChange={() => toggleRole(mod.slug, role.name)}
                              className="w-4 h-4 rounded border-outline text-primary-600 focus:ring-primary-500 shrink-0"
                            />
                            <span className="text-sm text-on-surface">{role.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeModules.length > 0 && (
              <p className="text-xs text-on-surface-variant mt-4 text-center">
                Sem nenhuma marcacao, o usuario nao tem acesso ao modulo.
              </p>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="flex justify-center py-6 text-on-surface-variant/60">
          <div className="flex items-center gap-2">
            <span className="text-sm">🔒</span>
            <p className="text-xs font-medium">Todas as alteracoes sao registradas em log de auditoria.</p>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

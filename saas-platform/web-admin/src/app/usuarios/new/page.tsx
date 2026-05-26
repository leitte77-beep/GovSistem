"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface Organization {
  id: string;
  name: string;
}

const roles = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "PLATFORM_ADMIN", label: "Admin da Plataforma" },
  { value: "BILLING_MANAGER", label: "Gestor de Cobranca" },
  { value: "SUPPORT", label: "Suporte" },
  { value: "AUDITOR", label: "Auditor" },
];

export default function NewUsuarioPage() {
  const router = useRouter();
interface Module {
  id: string;
  slug: string;
  name: string;
}

const ALL_MODULES: Module[] = [
  { id: "diario", slug: "diario", name: "Diário Oficial" },
  { id: "financeiro", slug: "financeiro", name: "Financeiro" },
];

  const [form, setForm] = useState({
    name: "", email: "", password: "", cpf: "", phone: "",
    is_platform_admin: false, is_organization_admin: false, platform_role: "", organization_id: "",
    is_active: true, module_permissions: [] as string[],
  });
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ data: Organization[] }>("/organizations?limit=200").then((r) => setOrgs(r.data)).catch(() => {});
  }, []);

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
      const body = {
        ...form,
        cpf: form.cpf.replace(/\D/g, "") || undefined,
        organization_id: form.organization_id || null,
        module_permissions: form.module_permissions.length > 0 ? form.module_permissions : undefined,
      };
      await api("/users", { method: "POST", body });
      toast.success("Usuario criado com sucesso!");
      router.push("/usuarios");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuario");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm";

  return (
    <AppLayout title="Novo Usuario">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                <input name="password" type="password" value={form.password} onChange={handleChange} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                <input name="cpf" value={form.cpf} onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  const masked = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").slice(0, 14);
                  setForm({ ...form, cpf: masked });
                }} placeholder="000.000.000-00" maxLength={14} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input name="phone" value={form.phone} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Funcao</label>
                <select name="platform_role" value={form.platform_role} onChange={handleChange} className={inputClass}>
                  <option value="">Selecione...</option>
                  {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orgao</label>
                <select name="organization_id" value={form.organization_id} onChange={handleChange} className={inputClass}>
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
                <p className="text-sm font-medium text-gray-700 mb-3">Módulos disponíveis neste orgão</p>
                <div className="flex flex-wrap gap-4">
                  {ALL_MODULES.map((mod) => (
                    <label key={mod.slug} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.module_permissions.includes(mod.slug)}
                        onChange={(e) => {
                          const perms = e.target.checked
                            ? [...form.module_permissions, mod.slug]
                            : form.module_permissions.filter((p: string) => p !== mod.slug);
                          setForm({ ...form, module_permissions: perms });
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{mod.name}</span>
                    </label>
                  ))}
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
          </div>
        </form>
      </div>
    </AppLayout>
  );
}

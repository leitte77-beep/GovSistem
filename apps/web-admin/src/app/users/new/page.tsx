"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import clsx from "clsx";
import { api } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/types/user";

const ROLE_ICONS: Record<string, string> = {
  ADMIN: "key",
  AUTOR: "edit_note",
  REVISOR: "spellcheck",
  DIAGRAMADOR: "dashboard_customize",
  ASSINADOR: "history_edu",
  PUBLICADOR: "public",
  AUDITOR: "manage_search",
};

export default function NewUserPage() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.listRoles().then(setRoles).catch(() => {});
  }, []);

  const errors: Record<string, string> = {};
  if (touched.name && !name.trim()) errors.name = "Nome é obrigatório";
  if (touched.email && !email.trim()) errors.email = "Email é obrigatório";
  if (touched.email && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Email inválido";
  if (touched.password && !password) errors.password = "Senha é obrigatória";
  if (touched.password && password && password.length < 6) errors.password = "Mínimo 6 caracteres";

  const isValid = Object.keys(errors).length === 0 && name && email && password;

  const toggleRole = (roleName: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true });
    if (!isValid) return;
    setSaving(true);
    try {
      await api.createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        organization_id: currentUser?.organization_id || "",
        role_names: selectedRoles,
      });
      toast.success("Usuário criado com sucesso!");
      router.push("/users");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar usuário");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-gutter max-w-container-max mx-auto w-full">
      <Breadcrumbs items={[{ label: "Usuários", href: "/users" }, { label: "Novo Usuário" }]} />

      <div className="bg-primary text-white p-8 rounded-xl shadow-lg mb-8 relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-6">
          <div className="bg-on-primary-container/20 p-4 rounded-xl backdrop-blur-md">
            <span className="material-symbols-outlined text-4xl">person_add</span>
          </div>
          <div>
            <h1 className="text-headline-lg font-headline-lg">Novo Usuário</h1>
            <p className="text-on-primary-container text-body-md">Preencha os dados abaixo para criar um novo acesso ao sistema administrativo.</p>
          </div>
        </div>
        <div className="absolute right-0 top-0 w-64 h-full opacity-10 pointer-events-none">
          <svg className="h-full w-full" viewBox="0 0 100 100">
            <circle cx="100" cy="0" fill="currentColor" r="80" />
            <circle cx="100" cy="0" fill="currentColor" opacity="0.5" r="60" />
          </svg>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-stack-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
            <div className="space-y-2">
              <label className="block text-label-md font-label-md text-on-surface-variant" htmlFor="full-name">
                Nome Completo <span className="text-error">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline">person</span>
                <input
                  id="full-name"
                  className={clsx(
                    "w-full pl-10 pr-4 py-3 rounded-lg border focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none",
                    errors.name ? "border-error bg-error-container/20" : "border-outline-variant"
                  )}
                  placeholder="Ex: Maria Oliveira"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                />
              </div>
              {errors.name && <p className="text-xs text-error mt-1">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <label className="block text-label-md font-label-md text-on-surface-variant" htmlFor="email">
                E-mail Corporativo <span className="text-error">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline">mail</span>
                <input
                  id="email"
                  className={clsx(
                    "w-full pl-10 pr-4 py-3 rounded-lg border focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none",
                    errors.email ? "border-error bg-error-container/20" : "border-outline-variant"
                  )}
                  placeholder="email@exemplo.com.br"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                />
              </div>
              {errors.email && <p className="text-xs text-error mt-1">{errors.email}</p>}
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="block text-label-md font-label-md text-on-surface-variant" htmlFor="password">
                Senha <span className="text-error">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline">lock</span>
                <input
                  id="password"
                  className={clsx(
                    "w-full pl-10 pr-12 py-3 rounded-lg border focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none",
                    errors.password ? "border-error bg-error-container/20" : "border-outline-variant"
                  )}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  <span className="material-symbols-outlined">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
              {errors.password && <p className="text-xs text-error mt-1">{errors.password}</p>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-outline-variant pb-2">
              <span className="material-symbols-outlined text-primary">shield</span>
              <h3 className="text-headline-sm font-headline-sm text-primary">Permissões de Acesso</h3>
            </div>
            <p className="text-on-surface-variant text-body-sm italic">
              Selecione o perfil que melhor descreve as atribuições deste usuário no sistema.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {roles.map((role) => {
                const isSelected = selectedRoles.includes(role.name);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.name)}
                    className={clsx(
                      "p-4 border rounded-xl transition-all flex flex-col items-center text-center gap-3 group",
                      isSelected
                        ? "border-secondary bg-secondary-container/10"
                        : "border-outline-variant hover:bg-surface-container"
                    )}
                  >
                    <div className={clsx(
                      "w-12 h-12 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform",
                      isSelected ? "bg-secondary-container text-secondary" : "bg-surface-container text-primary"
                    )}>
                      <span className="material-symbols-outlined text-2xl">
                        {ROLE_ICONS[role.name] || "shield"}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-primary">{role.label}</p>
                      <p className="text-[10px] uppercase font-bold text-outline">{role.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-8 border-t border-outline-variant">
            <button
              type="submit"
              disabled={saving || !isValid}
              className="w-full sm:w-auto px-12 py-3.5 bg-secondary text-on-secondary font-bold rounded-lg shadow-md hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined">
                {saving ? "progress_activity" : "save"}
              </span>
              {saving ? "Salvando..." : "Criar Usuário"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/users")}
              className="w-full sm:w-auto px-8 py-3.5 text-on-surface-variant font-bold hover:bg-surface-container transition-colors rounded-lg text-center"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

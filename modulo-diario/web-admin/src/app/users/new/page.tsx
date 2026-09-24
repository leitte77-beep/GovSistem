"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Shield,
  KeyRound,
  FileText,
  SpellCheck,
  LayoutDashboard,
  PenLine,
  Globe,
  SearchCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/types/user";
import { notifyError } from "@/lib/error-handler";

const ROLE_ICONS: Record<string, LucideIcon> = {
  ADMIN: KeyRound,
  AUTOR: FileText,
  REVISOR: SpellCheck,
  DIAGRAMADOR: LayoutDashboard,
  ASSINADOR: PenLine,
  PUBLICADOR: Globe,
  AUDITOR: SearchCheck,
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
    api.listRoles()
      .then((items) => setRoles(items.filter((role) => role.name !== "SUPER_ADMIN")))
      .catch((err) => notifyError("NewUser.listRoles", err));
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
        role_names: selectedRoles.filter((role) => role !== "SUPER_ADMIN"),
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
    <div className="mx-auto w-full max-w-container-max space-y-6 p-gutter">
      <div>
        <Breadcrumbs items={[{ label: "Usuários", href: "/users" }, { label: "Novo usuário" }]} />
        <PageHeader
          eyebrow="Acesso"
          title="Novo usuário"
          description="Preencha os dados abaixo para criar um novo acesso ao sistema administrativo."
        />
      </div>

      <form onSubmit={handleSubmit} className="card space-y-8 p-6 sm:p-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="full-name">
              Nome completo <span className="text-error">*</span>
            </label>
            <div className="relative">
              <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true" />
              <input
                id="full-name"
                className={clsx("input pl-9", errors.name && "border-error bg-error-container/40 focus:border-error")}
                placeholder="Ex.: Maria Oliveira"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, name: true }))}
              />
            </div>
            {errors.name && <p className="field-hint text-error">{errors.name}</p>}
          </div>
          <div>
            <label className="field-label" htmlFor="email">
              E-mail corporativo <span className="text-error">*</span>
            </label>
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true" />
              <input
                id="email"
                className={clsx("input pl-9", errors.email && "border-error bg-error-container/40 focus:border-error")}
                placeholder="email@exemplo.com.br"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, email: true }))}
              />
            </div>
            {errors.email && <p className="field-hint text-error">{errors.email}</p>}
          </div>
          <div className="md:col-span-2">
            <label className="field-label" htmlFor="password">
              Senha <span className="text-error">*</span>
            </label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true" />
              <input
                id="password"
                className={clsx("input pl-9 pr-11", errors.password && "border-error bg-error-container/40 focus:border-error")}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-outline transition-colors hover:bg-surface-container hover:text-primary"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
            {errors.password ? (
              <p className="field-hint text-error">{errors.password}</p>
            ) : (
              <p className="field-hint">Use ao menos 6 caracteres.</p>
            )}
          </div>
        </div>

        <hr className="rule" />

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-primary" aria-hidden="true" />
            <h2 className="text-headline-sm text-on-surface">Permissões de acesso</h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Selecione o perfil que melhor descreve as atribuições deste usuário no sistema.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((role) => {
              const isSelected = selectedRoles.includes(role.name);
              const Icon = ROLE_ICONS[role.name] || Shield;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.name)}
                  aria-pressed={isSelected}
                  className={clsx(
                    "flex flex-col items-center gap-3 rounded-xl border p-4 text-center transition-colors",
                    isSelected
                      ? "border-primary bg-primary-fixed"
                      : "border-outline-variant hover:bg-surface-container-low"
                  )}
                >
                  <span className={clsx(
                    "flex h-11 w-11 items-center justify-center rounded-full",
                    isSelected ? "bg-primary text-on-primary" : "bg-surface-container text-primary"
                  )}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-body-md font-semibold text-on-surface">{role.label}</span>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-outline">{role.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <hr className="rule" />

        <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row">
          <button type="submit" disabled={saving || !isValid} className="btn-primary w-full sm:w-auto">
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            {saving ? "Salvando…" : "Criar usuário"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/users")}
            className="btn-ghost w-full sm:w-auto"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

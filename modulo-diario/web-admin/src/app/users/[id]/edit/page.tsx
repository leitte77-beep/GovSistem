"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Save,
  Loader2,
  User,
  Mail,
  Shield,
  ToggleLeft,
  ToggleRight,
  KeyRound,
  FileText,
  SpellCheck,
  LayoutDashboard,
  PenLine,
  Globe,
  SearchCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import clsx from "clsx";
import { api } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import type { Role, User as UserType } from "@/types/user";

const ROLE_ICONS: Record<string, LucideIcon> = {
  ADMIN: KeyRound,
  AUTOR: FileText,
  REVISOR: SpellCheck,
  DIAGRAMADOR: LayoutDashboard,
  ASSINADOR: PenLine,
  PUBLICADOR: Globe,
  AUDITOR: SearchCheck,
};

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const [user, setUser] = useState<UserType | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([
      api.getUser(params.id as string),
      api.listRoles(),
    ])
      .then(([u, r]) => {
        if (u.managed_by_saas) {
          toast.error("Usuários gerenciados pelo SaaS não podem ser editados no Diário");
          router.replace("/users");
          return;
        }
        setUser(u);
        setName(u.name);
        setEmail(u.email);
        setIsActive(u.is_active);
        setRoles(r.filter((role) => role.name !== "SUPER_ADMIN"));
      })
      .catch(() => toast.error("Erro ao carregar usuário"))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  const errors: Record<string, string> = {};
  if (touched.name && !name.trim()) errors.name = "Nome é obrigatório";
  if (touched.email && !email.trim()) errors.email = "Email é obrigatório";
  if (touched.email && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Email inválido";

  const toggleRole = (roleName: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true });
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    try {
      await api.updateUser(params.id as string, {
        name: name.trim(),
        email: email.trim(),
        is_active: isActive,
        role_names: selectedRoles.length > 0 ? selectedRoles.filter((role) => role !== "SUPER_ADMIN") : undefined,
      });
      toast.success("Usuário atualizado com sucesso!");
      router.push("/users");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Carregando usuário">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl px-gutter py-8">
        <EmptyState title="Usuário não encontrado" description="O usuário pode ter sido removido ou o link está incorreto." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-gutter py-8">
      <div>
        <Breadcrumbs items={[{ label: "Usuários", href: "/users" }, { label: "Editar usuário" }]} />
        <PageHeader
          eyebrow="Acesso"
          title={user.name}
          description={user.email}
        />
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6 p-6">
        {/* Name */}
        <div>
          <label htmlFor="edit-user-name" className="field-label flex items-center gap-1.5">
            <User size={14} aria-hidden="true" /> Nome <span className="text-error">*</span>
          </label>
          <input
            id="edit-user-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, name: true }))}
            className={clsx("input", errors.name && "border-error bg-error-container/40 focus:border-error")}
          />
          {errors.name && <p className="field-hint text-error">{errors.name}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="edit-user-email" className="field-label flex items-center gap-1.5">
            <Mail size={14} aria-hidden="true" /> E-mail <span className="text-error">*</span>
          </label>
          <input
            id="edit-user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, email: true }))}
            className={clsx("input", errors.email && "border-error bg-error-container/40 focus:border-error")}
          />
          {errors.email && <p className="field-hint text-error">{errors.email}</p>}
        </div>

        <hr className="rule" />

        {/* Active toggle */}
        <div>
          <span className="field-label flex items-center gap-1.5">
            <Shield size={14} aria-hidden="true" /> Status
          </span>
          <button
            type="button"
            onClick={() => setIsActive(!isActive)}
            aria-pressed={isActive}
            className={clsx(
              "flex w-full items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
              isActive
                ? "border-success-container bg-success-container text-on-success-container"
                : "border-error-container bg-error-container text-on-error-container"
            )}
          >
            {isActive ? <ToggleRight size={22} aria-hidden="true" /> : <ToggleLeft size={22} aria-hidden="true" />}
            <span className="text-body-md font-semibold">
              {isActive ? "Usuário ativo" : "Usuário inativo"}
            </span>
          </button>
          <p className="field-hint">Usuários inativos não conseguem autenticar no painel.</p>
        </div>

        <hr className="rule" />

        {/* Roles */}
        <div>
          <span className="field-label flex items-center gap-1.5">
            <Shield size={14} aria-hidden="true" /> Permissões
          </span>
          <div className="mt-1 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
                    "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary-fixed text-primary"
                      : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                  )}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-semibold">{role.label}</span>
                    <span className="block truncate text-[10px] uppercase tracking-wide opacity-70">{role.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <hr className="rule" />

        {/* Actions */}
        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push("/users")}
            className="btn-ghost"
          >
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}

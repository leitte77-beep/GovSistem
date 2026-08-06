"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Save,
  Loader2,
  User,
  Mail,
  Shield,
  ArrowLeft,
  ToggleLeft,
  ToggleRight,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import toast from "react-hot-toast";
import clsx from "clsx";
import { api } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import type { Role, User as UserType } from "@/types/user";

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const [user, setUser] = useState<UserType | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        setUser(u);
        setName(u.name);
        setEmail(u.email);
        setCpf(u.cpf || "");
        setIsActive(u.is_active);
        setRoles(r);
      })
      .catch(() => toast.error("Erro ao carregar usuário"))
      .finally(() => setLoading(false));
  }, [params.id]);

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
      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        is_active: isActive,
        role_names: selectedRoles.length > 0 ? selectedRoles : undefined,
      };
      if (password) body.password = password;
      body.cpf = cpf.replace(/\D/g, "") || undefined;
      await api.updateUser(params.id as string, body);
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
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Carregando usuário...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-400">Usuário não encontrado</p>
      </div>
    );
  }

  const ROLE_ICONS: Record<string, string> = {
    ADMIN: "🔑", AUTOR: "✍️", REVISOR: "✅",
    DIAGRAMADOR: "🎨", ASSINADOR: "📝",
    PUBLICADOR: "📢", AUDITOR: "🔍",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Breadcrumbs items={[{ label: "Usuários", href: "/users" }, { label: "Editar Usuário" }]} />

      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6">
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className={clsx(
            "w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg",
            isActive
              ? "bg-gradient-to-br from-blue-500 to-blue-600"
              : "bg-gradient-to-br from-slate-400 to-slate-500"
          )}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{user.name}</h1>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 p-6 space-y-6">
        {/* Name */}
        <div>
          <label htmlFor="edit-user-name" className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1.5">
            <User size={15} /> Nome <span className="text-red-400">*</span>
          </label>
          <input
            id="edit-user-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, name: true }))}
            className={clsx(
              "w-full px-4 py-2.5 border-2 rounded-xl outline-none transition-all text-sm",
              errors.name
                ? "border-red-300 bg-red-50 focus-visible:border-red-400"
                : "border-slate-200 focus-visible:border-blue-400 hover:border-slate-300"
            )}
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="edit-user-email" className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1.5">
            <Mail size={15} /> Email <span className="text-red-400">*</span>
          </label>
          <input
            id="edit-user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, email: true }))}
            className={clsx(
              "w-full px-4 py-2.5 border-2 rounded-xl outline-none transition-all text-sm",
              errors.email
                ? "border-red-300 bg-red-50 focus-visible:border-red-400"
                : "border-slate-200 focus-visible:border-blue-400 hover:border-slate-300"
            )}
          />
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
        </div>

        {/* CPF */}
        <div>
          <label htmlFor="edit-user-cpf" className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1.5">
            <User size={15} /> CPF
          </label>
          <input
            id="edit-user-cpf"
            type="text"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="000.000.000-00"
            maxLength={14}
            className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl outline-none transition-all text-sm focus-visible:border-blue-400 hover:border-slate-300"
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="edit-user-password" className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1.5">
            <Lock size={15} /> Nova Senha
          </label>
          <div className="relative">
            <input
              id="edit-user-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nova senha"
              className="w-full px-4 py-2.5 pr-12 border-2 border-slate-200 rounded-xl outline-none transition-all text-sm focus-visible:border-blue-400 hover:border-slate-300"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Active toggle */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2">
            <Shield size={15} /> Status
          </label>
          <button
            type="button"
            onClick={() => setIsActive(!isActive)}
            className={clsx(
              "flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all w-full",
              isActive
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-red-300 bg-red-50 text-red-600"
            )}
          >
            {isActive ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
            <span className="text-sm font-semibold">
              {isActive ? "Usuário Ativo" : "Usuário Inativo"}
            </span>
          </button>
        </div>

        {/* Roles */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-3">
            <Shield size={15} /> Permissões
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {roles.map((role) => {
              const isSelected = selectedRoles.includes(role.name);
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.name)}
                  className={clsx(
                    "flex items-center gap-2.5 px-3.5 py-3 rounded-xl border-2 text-left transition-all",
                    isSelected
                      ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <span className="text-lg">{ROLE_ICONS[role.name] || "📋"}</span>
                  <div>
                    <p className="text-sm font-semibold">{role.label}</p>
                    <p className="text-[10px] opacity-70 leading-tight">{role.name}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Salvando..." : "Salvar Alterações"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/users")}
            className="px-5 py-2.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

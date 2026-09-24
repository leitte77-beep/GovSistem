"use client";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";

interface AccessLogEntry {
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

type Tab = "cadastro" | "senha" | "acessos";

function formatCpf(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

const actionLabels: Record<string, string> = {
  login: "Login no portal",
  module_access: "Acesso a módulo",
};

export default function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState<Tab>("cadastro");

  // cadastro
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // senha
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // acessos
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  useEffect(() => {
    if (open && user) {
      setTab("cadastro");
      setName(user.name || "");
      setCpf(user.cpf ? formatCpf(user.cpf) : "");
      setPhone(user.phone || "");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open, user]);

  useEffect(() => {
    if (open && tab === "acessos") {
      setLoadingLog(true);
      api<AccessLogEntry[]>("/auth/me/access-log")
        .then(setAccessLog)
        .catch(() => toast.error("Erro ao carregar acessos"))
        .finally(() => setLoadingLog(false));
    }
  }, [open, tab]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api("/auth/me", {
        method: "PUT",
        body: {
          name: name.trim(),
          cpf: cpf.replace(/\D/g, "") || null,
          phone: phone.trim() || null,
        },
      });
      await refreshUser();
      toast.success("Dados atualizados com sucesso.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar dados");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("A confirmação não confere com a nova senha.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }
    setSavingPassword(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: { current_password: currentPassword, new_password: newPassword },
      });
      toast.success("Senha alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha");
    } finally {
      setSavingPassword(false);
    }
  };

  const inputClass =
    "w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm focus:ring-2 focus:ring-[#001631]/20 focus:border-[#001631] outline-none transition-all";
  const labelClass = "block text-label-md text-on-surface-variant mb-1";

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "cadastro", label: "Cadastro", icon: "person" },
    { id: "senha", label: "Senha", icon: "lock" },
    { id: "acessos", label: "Últimos acessos", icon: "history" },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Meu perfil" size="lg">
      {/* Identity header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-lg bg-[#001631] flex items-center justify-center text-white font-bold text-lg shrink-0">
          {user?.name?.charAt(0)?.toUpperCase() || "U"}
        </div>
        <div className="min-w-0">
          <p className="text-body-md font-bold text-[#001631] truncate">{user?.name}</p>
          <p className="text-label-md text-on-surface-variant truncate">{user?.email}</p>
          {user?.is_organization_admin && (
            <span className="inline-block mt-0.5 text-[11px] text-green-700 font-medium">Admin do Órgão</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant mb-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-body-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-[#001631] text-[#001631]"
                : "border-transparent text-on-surface-variant hover:text-[#001631]"
            }`}
          >
            <span className="material-symbols-outlined text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "cadastro" && (
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className={labelClass}>Nome completo</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>E-mail</label>
            <input className={`${inputClass} bg-surface-container text-on-surface-variant cursor-not-allowed`} value={user?.email || ""} disabled />
            <p className="text-[11px] text-on-surface-variant mt-1">Para alterar o e-mail, contate o administrador.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>CPF</label>
              <input className={inputClass} value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" />
            </div>
            <div>
              <label className={labelClass}>Telefone</label>
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#001631] text-white text-body-sm font-bold hover:opacity-90 disabled:opacity-60 transition-all"
            >
              {savingProfile && <span className="material-symbols-outlined animate-spin text-lg">sync</span>}
              Salvar alterações
            </button>
          </div>
        </form>
      )}

      {tab === "senha" && (
        <form onSubmit={savePassword} className="space-y-4">
          <div>
            <label className={labelClass}>Senha atual</label>
            <input type="password" className={inputClass} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <div>
            <label className={labelClass}>Nova senha</label>
            <input type="password" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoComplete="new-password" />
          </div>
          <div>
            <label className={labelClass}>Confirmar nova senha</label>
            <input type="password" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingPassword}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#001631] text-white text-body-sm font-bold hover:opacity-90 disabled:opacity-60 transition-all"
            >
              {savingPassword && <span className="material-symbols-outlined animate-spin text-lg">sync</span>}
              Alterar senha
            </button>
          </div>
        </form>
      )}

      {tab === "acessos" && (
        <div className="max-h-80 overflow-y-auto">
          {loadingLog ? (
            <div className="py-8 text-center text-on-surface-variant text-body-sm">Carregando...</div>
          ) : accessLog.length === 0 ? (
            <div className="py-8 text-center text-on-surface-variant text-body-sm">Nenhum acesso registrado.</div>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {accessLog.map((entry, i) => (
                <li key={i} className="py-3 flex items-start gap-3">
                  <span className="material-symbols-outlined text-[#001631] text-xl mt-0.5">
                    {entry.action === "module_access" ? "apps" : "login"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium text-[#001631]">{actionLabels[entry.action] || entry.action}</p>
                    <p className="text-[12px] text-on-surface-variant">
                      {new Date(entry.created_at).toLocaleString("pt-BR")}
                      {entry.ip_address ? ` · IP ${entry.ip_address}` : ""}
                    </p>
                    {entry.user_agent && (
                      <p className="text-[11px] text-on-surface-variant/70 truncate">{entry.user_agent}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

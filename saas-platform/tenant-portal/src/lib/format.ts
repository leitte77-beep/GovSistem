// Utilitários de formatação e mapeamento do portal do tenant (pt-BR / America/Sao_Paulo)

const TIMEZONE = "America/Sao_Paulo";

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Agora mesmo";
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hoje, às ${d.toLocaleTimeString("pt-BR", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" })}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return `Ontem, às ${d.toLocaleTimeString("pt-BR", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" })}`;
  if (days < 7) return `Há ${days} dias`;
  return formatDateTime(value);
}

const ACTION_LABELS: Record<string, string> = {
  login: "Login realizado",
  logout: "Logout realizado",
  module_access: "Módulo acessado",
  module_access_failed: "Tentativa de acesso a módulo negada",
  update: "Cadastro atualizado",
  user_create: "Usuário criado",
  membership_create: "Usuário vinculado ao órgão",
  membership_update: "Vínculo atualizado",
  membership_profile_update: "Perfil atualizado",
  membership_suspended: "Usuário suspenso",
  membership_activated: "Usuário ativado",
  membership_removed: "Usuário removido do órgão",
  membership_restored: "Usuário restaurado",
  grant_created: "Acesso concedido",
  grant_removed: "Acesso removido",
  grants_update: "Permissões atualizadas",
  password_reset_requested: "Redefinição de senha solicitada",
  password_reset: "Redefinição de senha",
  force_password_reset: "Troca de senha obrigatória",
  password_changed: "Senha alterada",
  sessions_revoked: "Sessões revogadas",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

const RESOURCE_LABELS: Record<string, string> = {
  user: "Usuário",
  organization_membership: "Vínculo",
  user_grants: "Permissões",
  module: "Módulo",
  organization: "Órgão",
  login: "Login",
  session: "Sessão",
};

export function resourceLabel(type?: string | null): string {
  if (!type) return "—";
  return RESOURCE_LABELS[type] ?? type.replace(/_/g, " ");
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

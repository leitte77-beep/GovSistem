"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  UserCog,
  Pencil,
  ShieldCheck,
  KeyRound,
  RefreshCcw,
  LogOut,
  Mail,
  Phone,
  User,
  Building2,
  BadgeCheck,
} from "lucide-react";
import api from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { actionLabel } from "@/lib/format";

interface UserDetail {
  user_id: string;
  membership_id: string;
  name: string;
  email: string;
  cpf?: string | null;
  phone?: string | null;
  position?: string | null;
  department?: string | null;
  global_active: boolean;
  membership_role: string;
  membership_active: boolean;
  created_at?: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  actor_email?: string | null;
  created_at?: string | null;
}

export default function DetalhesUsuarioPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api<UserDetail>(`/tenant/users/${id}`),
      api<{ grants: Record<string, string[]> }>(`/tenant/users/${id}/grants`),
      api<{ data: AuditRow[] }>(`/tenant/users/${id}/audit?per_page=8`),
    ])
      .then(([u, g, a]) => {
        setUser(u);
        setGrants(g.grants);
        setAudit(a.data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar usuário"))
      .finally(() => setLoading(false));
  }, [id]);

  const isManager = user?.membership_role === "ORG_ADMIN";

  const actionLinks = [
    { href: `/usuarios/${id}/editar`, icon: Pencil, label: "Editar dados", color: "bg-primary-50 text-primary-700", desc: "Atualizar nome, telefone, cargo e departamento" },
    { href: `/usuarios/${id}/acessos`, icon: UserCog, label: "Acessos e permissões", color: "bg-violet-50 text-violet-600", desc: "Liberar ou remover módulos e roles" },
    { href: `/usuarios/${id}/perfil`, icon: ShieldCheck, label: "Perfil no órgão", color: "bg-cyan-50 text-cyan-600", desc: "Promover/rebaixar gestor e ativar/suspender" },
    { href: `/usuarios/${id}/senha`, icon: KeyRound, label: "Redefinir senha", color: "bg-amber-50 text-amber-600", desc: "Iniciar recuperação de senha" },
    { href: `/usuarios/${id}/forcar-troca`, icon: RefreshCcw, label: "Forçar troca de senha", color: "bg-orange-50 text-orange-600", desc: "Exigir nova senha no próximo acesso" },
    { href: `/usuarios/${id}/revogar-sessoes`, icon: LogOut, label: "Revogar sessões", color: "bg-red-50 text-red-600", desc: "Encerrar acessos ativos aos módulos" },
  ];

  if (loading) {
    return <p className="py-10 text-center text-sm text-on-surface-variant">Carregando...</p>;
  }

  if (error || !user) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error || "Usuário não encontrado"}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/usuarios" className="mb-3 inline-flex items-center gap-1 text-sm text-on-surface-variant transition hover:text-primary-700">
          <ArrowLeft size={15} /> Voltar para usuários
        </Link>
        <h1 className="text-2xl font-semibold text-on-surface">Detalhes do usuário</h1>
        <p className="text-sm text-on-surface-variant">Informações do vínculo e acesso do servidor no órgão.</p>
      </div>

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-600 text-xl font-bold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-on-surface">{user.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
              <span className="inline-flex items-center gap-1"><Mail size={14} /> {user.email}</span>
              {user.phone && <span className="inline-flex items-center gap-1"><Phone size={14} /> {user.phone}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 font-medium text-primary-700">
                <ShieldCheck size={12} /> {isManager ? "Gestor" : "Usuário"}
              </span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${user.membership_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {user.membership_active ? "Ativo" : "Suspenso"}
              </span>
            </div>
          </div>
        </div>
        <Link href={`/usuarios/${id}/editar`} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700">
          <Pencil size={16} /> Editar
        </Link>
      </div>

      {/* Dados do vínculo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { icon: User, label: "Cargo", value: user.position ?? "—" },
          { icon: Building2, label: "Departamento", value: user.department ?? "—" },
          { icon: BadgeCheck, label: "CPF", value: user.cpf ?? "—" },
          { icon: User, label: "Vínculo desde", value: formatDateTime(user.created_at) },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="rounded-xl border bg-surface-container-lowest p-4 shadow-sm">
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                <Icon size={16} />
              </div>
              <p className="text-xs text-on-surface-variant">{item.label}</p>
              <p className="text-sm font-semibold text-on-surface">{item.value}</p>
            </div>
          );
        })}
      </div>

      {/* Ações disponíveis */}
      <div className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
        <h2 className="mb-1 font-semibold text-on-surface">Ações disponíveis</h2>
        <p className="mb-4 text-sm text-on-surface-variant">Escolha uma operação para gerenciar este usuário.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actionLinks.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.href} href={a.href} className="group flex items-start gap-3 rounded-xl border p-4 transition hover:border-primary-600 hover:bg-surface-container-low">
                <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${a.color}`}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-on-surface">{a.label}</span>
                  <span className="block text-xs text-on-surface-variant">{a.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Módulos e roles */}
      <div className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-on-surface">Módulos e roles</h2>
        {Object.keys(grants).length === 0 ? (
          <p className="rounded-lg bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">
            Nenhum acesso concedido ainda. Use "Acessos e permissões" para liberar módulos.
          </p>
        ) : (
          <div className="space-y-2">
            {Object.entries(grants).map(([slug, roles]) => (
              <div key={slug} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <span className="font-medium capitalize text-on-surface">{slug}</span>
                <div className="flex flex-wrap gap-1">
                  {roles.map((r) => (
                    <span key={r} className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{r}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Últimos eventos */}
      <div className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-on-surface">Últimos eventos</h2>
        {audit.length === 0 ? (
          <p className="rounded-lg bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">Sem eventos recentes.</p>
        ) : (
          <ul className="divide-y">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium text-on-surface">{actionLabel(a.action)}</span>
                <span className="text-xs text-on-surface-variant">{formatDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

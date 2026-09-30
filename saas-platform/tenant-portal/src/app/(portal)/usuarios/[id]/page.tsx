"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Blocks,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Copy,
  IdCard,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import ActivityFeed, { type ActivityEvent } from "@/components/activity-feed";
import ConfirmDialog from "@/components/confirm-dialog";
import { moduleVisual } from "@/components/module-card";
import { useToast } from "@/components/toast";
import { formatCpf, formatDate, formatDateTime, formatPhone, formatRelative, initials } from "@/lib/format";

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
  last_login_at?: string | null;
  module_usage?: Record<string, { last_access_at?: string | null; count: number }>;
  must_change_password?: boolean;
  password_changed_at?: string | null;
  locked?: boolean;
}
interface CatalogModule {
  slug: string;
  name: string;
  roles: { name: string; label: string }[];
}

function roleTitle(label: string) {
  return label.split(/\s+[—–-]\s+/)[0];
}

type Action = "status" | "remove";

export default function DetalhesUsuarioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api<UserDetail>(`/tenant/users/${id}`),
      api<{ grants: Record<string, string[]>; pending_review?: string[] }>(`/tenant/users/${id}/grants`),
      api<{ data: ActivityEvent[] }>(`/tenant/users/${id}/audit?per_page=40`).catch(() => ({ data: [] })),
      api<CatalogModule[]>("/tenant/roles").catch(() => []),
    ])
      .then(([u, g, a, c]) => {
        setUser(u);
        setGrants(g.grants);
        setPending(g.pending_review ?? []);
        setEvents(a.data);
        setCatalog(c);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar usuário"))
      .finally(() => setLoading(false));
  }, [id]);

  const run = async (action: Action) => {
    if (!user) return;
    setBusy(true);
    try {
      if (action === "status") {
        const r = await api<{ is_active: boolean }>(`/tenant/users/${id}/status`, {
          method: "PATCH",
          body: { is_active: !user.membership_active },
        });
        setUser({ ...user, membership_active: r.is_active });
        toast(r.is_active ? "success" : "info", r.is_active ? "Usuário reativado." : "Usuário suspenso.");
      } else {
        await api(`/tenant/users/${id}`, { method: "DELETE" });
        toast("success", "Usuário removido do órgão. Dá para restaurar na aba Removidos.");
        router.push("/usuarios");
      }
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Falha na operação");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const copyEmail = async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* navegador sem permissão de área de transferência */
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-4 w-48 animate-pulse rounded bg-paper" />
        <div className="h-40 animate-pulse rounded-2xl bg-white shadow-card" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white shadow-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">
          {error || "Usuário não encontrado"}
        </p>
        <Link href="/usuarios" className="mt-4 inline-block text-sm font-semibold text-ink hover:underline">
          Voltar para usuários
        </Link>
      </div>
    );
  }

  const isManager = user.membership_role === "ORG_ADMIN";
  const suspended = !user.membership_active;
  const moduleSlugs = Array.from(new Set([...Object.keys(grants), ...pending]));
  const moduleInfo = (slug: string) => catalog.find((m) => m.slug === slug);
  const firstName = user.name.split(/\s+/)[0];
  const cpf = formatCpf(user.cpf) || null;
  // Login no portal e abertura de módulo contam como acesso: com a sessão aberta
  // a pessoa usa os módulos sem gerar login novo.
  const lastSeen = [user.last_login_at, ...Object.values(user.module_usage ?? {}).map((m) => m.last_access_at)]
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  const phone = formatPhone(user.phone) || null;

  return (
    <div className="space-y-6">
      <nav aria-label="Trilha" className="flex min-w-0 items-center gap-1 text-sm text-muted">
        <Link href="/usuarios" className="shrink-0 hover:text-ink hover:underline">
          Usuários
        </Link>
        <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        <span className="truncate font-medium text-ink" aria-current="page">
          {user.name}
        </span>
      </nav>

      {/* Cartão da pessoa */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="h-20 bg-ink sm:h-24">
          <div
            aria-hidden="true"
            className="h-full w-full opacity-[0.08]"
            style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "18px 18px" }}
          />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-5 sm:px-6">
          {/* Só o avatar sobe sobre a faixa; o nome fica abaixo dela, no fundo branco. */}
          <div className="flex min-w-0 items-start gap-4">
            <span className="relative -mt-10 shrink-0">
              <span
                className={`flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-bold ring-4 ring-white ${
                  suspended ? "bg-paper text-muted" : "bg-[#E0EAFF] text-[#1D3A8A]"
                }`}
              >
                {initials(user.name)}
              </span>
              <span
                className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full ring-4 ring-white ${suspended ? "bg-warning" : "bg-accent"}`}
                title={suspended ? "Suspenso" : "Ativo"}
              />
            </span>
            <div className="min-w-0 pt-3">
              <h1 className="truncate text-2xl font-bold tracking-tight text-ink">{user.name}</h1>
              <p className="truncate text-sm text-muted">
                {[user.position, user.department].filter(Boolean).join(" · ") || "Cargo e setor não informados"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-3">
            <Link
              href={`/usuarios/${id}/acessos`}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30 hover:shadow-card"
            >
              <KeyRound size={15} aria-hidden="true" /> Acessos
            </Link>
            <Link
              href={`/usuarios/${id}/editar`}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-ink-soft"
            >
              <Pencil size={15} aria-hidden="true" /> Editar dados
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 sm:px-6">
          {isManager ? (
            <Chip tone="ink" icon={ShieldCheck}>Gestor do órgão</Chip>
          ) : (
            <Chip tone="muted">Usuário</Chip>
          )}
          {suspended ? <Chip tone="warn" icon={UserMinus}>Suspenso</Chip> : <Chip tone="good" icon={UserCheck}>Ativo</Chip>}
          {user.locked && <Chip tone="danger" icon={Lock}>Bloqueado por tentativas de senha</Chip>}
          {user.must_change_password && <Chip tone="muted" icon={KeyRound}>Troca de senha pendente</Chip>}
          {!user.global_active && <Chip tone="danger">Conta desativada na plataforma</Chip>}
        </div>
      </section>

      {suspended && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-soft bg-warning-soft/60 px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-warning-ink">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {firstName} está suspenso(a) e não consegue abrir nenhum módulo deste órgão.
          </p>
          <button
            onClick={() => setConfirm("status")}
            className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink shadow-card hover:bg-paper"
          >
            Reativar
          </button>
        </div>
      )}

      {/* Números rápidos */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo">
        <Fact
          icon={Clock}
          label="Último acesso"
          value={lastSeen ? formatRelative(lastSeen) : "Nunca acessou"}
          title={lastSeen ? formatDateTime(lastSeen) : undefined}
          muted={!lastSeen}
        />
        <Fact icon={Blocks} label="Módulos liberados" value={String(Object.keys(grants).length)} />
        <Fact icon={CalendarDays} label="No órgão desde" value={formatDate(user.created_at)} />
        <Fact
          icon={KeyRound}
          label="Senha"
          value={
            user.must_change_password
              ? "Troca pendente"
              : user.password_changed_at
                ? `Trocada ${formatRelative(user.password_changed_at).toLowerCase()}`
                : "—"
          }
          title={user.password_changed_at ? formatDateTime(user.password_changed_at) : undefined}
          muted={!user.password_changed_at && !user.must_change_password}
        />
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-2xl border border-line bg-white shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-ink">
                  <Blocks size={16} aria-hidden="true" /> Módulos
                </h2>
                <p className="text-xs text-muted">O que {firstName} pode abrir, com qual perfil, e quando usou por último</p>
              </div>
              <Link href={`/usuarios/${id}/acessos`} className="shrink-0 text-sm font-semibold text-ink hover:underline">
                Gerenciar
              </Link>
            </div>
            {moduleSlugs.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-medium text-ink">Nenhum módulo liberado</p>
                <p className="mt-1 text-xs text-muted">{firstName} entra no portal, mas não consegue abrir nenhum sistema.</p>
                <Link
                  href={`/usuarios/${id}/acessos`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white"
                >
                  <KeyRound size={13} aria-hidden="true" /> Liberar módulos
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {moduleSlugs.map((slug) => {
                  const info = moduleInfo(slug);
                  const v = moduleVisual(slug);
                  const Icon = v.icon as LucideIcon;
                  const roles = (grants[slug] ?? []).map((r) => {
                    const found = info?.roles.find((x) => x.name === r);
                    return found ? roleTitle(found.label) : r;
                  });
                  const use = user.module_usage?.[slug];
                  return (
                    <li key={slug} className="flex items-center gap-4 px-5 py-3.5">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm ${v.gradient}`}>
                        <Icon size={18} className="text-white" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-ink">{info?.name ?? slug}</span>
                          {pending.includes(slug) && <Chip tone="warn">Aguardando revisão</Chip>}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {roles.map((r) => (
                            <span key={r} className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink ring-1 ring-line">
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        {use?.last_access_at ? (
                          <>
                            <p className="text-ink" title={formatDateTime(use.last_access_at)}>
                              {formatRelative(use.last_access_at)}
                            </p>
                            <p className="text-muted">
                              {use.count} {use.count === 1 ? "acesso" : "acessos"}
                            </p>
                          </>
                        ) : (
                          <p className="text-muted">Ainda não abriu</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <ActivityFeed
            events={events}
            title="Histórico"
            subtitle={`O que ${firstName} fez e o que foi alterado no cadastro`}
            link={{ href: "/auditoria", label: "Auditoria" }}
            className=""
            emptyText="Nenhum evento registrado"
          />
        </div>

        {/* Coluna lateral */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Dados</h2>
              <Link href={`/usuarios/${id}/editar`} className="text-xs font-semibold text-ink hover:underline">
                Editar
              </Link>
            </div>
            <dl className="space-y-3 text-sm">
              <DataRow icon={Mail} label="E-mail">
                <span className="flex min-w-0 items-center gap-1.5">
                  <a href={`mailto:${user.email}`} className="truncate text-ink hover:underline">
                    {user.email}
                  </a>
                  <button
                    onClick={copyEmail}
                    aria-label="Copiar e-mail"
                    className="shrink-0 rounded-md p-1 text-muted hover:bg-paper hover:text-ink"
                  >
                    {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
                  </button>
                </span>
              </DataRow>
              <DataRow icon={Phone} label="Telefone">
                {phone ? (
                  <a href={`tel:${(user.phone ?? "").replace(/\D/g, "")}`} className="text-ink hover:underline">
                    {phone}
                  </a>
                ) : null}
              </DataRow>
              <DataRow icon={IdCard} label="CPF">{cpf}</DataRow>
              <DataRow icon={Briefcase} label="Cargo">{user.position}</DataRow>
              <DataRow icon={Building2} label="Setor">{user.department}</DataRow>
            </dl>
          </section>

          <section className="rounded-2xl border border-line bg-white p-2 shadow-card">
            <h2 className="px-3 pb-1 pt-2 text-sm font-semibold text-ink">Segurança</h2>
            <ActionLink href={`/usuarios/${id}/senha`} icon={KeyRound} title="Definir nova senha" desc="Você escolhe a senha e informa à pessoa" />
            <ActionLink href={`/usuarios/${id}/forcar-troca`} icon={RefreshCcw} title="Exigir troca de senha" desc="Pede uma senha nova no próximo acesso" />
            <ActionLink href={`/usuarios/${id}/revogar-sessoes`} icon={LogOut} title="Encerrar sessões" desc="Desconecta de todos os módulos agora" />
          </section>

          <section className="rounded-2xl border border-line bg-white p-2 shadow-card">
            <h2 className="px-3 pb-1 pt-2 text-sm font-semibold text-ink">Vínculo com o órgão</h2>
            <ActionLink
              href={`/usuarios/${id}/perfil`}
              icon={ShieldCheck}
              title={isManager ? "Perfil no órgão" : "Tornar gestor"}
              desc={isManager ? "Gestor: administra usuários e acessos" : "Dá poder de administrar usuários e acessos"}
            />
            <ActionButton
              icon={suspended ? UserCheck : UserMinus}
              tone={suspended ? "good" : "warn"}
              title={suspended ? "Reativar" : "Suspender"}
              desc={suspended ? "Devolve o acesso aos módulos" : "Bloqueia o acesso sem apagar nada"}
              onClick={() => setConfirm("status")}
            />
            <ActionButton
              icon={Trash2}
              tone="danger"
              title="Remover do órgão"
              desc="Revoga os acessos; dá para restaurar depois"
              onClick={() => setConfirm("remove")}
            />
          </section>
        </aside>
      </div>

      {confirm && (
        <ConfirmDialog
          open
          busy={busy}
          title={confirm === "remove" ? "Remover do órgão" : suspended ? "Reativar usuário" : "Suspender usuário"}
          message={
            confirm === "remove"
              ? `Remover ${user.name} deste órgão? Os acessos aos módulos serão revogados. A conta e o histórico ficam preservados, e dá para restaurar depois na aba Removidos.`
              : suspended
                ? `Reativar ${user.name}? O acesso aos módulos liberados volta a funcionar.`
                : `Suspender ${user.name}? O acesso aos módulos deste órgão fica bloqueado até você reativar.`
          }
          confirmLabel={confirm === "remove" ? "Remover" : suspended ? "Reativar" : "Suspender"}
          danger={confirm === "remove" || !suspended}
          onConfirm={() => run(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function Chip({
  children,
  tone,
  icon: Icon,
}: {
  children: ReactNode;
  tone: "ink" | "good" | "warn" | "danger" | "muted";
  icon?: LucideIcon;
}) {
  const tones = {
    ink: "bg-ink/5 text-ink ring-ink/10",
    good: "bg-accent-soft text-accent-ink ring-accent-soft",
    warn: "bg-warning-soft text-warning-ink ring-warning-soft",
    danger: "bg-danger-soft text-danger-ink ring-danger-soft",
    muted: "bg-paper text-muted ring-line",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  title,
  muted,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  title?: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card" title={title}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon size={13} aria-hidden="true" /> {label}
      </p>
      <p className={`mt-1.5 truncate text-base font-semibold ${muted ? "text-muted" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function DataRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="min-w-0 truncate text-ink">{children || <span className="text-muted">Não informado</span>}</dd>
      </div>
    </div>
  );
}

function ActionLink({ href, icon: Icon, title, desc }: { href: string; icon: ElementType; title: string; desc: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-paper">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper text-ink group-hover:bg-white">
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block truncate text-xs text-muted">{desc}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-muted transition group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

function ActionButton({
  icon: Icon,
  title,
  desc,
  tone,
  onClick,
}: {
  icon: ElementType;
  title: string;
  desc: string;
  tone: "good" | "warn" | "danger";
  onClick: () => void;
}) {
  const tones = {
    good: { row: "hover:bg-accent-soft/50", icon: "bg-accent-soft text-accent-ink", text: "text-accent-ink" },
    warn: { row: "hover:bg-warning-soft/50", icon: "bg-warning-soft text-warning-ink", text: "text-warning-ink" },
    danger: { row: "hover:bg-danger-soft/60", icon: "bg-danger-soft text-danger-ink", text: "text-danger-ink" },
  }[tone];
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${tones.row}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones.icon}`}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${tones.text}`}>{title}</span>
        <span className="block truncate text-xs text-muted">{desc}</span>
      </span>
    </button>
  );
}

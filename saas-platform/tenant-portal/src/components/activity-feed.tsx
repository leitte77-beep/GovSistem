"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Blocks,
  Building2,
  CheckCircle2,
  ChevronDown,
  Filter,
  KeyRound,
  LogIn,
  LogOut,
  Settings2,
  ShieldAlert,
  TrendingUp,
  UserCog,
  UserMinus,
  UserPlus,
} from "lucide-react";
import FilterChip from "@/components/filter-chip";
import EmptyState from "@/components/empty-state";
import { actionLabel, formatDateTime, initials } from "@/lib/format";

export interface ActivityEvent {
  id: string;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  actor_email?: string | null;
  actor_name?: string | null;
  target_name?: string | null;
  module_name?: string | null;
  grant_summary?: string[];
  created_at?: string | null;
  details?: Record<string, unknown> | null;
}

type Category = "access" | "users" | "grants" | "security" | "other";

const TIMEZONE = "America/Sao_Paulo";
const PAGE = 8;

export function categoryOf(a: ActivityEvent): Category {
  const { action, resource_type: rt } = a;
  if (
    action.includes("password") ||
    action === "sessions_revoked" ||
    action === "module_access_failed"
  )
    return "security";
  if (action === "login" || action === "logout" || action.startsWith("module_access")) return "access";
  if (rt === "user_grants" || action.startsWith("grant_") || action === "grants_update") return "grants";
  if (rt === "user" || action.startsWith("membership_") || action === "user_create") return "users";
  return "other";
}

const FILTERS: { key: "all" | Category; label: string }[] = [
  { key: "all", label: "Tudo" },
  { key: "users", label: "Usuários" },
  { key: "grants", label: "Permissões" },
  { key: "security", label: "Segurança" },
  { key: "access", label: "Acessos" },
];

export const TONES = {
  neutral: "bg-paper text-ink ring-line",
  muted: "bg-paper text-muted ring-line",
  good: "bg-accent-soft text-accent-ink ring-accent-soft",
  warn: "bg-warning-soft text-warning-ink ring-warning-soft",
  bad: "bg-danger-soft text-danger-ink ring-danger-soft",
};

interface Described {
  verb: string;
  object?: string | null;
  suffix?: string;
  icon: typeof LogIn;
  tone: keyof typeof TONES;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Transforma o evento de auditoria em uma frase: "<quem> <verbo> <objeto>". */
export function describe(a: ActivityEvent): Described {
  const d = a.details ?? {};
  const target = a.target_name ?? str(d.name) ?? str(d.email);
  const mod = a.module_name;
  switch (a.action) {
    case "login":
      return { verb: "entrou no portal", icon: LogIn, tone: "muted" };
    case "logout":
      return { verb: "saiu do portal", icon: LogOut, tone: "muted" };
    case "module_access":
      return { verb: "abriu", object: mod ?? "um módulo", icon: Blocks, tone: "neutral" };
    case "module_access_failed":
      return { verb: "teve o acesso negado a", object: mod ?? "um módulo", icon: ShieldAlert, tone: "bad" };
    case "user_create":
      return { verb: "cadastrou", object: target ?? "um usuário", icon: UserPlus, tone: "good" };
    case "membership_create":
      return { verb: "vinculou ao órgão", object: target ?? "um usuário", icon: UserPlus, tone: "good" };
    case "update_profile":
      return { verb: "atualizou o próprio perfil", icon: UserCog, tone: "neutral" };
    case "membership_update":
    case "membership_profile_update":
      return { verb: "atualizou o cadastro de", object: target ?? "um usuário", icon: UserCog, tone: "neutral" };
    case "membership_suspended":
      return { verb: "suspendeu", object: target ?? "um usuário", icon: UserMinus, tone: "warn" };
    case "membership_activated":
    case "membership_restored":
      return { verb: "reativou", object: target ?? "um usuário", icon: CheckCircle2, tone: "good" };
    case "membership_removed":
      return { verb: "removeu do órgão", object: target ?? "um usuário", icon: UserMinus, tone: "bad" };
    case "grants_update":
      return { verb: "alterou as permissões de", object: target ?? "um usuário", icon: KeyRound, tone: "neutral" };
    case "grant_created":
      return { verb: "concedeu acesso a", object: target ?? "um usuário", icon: KeyRound, tone: "good" };
    case "grant_removed":
      return { verb: "removeu um acesso de", object: target ?? "um usuário", icon: KeyRound, tone: "bad" };
    case "pending_grant_approved":
      return { verb: "aprovou o acesso de", object: target ?? "um usuário", icon: CheckCircle2, tone: "good" };
    case "change_password":
    case "password_changed":
      return { verb: "trocou a própria senha", icon: KeyRound, tone: "muted" };
    case "password_set_by_manager":
      return { verb: "definiu uma nova senha para", object: target ?? "um usuário", icon: KeyRound, tone: "warn" };
    case "password_reset_requested":
      return { verb: "pediu redefinição de senha", suffix: target ? `para ${target}` : undefined, icon: KeyRound, tone: "warn" };
    case "force_password_reset":
      return { verb: "exigiu troca de senha de", object: target ?? "um usuário", icon: KeyRound, tone: "warn" };
    case "org_profile_update":
      return { verb: "atualizou os dados de contato do órgão", icon: Building2, tone: "neutral" };
    case "sessions_revoked":
      return { verb: "encerrou as sessões de", object: target ?? "um usuário", icon: ShieldAlert, tone: "warn" };
  }
  // Ações genéricas (create/update/delete) distinguidas pelo recurso.
  const verbByAction: Record<string, string> = { create: "criou", update: "atualizou", delete: "excluiu" };
  const verb = verbByAction[a.action];
  if (verb) {
    if (a.resource_type === "user_grants")
      return { verb: "alterou as permissões de", object: target ?? "um usuário", icon: KeyRound, tone: "neutral" };
    if (a.resource_type === "user")
      return {
        verb: a.action === "create" ? "cadastrou" : a.action === "update" ? "atualizou o cadastro de" : "excluiu",
        object: target ?? "um usuário",
        icon: a.action === "create" ? UserPlus : a.action === "delete" ? UserMinus : UserCog,
        tone: a.action === "create" ? "good" : a.action === "delete" ? "bad" : "neutral",
      };
    if (a.resource_type === "organization_module")
      return { verb: a.action === "delete" ? "removeu um módulo do órgão" : "atualizou os módulos do órgão", icon: Blocks, tone: "neutral" };
    if (a.resource_type === "organization")
      return { verb: `${verb} os dados do órgão`, icon: Building2, tone: "neutral" };
  }
  return { verb: actionLabel(a.action).toLowerCase(), icon: Settings2, tone: "muted" };
}

/** Frase completa em texto puro, ex.: "Ana abriu GovTask". */
export function sentence(a: ActivityEvent): string {
  const d = describe(a);
  return [actorOf(a), d.verb, d.object, d.suffix].filter(Boolean).join(" ");
}

export function actorOf(a: ActivityEvent): string {
  return a.actor_name ?? a.actor_email ?? "Sistema";
}

function dayKey(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function dayLabel(key: string): string {
  if (!key) return "Sem data";
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return "Hoje";
  if (key === yesterday) return "Ontem";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" });
}

function timeOf(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-BR", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" });
}

interface Row {
  key: string;
  first: ActivityEvent; // mais recente
  last: ActivityEvent; // mais antigo
  count: number;
}

/** Agrupa eventos repetidos em sequência (mesma pessoa, ação e alvo) no mesmo dia. */
function collapse(events: ActivityEvent[]): { day: string; rows: Row[] }[] {
  const days: { day: string; rows: Row[] }[] = [];
  for (const e of events) {
    const day = dayKey(e.created_at);
    let bucket = days[days.length - 1];
    if (!bucket || bucket.day !== day) {
      bucket = { day, rows: [] };
      days.push(bucket);
    }
    const sig = [e.action, e.resource_type, actorOf(e), e.target_name, e.module_name].join("|");
    const prev = bucket.rows[bucket.rows.length - 1];
    if (prev && prev.key.startsWith(sig + "#")) {
      prev.count += 1;
      prev.last = e;
    } else {
      bucket.rows.push({ key: `${sig}#${e.id}`, first: e, last: e, count: 1 });
    }
  }
  return days;
}

export default function ActivityFeed({
  events,
  title = "Atividade recente",
  subtitle = "Quem fez o quê no órgão, do mais recente para o mais antigo",
  link = { href: "/auditoria", label: "Auditoria completa" },
  className = "lg:col-span-2",
  emptyText = "Nenhuma atividade neste filtro",
}: {
  events: ActivityEvent[];
  title?: string;
  subtitle?: string;
  link?: { href: string; label: string } | null;
  className?: string;
  emptyText?: string;
}) {
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    events.forEach((e) => {
      const k = categoryOf(e);
      c[k] = (c[k] ?? 0) + 1;
    });
    return c;
  }, [events]);

  const groups = useMemo(() => {
    const filtered = filter === "all" ? events : events.filter((e) => categoryOf(e) === filter);
    return collapse(filtered);
  }, [events, filter]);

  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);

  // Corta a lista em `limit` linhas preservando os cabeçalhos de dia.
  const visible = useMemo(() => {
    let left = limit;
    const out: typeof groups = [];
    for (const g of groups) {
      if (left <= 0) break;
      out.push({ day: g.day, rows: g.rows.slice(0, left) });
      left -= g.rows.length;
    }
    return out;
  }, [groups, limit]);

  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <TrendingUp size={16} className="text-ink" aria-hidden="true" /> {title}
          </h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        {link && (
          <Link href={link.href} className="inline-flex items-center gap-1 text-sm font-semibold text-ink hover:underline">
            {link.label} <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-paper px-5 py-3">
        <Filter size={13} className="mr-1 text-muted" aria-hidden="true" />
        {FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            active={filter === f.key}
            onClick={() => {
              setFilter(f.key);
              setLimit(PAGE);
            }}
            count={counts[f.key] ?? 0}
          />
        ))}
      </div>

      {totalRows === 0 ? (
        <div className="p-6">
          <EmptyState
            title={emptyText}
            description="Tente outro filtro ou volte para todos os eventos."
            action={
              <button
                onClick={() => setFilter("all")}
                className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper"
              >
                Mostrar tudo
              </button>
            }
          />
        </div>
      ) : (
        <div className="px-5 pb-2">
          {visible.map((g) => (
            <section key={g.day} aria-label={dayLabel(g.day)}>
              <h3 className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted first-letter:uppercase">
                {dayLabel(g.day)}
              </h3>
              <ol className="relative">
                {g.rows.map((r, i) => (
                  <ActivityRow key={r.key} row={r} isLast={i === g.rows.length - 1} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {totalRows > limit && (
        <div className="mt-auto border-t border-line px-5 py-3">
          <button
            onClick={() => setLimit((l) => l + PAGE * 2)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:underline"
          >
            <ChevronDown size={15} aria-hidden="true" /> Mostrar mais ({totalRows - limit})
          </button>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ row, isLast }: { row: Row; isLast: boolean }) {
  const a = row.first;
  const desc = describe(a);
  const Icon = desc.icon;
  const actor = actorOf(a);
  const extra = a.grant_summary?.length ? a.grant_summary.join(" · ") : null;
  const showEmail = a.actor_name && a.actor_email;
  const time =
    row.count > 1 && timeOf(row.last.created_at) !== timeOf(a.created_at)
      ? `${timeOf(row.last.created_at)}–${timeOf(a.created_at)}`
      : timeOf(a.created_at);

  return (
    <li className="relative flex gap-3 py-2.5">
      {!isLast && (
        <span aria-hidden="true" className="absolute left-[17px] top-11 bottom-0 w-px bg-line" />
      )}
      <span className="relative shrink-0">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/5 text-[11px] font-bold text-ink ring-1 ring-line"
          aria-hidden="true"
        >
          {initials(a.actor_name ?? a.actor_email)}
        </span>
        <span
          className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${TONES[desc.tone]}`}
          aria-hidden="true"
        >
          <Icon size={11} />
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-muted">
          <span className="font-semibold text-ink" title={a.actor_email ?? undefined}>
            {actor}
          </span>{" "}
          {desc.verb}
          {desc.object && (
            <>
              {" "}
              <span className="font-semibold text-ink">{desc.object}</span>
            </>
          )}
          {desc.suffix && <> {desc.suffix}</>}
          {row.count > 1 && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-paper px-1.5 py-0.5 align-middle text-[10px] font-bold text-muted ring-1 ring-line">
              {row.count}×
            </span>
          )}
        </p>
        {(extra || showEmail) && (
          <p className="mt-0.5 truncate text-xs text-muted">
            {extra ?? a.actor_email}
          </p>
        )}
      </div>

      <time
        dateTime={a.created_at ?? undefined}
        title={formatDateTime(a.created_at)}
        className="shrink-0 pt-0.5 text-xs tabular-nums text-muted"
      >
        {time}
      </time>
    </li>
  );
}

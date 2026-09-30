"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  Filter,
  Globe,
  Loader2,
  Monitor,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import api from "@/lib/api";
import EmptyState from "@/components/empty-state";
import { TONES, actorOf, describe, sentence, type ActivityEvent } from "@/components/activity-feed";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/components/toast";
import { formatDateTime, initials } from "@/lib/format";

type Category = "all" | "access" | "users" | "grants" | "security" | "other";

interface AuditResponse {
  data: ActivityEvent[];
  total: number;
  counts: Record<Category, number>;
}

const TIMEZONE = "America/Sao_Paulo";
const PER_PAGE = 50;

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "Tudo" },
  { key: "users", label: "Usuários" },
  { key: "grants", label: "Permissões" },
  { key: "security", label: "Segurança" },
  { key: "access", label: "Acessos" },
  { key: "other", label: "Outros" },
];

const PERIODS = [
  { key: "1", label: "24 horas", days: 1 },
  { key: "7", label: "7 dias", days: 7 },
  { key: "30", label: "30 dias", days: 30 },
  { key: "90", label: "90 dias", days: 90 },
  { key: "all", label: "Tudo", days: 0 },
] as const;

const SENSITIVE = ["password", "password_hash", "token", "secret", "reset_token"];

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  cpf: "CPF",
  position: "Cargo",
  department: "Setor",
  membership_role: "Perfil no órgão",
  is_active: "Ativo",
  module: "Módulo",
  module_slug: "Módulo",
  role: "Perfil",
  grants: "Permissões",
  sessions_revoked: "Sessões encerradas",
  require_change: "Exigir troca de senha",
  slug: "Identificador",
  user_id: "Usuário (ID)",
  organization_id: "Órgão (ID)",
  used_legacy_fallback: "Acesso legado",
  description: "Descrição",
  cnpj: "CNPJ",
  public_url: "Site",
  address_zip: "CEP",
  address_street: "Rua",
  address_number: "Número",
  address_complement: "Complemento",
  address_neighborhood: "Bairro",
  address_city: "Cidade",
  address_state: "UF",
};

function valueText(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (key === "membership_role") return v === "ORG_ADMIN" ? "Gestor" : v === "ORG_MEMBER" ? "Usuário" : String(v);
  if (key === "grants" && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([m, roles]) => `${m}: ${Array.isArray(roles) ? roles.join(", ") || "sem perfil" : String(roles)}`)
      .join(" · ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function parseAgent(ua?: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (!browser && !os) return ua.length > 60 ? `${ua.slice(0, 60)}…` : ua;
  return [browser, os].filter(Boolean).join(" no ");
}

function dayKey(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}
function dayLabel(key: string) {
  if (!key) return "Sem data";
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return "Hoje";
  if (key === yesterday) return "Ontem";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function timeOf(iso?: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" }) : "";
}

export default function AuditPage() {
  const { ctx } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<Category, number>>>({});
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<Category>("all");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("30");
  const [actor, setActor] = useState("");
  const [moduleSlug, setModuleSlug] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [people, setPeople] = useState<{ user_id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    api<{ data: { user_id: string; name: string }[] }>("/tenant/users?per_page=200")
      .then((r) => setPeople(r.data))
      .catch(() => {});
  }, []);

  const params = useCallback(
    (p: number, perPage = PER_PAGE, withCategory = true) => {
      const sp = new URLSearchParams({ page: String(p), per_page: String(perPage) });
      if (withCategory && category !== "all") sp.set("category", category);
      if (debouncedQ) sp.set("q", debouncedQ);
      if (actor) sp.set("actor_id", actor);
      if (moduleSlug) sp.set("module", moduleSlug);
      const days = PERIODS.find((x) => x.key === period)?.days ?? 0;
      if (days) sp.set("date_from", new Date(Date.now() - days * 86400000).toISOString());
      return sp.toString();
    },
    [category, debouncedQ, actor, moduleSlug, period],
  );

  // Recarrega do zero quando um filtro muda; ignora respostas antigas.
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    setPage(1);
    api<AuditResponse>(`/tenant/audit?${params(1)}`)
      .then((r) => {
        if (id !== reqId.current) return;
        setRows(r.data);
        setTotal(r.total);
        setCounts(r.counts ?? {});
      })
      .catch((e) => id === reqId.current && setError(e instanceof Error ? e.message : "Falha ao carregar auditoria"))
      .finally(() => id === reqId.current && setLoading(false));
  }, [params]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const r = await api<AuditResponse>(`/tenant/audit?${params(next)}`);
      setRows((prev) => [...prev, ...r.data]);
      setPage(next);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Falha ao carregar mais");
    } finally {
      setLoadingMore(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: ActivityEvent[] = [];
      for (let p = 1; p <= 25; p++) {
        const r = await api<AuditResponse>(`/tenant/audit?${params(p, 200)}`);
        all.push(...r.data);
        if (all.length >= r.total || r.data.length === 0) break;
      }
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = ["Data e hora", "Quem", "E-mail", "O que aconteceu", "Módulo", "Detalhe", "Ação (código)", "IP", "Navegador"];
      const lines = all.map((e) =>
        [
          formatDateTime(e.created_at),
          actorOf(e),
          e.actor_email ?? "",
          sentence(e),
          e.module_name ?? "",
          (e.grant_summary ?? []).join(" · "),
          e.action,
          e.ip_address ?? "",
          parseAgent(e.user_agent) ?? "",
        ]
          .map(esc)
          .join(";"),
      );
      // BOM + ";" para o Excel em português abrir com acentos e colunas certas.
      const blob = new Blob(["﻿" + [header.map(esc).join(";"), ...lines].join("\r\n")], {
        type: "text/csv;charset=utf-8",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `auditoria-${ctx?.organization.slug ?? "orgao"}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("success", `${all.length} registros exportados.`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  };

  const groups = useMemo(() => {
    const out: { day: string; items: ActivityEvent[] }[] = [];
    rows.forEach((r) => {
      const k = dayKey(r.created_at);
      const last = out[out.length - 1];
      if (last && last.day === k) last.items.push(r);
      else out.push({ day: k, items: [r] });
    });
    return out;
  }, [rows]);

  const filtersActive = !!(q || actor || moduleSlug || period !== "30" || category !== "all");
  const clear = () => {
    setQ("");
    setActor("");
    setModuleSlug("");
    setPeriod("30");
    setCategory("all");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-ink">Auditoria</h1>
          <p className="mt-1 text-sm text-muted">Tudo o que foi feito no órgão: quem fez, o quê, quando e de onde.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={exporting || total === 0}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink shadow-card transition hover:border-ink/30 disabled:opacity-50"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
          {exporting ? "Exportando…" : "Exportar CSV"}
        </button>
      </header>

      {/* Filtros */}
      <section className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-card" aria-label="Filtros">
        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Buscar por pessoa</span>
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou e-mail de quem fez"
              className="w-full rounded-full border border-line bg-white py-2 pl-10 pr-9 text-sm text-ink placeholder:text-muted focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/10"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-paper">
                <X size={14} />
              </button>
            )}
          </label>
          <Select value={actor} onChange={setActor} label="Pessoa">
            <option value="">Todas as pessoas</option>
            {people.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select value={moduleSlug} onChange={setModuleSlug} label="Módulo">
            <option value="">Todos os módulos</option>
            {(ctx?.modules ?? []).map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-full border border-line bg-paper/60 p-1 text-xs font-semibold" role="group" aria-label="Período">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                aria-pressed={period === p.key}
                className={`rounded-full px-3 py-1.5 transition ${period === p.key ? "bg-ink text-white shadow-card" : "text-muted hover:text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {filtersActive && (
            <button onClick={clear} className="text-xs font-semibold text-muted hover:text-ink hover:underline">
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      {/* Categorias */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Categoria">
        <Filter size={14} className="mr-1 mt-2 shrink-0 text-muted" aria-hidden="true" />
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(c.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30"
              }`}
            >
              {c.label}
              <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${active ? "bg-white/20" : "bg-paper text-muted"}`}>
                {counts[c.key] ?? "·"}
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>}

      {/* Registros */}
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        {loading ? (
          <ul aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line px-5 py-4 last:border-0">
                <span className="h-3 w-10 animate-pulse rounded bg-paper" />
                <span className="h-9 w-9 animate-pulse rounded-full bg-paper" />
                <span className="h-3 w-72 animate-pulse rounded bg-paper" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ScrollText size={20} />}
              title="Nenhum registro encontrado"
              description={filtersActive ? "Tente outro período ou tire algum filtro." : "Ainda não há ações registradas neste órgão."}
              action={
                filtersActive ? (
                  <button onClick={clear} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper">
                    Limpar filtros
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.day}>
              <h2 className="border-b border-line bg-paper px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted first-letter:uppercase">
                {dayLabel(g.day)} <span className="font-normal normal-case tracking-normal">· {g.items.length}</span>
              </h2>
              <ul>
                {g.items.map((r) => (
                  <AuditRow key={r.id} row={r} open={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {!loading && rows.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          {rows.length < total && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-2 text-sm font-semibold text-ink shadow-card transition hover:border-ink/30 disabled:opacity-60"
            >
              {loadingMore ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
              Carregar mais
            </button>
          )}
          <p className="text-xs text-muted">
            Mostrando {rows.length} de {total} {total === 1 ? "registro" : "registros"}
          </p>
        </div>
      )}
    </div>
  );
}

function AuditRow({ row: r, open, onToggle }: { row: ActivityEvent; open: boolean; onToggle: () => void }) {
  const d = describe(r);
  const Icon = d.icon;
  const details = Object.entries(r.details ?? {}).filter(([k]) => !SENSITIVE.includes(k.toLowerCase()));
  const before = (r.details?.before ?? null) as Record<string, unknown> | null;
  const after = (r.details?.after ?? null) as Record<string, unknown> | null;
  const diff =
    before && after
      ? Object.keys({ ...before, ...after }).filter(
          (k) => !SENSITIVE.includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
        )
      : null;
  const agent = parseAgent(r.user_agent);
  const hasMore = details.length > 0 || r.ip_address || agent;
  const extra = r.grant_summary?.length ? r.grant_summary.join(" · ") : r.actor_email;

  return (
    <li className="border-b border-line last:border-0">
      <button
        onClick={onToggle}
        aria-expanded={open}
        disabled={!hasMore}
        className={`flex w-full items-center gap-3 px-5 py-3 text-left transition ${hasMore ? "hover:bg-paper/70" : "cursor-default"} ${open ? "bg-paper/70" : ""}`}
      >
        <time dateTime={r.created_at ?? undefined} title={formatDateTime(r.created_at)} className="w-11 shrink-0 text-xs tabular-nums text-muted">
          {timeOf(r.created_at)}
        </time>
        <span className="relative shrink-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/5 text-[11px] font-bold text-ink ring-1 ring-line" aria-hidden="true">
            {initials(r.actor_name ?? r.actor_email)}
          </span>
          <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${TONES[d.tone]}`} aria-hidden="true">
            <Icon size={11} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-snug text-muted">
            <span className="font-semibold text-ink">{actorOf(r)}</span> {d.verb}
            {d.object && (
              <>
                {" "}
                <span className="font-semibold text-ink">{d.object}</span>
              </>
            )}
            {d.suffix && <> {d.suffix}</>}
          </span>
          {extra && <span className="block truncate text-xs text-muted">{extra}</span>}
        </span>
        {hasMore && <ChevronDown size={16} className={`shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-line bg-paper/50 px-5 py-4 sm:pl-[108px]">
          {diff && diff.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink">O que mudou</p>
              <table className="w-full overflow-hidden rounded-xl bg-white text-xs ring-1 ring-line">
                <thead className="bg-paper text-left text-muted">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Campo</th>
                    <th className="px-3 py-1.5 font-medium">Antes</th>
                    <th className="px-3 py-1.5 font-medium">Depois</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {diff.map((k) => (
                    <tr key={k}>
                      <td className="px-3 py-1.5 text-muted">{FIELD_LABELS[k] ?? k}</td>
                      <td className="px-3 py-1.5 text-danger-ink line-through decoration-danger/40">{valueText(k, before?.[k])}</td>
                      <td className="px-3 py-1.5 font-medium text-accent-ink">{valueText(k, after?.[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            details.length > 0 && (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                {details
                  .filter(([k]) => k !== "before" && k !== "after")
                  .map(([k, v]) => (
                    <div key={k} className="flex min-w-0 gap-2">
                      <dt className="shrink-0 text-muted">{FIELD_LABELS[k] ?? k}:</dt>
                      <dd className="min-w-0 break-words text-ink">{valueText(k, v)}</dd>
                    </div>
                  ))}
              </dl>
            )
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
            <span title={formatDateTime(r.created_at)}>{formatDateTime(r.created_at)}</span>
            {r.ip_address && (
              <span className="inline-flex items-center gap-1">
                <Globe size={12} aria-hidden="true" /> IP {r.ip_address}
              </span>
            )}
            {agent && (
              <span className="inline-flex items-center gap-1" title={r.user_agent ?? undefined}>
                <Monitor size={12} aria-hidden="true" /> {agent}
              </span>
            )}
            <button
              onClick={() => navigator.clipboard?.writeText(r.id).catch(() => {})}
              className="inline-flex items-center gap-1 font-mono hover:text-ink"
              title="Copiar o código do registro"
            >
              <Copy size={11} aria-hidden="true" /> {r.id.slice(0, 8)}
            </button>
            <span className="font-mono">{r.action}</span>
          </div>
        </div>
      )}
    </li>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-full border bg-white py-2 pl-4 pr-9 text-sm focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/10 ${
          value ? "border-ink/40 font-semibold text-ink" : "border-line text-muted"
        }`}
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
    </label>
  );
}

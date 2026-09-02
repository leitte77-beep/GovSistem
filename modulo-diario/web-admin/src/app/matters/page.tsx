"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ChevronDown, ChevronLeft, ChevronRight, Eye, FilePenLine, MoreHorizontal, Paperclip, Plus, Trash2, X } from "lucide-react";
import type { MatterListItem, MatterStatus, ActType, OrgUnit } from "@/types/matter";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { formatDate, formatTime, pluralAnexos } from "@/lib/format";
import { MATTER_STATUSES, MATTER_ACTIONS } from "@/lib/statusConfig";
import MatterStats from "@/components/MatterStats";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import toast from "react-hot-toast";

const PAGE_SIZE = 15;

interface Action {
  key: string;
  label: string;
}

const ACTION_ICON: Record<string, typeof Eye> = {
  edit: FilePenLine,
  fix: FilePenLine,
  review: Eye,
  view: Eye,
  open_edition: Eye,
  verify: Eye,
  download: Eye,
  archive: Archive,
  delete: Trash2,
};

const STATUS_PILL: Record<string, { classes: string }> = {
  published: { classes: "bg-status-published-bg text-status-published-text" },
  approved: { classes: "bg-status-published-bg text-status-published-text" },
  draft: { classes: "bg-status-draft-bg text-status-draft-text" },
  review: { classes: "bg-status-review-bg text-status-review-text" },
  rejected: { classes: "bg-status-rejected-bg text-status-rejected-text" },
  archived: { classes: "bg-status-archived-bg text-status-archived-text" },
};

function StatusPill({ status }: { status: MatterStatus }) {
  const def = MATTER_STATUSES[status];
  const pill = STATUS_PILL[status] ?? STATUS_PILL.draft;
  if (!def) {
    return (
      <span className="text-body-md text-on-surface-variant">{String(status)}</span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${pill.classes}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {def.label}
    </span>
  );
}

export default function MattersPage() {
  const [matters, setMatters] = useState<MatterListItem[]>([]);
  const [actTypes, setActTypes] = useState<ActType[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState({ total: 0, published: 0, draft: 0, review: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [actType, setActType] = useState("");
  const [orgUnit, setOrgUnit] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [confirm, setConfirm] = useState<{ type: "archive" | "delete"; matter: MatterListItem } | null>(null);

  useEffect(() => {
    api.listActTypes().then(setActTypes).catch(() => undefined);
    api.listOrgUnits().then(setOrgUnits).catch(() => undefined);
  }, []);

  useEffect(() => {
    api.listMatterStats()
      .then((s) => setStats({ total: s.total, published: s.published, draft: s.draft, review: s.review }))
      .catch((err) => notifyError("MatterStats", err))
      .finally(() => setStatsLoading(false));
  }, []);

  const activeFilters = useMemo(() =>
    [status && "status", actType && "tipo", orgUnit && "unidade", search && "busca"].filter(Boolean).length,
  [status, actType, orgUnit, search]);

  const actName = useCallback((id: string | null) => actTypes.find((a) => a.id === id)?.name ?? "", [actTypes]);
  const unitName = useCallback((id: string | null) => orgUnits.find((u) => u.id === id)?.name ?? "", [orgUnits]);

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api.listMatters({
      search: search || undefined,
      status: status || undefined,
      act_type_id: actType || undefined,
      org_unit_id: orgUnit || undefined,
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE + 1,
    })
      .then((data) => {
        if (data.length > PAGE_SIZE) { setHasMore(true); setMatters(data.slice(0, PAGE_SIZE)); }
        else { setHasMore(false); setMatters(data); }
      })
      .catch((err) => { setError(err instanceof Error ? err.message : "Erro ao carregar matérias"); notifyError("Matters", err); })
      .finally(() => setLoading(false));
  }, [search, status, actType, orgUnit, page]);

  useEffect(() => {
    const t = setTimeout(fetch, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetch, search]);

  useEffect(() => { setPage(0); }, [search, status, actType, orgUnit]);

  const clearFilters = () => { setSearch(""); setStatus(""); setActType(""); setOrgUnit(""); setPage(0); };

  const runConfirm = async () => {
    if (!confirm) return;
    const { type, matter } = confirm;
    setConfirm(null);
    try {
      if (type === "archive") {
        await api.archiveMatter(matter.id);
        toast.success("Matéria arquivada com sucesso");
      } else {
        await api.deleteMatter(matter.id);
        toast.success("Matéria excluída com sucesso");
      }
      setMatters((prev) => prev.filter((m) => m.id !== matter.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na operação");
    }
  };

  const actionsFor = (status: MatterStatus): Action[] => MATTER_ACTIONS[status] ?? [];

  const rowLink = (id: string) => `/matters/${id}/edit`;

  const actionLink = (m: MatterListItem, a: Action, extra?: string) =>
    a.key === "view" || a.key === "open_edition" || a.key === "verify" || a.key === "download"
      ? `/matters/${m.id}` + (extra ?? "")
      : rowLink(m.id);

  const actionControl = (m: MatterListItem, action: Action, compact = false) => {
    const Icon = ACTION_ICON[action.key] ?? MoreHorizontal;
    const isPrimary = !compact && ["edit", "fix", "review", "view"].includes(action.key);
    const classes = `inline-flex items-center ${compact ? "w-full justify-start" : "justify-center"} gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
      action.key === "delete"
        ? "text-error hover:bg-error-container/50"
        : isPrimary
          ? "bg-primary-fixed text-primary hover:bg-primary-fixed-dim"
          : "text-on-surface-variant hover:bg-surface-container hover:text-primary"
    }`;

    if (action.key === "delete" || action.key === "archive") {
      return (
        <button
          key={action.key}
          type="button"
          onClick={() => setConfirm({ type: action.key === "delete" ? "delete" : "archive", matter: m })}
          className={classes}
        >
          <Icon size={17} aria-hidden="true" />
          {action.label}
        </button>
      );
    }

    return (
      <Link key={action.key} href={actionLink(m, action)} className={classes}>
        <Icon size={17} aria-hidden="true" />
        {action.label}
      </Link>
    );
  };

  const renderActions = (m: MatterListItem, mobile = false) => {
    const actions = actionsFor(m.status);
    const primary = actions.find((a) => ["edit", "fix", "review"].includes(a.key)) ?? actions.find((a) => a.key === "view") ?? actions[0];
    const secondary = actions.filter((a) => a !== primary);

    return (
      <div className={`flex items-center ${mobile ? "w-full" : "justify-end"} gap-2`}>
        {primary && (
          <span className={mobile ? "flex-1 [&>*]:w-full" : ""}>
            {actionControl(m, primary)}
          </span>
        )}
        {secondary.length > 0 && (
          <details className="group relative">
            <summary
              className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:border-primary/40 hover:bg-surface-container [&::-webkit-details-marker]:hidden"
              aria-label={`Mais ações para ${m.title}`}
            >
              <MoreHorizontal size={18} aria-hidden="true" />
              {mobile && <span>Mais</span>}
              <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="absolute bottom-full right-0 z-30 mb-2 min-w-48 rounded-xl border border-outline-variant bg-surface-container-lowest p-1.5 shadow-xl md:bottom-auto md:top-full md:mb-0 md:mt-2">
              {secondary.map((action) => actionControl(m, action, true))}
            </div>
          </details>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-secondary">Acervo editorial</p>
          <h1 className="text-display font-display tracking-tight text-on-surface">Matérias</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Crie, revise e acompanhe os atos oficiais em um só lugar.</p>
        </div>
        <Link
          href="/matters/new"
          className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-5 text-sm font-bold text-on-primary shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary-container hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Plus size={18} aria-hidden="true" />
          Nova matéria
        </Link>
      </div>

      <MatterStats {...stats} loading={statsLoading} />

      {/* Filtros */}
      <section className="mb-5 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-sm" aria-label="Filtros de matérias">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_190px_190px_190px_auto]">
        <label className="relative block min-w-0">
          <span className="sr-only">Buscar por título ou conteúdo</span>
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou conteúdo..."
            className="h-11 w-full rounded-xl border border-outline-variant bg-surface pl-12 pr-4 text-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </label>
          <label className="relative block">
            <span className="sr-only">Filtrar por status</span>
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg" aria-hidden="true">filter_list</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-outline-variant bg-surface pl-10 pr-9 text-sm font-medium text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            >
              <option value="">Todos os status</option>
              {Object.entries(MATTER_STATUSES).map(([code, def]) => (
                <option key={code} value={code}>{def.label}</option>
              ))}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true">expand_more</span>
          </label>
          <label className="relative block">
            <span className="sr-only">Filtrar por tipo de ato</span>
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg" aria-hidden="true">category</span>
            <select
              value={actType}
              onChange={(e) => setActType(e.target.value)}
              className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-outline-variant bg-surface pl-10 pr-9 text-sm font-medium text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            >
              <option value="">Todos os tipos</option>
              {actTypes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true">expand_more</span>
          </label>
          <label className="relative block">
            <span className="sr-only">Filtrar por unidade</span>
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-outline" aria-hidden="true">account_balance</span>
            <select value={orgUnit} onChange={(e) => setOrgUnit(e.target.value)} className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-outline-variant bg-surface pl-10 pr-9 text-sm font-medium text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15">
              <option value="">Todas as unidades</option>
              {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true">expand_more</span>
          </label>
          <button type="button" onClick={clearFilters} disabled={activeFilters === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:pointer-events-none disabled:opacity-0">
            <X size={16} aria-hidden="true" /> Limpar
          </button>
        </div>
      </section>

      {/* Lista editorial */}
      <div className="flex flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        {error ? (
          <div className="p-6 text-center text-sm text-error" role="alert">Erro ao carregar matérias: {error}</div>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full table-fixed border-collapse text-left">
                <caption className="sr-only">Lista de matérias do Diário Oficial</caption>
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low">
                    <th scope="col" className="w-[38%] rounded-tl-2xl px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Matéria</th>
                    <th scope="col" className="w-[15%] px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Status</th>
                    <th scope="col" className="w-[8%] px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-on-surface-variant">Versão</th>
                    <th scope="col" className="w-[14%] px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Atualização</th>
                    <th scope="col" className="w-[9%] px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-on-surface-variant">Anexos</th>
                    <th scope="col" className="w-[16%] rounded-tr-2xl px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-on-surface-variant">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={6} className="px-5 py-4"><div className="h-11 rounded-lg bg-surface-container-high" /></td>
                      </tr>
                    ))
                  ) : matters.length === 0 ? (
                    <tr><td colSpan={6} className="p-6"><EmptyState title="Nenhuma matéria encontrada" description="Ajuste os filtros ou crie uma nova matéria." /></td></tr>
                  ) : matters.map((m) => (
                    <tr key={m.id} className="group transition-colors hover:bg-surface-container-low/70">
                      <td className="px-5 py-4 align-middle">
                        <Link href={rowLink(m.id)} className="line-clamp-2 text-sm font-semibold leading-5 text-on-surface transition-colors hover:text-primary hover:underline">{m.title}</Link>
                        <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-outline">
                          <span className="max-w-[42%] truncate">{actName(m.act_type_id) || "Tipo não informado"}</span>
                          <span aria-hidden="true">•</span>
                          <span className="truncate">{unitName(m.org_unit_id) || "Sem unidade"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle"><StatusPill status={m.status} /></td>
                      <td className="px-3 py-4 text-center align-middle text-sm font-semibold text-on-surface-variant">v{m.version}</td>
                      <td className="px-4 py-4 align-middle">
                        <div className="text-sm font-medium text-on-surface-variant">{formatDate(m.updated_at)}</div>
                        <div className="mt-0.5 text-xs text-outline">às {formatTime(m.updated_at)}</div>
                      </td>
                      <td className="px-3 py-4 text-center align-middle text-sm text-on-surface-variant" title={pluralAnexos(m.attachment_count)}>
                        <span className="inline-flex items-center gap-1.5"><Paperclip size={15} aria-hidden="true" />{m.attachment_count}</span>
                      </td>
                      <td className="px-5 py-4 align-middle">{renderActions(m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-outline-variant/40 lg:hidden">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <div key={i} className="m-4 h-36 animate-pulse rounded-xl bg-surface-container-high" />)
              ) : matters.length === 0 ? (
                <div className="p-6"><EmptyState title="Nenhuma matéria encontrada" description="Ajuste os filtros ou crie uma nova matéria." /></div>
              ) : matters.map((m) => (
                <article key={m.id} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={rowLink(m.id)} className="line-clamp-2 text-base font-bold leading-5 text-on-surface hover:text-primary hover:underline">{m.title}</Link>
                      <p className="mt-1 truncate text-xs text-outline">{actName(m.act_type_id) || "Tipo não informado"} · {unitName(m.org_unit_id) || "Sem unidade"}</p>
                    </div>
                    <StatusPill status={m.status} />
                  </div>
                  <dl className="my-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-container-low p-3 text-xs">
                    <div><dt className="text-outline">Versão</dt><dd className="mt-0.5 font-semibold text-on-surface">v{m.version}</dd></div>
                    <div><dt className="text-outline">Atualizada</dt><dd className="mt-0.5 font-semibold text-on-surface">{formatDate(m.updated_at)}</dd></div>
                    <div><dt className="text-outline">Anexos</dt><dd className="mt-0.5 flex items-center gap-1 font-semibold text-on-surface"><Paperclip size={13} aria-hidden="true" />{m.attachment_count}</dd></div>
                  </dl>
                  {renderActions(m, true)}
                </article>
              ))}
            </div>

            {!loading && !error && matters.length > 0 && (
              <div className="flex items-center justify-between rounded-b-2xl border-t border-outline-variant bg-surface-container-low px-4 py-3 sm:px-5">
                <span className="text-sm font-medium text-on-surface-variant">Página {page + 1}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-sm font-semibold text-on-surface-variant transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
                  >
                    <ChevronLeft size={16} aria-hidden="true" /><span className="hidden sm:inline">Anterior</span>
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasMore}
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-sm font-semibold text-on-surface transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
                  >
                    <span className="hidden sm:inline">Próximo</span><ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.type === "delete" ? "Excluir matéria" : "Arquivar matéria"}
        message={confirm ? (confirm.type === "delete"
          ? `Tem certeza que deseja excluir definitivamente a matéria "${confirm.matter.title}"? Esta ação não pode ser desfeita.`
          : `Deseja arquivar a matéria "${confirm.matter.title}"? Ela sairá da lista ativa.`) : ""}
        confirmLabel={confirm?.type === "delete" ? "Excluir" : "Arquivar"}
        destructive={confirm?.type === "delete"}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

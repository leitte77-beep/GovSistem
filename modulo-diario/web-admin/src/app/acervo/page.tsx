"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Eye, FileText, Pencil, Plus, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import { api, type AcervoFolders, type AcervoItem, type AcervoQuery } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { formatDate } from "@/lib/format";
import EmptyState from "@/components/EmptyState";

const PAGE_SIZE = 25;

/** Valor do filtro de entidade: id da unidade, "sem" (sem entidade) ou "" (todas). */
type EntityFilter = string;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "registered", label: "Registrado (sem publicação)" },
  { value: "published", label: "Publicado" },
  { value: "approved", label: "Aguardando edição" },
  { value: "review", label: "Em aprovação" },
  { value: "rejected", label: "Devolvido" },
  { value: "draft", label: "Rascunho" },
  { value: "archived", label: "Arquivado" },
];

const STATUS_PILL: Record<string, string> = {
  published: "bg-status-published-bg text-status-published-text",
  approved: "bg-status-published-bg text-status-published-text",
  draft: "bg-status-draft-bg text-status-draft-text",
  review: "bg-status-review-bg text-status-review-text",
  rejected: "bg-status-rejected-bg text-status-rejected-text",
  archived: "bg-status-archived-bg text-status-archived-text",
  registered: "bg-surface-container-high text-on-surface",
};

/** Cor por tipo de ato (na ordem das pastas), para bolinha e etiqueta. */
const TYPE_COLORS = [
  { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-800 border-emerald-200/70" },
  { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-800 border-amber-200/70" },
  { dot: "bg-blue-500", pill: "bg-blue-50 text-blue-800 border-blue-200/70" },
  { dot: "bg-indigo-500", pill: "bg-indigo-50 text-indigo-800 border-indigo-200/70" },
  { dot: "bg-cyan-500", pill: "bg-cyan-50 text-cyan-800 border-cyan-200/70" },
  { dot: "bg-violet-500", pill: "bg-violet-50 text-violet-800 border-violet-200/70" },
  { dot: "bg-rose-500", pill: "bg-rose-50 text-rose-800 border-rose-200/70" },
  { dot: "bg-teal-500", pill: "bg-teal-50 text-teal-800 border-teal-200/70" },
];

const SELECT_CLS =
  "h-11 w-full cursor-pointer rounded-xl border border-outline-variant bg-surface px-3 text-sm font-medium text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15";

/** Data sem hora ("2026-10-19") — formatada sem passar por fuso, que a
 *  levaria para o dia anterior. */
function formatPlainDate(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
}

function actLabel(item: AcervoItem): string {
  if (!item.act_number) return "s/nº";
  return item.act_year ? `${item.act_number}/${item.act_year}` : item.act_number;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function actFilename(item: AcervoItem): string {
  const base = item.act_type_name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return `${base}-${(item.act_number ?? "sn").replace(/[^0-9A-Za-z]+/g, "")}-${item.act_year ?? ""}.pdf`;
}

const EDITABLE = new Set(["draft", "registered", "rejected"]);

/** Painel lateral: o ato em PDF, com baixar, edição oficial e editar. */
function ActViewer({
  item,
  onClose,
  onSend,
  sending,
}: {
  item: AcervoItem;
  onClose: () => void;
  onSend: (item: AcervoItem) => void;
  sending: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    setUrl(null);
    setBlob(null);
    setError(null);
    api
      .getAcervoActPdf(item.id)
      .then((b) => {
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível abrir o ato"));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const edition = async (mode: "open" | "download") => {
    setBusy(mode);
    try {
      const b = await api.getAcervoEditionPdf(item.id);
      const name = `diario-oficial-${item.edition_year}-${String(item.edition_number).padStart(4, "0")}.pdf`;
      if (mode === "download") saveBlob(b, name);
      else window.open(URL.createObjectURL(b), "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível abrir a edição");
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface px-3.5 text-sm font-semibold text-on-surface hover:bg-surface-container disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={item.title}>
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex h-full w-full max-w-[900px] flex-col bg-surface-container-lowest shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-on-surface-variant">
              {item.act_type_name} · {item.org_unit_name ?? "Sem entidade"} · {item.status_label}
            </p>
            <h2 className="mt-0.5 line-clamp-2 text-lg font-bold text-on-surface">
              {item.act_number ? `${item.act_type_name} nº ${actLabel(item)}` : item.title}
            </h2>
            {item.summary && <p className="mt-0.5 line-clamp-2 text-sm text-on-surface-variant">{item.summary}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-outline-variant px-5 py-3">
          <button type="button" className={btn} disabled={!blob} onClick={() => blob && saveBlob(blob, actFilename(item))}>
            <Download size={16} aria-hidden="true" /> Baixar PDF do ato
          </button>
          {item.edition_id && (
            <>
              <button type="button" className={btn} disabled={!!busy} onClick={() => edition("open")}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">auto_stories</span>
                {busy === "open" ? "Abrindo…" : `Edição oficial ${item.edition_number}/${item.edition_year}`}
              </button>
              <button type="button" className={btn} disabled={!!busy} onClick={() => edition("download")}>
                <Download size={16} aria-hidden="true" /> {busy === "download" ? "Baixando…" : "Baixar edição"}
              </button>
            </>
          )}
          {item.status === "registered" && (
            <button type="button" className={btn} disabled={sending} onClick={() => onSend(item)}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">send</span>
              {sending ? "Enviando…" : "Enviar ao Diário"}
            </button>
          )}
          {EDITABLE.has(item.status) ? (
            <Link href={`/matters/${item.id}/edit`} className={`${btn} ml-auto`}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span> Editar
            </Link>
          ) : (
            <Link href={`/matters/${item.id}/edit`} className={`${btn} ml-auto border-transparent text-on-surface-variant`}>
              Ficha completa
            </Link>
          )}
        </div>

        <div className="min-h-0 flex-1 bg-surface-container">
          {error ? (
            <p className="p-6 text-sm text-error" role="alert">{error}</p>
          ) : url ? (
            <iframe title={`Documento: ${item.title}`} src={url} className="h-full w-full border-0" />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span>
              Gerando o documento…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function AcervoPage() {
  const [folders, setFolders] = useState<AcervoFolders | null>(null);
  const [entity, setEntity] = useState<EntityFilter>("");
  const [year, setYear] = useState<number | "">("");
  // act_type_id | "numerado" | "expediente" | "" — ?tipo= abre direto na pasta.
  const [folder, setFolder] = useState<string>("");
  useEffect(() => {
    // Lido após montar: no pré-render do servidor não há URL do navegador.
    const tipo = new URLSearchParams(window.location.search).get("tipo");
    if (tipo) setFolder(tipo);
  }, []);
  const [sending, setSending] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AcervoItem | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<NonNullable<AcervoQuery["sort"]>>("data");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<AcervoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const q = useDebounced(search.trim());

  const query = useMemo<AcervoQuery>(() => {
    const base: AcervoQuery = {
      year: year || undefined,
      status: status || undefined,
      q: q || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      sort,
      order,
    };
    if (entity === "sem") base.sem_entidade = true;
    else if (entity) base.org_unit_id = entity;
    if (folder === "numerado" || folder === "expediente") base.family = folder;
    else if (folder) base.act_type_id = folder;
    return base;
  }, [entity, year, folder, status, q, dateFrom, dateTo, sort, order]);

  // Pastas: contagem por tipo, sensível à entidade e ao ano escolhidos.
  useEffect(() => {
    api
      .getAcervoFolders({
        org_unit_id: entity && entity !== "sem" ? entity : undefined,
        year: year || undefined,
      })
      .then(setFolders)
      .catch((err) => notifyError("acervo.pastas", err));
  }, [entity, year]);

  useEffect(() => setPage(0), [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAcervo({ ...query, skip: page * PAGE_SIZE, limit: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar o acervo");
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportar = async (formato: "xlsx" | "csv" | "pdf") => {
    setExporting(formato);
    try {
      const blob = await api.exportAcervo(formato, query);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acervo-atos-${new Date().toISOString().slice(0, 10)}.${formato}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível exportar");
    } finally {
      setExporting(null);
    }
  };

  /** Ato só registrado → segue para aprovação e, depois, para a edição. */
  const enviarAoDiario = async (item: AcervoItem) => {
    if (!window.confirm(`Enviar "${item.title}" para aprovação e publicação no Diário?`)) return;
    setSending(item.id);
    try {
      await api.submitReview(item.id);
      toast.success("Enviado para aprovação.");
      setViewing((v) => (v?.id === item.id ? { ...v, status: "review", status_label: "Em aprovação" } : v));
      await load();
    } catch (err) {
      toast.error(
        `${err instanceof Error ? err.message : "Não foi possível enviar"} — abra o ato para completar os dados.`
      );
    } finally {
      setSending(null);
    }
  };

  const novoAtoHref = useMemo(() => {
    const q = new URLSearchParams();
    if (folder && folder !== "numerado" && folder !== "expediente") q.set("tipo", folder);
    if (entity && entity !== "sem") q.set("entidade", entity);
    const qs = q.toString();
    return `/acervo/novo${qs ? `?${qs}` : ""}`;
  }, [folder, entity]);

  const numbered = folders?.folders.filter((f) => f.family === "numerado") ?? [];
  const expedient = folders?.folders.filter((f) => f.family === "expediente") ?? [];
  const sum = (list: { total: number }[]) => list.reduce((acc, f) => acc + f.total, 0);

  const folderName = useMemo(() => {
    if (folder === "numerado") return "Atos numerados";
    if (folder === "expediente") return "Licitações, contratos e outros";
    return folders?.folders.find((f) => f.act_type_id === folder)?.name ?? "Todos os atos";
  }, [folder, folders]);

  const activeFilters = [status, q, dateFrom, dateTo].filter(Boolean).length;
  const clearFilters = () => {
    setStatus("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  const rangeFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeTo = Math.min(total, (page + 1) * PAGE_SIZE);

  const typeColor = (actTypeId: string) => {
    const index = folders?.folders.findIndex((f) => f.act_type_id === actTypeId) ?? -1;
    return TYPE_COLORS[(index < 0 ? 0 : index) % TYPE_COLORS.length];
  };

  const FolderGroup = ({ id, label, list }: { id: "numerado" | "expediente"; label: string; list: typeof numbered }) => (
    <div className="space-y-1 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setFolder(id)}
        aria-pressed={folder === id}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
          folder === id ? "bg-slate-900 text-white" : "bg-slate-100/70 text-slate-800 hover:bg-slate-200/70"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="material-symbols-outlined text-[17px] opacity-70" aria-hidden="true">{folder === id ? "folder_open" : "folder"}</span>
          <span className="truncate">{label}</span>
        </span>
        <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] ${folder === id ? "border-white/20 bg-white/15" : "border-slate-200 bg-white text-slate-600"}`}>
          {sum(list)}
        </span>
      </button>
      <div className="space-y-0.5 pl-2 text-xs">
        {list.map((f) => {
          const active = folder === f.act_type_id;
          const empty = f.total === 0;
          return (
            <button
              key={f.act_type_id}
              type="button"
              onClick={() => setFolder(f.act_type_id)}
              aria-pressed={active}
              className={`group flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors ${
                active ? "bg-emerald-50 font-semibold text-emerald-900 ring-1 ring-emerald-200" : empty ? "text-slate-400 hover:text-slate-600" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${empty ? "bg-slate-300" : typeColor(f.act_type_id).dot}`} />
                <span className="truncate font-medium">{f.name}</span>
              </span>
              <span className="font-mono text-[11px] font-semibold text-slate-400 group-hover:text-slate-700">{f.total}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const lastEdition = items.find((i) => i.edition_id);
  const entityTabs = [
    { id: "", name: "Todas as entidades", total: folders ? sum(folders.entities) : 0 },
    ...(folders?.entities ?? []).map((e) => ({ ...e, id: e.id ?? "sem" })),
  ];
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === status)?.label;
  const chips: { key: string; label: string; clear: () => void; tone: string }[] = [
    ...(status ? [{ key: "status", label: `Situação: ${statusLabel}`, clear: () => setStatus(""), tone: "bg-emerald-50 text-emerald-800 border-emerald-200/80" }] : []),
    ...(year ? [{ key: "year", label: `Ano: ${year}`, clear: () => setYear(""), tone: "bg-blue-50 text-blue-800 border-blue-200/80" }] : []),
    ...(entity ? [{ key: "entity", label: `Entidade: ${entityTabs.find((e) => e.id === entity)?.name ?? ""}`, clear: () => setEntity(""), tone: "bg-slate-100 text-slate-700 border-slate-200" }] : []),
    ...(folder ? [{ key: "folder", label: `Pasta: ${folderName}`, clear: () => setFolder(""), tone: "bg-indigo-50 text-indigo-800 border-indigo-200/80" }] : []),
    ...(q ? [{ key: "q", label: `Busca: “${q}”`, clear: () => setSearch(""), tone: "bg-slate-100 text-slate-700 border-slate-200" }] : []),
    ...(dateFrom ? [{ key: "from", label: `De ${formatPlainDate(dateFrom)}`, clear: () => setDateFrom(""), tone: "bg-slate-100 text-slate-700 border-slate-200" }] : []),
    ...(dateTo ? [{ key: "to", label: `Até ${formatPlainDate(dateTo)}`, clear: () => setDateTo(""), tone: "bg-slate-100 text-slate-700 border-slate-200" }] : []),
  ];
  const clearAll = () => {
    clearFilters();
    setYear("");
    setEntity("");
    setFolder("");
  };

  const kpis = [
    { label: "Atos no acervo", value: String(folders?.total ?? "—"), note: year ? `em ${year}` : "todos os anos", icon: "description", tone: "bg-slate-100 text-slate-500", bar: "bg-emerald-500", pct: 100 },
    { label: "Atos numerados", value: String(sum(numbered)), note: "decretos, leis, portarias", icon: "tag", tone: "bg-emerald-50 text-emerald-600", bar: "bg-teal-500", pct: folders?.total ? (sum(numbered) / folders.total) * 100 : 0 },
    { label: "Licitações e outros", value: String(sum(expedient)), note: "contratos, atas, editais", icon: "gavel", tone: "bg-amber-50 text-amber-600", bar: "bg-amber-400", pct: folders?.total ? (sum(expedient) / folders.total) * 100 : 0 },
    {
      label: "Última edição na lista",
      value: lastEdition ? `Nº ${lastEdition.edition_number}/${lastEdition.edition_year}` : "—",
      note: lastEdition ? formatPlainDate(lastEdition.edition_date) : "nenhuma nesta página",
      icon: "schedule",
      tone: "bg-blue-50 text-blue-600",
      bar: "bg-blue-600",
      pct: lastEdition ? 100 : 0,
      mono: true,
    },
  ];

  const inputCls =
    "h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 text-xs font-medium text-slate-800 placeholder:text-slate-400 transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
      {/* Cabeçalho + indicadores */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm md:p-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(at 0% 0%, rgba(16,185,129,0.07) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(59,130,246,0.08) 0px, transparent 50%)",
          }}
        />
        <div className="relative">
          <div className="flex flex-col justify-between gap-6 border-b border-slate-200/70 pb-6 lg:flex-row lg:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Livro de registro oficial
              </div>
              <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl font-extrabold tracking-tight text-slate-900">
                Acervo de atos
                {year && <span className="rounded-full bg-slate-900 px-2.5 py-0.5 font-mono text-xs font-semibold text-white">Exercício {year}</span>}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
                Consulte, exporte e acompanhe a publicação de decretos, leis, portarias, licitações e demais atos da entidade.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <details className="relative">
                <summary className="group inline-flex cursor-pointer list-none items-center rounded-xl border border-slate-300 bg-white/90 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                  <Download size={16} className="mr-2 text-slate-500 group-hover:text-slate-800" aria-hidden="true" />
                  {exporting ? "Exportando…" : "Exportar acervo"}
                  <ChevronDown size={14} className="ml-1.5 text-slate-400" aria-hidden="true" />
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  {([
                    ["xlsx", "Planilha Excel (.xlsx)"],
                    ["pdf", "Relatório em PDF"],
                    ["csv", "CSV"],
                  ] as const).map(([fmt, label]) => (
                    <button
                      key={fmt}
                      type="button"
                      disabled={!!exporting || total === 0}
                      onClick={(e) => {
                        (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                        void exportar(fmt);
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {label}
                    </button>
                  ))}
                  <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">Exporta o que está filtrado na tela.</p>
                </div>
              </details>
              <Link
                href={novoAtoHref}
                className="group inline-flex items-center rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 px-5 py-2.5 text-xs font-bold tracking-wide text-white shadow-[0_0_25px_-5px_rgba(16,185,129,0.45)] transition-all hover:from-emerald-500 hover:to-teal-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-95"
              >
                <Plus size={16} className="mr-2 transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
                Novo ato
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-5 md:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-slate-200/80 bg-white/90 p-3.5 transition-colors hover:border-slate-300">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500">{k.label}</span>
                  <span className={`rounded p-1 ${k.tone}`}>
                    <span className="material-symbols-outlined block text-[15px]" aria-hidden="true">{k.icon}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`font-bold text-slate-900 ${k.mono ? "font-mono text-xl" : "font-display text-2xl"}`}>{k.value}</span>
                  <span className="text-[11px] font-semibold text-slate-500">{k.note}</span>
                </div>
                <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-1 rounded-full ${k.bar}`} style={{ width: `${Math.round(k.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Entidade + exercício */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/70 p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/50 bg-slate-100/90 p-1" role="tablist" aria-label="Entidade">
          {entityTabs.map((e) => {
            const active = entity === e.id;
            return (
              <button
                key={e.id || "todas"}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setEntity(e.id)}
                className={`inline-flex items-center rounded-lg px-3.5 py-1.5 text-xs transition-all ${
                  active ? "border border-slate-200/70 bg-white font-bold text-slate-900 shadow-sm" : "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                {active && <span className="mr-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                {e.name}
                <span className={`ml-2 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${active ? "bg-slate-900 text-white" : "bg-slate-200/80 text-slate-700"}`}>{e.total}</span>
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2.5 text-xs font-medium text-slate-500">
          <span className="material-symbols-outlined text-[16px] text-slate-400" aria-hidden="true">calendar_month</span>
          Exercício:
          <select
            value={year}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white py-1.5 pl-3 pr-8 font-mono text-xs font-bold text-slate-800 shadow-sm hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <option value="">Todos os anos</option>
            {(folders?.years ?? []).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </section>

      {/* Busca e filtros */}
      <section className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]" aria-label="Filtros do acervo">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <label className="group relative md:col-span-5">
            <span className="sr-only">Buscar</span>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600" aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número, ementa, responsável, texto do ato…" className={`${inputCls} pl-10`} />
          </label>
          <label className="md:col-span-3">
            <span className="sr-only">Situação</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} cursor-pointer font-semibold`}>
              <option value="">Todas as situações</option>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="md:col-span-2">
            <span className="sr-only">Data inicial</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="De" className={inputCls} />
          </label>
          <label className="md:col-span-2">
            <span className="sr-only">Data final</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Até" className={inputCls} />
          </label>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Filtros ativos:</span>
            {chips.map((c) => (
              <span key={c.key} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${c.tone}`}>
                {c.label}
                <button type="button" onClick={c.clear} aria-label={`Remover filtro ${c.label}`} className="ml-0.5 font-bold opacity-70 hover:opacity-100">×</button>
              </span>
            ))}
            <button type="button" onClick={clearAll} className="ml-1 text-[11px] font-semibold text-slate-400 underline underline-offset-2 hover:text-rose-600">
              Limpar todos
            </button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Pastas (celular) */}
        <label className="block lg:hidden">
          <span className="sr-only">Pasta</span>
          <select value={folder} onChange={(e) => setFolder(e.target.value)} className={inputCls}>
            <option value="">Todos os atos ({folders?.total ?? 0})</option>
            <optgroup label="Atos numerados">
              <option value="numerado">Todos os numerados ({sum(numbered)})</option>
              {numbered.map((f) => <option key={f.act_type_id} value={f.act_type_id}>{f.name} ({f.total})</option>)}
            </optgroup>
            <optgroup label="Licitações, contratos e outros">
              <option value="expediente">Todos ({sum(expedient)})</option>
              {expedient.map((f) => <option key={f.act_type_id} value={f.act_type_id}>{f.name} ({f.total})</option>)}
            </optgroup>
          </select>
        </label>

        {/* Pastas */}
        <nav aria-label="Pastas do acervo" className="hidden space-y-3.5 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] lg:sticky lg:top-4 lg:col-span-3 lg:block">
          <div className="flex items-center justify-between px-2 pt-1">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">list</span>
              Classificação
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">{folders?.total ?? 0} no total</span>
          </div>
          <button
            type="button"
            onClick={() => setFolder("")}
            aria-pressed={folder === ""}
            className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${
              folder === "" ? "bg-slate-900 text-white shadow-md hover:bg-slate-800" : "border border-slate-200 text-slate-800 hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span className={`flex h-6 w-6 items-center justify-center rounded-lg border ${folder === "" ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-400" : "border-slate-200 text-slate-500"}`}>
                <span className="material-symbols-outlined text-[15px]" aria-hidden="true">folder</span>
              </span>
              Todos os atos
            </span>
            <span className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] ${folder === "" ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>{folders?.total ?? 0}</span>
          </button>
          <FolderGroup id="numerado" label="Atos numerados" list={numbered} />
          <FolderGroup id="expediente" label="Licitações, contratos e outros" list={expedient} />
        </nav>

        {/* Lista */}
        <section className="min-w-0 space-y-4 lg:col-span-9">
          <div className="flex flex-col justify-between gap-3 px-1 sm:flex-row sm:items-center">
            <p className="flex items-center gap-2 text-xs text-slate-500" aria-live="polite">
              <span className="font-bold text-slate-900">{folderName}</span>
              <span className="text-slate-300">•</span>
              <span className="font-mono">{loading ? "carregando…" : total === 0 ? "nenhum ato" : `${rangeFrom}–${rangeTo} de ${total} registros`}</span>
            </p>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
              Ordenar por:
              <select
                value={`${sort}:${order}`}
                onChange={(e) => {
                  const [s, o] = e.target.value.split(":");
                  setSort(s as NonNullable<AcervoQuery["sort"]>);
                  setOrder(o as "asc" | "desc");
                }}
                className="cursor-pointer rounded-xl border border-slate-300/80 bg-white py-1.5 pl-3 pr-8 text-xs font-semibold text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="data:desc">Mais recentes primeiro</option>
                <option value="data:asc">Mais antigos primeiro</option>
                <option value="numero:desc">Número (maior primeiro)</option>
                <option value="numero:asc">Número (menor primeiro)</option>
                <option value="titulo:asc">Título (A–Z)</option>
                <option value="atualizado:desc">Última alteração</option>
              </select>
            </label>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700" role="alert">Erro ao carregar o acervo: {error}</div>
          ) : loading && items.length === 0 ? (
            <div className="space-y-3.5">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <EmptyState title="Nenhum ato encontrado" description="Escolha outra pasta, entidade ou ano, ou ajuste os filtros." />
            </div>
          ) : (
            <div className={`space-y-3.5 ${loading ? "opacity-60" : ""}`}>
              {items.map((item) => {
                const color = typeColor(item.act_type_id);
                return (
                  <article
                    key={item.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      setViewing(item);
                    }}
                    className="group cursor-pointer rounded-2xl border border-slate-200/90 bg-white p-5 transition-all duration-200 hover:border-slate-300 hover:shadow-[0_14px_34px_-10px_rgba(15,23,42,0.09),0_0_0_1px_rgba(99,102,241,0.15)]"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div className="flex shrink-0 items-baseline justify-between gap-1.5 pt-0.5 md:w-32 md:flex-col md:items-start md:justify-start">
                        <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${color.pill}`}>
                          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${color.dot}`} />
                          <span className="max-w-[96px] truncate">{item.act_type_name}</span>
                        </span>
                        <span className="font-mono text-base font-bold text-slate-900 transition-colors group-hover:text-emerald-600">{actLabel(item)}</span>
                        {(item.act_date || item.edition_date) && (
                          <span className="font-mono text-[11px] font-medium text-slate-400" title={item.act_date ? "Data do ato" : "Data da publicação"}>
                            {formatPlainDate(item.act_date ?? item.edition_date)}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-2.5">
                        <button type="button" onClick={() => setViewing(item)} className="line-clamp-2 text-left font-display text-xs font-bold uppercase tracking-wide text-slate-900 hover:text-emerald-700 hover:underline">
                          {item.title}
                        </button>
                        {item.summary && <p className="line-clamp-3 text-[13px] leading-relaxed text-slate-600">{item.summary}</p>}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-1 text-[11px] text-slate-500">
                          <span className="inline-flex items-center rounded-md border border-slate-200/60 bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                            <span className="material-symbols-outlined mr-1 text-[14px] text-slate-400" aria-hidden="true">account_balance</span>
                            {item.org_unit_name ?? "Sem entidade"}
                          </span>
                          {item.responsible_name && (
                            <span className="inline-flex items-center rounded-md border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-slate-700">
                              <span className="material-symbols-outlined mr-1 text-[14px] text-slate-400" aria-hidden="true">person</span>
                              {item.responsible_name}
                            </span>
                          )}
                          {item.edition_id && (
                            <span className="inline-flex items-center rounded-md border border-blue-200/60 bg-blue-50 px-2 py-0.5 font-mono font-semibold text-blue-700">
                              Edição {item.edition_number}/{item.edition_year} · {formatPlainDate(item.edition_date)}
                            </span>
                          )}
                          {!item.edition_id && item.published_at && <span>publicado em {formatDate(item.published_at)}</span>}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-3 pt-0.5 md:flex-col md:items-end md:justify-start">
                        <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_PILL[item.status] ?? STATUS_PILL.draft}`}>
                          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                          {item.status_label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {item.status === "registered" && (
                            <button
                              type="button"
                              disabled={sending === item.id}
                              onClick={() => enviarAoDiario(item)}
                              className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">send</span>
                              {sending === item.id ? "Enviando…" : "Enviar ao Diário"}
                            </button>
                          )}
                          <button type="button" onClick={() => setViewing(item)} title="Visualizar documento" aria-label="Visualizar documento" className="rounded-xl border border-slate-200/80 p-2 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900">
                            <Eye size={16} aria-hidden="true" />
                          </button>
                          <Link
                            href={`/matters/${item.id}/edit`}
                            title={EDITABLE.has(item.status) ? "Editar" : "Ficha completa"}
                            aria-label={EDITABLE.has(item.status) ? "Editar" : "Ficha completa"}
                            className="rounded-xl border border-slate-200/80 p-2 text-slate-500 transition-all hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            {EDITABLE.has(item.status) ? <Pencil size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between rounded-2xl border border-slate-200/90 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft size={16} aria-hidden="true" /> Anterior
              </button>
              <span className="font-mono text-xs text-slate-500">
                Página {page + 1} de {Math.ceil(total / PAGE_SIZE)}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={rangeTo >= total || loading}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Próxima <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </section>
      </div>
      {viewing && (
        <ActViewer
          item={viewing}
          onClose={() => setViewing(null)}
          onSend={enviarAoDiario}
          sending={sending === viewing.id}
        />
      )}
    </div>
  );
}

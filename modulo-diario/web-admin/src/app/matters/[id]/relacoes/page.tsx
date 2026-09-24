"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Breadcrumbs from "@/components/Breadcrumbs";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import { api, type MatterRelation } from "@/lib/api";

const RELATION_TYPES: { value: string; label: string; inverse: string }[] = [
  { value: "rectifies", label: "Retifica", inverse: "Retificada" },
  { value: "republishes", label: "Republica", inverse: "Republicada" },
  { value: "cancels", label: "Cancela", inverse: "Cancelada" },
  { value: "revokes", label: "Revoga", inverse: "Revogada" },
  { value: "amends", label: "Altera", inverse: "Alterada" },
  { value: "supersedes", label: "Substitui", inverse: "Substituída" },
  { value: "complements", label: "Complementa", inverse: "Complementada" },
];

type Direction = "source" | "target";

interface SearchHit {
  id: string;
  title: string;
  summary: string | null;
  act_number: string | null;
  act_year: number | null;
  published_at: string | null;
}

export default function MatterRelationsPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const isAdmin = user?.roles?.some((r) => r.name === "ADMIN" || r.name === "SUPER_ADMIN") ?? false;

  const [matterTitle, setMatterTitle] = useState<string | null>(null);
  const [outgoing, setOutgoing] = useState<MatterRelation[]>([]);
  const [incoming, setIncoming] = useState<MatterRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MatterRelation | null>(null);

  // add form state
  const [direction, setDirection] = useState<Direction>("source");
  const [relationType, setRelationType] = useState<string>("rectifies");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [notes, setNotes] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(() => {
    api.listMatterRelations(id).then((res) => {
      setOutgoing(res.outgoing);
      setIncoming(res.incoming);
    }).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    api
      .getMatter(id)
      .then((m) => setMatterTitle(m.title))
      .catch(() => {});
    Promise.all([api.listMatterRelations(id)])
      .then(() => reload())
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, reload]);

  const runSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    api
      .searchPublishedMatters(q.trim())
      .then((hits) => setResults(hits.filter((h) => h.id !== id)))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [id]);

  const onSearchInput = (value: string) => {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(value), 250);
  };

  const canSubmit = isAdmin && selected && relationType;

  const handleAdd = async () => {
    if (!selected || !canSubmit) return;
    setSaving(true);
    setError(null);
    const payload =
      direction === "source"
        ? { source_matter_id: id, target_matter_id: selected.id }
        : { source_matter_id: selected.id, target_matter_id: id };
    try {
      await api.createMatterRelation({ ...payload, relation_type: relationType, notes: notes || undefined });
      setSelected(null);
      setQuery("");
      setNotes("");
      setResults([]);
      reload();
    } catch (e: any) {
      setError(e.message || "Não foi possível criar a relação.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (relationId: string) => {
    if (!isAdmin) return;
    try {
      await api.deleteMatterRelation(relationId);
      reload();
    } catch (e: any) {
      setError(e.message || "Não foi possível remover a relação.");
    }
  };

  const labelFor = (rt: string) => RELATION_TYPES.find((t) => t.value === rt)?.label || rt;

  const total = outgoing.length + incoming.length;

  const relationChip = (rt: string, dir: "out" | "in") => (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-2.5 py-1 text-xs font-semibold text-on-primary-fixed">
      {dir === "out" ? <ArrowRight size={12} aria-hidden="true" /> : <ArrowLeft size={12} aria-hidden="true" />}
      {labelFor(rt)}
    </span>
  );

  const removeButton = (rel: MatterRelation) => (
    <button
      onClick={() => setPendingDelete(rel)}
      className="btn btn-sm shrink-0 self-start text-error hover:bg-error-container/50"
      aria-label={`Remover relação ${rel.relation_type}`}
    >
      <Trash2 size={14} aria-hidden="true" />
      Remover
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <Breadcrumbs
        items={[
          { label: "Matérias", href: "/matters" },
          { label: matterTitle || "Publicação", href: `/matters/${id}/edit` },
          { label: "Relações" },
        ]}
      />

      <PageHeader
        eyebrow="Relações jurídicas"
        title="Relacionar publicação"
        description={matterTitle ? `Relações jurídicas da publicação: ${matterTitle}` : "Relações jurídicas entre publicações"}
        meta={<span className="text-body-sm text-on-surface-variant">Estas relações não alteram o conteúdo publicado — são registradas numa camada auditável.</span>}
      />

      {!isAdmin && (
        <div className="mb-5 rounded-xl border border-warning/30 bg-warning-container px-4 py-3 text-body-md text-on-warning-container" role="status">
          Somente administradores podem criar ou remover relações. Você tem acesso somente leitura.
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border border-error/30 bg-error-container/60 px-4 py-3 text-body-md text-on-error-container" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
          <Loader2 className="animate-spin text-primary" size={24} aria-hidden="true" />
          <p className="text-body-md text-on-surface-variant">Carregando relações…</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Existing relations */}
          <section aria-label="Relações existentes">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-headline-sm text-on-surface">Relações registradas</h2>
              {total > 0 && (
                <span className="text-body-sm text-outline">{total} {total === 1 ? "registro" : "registros"}</span>
              )}
            </div>
            {total === 0 ? (
              <div className="card">
                <EmptyState
                  title="Nenhuma relação registrada"
                  description="Não há vínculos jurídicos registrados para esta publicação."
                />
              </div>
            ) : (
              <ul className="space-y-3">
                {outgoing.map((rel) => (
                  <li key={rel.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-body-md text-on-surface-variant">
                          <span>Esta publicação</span>
                          {relationChip(rel.relation_type, "out")}
                          <Link
                            href={`/matters/${rel.target_matter_id}/edit`}
                            className="font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            {rel.target_title || rel.target_matter_id}
                          </Link>
                        </p>
                        {rel.notes && <p className="mt-1.5 text-body-sm text-outline">{rel.notes}</p>}
                      </div>
                      {isAdmin && removeButton(rel)}
                    </div>
                  </li>
                ))}
                {incoming.map((rel) => (
                  <li key={rel.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-body-md text-on-surface-variant">
                          <Link
                            href={`/matters/${rel.source_matter_id}/edit`}
                            className="font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            {rel.source_title || rel.source_matter_id}
                          </Link>
                          {relationChip(rel.relation_type, "in")}
                          <span>esta publicação</span>
                        </p>
                        {rel.notes && <p className="mt-1.5 text-body-sm text-outline">{rel.notes}</p>}
                      </div>
                      {isAdmin && removeButton(rel)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Add */}
          {isAdmin && (
            <section aria-label="Nova relação" className="card p-5 sm:p-6">
              <h2 className="mb-4 flex items-center gap-2 text-headline-sm text-on-surface">
                <Plus size={18} aria-hidden="true" />
                Nova relação
              </h2>

              <div className="mb-5">
                <span className="field-label">Sentido da relação</span>
                <div
                  className="inline-flex flex-wrap gap-1 rounded-xl border border-outline-variant bg-surface-container-low p-1"
                  role="group"
                  aria-label="Sentido da relação"
                >
                  <button
                    onClick={() => setDirection("source")}
                    aria-pressed={direction === "source"}
                    className={`rounded-lg px-3.5 py-2 text-body-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      direction === "source" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Esta publicação atua sobre outra
                  </button>
                  <button
                    onClick={() => setDirection("target")}
                    aria-pressed={direction === "target"}
                    className={`rounded-lg px-3.5 py-2 text-body-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      direction === "target" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Outra publicação atua sobre esta
                  </button>
                </div>
              </div>

              <label className="mb-4 block max-w-xs" htmlFor="rel-type">
                <span className="field-label">Tipo da relação</span>
                <select id="rel-type" value={relationType} onChange={(e) => setRelationType(e.target.value)} className="input cursor-pointer">
                  {RELATION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {direction === "source" ? t.label : t.inverse}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block max-w-md" htmlFor="rel-search">
                <span className="field-label">
                  Buscar publicação {direction === "source" ? "que recebe o efeito" : "que exerce o efeito"}
                </span>
                <span className="relative block">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true" />
                  <input
                    id="rel-search"
                    value={query}
                    onChange={(e) => onSearchInput(e.target.value)}
                    placeholder="Número, ano, título ou texto…"
                    className="input pl-9"
                  />
                </span>
              </label>
              {searching && <p className="mt-2 text-body-sm text-on-surface-variant">Buscando…</p>}
              {results.length > 0 && !selected && (
                <ul className="mt-2 max-h-56 divide-y divide-outline-variant/40 overflow-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
                  {results.map((h) => (
                    <li key={h.id}>
                      <button onClick={() => setSelected(h)} className="w-full px-3.5 py-2.5 text-left transition-colors hover:bg-surface-container-low">
                        <span className="block text-body-md font-semibold text-on-surface">{h.title}</span>
                        <span className="mt-0.5 block text-body-sm text-outline">
                          {h.act_number ? `Nº ${h.act_number}/${h.act_year ?? "—"}` : h.act_year || ""}
                          {h.summary ? ` — ${h.summary}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-primary-fixed-dim bg-primary-fixed px-3.5 py-2.5 text-body-md text-on-primary-fixed">
                  <span className="min-w-0 truncate">{selected.title}</span>
                  <button onClick={() => setSelected(null)} className="shrink-0 text-body-sm font-semibold text-primary underline-offset-2 hover:underline">
                    Trocar
                  </button>
                </div>
              )}

              <label className="mb-5 mt-4 block" htmlFor="rel-notes">
                <span className="field-label">Observações (opcional)</span>
                <textarea id="rel-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input resize-y" />
              </label>

              <button onClick={handleAdd} disabled={!canSubmit || saving} className="btn-primary">
                {saving ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                Registrar relação
              </button>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remover relação"
        message={pendingDelete ? `Tem certeza que deseja remover esta relação (${labelFor(pendingDelete.relation_type)})? Esta ação não pode ser desfeita.` : ""}
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          const rel = pendingDelete;
          setPendingDelete(null);
          if (rel) handleDelete(rel.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

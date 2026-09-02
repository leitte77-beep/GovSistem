"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
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
    if (!window.confirm("Remover esta relação?")) return;
    try {
      await api.deleteMatterRelation(relationId);
      reload();
    } catch (e: any) {
      setError(e.message || "Não foi possível remover a relação.");
    }
  };

  const labelFor = (rt: string) => RELATION_TYPES.find((t) => t.value === rt)?.label || rt;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Link
        href={`/matters/${id}/edit`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft size={16} /> Voltar para a matéria
      </Link>

      <PageHeader
        title="Relacionar publicação"
        description={matterTitle ? `Relações jurídicas da publicação: ${matterTitle}` : "Relações jurídicas entre publicações"}
        meta={<span className="text-xs text-gray-500">Estas relações não alteram o conteúdo publicado — são registradas numa camada auditável.</span>}
      />

      {!isAdmin && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 mb-4">
          Somente administradores podem criar ou remover relações. Você tem acesso somente leitura.
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16 text-gray-400"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="space-y-8">
          {/* Existing relations */}
          <section aria-label="Relações existentes">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Relações registradas</h2>
            {outgoing.length === 0 && incoming.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma relação registrada para esta publicação.</p>
            ) : (
              <ul className="space-y-3">
                {outgoing.map((rel) => (
                  <li key={rel.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-sm">
                      Esta publicação <strong className="text-indigo-700">{labelFor(rel.relation_type)}</strong>{" "}
                      <Link href={`/matters/${rel.target_matter_id}/edit`} className="text-indigo-700 underline">
                        {rel.target_title || rel.target_matter_id}
                      </Link>
                    </p>
                    {rel.notes && <p className="text-sm text-gray-500 mt-1">{rel.notes}</p>}
                    {isAdmin && (
                      <button onClick={() => handleDelete(rel.id)} className="mt-2 inline-flex items-center gap-1 text-xs text-red-600 hover:underline" aria-label={`Remover relação ${rel.relation_type}`}>
                        <Trash2 size={12} /> Remover
                      </button>
                    )}
                  </li>
                ))}
                {incoming.map((rel) => (
                  <li key={rel.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-sm">
                      <Link href={`/matters/${rel.source_matter_id}/edit`} className="text-indigo-700 underline">
                        {rel.source_title || rel.source_matter_id}
                      </Link>{" "}
                      <strong className="text-indigo-700">{labelFor(rel.relation_type)}</strong> esta publicação
                    </p>
                    {rel.notes && <p className="text-sm text-gray-500 mt-1">{rel.notes}</p>}
                    {isAdmin && (
                      <button onClick={() => handleDelete(rel.id)} className="mt-2 inline-flex items-center gap-1 text-xs text-red-600 hover:underline" aria-label={`Remover relação ${rel.relation_type}`}>
                        <Trash2 size={12} /> Remover
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Add */}
          {isAdmin && (
            <section aria-label="Nova relação" className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2"><Plus size={18} /> Nova relação</h2>

              <div className="mb-3">
                <span className="text-xs font-medium text-gray-600">Sentido da relação</span>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => setDirection("source")}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${direction === "source" ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600"}`}
                    aria-pressed={direction === "source"}
                  >
                    Esta publicação atua sobre outra
                  </button>
                  <button
                    onClick={() => setDirection("target")}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${direction === "target" ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600"}`}
                    aria-pressed={direction === "target"}
                  >
                    Outra publicação atua sobre esta
                  </button>
                </div>
              </div>

              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="rel-type">Tipo da relação</label>
              <select id="rel-type" value={relationType} onChange={(e) => setRelationType(e.target.value)} className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4">
                {RELATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {direction === "source" ? t.label : t.inverse}
                  </option>
                ))}
              </select>

              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="rel-search">
                Buscar publicação {direction === "source" ? "que recebe o efeito" : "que exerce o efeito"}
              </label>
              <div className="relative mb-2 max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="rel-search"
                  value={query}
                  onChange={(e) => onSearchInput(e.target.value)}
                  placeholder="Número, ano, título ou texto…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              {searching && <p className="text-xs text-gray-500 mb-2">Buscando…</p>}
              {results.length > 0 && !selected && (
                <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-3 max-h-48 overflow-auto">
                  {results.map((h) => (
                    <li key={h.id}>
                      <button onClick={() => setSelected(h)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                        <span className="font-medium text-gray-800">{h.title}</span>
                        <span className="block text-xs text-gray-500">
                          {h.act_number ? `Nº ${h.act_number}/${h.act_year ?? "—"}` : h.act_year || ""}
                          {h.summary ? ` — ${h.summary}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm text-indigo-800 mb-3 flex items-center justify-between">
                  <span className="min-w-0 truncate">{selected.title}</span>
                  <button onClick={() => setSelected(null)} className="text-indigo-700 underline text-xs ml-3 shrink-0">
                    Trocar
                  </button>
                </div>
              )}

              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="rel-notes">Observações (opcional)</label>
              <textarea id="rel-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4" />

              <button onClick={handleAdd} disabled={!canSubmit || saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                Registrar relação
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

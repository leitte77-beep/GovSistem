"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Authority, OrgUnit } from "@/types/matter";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";

const inputCls = "input";

const EMPTY = (): Authority => ({
  id: "",
  name: "",
  role: "",
  org_unit_id: null,
  is_active: true,
  valid_from: "",
  valid_until: "",
  notes: "",
});

export default function AuthoritiesPage() {
  const [rows, setRows] = useState<Authority[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [editing, setEditing] = useState<Authority>(EMPTY());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Authority | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isNew = !editing.id;

  async function load() {
    setLoading(true);
    try {
      const [as, os] = await Promise.all([api.listAuthorities({ search: search || undefined, active_only: activeOnly || undefined }), api.listOrgUnits()]);
      setRows(as);
      setOrgUnits(os);
    } catch (e) {
      notifyError("carregar autoridades", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeOnly]);

  function payload() {
    return {
      name: editing.name.trim(),
      role: editing.role?.trim() || undefined,
      org_unit_id: editing.org_unit_id || undefined,
      is_active: editing.is_active,
      valid_from: editing.valid_from || undefined,
      valid_until: editing.valid_until || undefined,
      notes: editing.notes?.trim() || undefined,
    };
  }

  async function save() {
    setSaveError(null);
    if (!editing.name.trim()) {
      setSaveError("Informe o nome da autoridade.");
      return;
    }
    if (editing.valid_until && editing.valid_from && editing.valid_until < editing.valid_from) {
      setSaveError("A data final não pode ser anterior à inicial.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await api.createAuthority(payload());
        toast.success("Autoridade cadastrada.");
      } else {
        await api.updateAuthority(editing.id, payload());
        toast.success("Autoridade atualizada.");
      }
      setEditing(EMPTY());
      await load();
    } catch (e: unknown) {
      const err = e as { data?: { detail?: unknown }; message?: string };
      const d = err?.data?.detail;
      setSaveError(typeof d === "string" ? d : String(err?.message || "Erro ao salvar."));
      notifyError("salvar autoridade", e);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.deleteAuthority(deleting.id);
      toast.success("Autoridade desativada.");
      setDeleting(null);
      await load();
    } catch (e) {
      notifyError("desativar autoridade", e);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-gutter py-8">
      <PageHeader
        eyebrow="Cadastros"
        title="Autoridades e signatários"
        description="Cadastro de responsáveis por atos. Ao publicar, nome e cargo são congelados no documento."
        actions={
          <button
            type="button"
            onClick={() => { setSaveError(null); setEditing(EMPTY()); }}
            className="btn-primary"
          >
            <Plus size={18} aria-hidden="true" />
            Nova autoridade
          </button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true" />
          <input
            className={inputCls + " pl-9"}
            placeholder="Buscar por nome ou cargo…"
            aria-label="Buscar autoridades por nome ou cargo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-body-sm text-on-surface">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Apenas ativas
        </label>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="p-6 text-body-sm text-on-surface-variant">Carregando…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhuma autoridade" description="Cadastre o prefeito, secretários e demais signatários." />
        ) : (
          <ul className="divide-y divide-outline-variant">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface-container-low">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-body-md font-semibold text-on-surface">{a.name}</span>
                    {a.is_active ? (
                      <span className="rounded-full bg-success-container px-2 py-0.5 text-[11px] font-semibold text-on-success-container">Ativa</span>
                    ) : (
                      <span className="rounded-full bg-error-container px-2 py-0.5 text-[11px] font-semibold text-on-error-container">Inativa</span>
                    )}
                  </div>
                  <p className="truncate text-body-sm text-on-surface-variant">
                    {[a.role, a.org_unit_name].filter(Boolean).join(" · ") || "—"}
                    {a.valid_until ? ` · até ${a.valid_until}` : ""}
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <button onClick={() => setEditing({ ...a })} className="btn-outline btn-sm">Editar</button>
                  {a.is_active && (
                    <button
                      onClick={() => setDeleting(a)}
                      className="btn-ghost btn-sm text-error hover:bg-error-container"
                    >
                      Desativar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(editing.name !== "" || !isNew) && (
        <section className="card space-y-5 p-6">
          <div>
            <p className="eyebrow mb-1">{isNew ? "Novo cadastro" : "Edição"}</p>
            <h2 className="text-headline-sm text-on-surface">{isNew ? "Nova autoridade" : editing.name}</h2>
          </div>

          {saveError && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-body-sm text-on-error-container" role="alert">
              {saveError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Nome *</span>
              <input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Cargo ou função</span>
              <input className={inputCls} placeholder="Prefeito Municipal" value={editing.role ?? ""} onChange={(e) => setEditing({ ...editing, role: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Órgão ou unidade</span>
              <select className={inputCls} value={editing.org_unit_id ?? ""} onChange={(e) => setEditing({ ...editing, org_unit_id: e.target.value || null })}>
                <option value="">— Sem unidade —</option>
                {orgUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Início (mandato)</span>
                <input type="date" className={inputCls} value={editing.valid_from ?? ""} onChange={(e) => setEditing({ ...editing, valid_from: e.target.value })} />
              </label>
              <label className="block">
                <span className="field-label">Fim (opcional)</span>
                <input type="date" className={inputCls} value={editing.valid_until ?? ""} onChange={(e) => setEditing({ ...editing, valid_until: e.target.value })} />
              </label>
            </div>
            <label className="block sm:col-span-2">
              <span className="field-label">Observações</span>
              <textarea className={inputCls} rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-body-sm text-on-surface">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
              checked={editing.is_active}
              onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
            />
            Autoridade ativa (disponível para seleção)
          </label>

          <hr className="rule" />

          <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
            <button onClick={() => setEditing(EMPTY())} className="btn-outline">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Salvando…" : isNew ? "Cadastrar" : "Salvar"}
            </button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`Desativar "${deleting?.name}"?`}
        message="A autoridade deixa de aparecer nas seleções. Documentos já publicados não mudam."
        confirmLabel="Desativar"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

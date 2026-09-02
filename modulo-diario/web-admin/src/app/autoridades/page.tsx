"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { Authority, OrgUnit } from "@/types/matter";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";

const inputCls =
  "w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

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
    <div className="mx-auto max-w-6xl px-gutter py-8 space-y-6">
      <PageHeader
        title="Autoridades / Signatários"
        description="Cadastro de responsáveis por atos. Ao publicar, nome e cargo são congelados no documento."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className={inputCls + " sm:w-72"}
            placeholder="Buscar por nome ou cargo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Apenas ativas
          </label>
        </div>
        <button onClick={() => { setSaveError(null); setEditing(EMPTY()); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:opacity-90">
          + Nova autoridade
        </button>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
        {loading ? (
          <p className="p-6 text-sm text-on-surface-variant">Carregando…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhuma autoridade" description="Cadastre o prefeito, secretários e demais signatários." />
        ) : (
          <ul className="divide-y divide-outline-variant">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-on-surface">{a.name}</span>
                    {a.is_active ? (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Ativo</span>
                    ) : (
                      <span className="rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error">Inativo</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-on-surface-variant">
                    {[a.role, a.org_unit_name].filter(Boolean).join(" · ") || "—"}
                    {a.valid_until ? ` · até ${a.valid_until}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setEditing({ ...a })} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs hover:bg-surface-container-high">Editar</button>
                  {a.is_active && (
                    <button onClick={() => setDeleting(a)} className="rounded-lg border border-error/30 px-3 py-1.5 text-xs text-error hover:bg-error/5">Desativar</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(editing.name !== "" || !isNew) && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 space-y-5">
          <h3 className="text-lg font-semibold">{isNew ? "Nova autoridade" : `Editar: ${editing.name}`}</h3>
          {saveError && <div className="rounded-lg bg-error/10 px-4 py-2 text-sm text-error">{saveError}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Nome *</span>
              <input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Cargo / Função</span>
              <input className={inputCls} placeholder="Prefeito Municipal" value={editing.role ?? ""} onChange={(e) => setEditing({ ...editing, role: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Órgão / Unidade</span>
              <select className={inputCls} value={editing.org_unit_id ?? ""} onChange={(e) => setEditing({ ...editing, org_unit_id: e.target.value || null })}>
                <option value="">— Sem unidade —</option>
                {orgUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Início (mandato)</span>
                <input type="date" className={inputCls} value={editing.valid_from ?? ""} onChange={(e) => setEditing({ ...editing, valid_from: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Fim (opcional)</span>
                <input type="date" className={inputCls} value={editing.valid_until ?? ""} onChange={(e) => setEditing({ ...editing, valid_until: e.target.value })} />
              </label>
            </div>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Observações</span>
              <textarea className={inputCls} rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
            Autoridade ativa (disponível para seleção)
          </label>

          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(EMPTY())} className="rounded-lg border border-outline-variant px-4 py-2 text-sm hover:bg-surface-container-high">Cancelar</button>
            <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50">
              {saving ? "Salvando…" : isNew ? "Cadastrar" : "Salvar"}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`Desativar "${deleting?.name}"?`}
        message="A autoridade deixa de aparecer nas seleções. Documentos já publicados não mudam."
        confirmLabel="Desativar"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

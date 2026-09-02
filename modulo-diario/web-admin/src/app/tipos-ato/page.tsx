"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { ActTypeAdmin, DynamicFieldDef, DynamicFieldType } from "@/types/matter";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";

const TOKENS = ["{type}", "{number}", "{year}", "{date}"] as const;
const FIELD_TYPES: { value: DynamicFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "textarea", label: "Texto longo" },
  { value: "number", label: "Número" },
  { value: "date", label: "Data" },
  { value: "currency", label: "Moeda" },
  { value: "cpf_cnpj", label: "CPF/CNPJ" },
  { value: "select", label: "Lista (select)" },
  { value: "boolean", label: "Sim/Não" },
];

const EMPTY_AT = (): ActTypeAdmin => ({
  id: "",
  name: "",
  description: "",
  is_active: true,
  config: {
    number_required: false,
    year_required: false,
    date_required: false,
    responsible_required: false,
    allow_free_responsible: true,
    title_pattern: "",
    title_uppercase: false,
    dynamic_fields: [],
  },
});

function emptyField(): DynamicFieldDef {
  return { key: "", label: "", type: "text", required: false, placeholder: "", help: "", options: [] };
}

const inputCls =
  "w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export default function ActTypesAdminPage() {
  const [rows, setRows] = useState<ActTypeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ActTypeAdmin>(EMPTY_AT());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ActTypeAdmin | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const patternRef = useRef<HTMLInputElement>(null);

  const isNew = !editing.id;

  async function load() {
    setLoading(true);
    try {
      setRows(await api.adminListActTypes(showInactive));
    } catch (e) {
      notifyError("carregar tipos", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  function patchConfig<K extends keyof NonNullable<ActTypeAdmin["config"]>>(key: K, value: unknown) {
    setEditing((prev) => ({ ...prev, config: { ...(prev.config ?? {}), [key]: value } }));
  }

  function patchField(i: number, patch: Partial<DynamicFieldDef>) {
    setEditing((prev) => {
      const fields = [...((prev.config?.dynamic_fields as DynamicFieldDef[]) ?? [])];
      fields[i] = { ...fields[i], ...patch };
      return { ...prev, config: { ...(prev.config ?? {}), dynamic_fields: fields } };
    });
  }

  function addField() {
    patchConfig("dynamic_fields", [...(editing.config?.dynamic_fields ?? []), emptyField()]);
  }

  function removeField(i: number) {
    const fields = [...(editing.config?.dynamic_fields ?? [])];
    fields.splice(i, 1);
    patchConfig("dynamic_fields", fields);
  }

  function insertToken(token: string) {
    const el = patternRef.current;
    const cfg = editing.config?.title_pattern ?? "";
    if (el) {
      const s = el.selectionStart ?? cfg.length;
      const e = el.selectionEnd ?? cfg.length;
      const next = cfg.slice(0, s) + token + cfg.slice(e);
      patchConfig("title_pattern", next);
      requestAnimationFrame(() => {
        const pos = s + token.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    } else {
      patchConfig("title_pattern", cfg + token);
    }
  }

  const preview = useMemo(() => {
    const p = editing.config?.title_pattern ?? "";
    if (!p.trim()) return null;
    const sample: Record<string, string> = {
      type: (editing.name || "Tipo").toUpperCase(),
      number: "25",
      year: String(new Date().getFullYear()),
      date: new Date().toISOString().slice(0, 10),
    };
    let out = p;
    for (const t of Object.keys(sample)) out = out.replaceAll(`{${t}}`, sample[t]);
    return out;
  }, [editing.config?.title_pattern, editing.name]);

  async function save() {
    setSaveError(null);
    if (!editing.name.trim()) {
      setSaveError("Informe o nome do tipo.");
      return;
    }
    const cfg = {
      number_required: editing.config?.number_required ?? false,
      year_required: editing.config?.year_required ?? false,
      date_required: editing.config?.date_required ?? false,
      responsible_required: editing.config?.responsible_required ?? false,
      allow_free_responsible: editing.config?.allow_free_responsible ?? true,
      title_uppercase: editing.config?.title_uppercase ?? false,
      title_pattern: (editing.config?.title_pattern ?? "").trim() || null,
      dynamic_fields: (editing.config?.dynamic_fields ?? []).map((f) => ({
        key: f.key.trim(),
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        placeholder: f.placeholder?.trim() || null,
        help: f.help?.trim() || null,
        options: Array.isArray(f.options) ? f.options.map((o) => String(o).trim()).filter(Boolean) : [],
      })),
    };
    setSaving(true);
    try {
      if (isNew) {
        await api.adminCreateActType({ name: editing.name.trim(), description: editing.description || undefined, config: cfg });
        toast.success("Tipo criado.");
      } else {
        await api.adminUpdateActType(editing.id, {
          name: editing.name.trim(),
          description: editing.description || undefined,
          is_active: editing.is_active,
          config: cfg,
        });
        toast.success("Configuração salva.");
      }
      setEditing(EMPTY_AT());
      await load();
    } catch (e: unknown) {
      const err = e as { data?: { detail?: unknown }; message?: string };
      const d = err?.data?.detail;
      if (Array.isArray(d)) {
        setSaveError(d.map((x: any) => x?.message || x?.msg).filter(Boolean).join(" • "));
      } else if (typeof d === "string") {
        setSaveError(d);
      } else {
        setSaveError(String(err?.message || "Erro ao salvar."));
      }
      notifyError("salvar tipo", e);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.adminDeleteActType(deleting.id);
      toast.success(`Tipo "${deleting.name}" desativado.`);
      setDeleting(null);
      await load();
    } catch (e) {
      notifyError("desativar tipo", e);
    }
  }

  const fields = (editing.config?.dynamic_fields ?? []) as DynamicFieldDef[];

  return (
    <div className="mx-auto max-w-6xl px-gutter py-8 space-y-6">
      <PageHeader
        title="Tipos de Ato"
        description="Configure regras e campos de cada tipo de publicação sem tocar em JSON."
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inativos
        </label>
        <button
          onClick={() => { setSaveError(null); setEditing(EMPTY_AT()); }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:opacity-90"
        >
          + Novo tipo
        </button>
      </div>

      {/* List */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
        {loading ? (
          <p className="p-6 text-sm text-on-surface-variant">Carregando…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum tipo cadastrado" description="Crie o primeiro tipo de ato acima." />
        ) : (
          <ul className="divide-y divide-outline-variant">
            {rows.map((t) => {
              const cfg = t.config ?? {};
              const nf = (cfg.dynamic_fields as DynamicFieldDef[] | undefined)?.length ?? 0;
              return (
                <li key={t.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-on-surface">{t.name}</span>
                      {!t.is_active && (
                        <span className="rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error">Inativo</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-on-surface-variant">
                      {cfg.title_pattern || `Sem padrão de título`}
                      {nf > 0 && ` · ${nf} campo(s) adicional(is)`}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => setEditing({ ...t, config: { ...(t.config ?? {}) } })} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs hover:bg-surface-container-high">
                      Editar
                    </button>
                    {!t.is_active ? null : (
                      <button onClick={() => setDeleting(t)} className="rounded-lg border border-error/30 px-3 py-1.5 text-xs text-error hover:bg-error/5">
                        Desativar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Editor */}
      {(editing.name !== "" || !isNew) && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 space-y-5">
          <h3 className="text-lg font-semibold">{isNew ? "Novo tipo" : `Editar: ${editing.name}`}</h3>

          {saveError && <div className="rounded-lg bg-error/10 px-4 py-2 text-sm text-error">{saveError}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Nome</span>
              <input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Ativo</span>
              <select className={inputCls} value={editing.is_active ? "1" : "0"} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === "1" })}>
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Descrição</span>
              <textarea className={inputCls} rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </label>
          </div>

          {/* Required flags */}
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["number_required", "Número obrigatório"],
              ["year_required", "Ano obrigatório"],
              ["date_required", "Data obrigatória"],
              ["responsible_required", "Responsável obrigatório"],
              ["allow_free_responsible", "Permitir texto manual de responsável"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!(editing.config as any)?.[key]} onChange={(e) => patchConfig(key as never, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>

          {/* Title pattern */}
          <div>
            <span className="mb-1 block text-sm font-medium">Formato automático do título</span>
            <div className="flex flex-wrap gap-1.5 pb-2">
              {TOKENS.map((t) => (
                <button key={t} onClick={() => insertToken(t)} className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary hover:bg-primary/20">
                  {t}
                </button>
              ))}
            </div>
            <input
              id="title-pattern"
              ref={patternRef}
              className={inputCls}
              placeholder="Ex.: PORTARIA Nº {number}/{year}"
              value={editing.config?.title_pattern ?? ""}
              onChange={(e) => patchConfig("title_pattern", e.target.value)}
            />
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-surface px-3 py-2">
                <span className="text-xs text-on-surface-variant">Formato</span>
                <div className="font-mono text-xs">{editing.config?.title_pattern || "—"}</div>
              </div>
              <div className="rounded-lg bg-primary/5 px-3 py-2">
                <span className="text-xs text-on-surface-variant">Prévia (amostra)</span>
                <div className="font-semibold text-primary">{preview || "—"}</div>
              </div>
            </div>
          </div>

          {/* Dynamic fields */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Campos adicionais deste tipo</span>
              <button onClick={addField} className="rounded-md bg-secondary-container px-3 py-1.5 text-xs font-medium hover:opacity-90">
                + Adicionar campo
              </button>
            </div>

            {fields.length === 0 && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Ex.: Contrato → contratado, cnpj/objeto, vigência, valor; Licitação → modalidade, processo, objeto.
              </p>
            )}

            <div className="mt-3 space-y-3">
              {fields.map((f, i) => (
                <div key={i} className="rounded-lg border border-outline-variant bg-surface p-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input className={inputCls} placeholder="Nome (label)" value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} />
                    <input className={inputCls} placeholder="Chave (ex.: cnpj_contratado)" value={f.key} onChange={(e) => patchField(i, { key: e.target.value })} />
                    <select className={inputCls} value={f.type} onChange={(e) => patchField(i, { type: e.target.value as DynamicFieldType, options: e.target.value === "select" ? (f.options ?? []) : [] })}>
                      {FIELD_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className={inputCls} placeholder="Placeholder" value={f.placeholder ?? ""} onChange={(e) => patchField(i, { placeholder: e.target.value })} />
                    <input className={inputCls} placeholder="Texto de ajuda" value={f.help ?? ""} onChange={(e) => patchField(i, { help: e.target.value })} />
                  </div>
                  {f.type === "select" && (
                    <input
                      className={inputCls}
                      placeholder="Opções separadas por vírgula (ex.: Menor preço, Melhor técnica)"
                      value={(f.options ?? []).join(", ")}
                      onChange={(e) => patchField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!!f.required} onChange={(e) => patchField(i, { required: e.target.checked })} />
                      Obrigatório
                    </label>
                    <button onClick={() => removeField(i)} className="text-xs text-error hover:underline">Remover</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(EMPTY_AT())} className="rounded-lg border border-outline-variant px-4 py-2 text-sm hover:bg-surface-container-high">
              Cancelar
            </button>
            <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50">
              {saving ? "Salvando…" : isNew ? "Criar tipo" : "Salvar configuração"}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`Desativar "${deleting?.name}"?`}
        message="O tipo fica oculto na criação, mas matérias já existentes não são alteradas."
        confirmLabel="Desativar"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

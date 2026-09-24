"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";
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

const inputCls = "input";

export default function ActTypesAdminPage() {
  const [rows, setRows] = useState<ActTypeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ActTypeAdmin>(EMPTY_AT());
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ActTypeAdmin | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const patternRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (editorOpen) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      editorRef.current?.focus({ preventScroll: true });
    }
  }, [editorOpen, editing.id]);

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
      setEditorOpen(false);
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
    <div className="mx-auto max-w-6xl space-y-6 px-gutter py-8">
      <PageHeader
        eyebrow="Cadastros"
        title="Tipos de ato"
        description="Configure regras e campos de cada tipo de publicação sem tocar em JSON."
        actions={
          <button
            type="button"
            onClick={() => { setSaveError(null); setEditing(EMPTY_AT()); setEditorOpen(true); }}
            className="btn-primary"
          >
            + Novo tipo
          </button>
        }
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-body-sm text-on-surface">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar inativos
        </label>
        <span className="text-body-sm text-on-surface-variant">
          {rows.length} tipo(s)
        </span>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        {loading ? (
          <p className="p-6 text-body-sm text-on-surface-variant">Carregando…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum tipo cadastrado" description="Crie o primeiro tipo de ato para começar." />
        ) : (
          <ul className="divide-y divide-outline-variant">
            {rows.map((t) => {
              const cfg = t.config ?? {};
              const nf = (cfg.dynamic_fields as DynamicFieldDef[] | undefined)?.length ?? 0;
              return (
                <li key={t.id} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface-container-low">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-body-md font-semibold text-on-surface">{t.name}</span>
                      {!t.is_active && (
                        <span className="rounded-full bg-error-container px-2 py-0.5 text-[11px] font-semibold text-on-error-container">Inativo</span>
                      )}
                    </div>
                    <p className="truncate text-body-sm text-on-surface-variant">
                      {cfg.title_pattern || "Sem padrão de título"}
                      {nf > 0 && ` · ${nf} campo(s) adicional(is)`}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      onClick={() => { setSaveError(null); setEditing({ ...t, config: { ...(t.config ?? {}) } }); setEditorOpen(true); }}
                      className="btn-outline btn-sm"
                    >
                      Editar
                    </button>
                    {!t.is_active ? null : (
                      <button
                        onClick={() => setDeleting(t)}
                        className="btn-ghost btn-sm text-error hover:bg-error-container"
                      >
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
      {editorOpen && (
        <section ref={editorRef} tabIndex={-1} className="card animate-fade-up space-y-5 p-6 focus:outline-none">
          <p className="eyebrow">{isNew ? "Novo cadastro" : "Edição"}</p>
          <h2 className="-mt-3 text-headline-sm text-on-surface">{isNew ? "Novo tipo" : `Editar: ${editing.name}`}</h2>

          {saveError && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-body-sm text-on-error-container" role="alert">
              {saveError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Nome</span>
              <input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Situação</span>
              <select className={inputCls} value={editing.is_active ? "1" : "0"} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === "1" })}>
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">Descrição</span>
              <textarea className={inputCls} rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </label>
          </div>

          <hr className="rule" />

          {/* Required flags */}
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["number_required", "Número obrigatório"],
              ["year_required", "Ano obrigatório"],
              ["date_required", "Data obrigatória"],
              ["responsible_required", "Responsável obrigatório"],
              ["allow_free_responsible", "Permitir texto manual de responsável"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-body-sm text-on-surface">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                  checked={!!(editing.config as any)?.[key]}
                  onChange={(e) => patchConfig(key as never, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>

          <hr className="rule" />

          {/* Title pattern */}
          <div>
            <span className="field-label">Formato automático do título</span>
            <div className="flex flex-wrap gap-1.5 pb-2">
              {TOKENS.map((t) => (
                <button
                  key={t}
                  onClick={() => insertToken(t)}
                  className="rounded-md bg-primary-fixed px-2 py-1 font-mono text-xs text-primary transition-colors hover:bg-primary-fixed-dim"
                >
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
            <p className="field-hint">Insira os marcadores acima ou digite o padrão com texto livre.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-surface-container-low px-3 py-2">
                <span className="block text-body-sm text-on-surface-variant">Formato</span>
                <div className="font-mono text-xs text-on-surface">{editing.config?.title_pattern || "—"}</div>
              </div>
              <div className="rounded-lg bg-primary-fixed px-3 py-2">
                <span className="block text-body-sm text-on-surface-variant">Prévia (amostra)</span>
                <div className="text-body-sm font-semibold text-primary">{preview || "—"}</div>
              </div>
            </div>
          </div>

          <hr className="rule" />

          {/* Dynamic fields */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="field-label mb-0">Campos adicionais deste tipo</span>
                <p className="text-body-sm text-on-surface-variant">Personalize os dados coletados em cada matéria.</p>
              </div>
              <button
                onClick={addField}
                className="btn btn-sm bg-secondary-container text-on-secondary-container hover:brightness-95"
              >
                <Plus size={16} aria-hidden="true" />
                Adicionar campo
              </button>
            </div>

            {fields.length === 0 && (
              <p className="mt-3 rounded-lg border border-dashed border-outline-variant px-3 py-2 text-body-sm text-on-surface-variant">
                Ex.: Contrato → contratado, CNPJ/objeto, vigência, valor; Licitação → modalidade, processo, objeto.
              </p>
            )}

            <div className="mt-3 space-y-3">
              {fields.map((f, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-outline-variant bg-surface-container-low p-3">
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
                    <label className="flex items-center gap-2 text-body-sm text-on-surface">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                        checked={!!f.required}
                        onChange={(e) => patchField(i, { required: e.target.checked })}
                      />
                      Obrigatório
                    </label>
                    <button
                      onClick={() => removeField(i)}
                      className="btn-ghost btn-sm text-error hover:bg-error-container"
                      aria-label={`Remover campo ${f.label || i + 1}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <hr className="rule" />

          <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
            <button onClick={() => setEditorOpen(false)} className="btn-outline">
              Cancelar
            </button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Salvando…" : isNew ? "Criar tipo" : "Salvar configuração"}
            </button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`Desativar "${deleting?.name}"?`}
        message="O tipo fica oculto na criação, mas matérias já existentes não são alteradas."
        confirmLabel="Desativar"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

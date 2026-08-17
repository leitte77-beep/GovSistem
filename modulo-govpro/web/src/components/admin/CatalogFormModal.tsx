"use client";

import { useEffect, useState } from "react";

export type CatalogFieldType = "text" | "textarea" | "number" | "select" | "checkbox" | "checkbox-group";

export interface CatalogFieldOption {
  value: string;
  label: string;
}

export interface CatalogField {
  name: string;
  label: string;
  type: CatalogFieldType;
  required?: boolean;
  disabled?: boolean;
  help?: string;
  options?: CatalogFieldOption[];
  span?: 1 | 2;
}

export type CatalogFormValues = Record<string, string | number | boolean | string[] | null>;

export default function CatalogFormModal({
  open,
  title,
  fields,
  initialValues,
  submitting,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  fields: CatalogField[];
  initialValues: CatalogFormValues;
  submitting: boolean;
  onSubmit: (values: CatalogFormValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<CatalogFormValues>(initialValues);

  useEffect(() => {
    if (open) setValues(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const setField = (name: string, value: string | number | boolean | string[] | null) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const toggleInGroup = (name: string, option: string) => {
    const atual = Array.isArray(values[name]) ? (values[name] as string[]) : [];
    const proximo = atual.includes(option) ? atual.filter((v) => v !== option) : [...atual, option];
    setField(name, proximo);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-gutter" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(values);
        }}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface-container-lowest rounded-lg shadow-xl p-6"
      >
        <h3 className="text-headline-sm font-headline-sm text-on-surface mb-5">{title}</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {fields.map((f) => (
            <div key={f.name} className={f.span === 2 ? "md:col-span-2 space-y-2" : "space-y-2"}>
              {f.type !== "checkbox" && (
                <label htmlFor={f.name} className="text-label-md font-label-md text-on-surface">
                  {f.label} {f.required && <span className="text-error">*</span>}
                </label>
              )}

              {f.type === "text" && (
                <input
                  id={f.name}
                  required={f.required}
                  disabled={f.disabled}
                  value={(values[f.name] as string) ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                  className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary disabled:opacity-60"
                />
              )}

              {f.type === "textarea" && (
                <textarea
                  id={f.name}
                  required={f.required}
                  rows={3}
                  value={(values[f.name] as string) ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
                />
              )}

              {f.type === "number" && (
                <input
                  id={f.name}
                  type="number"
                  required={f.required}
                  value={(values[f.name] as number | string) ?? ""}
                  onChange={(e) => setField(f.name, e.target.value === "" ? null : Number(e.target.value))}
                  className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
                />
              )}

              {f.type === "select" && (
                <select
                  id={f.name}
                  required={f.required}
                  disabled={f.disabled}
                  value={(values[f.name] as string) ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                  className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary disabled:opacity-60"
                >
                  <option value="">Selecione…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}

              {f.type === "checkbox" && (
                <label htmlFor={f.name} className="flex items-center gap-2 h-11 text-body-md text-on-surface">
                  <input
                    id={f.name}
                    type="checkbox"
                    checked={Boolean(values[f.name])}
                    onChange={(e) => setField(f.name, e.target.checked)}
                    className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary"
                  />
                  {f.label}
                </label>
              )}

              {f.type === "checkbox-group" && (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {f.options?.map((o) => (
                    <label key={o.value} className="flex items-center gap-2 text-body-sm text-on-surface">
                      <input
                        type="checkbox"
                        checked={(values[f.name] as string[] | undefined)?.includes(o.value) ?? false}
                        onChange={() => toggleInGroup(f.name, o.value)}
                        className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              )}

              {f.help && <p className="text-body-sm text-on-surface-variant">{f.help}</p>}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-10 px-4 text-label-md font-label-md border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="h-10 px-4 text-label-md font-label-md rounded-lg bg-primary text-on-primary hover:bg-primary-container transition-colors disabled:opacity-60"
          >
            {submitting ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

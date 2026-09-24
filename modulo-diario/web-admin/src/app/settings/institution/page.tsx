"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import { defaultLayout } from "@/components/DocumentModelBuilder/constants";
import type { DocumentLayout, InstitutionalProfile } from "@/types/document_model";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

interface FormState {
  name: string;
  cnpj: string;
  state: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_district: string;
  address_city: string;
  address_postal_code: string;
  phone: string;
  email: string;
  site: string;
  logo_url: string;
}

const EMPTY: FormState = {
  name: "",
  cnpj: "",
  state: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_district: "",
  address_city: "",
  address_postal_code: "",
  phone: "",
  email: "",
  site: "",
  logo_url: "",
};

function toForm(p: InstitutionalProfile): FormState {
  return {
    name: p.name ?? "",
    cnpj: p.cnpj ?? "",
    state: p.state ?? "",
    address_street: p.address_street ?? "",
    address_number: p.address_number ?? "",
    address_complement: p.address_complement ?? "",
    address_district: p.address_district ?? "",
    address_city: p.address_city ?? "",
    address_postal_code: p.address_postal_code ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    site: p.site ?? "",
    logo_url: p.logo_url ?? "",
  };
}

export default function InstitutionPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [layout, setLayout] = useState<DocumentLayout>(() => defaultLayout());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getInstitution();
      setForm(toForm(data));
      setLayout({ ...defaultLayout(), ...(data.institutional_layout ?? {}) });
    } catch (err) {
      notifyError("settings.institution", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Informe o nome da instituição.");
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<InstitutionalProfile> = {
        name: form.name.trim(),
        cnpj: form.cnpj.trim() || null,
        state: form.state || null,
        address_street: form.address_street.trim() || null,
        address_number: form.address_number.trim() || null,
        address_complement: form.address_complement.trim() || null,
        address_district: form.address_district.trim() || null,
        address_city: form.address_city.trim() || null,
        address_postal_code: form.address_postal_code.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        site: form.site.trim() || null,
        logo_url: form.logo_url.trim() || null,
        institutional_layout: layout,
      };
      const updated = await api.updateInstitution(payload);
      setForm(toForm(updated));
      setLayout({ ...defaultLayout(), ...(updated.institutional_layout ?? {}) });
      toast.success("Identidade institucional salva.");
    } catch (err) {
      notifyError("settings.institution.save", err);
    } finally {
      setSaving(false);
    }
  };

  const updateLayout = (patch: Partial<DocumentLayout>) => setLayout((l) => ({ ...l, ...patch }));
  const updateMargins = (patch: Partial<NonNullable<DocumentLayout["margins"]>>) =>
    setLayout((l) => ({ ...l, margins: { ...defaultLayout().margins!, ...l.margins, ...patch } }));
  const updateFont = (patch: Partial<NonNullable<DocumentLayout["body_font"]>>) =>
    setLayout((l) => ({
      ...l,
      body_font: { ...defaultLayout().body_font!, ...l.body_font, ...patch },
    }));
  const updateHeader = (patch: Partial<NonNullable<DocumentLayout["header"]>>) =>
    setLayout((l) => ({ ...l, header: { ...l.header, ...patch } }));
  const updateFooter = (patch: Partial<NonNullable<DocumentLayout["footer"]>>) =>
    setLayout((l) => ({ ...l, footer: { ...l.footer, ...patch } }));

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-gutter py-8">
        <p className="py-10 text-center text-body-sm text-on-surface-variant">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-gutter py-8 animate-fade-up">
      <PageHeader
        eyebrow="Configurações"
        title="Identidade institucional"
        description="Dados do órgão usados no cabeçalho e rodapé de todos os documentos oficiais (modelos e PDF)."
        actions={
          <button type="button" onClick={save} disabled={saving} className="btn-primary">
            <span className="material-symbols-outlined text-base" aria-hidden="true">save</span>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        }
      />

      <div className="space-y-6">
        {/* Identificação */}
        <section className="card p-6">
          <div className="border-b border-outline-variant pb-3">
            <p className="eyebrow">Dados do órgão</p>
            <h2 className="mt-1 text-headline-sm text-on-surface">Identificação</h2>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Nome da instituição" required>
              <input value={form.name} onChange={set("name")} className="input" />
            </Field>
            <Field label="CNPJ">
              <input
                value={form.cnpj}
                onChange={set("cnpj")}
                placeholder="00.000.000/0000-00"
                className="input"
              />
            </Field>
            <Field label="UF">
              <select value={form.state} onChange={set("state")} className="input">
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Brasão / logotipo (URL)">
              <input
                value={form.logo_url}
                onChange={set("logo_url")}
                placeholder="https://…/brasao.png"
                className="input"
              />
            </Field>
          </div>
          {form.logo_url && (
            <div className="mt-4 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.logo_url}
                alt="Pré-visualização do brasão"
                className="h-16 w-16 rounded-lg border border-outline-variant bg-surface-container-lowest object-contain p-1"
              />
              <span className="text-body-sm text-on-surface-variant">Pré-visualização do brasão</span>
            </div>
          )}
        </section>

        {/* Endereço e contato */}
        <section className="card p-6">
          <div className="border-b border-outline-variant pb-3">
            <p className="eyebrow">Localização</p>
            <h2 className="mt-1 text-headline-sm text-on-surface">Endereço e contato</h2>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Logradouro">
              <input value={form.address_street} onChange={set("address_street")} className="input" />
            </Field>
            <Field label="Número">
              <input value={form.address_number} onChange={set("address_number")} className="input" />
            </Field>
            <Field label="Complemento">
              <input value={form.address_complement} onChange={set("address_complement")} className="input" />
            </Field>
            <Field label="Bairro">
              <input value={form.address_district} onChange={set("address_district")} className="input" />
            </Field>
            <Field label="Cidade">
              <input value={form.address_city} onChange={set("address_city")} className="input" />
            </Field>
            <Field label="CEP">
              <input value={form.address_postal_code} onChange={set("address_postal_code")} placeholder="00000-000" className="input" />
            </Field>
            <Field label="Telefone">
              <input value={form.phone} onChange={set("phone")} className="input" />
            </Field>
            <Field label="E-mail">
              <input value={form.email} onChange={set("email")} type="email" className="input" />
            </Field>
            <Field label="Site">
              <input value={form.site} onChange={set("site")} placeholder="https://…" className="input" />
            </Field>
          </div>
        </section>

        {/* Padrão visual */}
        <section className="card p-6">
          <div className="border-b border-outline-variant pb-3">
            <p className="eyebrow">Documentos oficiais</p>
            <h2 className="mt-1 text-headline-sm text-on-surface">Padrão visual dos documentos</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Aplicado como padrão quando o modelo documental não define o próprio layout.
            </p>
          </div>

          <div className="mt-5">
            <h3 className="text-body-sm font-semibold text-on-surface">Margens (mm)</h3>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <NumberField label="Topo" value={layout.margins?.top ?? 20} onChange={(v) => updateMargins({ top: v })} />
              <NumberField label="Direita" value={layout.margins?.right ?? 18} onChange={(v) => updateMargins({ right: v })} />
              <NumberField label="Inferior" value={layout.margins?.bottom ?? 20} onChange={(v) => updateMargins({ bottom: v })} />
              <NumberField label="Esquerda" value={layout.margins?.left ?? 18} onChange={(v) => updateMargins({ left: v })} />
            </div>
          </div>

          <hr className="rule my-5" />

          <div>
            <h3 className="text-body-sm font-semibold text-on-surface">Fonte do corpo</h3>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <Field label="Família">
                <input
                  value={layout.body_font?.family ?? "Times New Roman"}
                  onChange={(e) => updateFont({ family: e.target.value })}
                  className="input"
                />
              </Field>
              <NumberField
                label="Tamanho (pt)"
                value={layout.body_font?.size ?? 12}
                onChange={(v) => updateFont({ size: v })}
              />
              <NumberField
                label="Entrelinha"
                step={0.1}
                value={layout.body_font?.line_height ?? 1.5}
                onChange={(v) => updateFont({ line_height: v })}
              />
            </div>
          </div>

          <hr className="rule my-5" />

          <div>
            <h3 className="text-body-sm font-semibold text-on-surface">Cabeçalho</h3>
            <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Check label="Habilitado" checked={layout.header?.enabled ?? true} onChange={(v) => updateHeader({ enabled: v })} />
              <Check label="Brasão" checked={layout.header?.show_coat_of_arms ?? true} onChange={(v) => updateHeader({ show_coat_of_arms: v })} />
              <Check label="Nome do órgão" checked={layout.header?.show_institution_name ?? true} onChange={(v) => updateHeader({ show_institution_name: v })} />
              <Check label="Endereço" checked={layout.header?.show_address ?? true} onChange={(v) => updateHeader({ show_address: v })} />
              <Check label="CNPJ" checked={layout.header?.show_cnpj ?? true} onChange={(v) => updateHeader({ show_cnpj: v })} />
              <Check label="Telefone" checked={layout.header?.show_phone ?? true} onChange={(v) => updateHeader({ show_phone: v })} />
              <Check label="Site" checked={layout.header?.show_site ?? true} onChange={(v) => updateHeader({ show_site: v })} />
            </div>
          </div>

          <hr className="rule my-5" />

          <div>
            <h3 className="text-body-sm font-semibold text-on-surface">Rodapé</h3>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <Check label="Habilitado" checked={layout.footer?.enabled ?? true} onChange={(v) => updateFooter({ enabled: v })} />
              <Check label="Número de páginas" checked={layout.footer?.show_page_numbers ?? true} onChange={(v) => updateFooter({ show_page_numbers: v })} />
              <Field label="Formato da numeração" className="w-full sm:w-auto sm:min-w-[260px]">
                <input
                  value={layout.footer?.page_number_format ?? "Página {page} de {total}"}
                  onChange={(e) => updateFooter({ page_number_format: e.target.value })}
                  className="input"
                />
              </Field>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          <span className="material-symbols-outlined text-base" aria-hidden="true">save</span>
          {saving ? "Salvando…" : "Salvar identidade"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="field-label">
        {label}
        {required && <span className="text-error"> *</span>}
      </span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="input"
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2.5 text-body-sm text-on-surface">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30"
      />
      {label}
    </label>
  );
}

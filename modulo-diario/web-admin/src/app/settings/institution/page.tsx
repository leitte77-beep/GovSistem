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
    return <p className="p-gutter text-center text-sm text-gray-500">Carregando…</p>;
  }

  return (
    <div className="p-gutter max-w-4xl">
      <PageHeader
        title="Identidade institucional"
        description="Dados do órgão usados no cabeçalho e rodapé de todos os documentos oficiais (modelos e PDF)."
        actions={
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">save</span>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        }
      />

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Identificação</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Nome da instituição" required>
            <input value={form.name} onChange={set("name")} className={inputCls} />
          </Field>
          <Field label="CNPJ">
            <input
              value={form.cnpj}
              onChange={set("cnpj")}
              placeholder="00.000.000/0000-00"
              className={inputCls}
            />
          </Field>
          <Field label="UF">
            <select value={form.state} onChange={set("state")} className={inputCls}>
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
              className={inputCls}
            />
          </Field>
        </div>
        {form.logo_url && (
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.logo_url}
              alt="Pré-visualização do brasão"
              className="h-16 w-16 rounded border border-gray-200 object-contain"
            />
            <span className="text-xs text-gray-500">Pré-visualização do brasão</span>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Endereço e contato</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Logradouro">
            <input value={form.address_street} onChange={set("address_street")} className={inputCls} />
          </Field>
          <Field label="Número">
            <input value={form.address_number} onChange={set("address_number")} className={inputCls} />
          </Field>
          <Field label="Complemento">
            <input value={form.address_complement} onChange={set("address_complement")} className={inputCls} />
          </Field>
          <Field label="Bairro">
            <input value={form.address_district} onChange={set("address_district")} className={inputCls} />
          </Field>
          <Field label="Cidade">
            <input value={form.address_city} onChange={set("address_city")} className={inputCls} />
          </Field>
          <Field label="CEP">
            <input value={form.address_postal_code} onChange={set("address_postal_code")} placeholder="00000-000" className={inputCls} />
          </Field>
          <Field label="Telefone">
            <input value={form.phone} onChange={set("phone")} className={inputCls} />
          </Field>
          <Field label="E-mail">
            <input value={form.email} onChange={set("email")} type="email" className={inputCls} />
          </Field>
          <Field label="Site">
            <input value={form.site} onChange={set("site")} placeholder="https://…" className={inputCls} />
          </Field>
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Padrão visual dos documentos</h2>
        <p className="mt-1 text-sm text-gray-500">
          Aplicado como padrão quando o modelo documental não define o próprio layout.
        </p>

        <h3 className="mt-4 text-sm font-semibold text-gray-800">Margens (mm)</h3>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField label="Topo" value={layout.margins?.top ?? 20} onChange={(v) => updateMargins({ top: v })} />
          <NumberField label="Direita" value={layout.margins?.right ?? 18} onChange={(v) => updateMargins({ right: v })} />
          <NumberField label="Inferior" value={layout.margins?.bottom ?? 20} onChange={(v) => updateMargins({ bottom: v })} />
          <NumberField label="Esquerda" value={layout.margins?.left ?? 18} onChange={(v) => updateMargins({ left: v })} />
        </div>

        <h3 className="mt-5 text-sm font-semibold text-gray-800">Fonte do corpo</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Field label="Família">
            <input
              value={layout.body_font?.family ?? "Times New Roman"}
              onChange={(e) => updateFont({ family: e.target.value })}
              className={inputCls}
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

        <h3 className="mt-5 text-sm font-semibold text-gray-800">Cabeçalho</h3>
        <div className="mt-2 flex flex-wrap gap-4">
          <Check label="Habilitado" checked={layout.header?.enabled ?? true} onChange={(v) => updateHeader({ enabled: v })} />
          <Check label="Brasão" checked={layout.header?.show_coat_of_arms ?? true} onChange={(v) => updateHeader({ show_coat_of_arms: v })} />
          <Check label="Nome do órgão" checked={layout.header?.show_institution_name ?? true} onChange={(v) => updateHeader({ show_institution_name: v })} />
          <Check label="Endereço" checked={layout.header?.show_address ?? true} onChange={(v) => updateHeader({ show_address: v })} />
          <Check label="CNPJ" checked={layout.header?.show_cnpj ?? true} onChange={(v) => updateHeader({ show_cnpj: v })} />
          <Check label="Telefone" checked={layout.header?.show_phone ?? true} onChange={(v) => updateHeader({ show_phone: v })} />
          <Check label="Site" checked={layout.header?.show_site ?? true} onChange={(v) => updateHeader({ show_site: v })} />
        </div>

        <h3 className="mt-5 text-sm font-semibold text-gray-800">Rodapé</h3>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Check label="Habilitado" checked={layout.footer?.enabled ?? true} onChange={(v) => updateFooter({ enabled: v })} />
          <Check label="Número de páginas" checked={layout.footer?.show_page_numbers ?? true} onChange={(v) => updateFooter({ show_page_numbers: v })} />
          <Field label="Formato da numeração" className="min-w-[240px]">
            <input
              value={layout.footer?.page_number_format ?? "Página {page} de {total}"}
              onChange={(e) => updateFooter({ page_number_format: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-base">save</span>
          {saving ? "Salvando…" : "Salvar identidade"}
        </button>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";

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
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="mb-1 block font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
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
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className={inputCls}
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
    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      {label}
    </label>
  );
}

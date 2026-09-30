"use client";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Blocks,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Info,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/toast";
import { formatDate, formatPhone, initials, onlyDigits } from "@/lib/format";

interface Manager {
  user_id: string;
  name: string;
  email: string;
  phone?: string | null;
}

interface OrgInfo {
  organization_id: string;
  slug: string;
  name: string;
  cnpj?: string | null;
  logo_url?: string | null;
  is_active: boolean;
  created_at?: string | null;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  public_url?: string | null;
  address_zip?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  stats?: { members_active: number; members_total: number; modules_contracted: number };
  managers?: Manager[];
}

const FIELDS = [
  "description",
  "email",
  "phone",
  "public_url",
  "address_zip",
  "address_street",
  "address_number",
  "address_complement",
  "address_neighborhood",
  "address_city",
  "address_state",
] as const;
type Field = (typeof FIELDS)[number];
type Form = Record<Field, string>;

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

function formatCnpj(v?: string | null) {
  const d = onlyDigits(v);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : v || "";
}
function formatZip(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
function toForm(o: OrgInfo): Form {
  const f = Object.fromEntries(FIELDS.map((k) => [k, (o[k] as string | null | undefined) ?? ""])) as Form;
  f.phone = formatPhone(f.phone);
  return f;
}

export default function OrgInfoPage() {
  const { toast } = useToast();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api<OrgInfo>("/tenant/org")
      .then((o) => {
        setOrg(o);
        setForm(toForm(o));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar dados do órgão"))
      .finally(() => setLoading(false));
  }, []);

  const original = useMemo(() => (org ? toForm(org) : null), [org]);
  const changed = useMemo(
    () => (form && original ? FIELDS.filter((k) => form[k].trim() !== original[k].trim()) : []),
    [form, original],
  );

  const errors = useMemo(() => {
    const e: Partial<Record<Field, string>> = {};
    if (!form) return e;
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "E-mail inválido.";
    const tel = onlyDigits(form.phone);
    if (tel && tel.length !== 10 && tel.length !== 11) e.phone = "Informe DDD e número.";
    const cep = onlyDigits(form.address_zip);
    if (cep && cep.length !== 8) e.address_zip = "CEP tem 8 dígitos.";
    return e;
  }, [form]);

  useEffect(() => {
    if (!editing || changed.length === 0) return;
    const warn = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing, changed.length]);

  const set = (k: Field, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  // Preenche o endereço a partir do CEP (ViaCEP), sem sobrescrever o que já foi digitado.
  const lookupCep = async () => {
    const cep = onlyDigits(form?.address_zip);
    if (cep.length !== 8) return;
    setCepBusy(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) {
        toast("info", "CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }
      setForm((f) =>
        f
          ? {
              ...f,
              address_street: f.address_street || d.logradouro || "",
              address_neighborhood: f.address_neighborhood || d.bairro || "",
              address_city: d.localidade || f.address_city,
              address_state: d.uf || f.address_state,
            }
          : f,
      );
    } catch {
      /* sem internet ou ViaCEP fora do ar: segue manual */
    } finally {
      setCepBusy(false);
    }
  };

  const save = async () => {
    if (!form || Object.keys(errors).length) return;
    setBusy(true);
    try {
      const body = Object.fromEntries(
        changed.map((k) => [k, k === "phone" || k === "address_zip" ? onlyDigits(form[k]) : form[k].trim()]),
      );
      const updated = await api<OrgInfo>("/tenant/org", { method: "PATCH", body });
      const merged = { ...org!, ...updated };
      setOrg(merged);
      setForm(toForm(merged));
      setEditing(false);
      toast("success", "Dados do órgão atualizados.");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignora */
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-44 animate-pulse rounded-2xl bg-white shadow-card" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-80 animate-pulse rounded-2xl bg-white shadow-card lg:col-span-2" />
          <div className="h-80 animate-pulse rounded-2xl bg-white shadow-card" />
        </div>
      </div>
    );
  }

  if (error || !org || !form) {
    return <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error || "Órgão não encontrado"}</p>;
  }

  const addressLine1 = [org.address_street, org.address_number].filter(Boolean).join(", ");
  const addressLine2 = [org.address_complement, org.address_neighborhood].filter(Boolean).join(" · ");
  const addressLine3 = [
    [org.address_city, org.address_state].filter(Boolean).join(" – "),
    org.address_zip ? `CEP ${org.address_zip}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const hasAddress = !!(addressLine1 || addressLine3);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [addressLine1, org.address_neighborhood, org.address_city, org.address_state].filter(Boolean).join(", "),
  )}`;
  const missing = [
    !org.email && "e-mail",
    !org.phone && "telefone",
    !hasAddress && "endereço",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6 pb-24">
      {/* Identidade */}
      <section className="relative overflow-hidden rounded-2xl bg-ink px-6 py-7 text-white shadow-pop sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }}
        />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#5392ef] opacity-25 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          {org.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo_url} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-white object-contain p-2" />
          ) : (
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold ring-1 ring-white/20">
              {initials(org.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/70">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold ring-1 ${
                  org.is_active ? "bg-accent/20 text-accent-soft ring-accent-soft/30" : "bg-warning/20 text-warning-soft ring-warning-soft/30"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${org.is_active ? "bg-[#73db9a]" : "bg-[#fbbf24]"}`} />
                {org.is_active ? "Ativo" : "Inativo"}
              </span>
              {org.created_at && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays size={12} aria-hidden="true" /> Na plataforma desde {formatDate(org.created_at)}
                </span>
              )}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{org.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/75">
              {org.cnpj ? (
                <button onClick={() => copy(onlyDigits(org.cnpj), "cnpj")} className="inline-flex items-center gap-1.5 hover:text-white" title="Copiar CNPJ (só números)">
                  <FileText size={14} aria-hidden="true" /> CNPJ {formatCnpj(org.cnpj)}
                  {copied === "cnpj" ? <Check size={13} /> : <Copy size={12} className="opacity-60" />}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <FileText size={14} aria-hidden="true" /> CNPJ não informado
                </span>
              )}
              <span className="font-mono text-xs text-white/60">@{org.slug}</span>
            </p>
          </div>
        </div>

        {org.stats && (
          <dl className="relative mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
            <HeroStat icon={Users} label="Pessoas ativas" value={org.stats.members_active} href="/usuarios" />
            <HeroStat icon={ShieldCheck} label="Gestores" value={org.managers?.length ?? 0} href="/usuarios" />
            <HeroStat icon={Blocks} label="Módulos contratados" value={org.stats.modules_contracted} href="/modulos-contratados" />
          </dl>
        )}
      </section>

      {missing.length > 0 && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-soft bg-warning-soft/60 px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-warning-ink">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Falta cadastrar {missing.join(", ").replace(/, ([^,]*)$/, " e $1")} do órgão. Esses dados aparecem para a equipe e nos módulos.
          </p>
          <button onClick={() => setEditing(true)} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink shadow-card hover:bg-paper">
            Completar agora
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* Contato e endereço */}
        <section className="rounded-2xl border border-line bg-white shadow-card lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-semibold text-ink">Contato e endereço</h2>
              <p className="text-xs text-muted">Como falar com o órgão e onde ele fica</p>
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-semibold text-ink transition hover:border-ink/30 hover:shadow-card"
              >
                <Pencil size={14} aria-hidden="true" /> Editar
              </button>
            )}
          </div>

          {!editing ? (
            <div className="divide-y divide-line">
              {org.description && <p className="px-5 py-4 text-sm leading-relaxed text-ink">{org.description}</p>}
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
                <Info2 icon={Mail} label="E-mail">
                  {org.email && (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <a href={`mailto:${org.email}`} className="truncate hover:underline">{org.email}</a>
                      <button onClick={() => copy(org.email!, "email")} aria-label="Copiar e-mail" className="shrink-0 rounded p-0.5 text-muted hover:text-ink">
                        {copied === "email" ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
                      </button>
                    </span>
                  )}
                </Info2>
                <Info2 icon={Phone} label="Telefone">
                  {org.phone && <a href={`tel:${onlyDigits(org.phone)}`} className="hover:underline">{formatPhone(org.phone)}</a>}
                </Info2>
                <Info2 icon={Globe} label="Site">
                  {org.public_url && (
                    <a href={org.public_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 hover:underline">
                      <span className="truncate">{org.public_url.replace(/^https?:\/\//, "")}</span>
                      <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
                    </a>
                  )}
                </Info2>
                <Info2 icon={MapPin} label="Endereço">
                  {hasAddress && (
                    <span className="block">
                      {addressLine1 && <span className="block">{addressLine1}</span>}
                      {addressLine2 && <span className="block text-muted">{addressLine2}</span>}
                      {addressLine3 && <span className="block text-muted">{addressLine3}</span>}
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline">
                        Ver no mapa <ExternalLink size={11} aria-hidden="true" />
                      </a>
                    </span>
                  )}
                </Info2>
              </dl>
            </div>
          ) : (
            <form
              id="org-form"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              className="space-y-5 px-5 py-5"
              noValidate
            >
              <FormField id="o-desc" label="Descrição" help="Uma frase sobre o órgão, mostrada para a equipe.">
                <textarea
                  id="o-desc"
                  rows={2}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className={inputCls(false)}
                  placeholder="Ex.: Prefeitura Municipal de Farol – Paraná"
                />
              </FormField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField id="o-email" label="E-mail de contato" error={errors.email}>
                  <input id="o-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls(!!errors.email)} placeholder="contato@orgao.gov.br" />
                </FormField>
                <FormField id="o-phone" label="Telefone" error={errors.phone}>
                  <input id="o-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} className={inputCls(!!errors.phone)} placeholder="(00) 0000-0000" />
                </FormField>
                <FormField id="o-site" label="Site" className="sm:col-span-2">
                  <input id="o-site" value={form.public_url} onChange={(e) => set("public_url", e.target.value)} className={inputCls(false)} placeholder="www.orgao.gov.br" />
                </FormField>
              </div>

              <fieldset className="space-y-4 border-t border-line pt-5">
                <legend className="sr-only">Endereço</legend>
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <MapPin size={15} aria-hidden="true" /> Endereço
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                  <FormField id="o-cep" label="CEP" error={errors.address_zip} help={cepBusy ? "Buscando endereço…" : "Preenche rua, bairro e cidade"} className="sm:col-span-2">
                    <div className="relative">
                      <input
                        id="o-cep"
                        inputMode="numeric"
                        value={form.address_zip}
                        onChange={(e) => {
                          const v = formatZip(e.target.value);
                          set("address_zip", v);
                        }}
                        onBlur={lookupCep}
                        className={inputCls(!!errors.address_zip)}
                        placeholder="00000-000"
                      />
                      {cepBusy && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" />}
                    </div>
                  </FormField>
                  <FormField id="o-street" label="Rua" className="sm:col-span-4">
                    <input id="o-street" value={form.address_street} onChange={(e) => set("address_street", e.target.value)} className={inputCls(false)} />
                  </FormField>
                  <FormField id="o-num" label="Número" className="sm:col-span-2">
                    <input id="o-num" value={form.address_number} onChange={(e) => set("address_number", e.target.value)} className={inputCls(false)} />
                  </FormField>
                  <FormField id="o-comp" label="Complemento" className="sm:col-span-4">
                    <input id="o-comp" value={form.address_complement} onChange={(e) => set("address_complement", e.target.value)} className={inputCls(false)} placeholder="Ex.: Paço Municipal, 2º andar" />
                  </FormField>
                  <FormField id="o-bairro" label="Bairro" className="sm:col-span-2">
                    <input id="o-bairro" value={form.address_neighborhood} onChange={(e) => set("address_neighborhood", e.target.value)} className={inputCls(false)} />
                  </FormField>
                  <FormField id="o-city" label="Cidade" className="sm:col-span-3">
                    <input id="o-city" value={form.address_city} onChange={(e) => set("address_city", e.target.value)} className={inputCls(false)} />
                  </FormField>
                  <FormField id="o-uf" label="UF" className="sm:col-span-1">
                    <select id="o-uf" value={form.address_state} onChange={(e) => set("address_state", e.target.value)} className={inputCls(false)}>
                      <option value="">—</option>
                      {UFS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
              </fieldset>
            </form>
          )}
        </section>

        {/* Lateral */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShieldCheck size={15} aria-hidden="true" /> Gestores
              </h2>
              <Link href="/usuarios" className="text-xs font-semibold text-ink hover:underline">
                Ver todos
              </Link>
            </div>
            {(org.managers ?? []).length === 0 ? (
              <p className="text-sm text-warning-ink">Nenhum gestor ativo.</p>
            ) : (
              <ul className="space-y-3">
                {org.managers!.map((m) => (
                  <li key={m.user_id}>
                    <Link href={`/usuarios/${m.user_id}`} className="group flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E0EAFF] text-xs font-bold text-[#1D3A8A]">{initials(m.name)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink group-hover:underline">{m.name}</span>
                        <span className="block truncate text-xs text-muted">{m.email}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <Lock size={15} aria-hidden="true" /> Dados do contrato
            </h2>
            <dl className="space-y-2.5 text-sm">
              <Row label="Nome oficial">{org.name}</Row>
              <Row label="CNPJ">{org.cnpj ? formatCnpj(org.cnpj) : "Não informado"}</Row>
              <Row label="Identificador">
                <span className="font-mono text-xs">{org.slug}</span>
              </Row>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Estes dados estão no contrato com a GovSistem. Para corrigir, fale com a equipe de suporte.
            </p>
          </section>
        </aside>
      </div>

      {/* Barra de salvar */}
      {editing && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-gutter">
            <p className="min-w-0 text-sm">
              {changed.length ? (
                <>
                  <span className="font-semibold text-ink">Alterações não salvas</span>
                  <span className="block truncate text-xs text-muted">{changed.length === 1 ? "1 campo alterado" : `${changed.length} campos alterados`}</span>
                </>
              ) : (
                <span className="text-muted">Editando contato e endereço</span>
              )}
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  setForm(toForm(org));
                  setEditing(false);
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-60"
              >
                <X size={14} aria-hidden="true" /> Cancelar
              </button>
              <button
                type="submit"
                form="org-form"
                disabled={busy || changed.length === 0 || Object.keys(errors).length > 0}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
                {busy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function inputCls(invalid: boolean) {
  return `w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 transition focus:outline-none focus:ring-2 ${
    invalid ? "border-danger focus:ring-danger/15" : "border-line focus:border-ink/40 focus:ring-ink/10"
  }`;
}

function HeroStat({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="group rounded-xl px-2 py-1 transition hover:bg-white/5">
      <dt className="flex items-center gap-1.5 text-xs text-white/65">
        <Icon size={13} aria-hidden="true" /> {label}
      </dt>
      <dd className="mt-0.5 text-2xl font-bold tabular-nums">{value}</dd>
    </Link>
  );
}

function Info2({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper text-ink">
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="min-w-0 text-sm text-ink">{children || <span className="text-muted">Não informado</span>}</dd>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

function FormField({
  id,
  label,
  error,
  help,
  className = "",
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger-ink" role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="mt-1.5 text-xs text-muted">{help}</p>
      ) : null}
    </div>
  );
}


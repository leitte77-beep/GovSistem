"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  Globe,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  User,
} from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/toast";
import { formatCpf, formatPhone, initials, isValidCpf, onlyDigits } from "@/lib/format";

interface UserDetail {
  user_id: string;
  name: string;
  email: string;
  phone?: string | null;
  cpf?: string | null;
  position?: string | null;
  department?: string | null;
  membership_role: string;
  membership_active: boolean;
}

interface Form {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  position: string;
  department: string;
  role: string;
  active: boolean;
}

const LABELS: Record<keyof Form, string> = {
  name: "nome",
  email: "e-mail",
  phone: "telefone",
  cpf: "CPF",
  position: "cargo",
  department: "setor",
  role: "perfil",
  active: "situação",
};

function toForm(u: UserDetail): Form {
  return {
    name: u.name,
    email: u.email,
    phone: formatPhone(u.phone),
    cpf: formatCpf(u.cpf),
    position: u.position ?? "",
    department: u.department ?? "",
    role: u.membership_role ?? "ORG_MEMBER",
    active: u.membership_active ?? true,
  };
}

export default function EditarUsuarioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [serverField, setServerField] = useState<{ field: keyof Form; msg: string } | null>(null);
  const [original, setOriginal] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [suggestions, setSuggestions] = useState<{ positions: string[]; departments: string[] }>({
    positions: [],
    departments: [],
  });

  useEffect(() => {
    api<UserDetail>(`/tenant/users/${id}`)
      .then((u) => {
        setOriginal(toForm(u));
        setForm(toForm(u));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar usuário"))
      .finally(() => setLoading(false));
    // Cargos e setores já usados no órgão viram sugestões, para evitar grafias diferentes.
    api<{ data: { position?: string | null; department?: string | null }[] }>(`/tenant/users?per_page=200`)
      .then((r) => {
        const uniq = (xs: (string | null | undefined)[]) =>
          Array.from(new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x))).sort((a, b) =>
            a.localeCompare(b, "pt-BR"),
          );
        setSuggestions({ positions: uniq(r.data.map((u) => u.position)), departments: uniq(r.data.map((u) => u.department)) });
      })
      .catch(() => {});
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    if (serverField?.field === k) setServerField(null);
  };

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form) return e;
    if (!form.name.trim()) e.name = "Informe o nome.";
    if (!form.email.trim()) e.email = "Informe o e-mail.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "E-mail inválido.";
    // CPF e telefone só são validados quando mudam: um dado antigo fora do padrão
    // não pode travar a edição dos outros campos.
    if (form.cpf !== original?.cpf && form.cpf && !isValidCpf(form.cpf)) e.cpf = "CPF inválido. Confira os números.";
    const tel = onlyDigits(form.phone);
    if (form.phone !== original?.phone && tel && tel.length < 10) e.phone = "Telefone incompleto: informe DDD e número.";
    if (serverField) e[serverField.field] = serverField.msg;
    return e;
  }, [form, original, serverField]);

  const changed = useMemo(() => {
    if (!form || !original) return [] as (keyof Form)[];
    return (Object.keys(form) as (keyof Form)[]).filter((k) => {
      const a = form[k];
      const b = original[k];
      return typeof a === "string" ? a.trim() !== String(b).trim() : a !== b;
    });
  }, [form, original]);
  const dirty = changed.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setTouched({ name: true, email: true, cpf: true, phone: true });
    if (Object.keys(errors).length) return;
    setBusy(true);
    setError("");
    try {
      // Só vai o que mudou: a API trata campo ausente como "não mexer" e texto
      // vazio como "apagar". Assim um dado gravado em outro formato (ex.: telefone
      // com +55) não é reescrito quando a pessoa edita outro campo.
      const all = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: onlyDigits(form.phone),
        cpf: onlyDigits(form.cpf),
        position: form.position.trim(),
        department: form.department.trim(),
        membership_role: form.role,
        is_active: form.active,
      };
      const key: Record<keyof Form, keyof typeof all> = {
        name: "name",
        email: "email",
        phone: "phone",
        cpf: "cpf",
        position: "position",
        department: "department",
        role: "membership_role",
        active: "is_active",
      };
      const body = Object.fromEntries(changed.map((k) => [key[k], all[key[k]]]));
      await api(`/tenant/users/${id}/profile`, { method: "PATCH", body });
      toast("success", "Cadastro atualizado.");
      setOriginal(form);
      router.push(`/usuarios/${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao atualizar";
      // Erros de duplicidade apontam para o campo certo.
      if (/e-?mail/i.test(msg)) setServerField({ field: "email", msg });
      else if (/cpf/i.test(msg)) setServerField({ field: "cpf", msg });
      else setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4" aria-busy="true">
        <div className="h-4 w-56 animate-pulse rounded bg-paper" />
        <div className="h-64 animate-pulse rounded-2xl bg-white shadow-card" />
        <div className="h-48 animate-pulse rounded-2xl bg-white shadow-card" />
      </div>
    );
  }

  if (!form || !original) {
    return (
      <p className="mx-auto max-w-md rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">
        {error || "Usuário não encontrado"}
      </p>
    );
  }

  const show = (k: keyof Form) => (touched[k] || serverField?.field === k ? errors[k] : undefined);
  const emailChanged = form.email.trim().toLowerCase() !== original.email.trim().toLowerCase();
  const becomingManager = form.role === "ORG_ADMIN" && original.role !== "ORG_ADMIN";
  const losingManager = form.role !== "ORG_ADMIN" && original.role === "ORG_ADMIN";

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-28">
      <nav aria-label="Trilha" className="flex min-w-0 items-center gap-1 text-sm text-muted">
        <Link href="/usuarios" className="shrink-0 hover:text-ink hover:underline">
          Usuários
        </Link>
        <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        <Link href={`/usuarios/${id}`} className="truncate hover:text-ink hover:underline">
          {original.name}
        </Link>
        <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        <span className="shrink-0 font-medium text-ink" aria-current="page">
          Editar
        </span>
      </nav>

      <header className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#E0EAFF] text-lg font-bold text-[#1D3A8A]">
          {initials(form.name || original.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-ink">Editar cadastro</h1>
          <p className="truncate text-sm text-muted">{original.name}</p>
        </div>
      </header>

      <form id="editar-usuario" onSubmit={submit} noValidate className="space-y-4">
        {/* Identificação */}
        <Section
          icon={User}
          title="Identificação"
          hint={
            <span className="inline-flex items-center gap-1">
              <Globe size={12} aria-hidden="true" /> Vale em todos os órgãos em que a pessoa atua
            </span>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="f-name" label="Nome completo" required error={show("name")} className="sm:col-span-2">
              <input
                id="f-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                autoComplete="name"
                className={input(!!show("name"))}
              />
            </Field>
            <Field
              id="f-email"
              label="E-mail"
              required
              error={show("email")}
              help={emailChanged ? undefined : "É com ele que a pessoa entra no sistema."}
              className="sm:col-span-2"
            >
              <input
                id="f-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                autoComplete="email"
                className={input(!!show("email"))}
              />
              {emailChanged && !show("email") && (
                <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-warning-soft/70 px-2.5 py-1.5 text-xs text-warning-ink">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  O login muda para <strong className="font-semibold">{form.email.trim()}</strong>. Avise a pessoa antes de salvar.
                </p>
              )}
            </Field>
            <Field id="f-cpf" label="CPF" error={show("cpf")}>
              <input
                id="f-cpf"
                inputMode="numeric"
                value={form.cpf}
                onChange={(e) => set("cpf", formatCpf(e.target.value))}
                onBlur={() => setTouched((t) => ({ ...t, cpf: true }))}
                placeholder="000.000.000-00"
                className={input(!!show("cpf"))}
              />
            </Field>
            <Field id="f-phone" label="Telefone" error={show("phone")}>
              <input
                id="f-phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone", formatPhone(e.target.value))}
                onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                placeholder="(00) 00000-0000"
                autoComplete="tel"
                className={input(!!show("phone"))}
              />
            </Field>
          </div>
        </Section>

        {/* Neste órgão */}
        <Section
          icon={Building2}
          title="Neste órgão"
          hint="Não muda nada nos outros órgãos da pessoa"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="f-position" label="Cargo">
              <input
                id="f-position"
                list="sug-cargos"
                value={form.position}
                onChange={(e) => set("position", e.target.value)}
                placeholder="Ex.: Assessor de Gabinete"
                className={input(false)}
              />
              <datalist id="sug-cargos">
                {suggestions.positions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field id="f-department" label="Setor">
              <input
                id="f-department"
                list="sug-setores"
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
                placeholder="Ex.: Secretaria de Obras"
                className={input(false)}
              />
              <datalist id="sug-setores">
                {suggestions.departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Field>
          </div>

          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium text-ink">Perfil no órgão</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <RoleCard
                checked={form.role === "ORG_MEMBER"}
                onSelect={() => set("role", "ORG_MEMBER")}
                icon={User}
                title="Usuário"
                desc="Usa os módulos liberados para ele."
              />
              <RoleCard
                checked={form.role === "ORG_ADMIN"}
                onSelect={() => set("role", "ORG_ADMIN")}
                icon={ShieldCheck}
                title="Gestor"
                desc="Também cadastra pessoas e libera acessos no órgão."
              />
            </div>
            {(becomingManager || losingManager) && (
              <p className="mt-2 text-xs text-muted">
                {becomingManager
                  ? "Ao salvar, esta pessoa passa a administrar os usuários e acessos do órgão."
                  : "Ao salvar, esta pessoa deixa de administrar usuários e acessos. O órgão precisa ter pelo menos um gestor ativo."}
              </p>
            )}
          </fieldset>

          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-line bg-paper/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">Vínculo ativo</p>
              <p className="text-xs text-muted">
                {form.active
                  ? "A pessoa consegue entrar e abrir os módulos liberados."
                  : "Suspenso: o acesso fica bloqueado, mas nada é apagado."}
              </p>
            </div>
            <Switch checked={form.active} onChange={(v) => set("active", v)} label="Vínculo ativo" />
          </div>
        </Section>

        {error && (
          <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>
        )}
      </form>

      {/* Barra de salvar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-gutter">
          <p className="min-w-0 text-sm">
            {dirty ? (
              <>
                <span className="font-semibold text-ink">Alterações não salvas</span>
                <span className="block truncate text-xs text-muted">
                  {changed.map((k) => LABELS[k]).join(", ")}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Check size={14} aria-hidden="true" /> Nenhuma alteração
              </span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            {dirty ? (
              <button
                type="button"
                onClick={() => {
                  setForm(original);
                  setServerField(null);
                  setTouched({});
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper disabled:opacity-60"
              >
                <RotateCcw size={14} aria-hidden="true" /> Desfazer
              </button>
            ) : (
              <Link
                href={`/usuarios/${id}`}
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper"
              >
                Voltar
              </Link>
            )}
            <button
              type="submit"
              form="editar-usuario"
              disabled={busy || !dirty}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function input(invalid: boolean) {
  return `w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 transition focus:outline-none focus:ring-2 ${
    invalid ? "border-danger focus:border-danger focus:ring-danger/15" : "border-line focus:border-ink/40 focus:ring-ink/10"
  }`;
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof User;
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Icon size={17} aria-hidden="true" /> {title}
        </h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  required,
  error,
  help,
  className = "",
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  help?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
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

function RoleCard({
  checked,
  onSelect,
  icon: Icon,
  title,
  desc,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: typeof User;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition focus-within:ring-2 focus-within:ring-ink/30 ${
        checked ? "border-ink bg-white shadow-card" : "border-line bg-white hover:border-ink/30"
      }`}
    >
      <input type="radio" name="perfil" checked={checked} onChange={onSelect} className="sr-only" />
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
          checked ? "border-ink" : "border-line"
        }`}
        aria-hidden="true"
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Icon size={14} aria-hidden="true" /> {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{desc}</span>
      </span>
    </label>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ${
        checked ? "bg-accent" : "bg-line"
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

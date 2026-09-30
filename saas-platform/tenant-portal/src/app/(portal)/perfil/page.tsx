"use client";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Blocks,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock,
  ExternalLink,
  IdCard,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  MonitorSmartphone,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/components/toast";
import { moduleVisual } from "@/components/module-card";
import { openModuleInNewTab } from "@/lib/open-module";
import { formatCpf, formatDate, formatDateTime, formatPhone, formatRelative, initials, isValidCpf, onlyDigits } from "@/lib/format";

interface Me {
  id: string;
  name: string;
  email: string;
  cpf?: string | null;
  phone?: string | null;
}
interface Security {
  membership_role: string;
  position?: string | null;
  department?: string | null;
  member_since?: string | null;
  mfa_enabled: boolean;
  force_password_reset: boolean;
  password_changed_at?: string | null;
}
interface AccessEntry {
  action: string;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at?: string | null;
}

function agentLabel(ua?: string | null) {
  if (!ua) return null;
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  const o = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  return [b, o].filter(Boolean).join(" no ") || null;
}

export default function ProfilePage() {
  const { ctx, refresh } = useAuth();
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [sec, setSec] = useState<Security | null>(null);
  const [log, setLog] = useState<AccessEntry[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", cpf: "" });
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/auth/me")
      .then((u) => {
        setMe(u);
        setForm({ name: u.name, phone: formatPhone(u.phone), cpf: formatCpf(u.cpf) });
      })
      .catch(() => {});
    api<Security>("/tenant/security").then(setSec).catch(() => {});
    api<AccessEntry[]>("/auth/me/access-log").then(setLog).catch(() => {});
  }, []);

  const original = useMemo(
    () => (me ? { name: me.name, phone: formatPhone(me.phone), cpf: formatCpf(me.cpf) } : null),
    [me],
  );
  const changed = original
    ? (Object.keys(form) as (keyof typeof form)[]).filter((k) => form[k].trim() !== original[k].trim())
    : [];
  const errors = {
    name: form.name.trim().length < 3 ? "Informe o nome completo." : "",
    phone: (() => {
      const d = onlyDigits(form.phone);
      return form.phone !== original?.phone && d && d.length !== 10 && d.length !== 11 ? "Informe DDD e número." : "";
    })(),
    cpf: form.cpf !== original?.cpf && form.cpf && !isValidCpf(form.cpf) ? "CPF inválido. Confira os números." : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const save = async () => {
    if (hasErrors || changed.length === 0) return;
    setBusy(true);
    try {
      const body = Object.fromEntries(
        changed.map((k) => [k, k === "name" ? form.name.trim() : onlyDigits(form[k])]),
      );
      const u = await api<Me>("/auth/me", { method: "PUT", body });
      setMe(u);
      setForm({ name: u.name, phone: formatPhone(u.phone), cpf: formatCpf(u.cpf) });
      setEditing(false);
      toast("success", "Seus dados foram atualizados.");
      refresh().catch(() => {});
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  };

  const u = ctx?.user;
  const isManager = u?.profile === "ORG_ADMIN" || sec?.membership_role === "ORG_ADMIN";
  const myModules = (ctx?.modules ?? []).filter((m) => m.authorized);
  const name = me?.name ?? u?.name ?? "";
  const lastLogin = log.find((l) => l.action === "login")?.created_at;

  const open = async (slug: string, modName: string) => {
    setOpening(slug);
    try {
      await openModuleInNewTab(slug, modName);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Falha ao abrir o módulo");
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cartão da pessoa */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="h-20 bg-ink sm:h-24">
          <div
            aria-hidden="true"
            className="h-full w-full opacity-[0.08]"
            style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "18px 18px" }}
          />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-4">
            <span className="-mt-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[#E0EAFF] text-2xl font-bold text-[#1D3A8A] ring-4 ring-white">
              {initials(name)}
            </span>
            <div className="min-w-0 pt-3">
              <h1 className="truncate text-2xl font-bold tracking-tight text-ink">{name || "Meu perfil"}</h1>
              <p className="truncate text-sm text-muted">
                {[sec?.position, sec?.department].filter(Boolean).join(" · ") || me?.email || u?.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-3">
            <Link
              href="/trocar-senha"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30 hover:shadow-card"
            >
              <KeyRound size={15} aria-hidden="true" /> Trocar senha
            </Link>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                disabled={!me}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-ink-soft disabled:opacity-50"
              >
                <Pencil size={15} aria-hidden="true" /> Editar meus dados
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 sm:px-6">
          <Chip icon={Building2}>{ctx?.organization.name}</Chip>
          {isManager ? <Chip icon={ShieldCheck} strong>Gestor do órgão</Chip> : <Chip>Usuário</Chip>}
          {sec?.member_since && <Chip icon={CalendarDays}>No órgão desde {formatDate(sec.member_since)}</Chip>}
        </div>
      </section>

      {sec?.force_password_reset && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-soft bg-warning-soft/60 px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-warning-ink">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Sua senha atual é provisória. Crie uma senha sua para continuar usando o sistema com segurança.
          </p>
          <Link href="/trocar-senha" className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink shadow-card hover:bg-paper">
            Criar senha agora
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Meus dados */}
          <section className="rounded-2xl border border-line bg-white shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="font-semibold text-ink">Meus dados</h2>
                <p className="text-xs text-muted">Valem em todos os órgãos em que você atua</p>
              </div>
            </div>

            {!editing ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
                <Item icon={Mail} label="E-mail (usado para entrar)">{me?.email ?? u?.email}</Item>
                <Item icon={Phone} label="Telefone">{me?.phone ? formatPhone(me.phone) : null}</Item>
                <Item icon={IdCard} label="CPF">{me?.cpf ? formatCpf(me.cpf) : null}</Item>
                <Item icon={Briefcase} label="Cargo e setor">
                  {[sec?.position, sec?.department].filter(Boolean).join(" · ") || null}
                </Item>
              </dl>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
                noValidate
                className="space-y-4 px-5 py-5"
              >
                <Field id="p-name" label="Nome completo" error={errors.name}>
                  <input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" className={inputCls(!!errors.name)} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="p-phone" label="Telefone" error={errors.phone}>
                    <input id="p-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} placeholder="(00) 00000-0000" autoComplete="tel" className={inputCls(!!errors.phone)} />
                  </Field>
                  <Field id="p-cpf" label="CPF" error={errors.cpf}>
                    <input id="p-cpf" inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: formatCpf(e.target.value) })} placeholder="000.000.000-00" className={inputCls(!!errors.cpf)} />
                  </Field>
                </div>
                <p className="flex items-start gap-2 rounded-xl bg-paper px-3 py-2.5 text-xs text-muted">
                  <Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  E-mail, cargo e setor são definidos pelo gestor do órgão. Se algo estiver errado, peça a ele para corrigir.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (original) setForm(original);
                      setEditing(false);
                    }}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-60"
                  >
                    <X size={14} aria-hidden="true" /> Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={busy || hasErrors || changed.length === 0}
                    className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
                    {busy ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* Meus módulos */}
          <section className="rounded-2xl border border-line bg-white shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-ink">
                  <Blocks size={16} aria-hidden="true" /> Meus módulos
                </h2>
                <p className="text-xs text-muted">Sistemas que você pode abrir neste órgão</p>
              </div>
            </div>
            {myModules.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">
                Você ainda não tem acesso a nenhum módulo. Fale com o gestor do órgão para liberar.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
                {myModules.map((m) => {
                  const v = moduleVisual(m.slug);
                  const Icon = v.icon as LucideIcon;
                  return (
                    <li key={m.slug}>
                      <button
                        onClick={() => open(m.slug, m.name)}
                        disabled={!m.is_active || opening !== null}
                        className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-paper disabled:opacity-60"
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${v.gradient}`}>
                          <Icon size={18} className="text-white" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{m.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {m.requires_review ? "Acesso em revisão pelo gestor" : `Versão ${m.version}`}
                          </span>
                        </span>
                        {opening === m.slug ? (
                          <Loader2 size={15} className="shrink-0 animate-spin text-muted" aria-hidden="true" />
                        ) : (
                          <ExternalLink size={15} className="shrink-0 text-muted transition group-hover:text-ink" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Segurança */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <ShieldCheck size={15} aria-hidden="true" /> Segurança
            </h2>
            <dl className="space-y-3 text-sm">
              <Row icon={KeyRound} label="Senha">
                {sec?.force_password_reset ? (
                  <span className="font-semibold text-warning-ink">Provisória</span>
                ) : sec?.password_changed_at ? (
                  <span title={formatDateTime(sec.password_changed_at)}>Trocada {formatRelative(sec.password_changed_at).toLowerCase()}</span>
                ) : (
                  "—"
                )}
              </Row>
              <Row icon={Clock} label="Último login">
                {lastLogin ? <span title={formatDateTime(lastLogin)}>{formatRelative(lastLogin)}</span> : "—"}
              </Row>
            </dl>
            <div className="mt-4 space-y-1 border-t border-line pt-3">
              <NavLink href="/trocar-senha" icon={KeyRound}>Trocar minha senha</NavLink>
              <NavLink href="/seguranca" icon={MonitorSmartphone}>Sessões e dispositivos</NavLink>
            </div>
          </section>

          {log.length > 0 && (
            <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <h2 className="mb-1 text-sm font-semibold text-ink">Últimos acessos</h2>
              <p className="mb-3 text-xs text-muted">Se algum não foi você, troque a senha.</p>
              <ul className="space-y-2.5">
                {log.slice(0, 6).map((l, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper text-muted">
                      {l.action === "login" ? <LogIn size={12} aria-hidden="true" /> : <Blocks size={12} aria-hidden="true" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-ink">
                        {l.action === "login" ? "Entrou no portal" : "Abriu um módulo"}
                        <span className="text-muted"> · {formatRelative(l.created_at)}</span>
                      </span>
                      <span className="block truncate text-muted">
                        {[agentLabel(l.user_agent), l.ip_address && `IP ${l.ip_address}`].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function inputCls(invalid: boolean) {
  return `w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 transition focus:outline-none focus:ring-2 ${
    invalid ? "border-danger focus:ring-danger/15" : "border-line focus:border-ink/40 focus:ring-ink/10"
  }`;
}

function Chip({ icon: Icon, children, strong }: { icon?: LucideIcon; children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
        strong ? "bg-ink/5 text-ink ring-ink/10" : "bg-paper text-muted ring-line"
      }`}
    >
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

function Item({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper text-ink">
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="truncate text-sm text-ink">{children || <span className="text-muted">Não informado</span>}</dd>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="inline-flex items-center gap-2 text-muted">
        <Icon size={14} aria-hidden="true" /> {label}
      </dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

function NavLink({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-ink transition hover:bg-paper">
      <Icon size={15} className="text-muted" aria-hidden="true" />
      <span className="flex-1">{children}</span>
      <ChevronRight size={15} className="text-muted transition group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs font-medium text-danger-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

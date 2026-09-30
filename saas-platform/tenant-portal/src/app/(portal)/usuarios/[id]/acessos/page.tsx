"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/toast";
import EmptyState from "@/components/empty-state";
import { moduleVisual } from "@/components/module-card";
import { initials } from "@/lib/format";

interface RoleOption {
  name: string;
  label: string;
}
interface ContractedModule {
  slug: string;
  name: string;
  roles: RoleOption[];
}
interface UserInfo {
  name: string;
  email: string;
  membership_role: string;
  membership_active: boolean;
  position?: string | null;
  department?: string | null;
}
type Grants = Record<string, string[]>;

/** "Autor — cria e edita matérias" → { title: "Autor", desc: "cria e edita matérias" } */
function splitLabel(label: string) {
  const [title, ...rest] = label.split(/\s+[—–-]\s+/);
  const desc = rest.join(" — ");
  return { title, desc: desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : "" };
}

function isAdminRole(r: RoleOption) {
  return /admin/i.test(r.name) || /^administrador/i.test(r.label);
}

function clean(g: Grants): Grants {
  const out: Grants = {};
  for (const [k, v] of Object.entries(g)) if (v.length) out[k] = [...v].sort();
  return out;
}

export default function AcessosPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [modules, setModules] = useState<ContractedModule[]>([]);
  const [original, setOriginal] = useState<Grants>({});
  const [grants, setGrants] = useState<Grants>({});
  const [pending, setPending] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Módulos que acabaram de ser ligados e ainda esperam a escolha do perfil.
  const [enabling, setEnabling] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<ContractedModule[]>("/tenant/roles"),
      api<{ grants: Grants; pending_review?: string[] }>(`/tenant/users/${id}/grants`),
      api<UserInfo>(`/tenant/users/${id}`).catch(() => null),
    ])
      .then(([mods, current, u]) => {
        setModules(mods);
        setOriginal(clean(current.grants));
        setGrants(clean(current.grants));
        setPending(current.pending_review ?? []);
        setUser(u);
        // Abre de início os módulos que a pessoa já usa.
        setExpanded(Object.fromEntries(Object.keys(current.grants).map((s) => [s, true])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar acessos"))
      .finally(() => setLoading(false));
  }, [id]);

  // Diferença entre o que está salvo e o que está marcado na tela.
  const diff = useMemo(() => {
    const added: { slug: string; role: string }[] = [];
    const removed: { slug: string; role: string }[] = [];
    const slugs = new Set([...Object.keys(original), ...Object.keys(grants)]);
    slugs.forEach((slug) => {
      const before = new Set(original[slug] ?? []);
      const after = new Set(grants[slug] ?? []);
      after.forEach((r) => !before.has(r) && added.push({ slug, role: r }));
      before.forEach((r) => !after.has(r) && removed.push({ slug, role: r }));
    });
    return { added, removed, dirty: added.length + removed.length > 0 };
  }, [original, grants]);

  useEffect(() => {
    if (!diff.dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [diff.dirty]);

  const roleLabel = (slug: string, role: string) => {
    const r = modules.find((m) => m.slug === slug)?.roles.find((x) => x.name === role);
    return r ? splitLabel(r.label).title : role;
  };
  const moduleName = (slug: string) => modules.find((m) => m.slug === slug)?.name ?? slug;

  const toggleRole = (slug: string, role: string) =>
    setGrants((prev) => {
      const cur = prev[slug] ?? [];
      const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
      return clean({ ...prev, [slug]: next });
    });

  const setModuleOff = (slug: string) =>
    setGrants((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ sessions_revoked: number }>(`/tenant/users/${id}/grants`, {
        method: "PUT",
        body: { grants },
      });
      const fresh = await api<{ grants: Grants; pending_review?: string[] }>(`/tenant/users/${id}/grants`);
      setOriginal(clean(fresh.grants));
      setGrants(clean(fresh.grants));
      setPending(fresh.pending_review ?? []);
      setEnabling({});
      toast(
        "success",
        res.sessions_revoked > 0
          ? "Acessos salvos. A pessoa precisará entrar de novo nos módulos para a mudança valer."
          : "Acessos salvos.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar acessos";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  const enabledCount = modules.filter((m) => (grants[m.slug]?.length ?? 0) > 0).length;
  const q = query.trim().toLowerCase();
  const shown = q ? modules.filter((m) => m.name.toLowerCase().includes(q)) : modules;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-28">
      {/* Trilha */}
      <nav aria-label="Trilha" className="flex min-w-0 items-center gap-1 text-sm text-muted">
        <Link href="/usuarios" className="shrink-0 hover:text-ink hover:underline">
          Usuários
        </Link>
        <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        <Link href={`/usuarios/${id}`} className="truncate hover:text-ink hover:underline">
          {user?.name ?? "Usuário"}
        </Link>
        <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        <span className="shrink-0 font-medium text-ink" aria-current="page">
          Acessos
        </span>
      </nav>

      {/* Quem */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink text-base font-bold text-white">
            {initials(user?.name)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-ink">
              {user ? `Acessos de ${user.name.split(/\s+/)[0]}` : "Acessos e permissões"}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              {user && <span className="truncate">{user.email}</span>}
              {user?.membership_role === "ORG_ADMIN" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-ink/10">
                  <ShieldCheck size={11} aria-hidden="true" /> Gestor do órgão
                </span>
              )}
              {user && !user.membership_active && (
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-ink">
                  Suspenso
                </span>
              )}
            </p>
          </div>
        </div>
        {!loading && modules.length > 0 && (
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums leading-none text-ink">
              {enabledCount}
              <span className="text-base font-medium text-muted">/{modules.length}</span>
            </p>
            <p className="mt-1 text-xs text-muted">módulos liberados</p>
          </div>
        )}
      </header>

      <p className="flex items-start gap-2 text-sm text-muted">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Ligue os módulos que a pessoa pode usar e escolha o perfil dela em cada um. Ao salvar, as sessões abertas nos
        módulos são encerradas para a mudança valer na hora.
      </p>

      {user && !user.membership_active && (
        <p className="flex items-start gap-2 rounded-2xl border border-warning-soft bg-warning-soft/60 px-4 py-3 text-sm text-warning-ink">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          Esta pessoa está suspensa: os acessos ficam guardados, mas só valem depois que ela for reativada.
        </p>
      )}

      {modules.length > 6 && (
        <label className="relative block">
          <span className="sr-only">Buscar módulo</span>
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulo"
            className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-muted focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/10"
          />
        </label>
      )}

      {error && (
        <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4">
              <span className="h-11 w-11 animate-pulse rounded-xl bg-paper" />
              <span className="h-4 w-40 animate-pulse rounded bg-paper" />
            </div>
          ))}
        </div>
      ) : modules.length === 0 ? (
        <EmptyState
          title="Nenhum módulo com perfis configuráveis"
          description="O órgão ainda não contratou módulos que permitam escolher perfis de acesso."
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((mod) => (
            <ModuleAccess
              key={mod.slug}
              mod={mod}
              selected={grants[mod.slug] ?? []}
              original={original[mod.slug] ?? []}
              pending={pending.includes(mod.slug)}
              open={!!expanded[mod.slug]}
              enabling={!!enabling[mod.slug]}
              onToggleOpen={() => setExpanded((p) => ({ ...p, [mod.slug]: !p[mod.slug] }))}
              onSwitch={(on) => {
                setEnabling((p) => ({ ...p, [mod.slug]: on }));
                if (on) setExpanded((p) => ({ ...p, [mod.slug]: true }));
                else {
                  setModuleOff(mod.slug);
                  setExpanded((p) => ({ ...p, [mod.slug]: false }));
                }
              }}
              onToggleRole={(r) => toggleRole(mod.slug, r)}
            />
          ))}
          {shown.length === 0 && (
            <li>
              <EmptyState title="Nenhum módulo encontrado" description={`Nada corresponde a “${query}”.`} />
            </li>
          )}
        </ul>
      )}

      {/* Barra de salvar */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur transition-transform lg:left-64 ${
          diff.dirty ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!diff.dirty}
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-gutter">
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-ink">Alterações não salvas</p>
            <p className="truncate text-xs text-muted">
              {[
                ...diff.added.map((d) => `+ ${roleLabel(d.slug, d.role)} (${moduleName(d.slug)})`),
                ...diff.removed.map((d) => `− ${roleLabel(d.slug, d.role)} (${moduleName(d.slug)})`),
              ].join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                setGrants(original);
                setEnabling({});
              }}
              disabled={busy}
              tabIndex={diff.dirty ? 0 : -1}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper disabled:opacity-60"
            >
              <RotateCcw size={14} aria-hidden="true" /> Desfazer
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              tabIndex={diff.dirty ? 0 : -1}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-ink-soft disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
              {busy ? "Salvando…" : "Salvar acessos"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuleAccess({
  mod,
  selected,
  original,
  pending,
  open,
  enabling,
  onToggleOpen,
  onSwitch,
  onToggleRole,
}: {
  mod: ContractedModule;
  selected: string[];
  original: string[];
  pending: boolean;
  open: boolean;
  enabling: boolean;
  onToggleOpen: () => void;
  onSwitch: (on: boolean) => void;
  onToggleRole: (role: string) => void;
}) {
  const visual = moduleVisual(mod.slug);
  const Icon = visual.icon as LucideIcon;
  const on = selected.length > 0;
  // Ligado sem perfil escolhido ainda: aberto, esperando a escolha.
  const choosing = !on && enabling;
  const known = new Set(mod.roles.map((r) => r.name));
  const legacy = selected.filter((r) => !known.has(r));
  const changed = selected.join() !== [...original].sort().join();
  const summary = on
    ? selected.map((r) => splitLabel(mod.roles.find((x) => x.name === r)?.label ?? r).title).join(", ")
    : "Sem acesso";

  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-white shadow-card transition ${
        on ? "border-ink/20" : "border-line"
      }`}
    >
      <div className="flex items-center gap-4 p-4">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded-xl"
        >
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm transition ${visual.gradient} ${
              on ? "" : "opacity-40 grayscale"
            }`}
          >
            <Icon size={20} className="text-white" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-ink">{mod.name}</span>
              {changed && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="Alterado, não salvo" />}
              {pending && (
                <span
                  title="Há um acesso deste módulo esperando aprovação na tela Acessos"
                  className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning-ink"
                >
                  Aguardando revisão
                </span>
              )}
            </span>
            <span className={`block truncate text-xs ${on ? "text-ink" : "text-muted"}`}>
              {choosing ? "Escolha pelo menos um perfil abaixo" : summary}
            </span>
          </span>
          <ChevronDown
            size={16}
            className={`ml-auto shrink-0 text-muted transition ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        <Switch
          checked={on || choosing}
          label={`Acesso ao ${mod.name}`}
          onChange={onSwitch}
        />
      </div>

      {open && (
        <div className="border-t border-line bg-paper/50 p-4">
          <p className="mb-2 text-xs font-medium text-muted">
            Perfil no {mod.name} <span className="font-normal">· pode marcar mais de um</span>
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {mod.roles.map((r) => {
              const checked = selected.includes(r.name);
              const { title, desc } = splitLabel(r.label);
              const admin = isAdminRole(r);
              return (
                <label
                  key={r.name}
                  className={`relative flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 transition focus-within:ring-2 focus-within:ring-ink/30 ${
                    checked ? "border-ink shadow-card" : "border-line hover:border-ink/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleRole(r.name)}
                    className="peer sr-only"
                  />
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                      checked ? "border-ink bg-ink text-white" : "border-line bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    {checked && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      {title}
                      {admin && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-ink">
                          <ShieldCheck size={10} aria-hidden="true" /> acesso total
                        </span>
                      )}
                    </span>
                    {desc && <span className="mt-0.5 block text-xs leading-snug text-muted">{desc}</span>}
                    <span className="mt-1 block font-mono text-[10px] text-muted/70">{r.name}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {legacy.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              Perfis antigos:
              {legacy.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onToggleRole(r)}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 font-mono text-[11px] text-ink hover:border-danger hover:text-danger-ink"
                  title="Remover este perfil antigo"
                >
                  {r} <X size={11} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
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
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

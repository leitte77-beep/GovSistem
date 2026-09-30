"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquareText,
  Unlock,
  Wand2,
} from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/toast";
import { initials } from "@/lib/format";

interface UserInfo {
  name: string;
  email: string;
  locked?: boolean;
  must_change_password?: boolean;
}

const RULES = [
  { test: (p: string) => p.length >= 8, label: "8 caracteres ou mais" },
  { test: (p: string) => /[A-Z]/.test(p), label: "Uma letra maiúscula" },
  { test: (p: string) => /[a-z]/.test(p), label: "Uma letra minúscula" },
  { test: (p: string) => /[0-9]/.test(p), label: "Um número" },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: "Um símbolo (!@#…)" },
];

/** Senha forte e fácil de ditar: sem caracteres ambíguos (0/O, 1/l/I). */
function generatePassword(length = 12) {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const rnd = (n: number) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < length) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export default function RedefinirSenhaPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [requireChange, setRequireChange] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ password: string; requireChange: boolean } | null>(null);
  const [copied, setCopied] = useState<"senha" | "mensagem" | null>(null);

  useEffect(() => {
    api<UserInfo>(`/tenant/users/${id}`)
      .then(setUser)
      .catch(() => setUser(null));
  }, [id]);

  const passed = RULES.map((r) => r.test(password));
  const allOk = passed.every(Boolean);
  const matches = generated || (confirm.length > 0 && confirm === password);
  const canSubmit = allOk && matches && !busy;
  const firstName = user?.name.split(/\s+/)[0] ?? "o usuário";

  const generate = () => {
    const p = generatePassword();
    setPassword(p);
    setConfirm(p);
    setGenerated(true);
    setShow(true);
    setError("");
  };

  const copy = async (text: string, what: "senha" | "mensagem") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast("error", "Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await api(`/tenant/users/${id}/password`, {
        method: "POST",
        body: { password, require_change: requireChange },
      });
      setDone({ password, requireChange });
      toast("success", "Nova senha definida.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao definir a senha";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  const message = done
    ? [
        `Olá, ${firstName}!`,
        "",
        "Sua senha de acesso ao GovSistem foi redefinida.",
        "",
        "Endereço: https://app.govsistem.com.br",
        `Usuário: ${user?.email ?? ""}`,
        `Senha${done.requireChange ? " provisória" : ""}: ${done.password}`,
        "",
        done.requireChange
          ? "No primeiro acesso o sistema vai pedir que você crie uma senha nova."
          : "Recomendamos trocar a senha em Meu perfil depois de entrar.",
      ].join("\n")
    : "";

  return (
    <div className="mx-auto max-w-xl space-y-6">
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
          Nova senha
        </span>
      </nav>

      <header className="flex items-center gap-4">
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#E0EAFF] text-lg font-bold text-[#1D3A8A]">
          {initials(user?.name)}
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white ring-2 ring-white">
            <KeyRound size={12} aria-hidden="true" />
          </span>
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Definir nova senha</h1>
          <p className="truncate text-sm text-muted">
            {user ? `${user.name} · ${user.email}` : "Carregando…"}
          </p>
        </div>
      </header>

      {done ? (
        /* Concluído: o gestor precisa passar a senha para a pessoa */
        <section className="space-y-4 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-ink">Senha definida</h2>
              <p className="text-sm text-muted">
                Passe a senha para {firstName} por um canal seguro. Ela não vai aparecer de novo depois que você sair desta tela.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-4 py-3">
            <code className="min-w-0 flex-1 truncate font-mono text-lg font-semibold tracking-wide text-ink">{done.password}</code>
            <button
              type="button"
              onClick={() => copy(done.password, "senha")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-card hover:bg-paper"
            >
              {copied === "senha" ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
              {copied === "senha" ? "Copiada" : "Copiar"}
            </button>
          </div>

          <div className="rounded-xl border border-line">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <MessageSquareText size={15} aria-hidden="true" /> Mensagem pronta
              </p>
              <button
                type="button"
                onClick={() => copy(message, "mensagem")}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-soft"
              >
                {copied === "mensagem" ? <Check size={13} /> : <Copy size={13} />}
                {copied === "mensagem" ? "Copiada" : "Copiar mensagem"}
              </button>
            </div>
            <pre className="whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-relaxed text-muted">{message}</pre>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Link
              href="/usuarios"
              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-paper"
            >
              Lista de usuários
            </Link>
            <Link
              href={`/usuarios/${id}`}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft"
            >
              Voltar para {firstName}
            </Link>
          </div>
        </section>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <section className="space-y-5 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Nova senha</h2>
              <button
                type="button"
                onClick={generate}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/30 hover:shadow-card"
              >
                <Wand2 size={13} aria-hidden="true" /> Gerar senha forte
              </button>
            </div>

            <div>
              <label htmlFor="pw" className="mb-1.5 block text-sm font-medium text-ink">
                Senha
              </label>
              <div className="relative">
                <input
                  id="pw"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setGenerated(false);
                  }}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-line bg-white py-2.5 pl-3.5 pr-20 font-mono text-sm text-ink transition focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/10"
                  placeholder="Digite ou gere uma senha"
                />
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5">
                  {password && (
                    <button
                      type="button"
                      onClick={() => copy(password, "senha")}
                      aria-label="Copiar senha"
                      className="rounded-lg p-1.5 text-muted hover:bg-paper hover:text-ink"
                    >
                      {copied === "senha" ? <Check size={16} className="text-accent" /> : <Copy size={16} />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                    className="rounded-lg p-1.5 text-muted hover:bg-paper hover:text-ink"
                  >
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Força: uma barra por regra cumprida */}
              <div className="mt-3 flex gap-1" aria-hidden="true">
                {passed.map((ok, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition ${
                      ok ? (allOk ? "bg-accent" : "bg-warning") : "bg-paper"
                    }`}
                  />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label="Requisitos da senha">
                {RULES.map((r, i) => (
                  <li
                    key={r.label}
                    className={`flex items-center gap-2 text-xs transition ${passed[i] ? "text-accent-ink" : "text-muted"}`}
                  >
                    {passed[i] ? (
                      <CheckCircle2 size={14} className="shrink-0" aria-label="cumprido" />
                    ) : (
                      <Circle size={14} className="shrink-0" aria-label="pendente" />
                    )}
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>

            {!generated && (
              <div>
                <label htmlFor="pw2" className="mb-1.5 block text-sm font-medium text-ink">
                  Repita a senha
                </label>
                <input
                  id="pw2"
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className={`w-full rounded-xl border bg-white px-3.5 py-2.5 font-mono text-sm text-ink transition focus:outline-none focus:ring-2 ${
                    confirm && confirm !== password
                      ? "border-danger focus:ring-danger/15"
                      : "border-line focus:border-ink/40 focus:ring-ink/10"
                  }`}
                />
                {confirm && confirm !== password && (
                  <p className="mt-1.5 text-xs font-medium text-danger-ink" role="alert">
                    As senhas não são iguais.
                  </p>
                )}
              </div>
            )}

            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line bg-paper/60 px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-ink">Pedir para trocar no primeiro acesso</span>
                <span className="block text-xs text-muted">
                  {requireChange
                    ? "Recomendado: a senha acima vale só para entrar uma vez, e a pessoa cria a dela."
                    : "A senha acima passa a ser a senha definitiva da pessoa."}
                </span>
              </span>
              <input
                type="checkbox"
                checked={requireChange}
                onChange={(e) => setRequireChange(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 ${
                  requireChange ? "bg-accent" : "bg-line"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                    requireChange ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </span>
            </label>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <h2 className="mb-3 text-sm font-semibold text-ink">Ao confirmar</h2>
            <ul className="space-y-2.5 text-sm text-muted">
              <li className="flex items-start gap-2.5">
                <KeyRound size={15} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
                A senha atual de {firstName} deixa de funcionar.
              </li>
              <li className="flex items-start gap-2.5">
                <LogOut size={15} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
                As sessões abertas nos módulos são encerradas.
              </li>
              <li className="flex items-start gap-2.5">
                <Unlock size={15} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
                {user?.locked ? (
                  <span>
                    A conta, <strong className="font-semibold text-ink">hoje bloqueada</strong> por tentativas erradas, é desbloqueada.
                  </span>
                ) : (
                  "Se a conta estiver bloqueada por tentativas erradas, ela é desbloqueada."
                )}
              </li>
            </ul>
          </section>

          {error && (
            <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Link
              href={`/usuarios/${id}`}
              className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-paper"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
              {busy ? "Salvando…" : "Definir senha"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

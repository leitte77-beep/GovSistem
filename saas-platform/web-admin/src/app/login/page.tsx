"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";
import toast from "react-hot-toast";
import Link from "next/link";
import { LEGAL_DOCS } from "@/lib/legal";

const REMEMBER_KEY = "govsistem:remembered-email";

const HIGHLIGHTS = [
  {
    icon: "dashboard_customize",
    title: "Todos os módulos em um só acesso",
    desc: "Atendimento, diário oficial, processos, obras e documentos sob a mesma credencial.",
  },
  {
    icon: "encrypted",
    title: "Segurança de nível público",
    desc: "Conexão criptografada, autenticação em duas etapas e trilha de auditoria de cada ação.",
  },
  {
    icon: "verified_user",
    title: "Conformidade com a LGPD",
    desc: "Bases legais documentadas, controle de acesso por perfil e canal do Encarregado.",
  },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const { loading: authLoading, user, login } = useAuth();
  const router = useRouter();
  const redirected = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && !redirected.current) {
      redirected.current = true;
      router.replace("/");
    }
  }, [user, router]);

  // Lido apenas no cliente para não divergir do HTML renderizado no servidor.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(REMEMBER_KEY) : null;
    if (saved) {
      setEmail(saved);
      setRemember(true);
      passwordRef.current?.focus();
    }
  }, []);

  if (authLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-[999px] border-2 border-outline-variant border-t-primary-600" />
          <p className="text-xs text-on-surface-variant">Carregando sua sessão…</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Informe seu e-mail e sua senha para continuar.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(email.trim(), password);
      if (remember) localStorage.setItem(REMEMBER_KEY, email.trim());
      else localStorage.removeItem(REMEMBER_KEY);
      toast.success("Acesso liberado!");
    } catch (err: any) {
      const raw: string = err?.message || "";
      // Erros de validacao da API chegam em ingles; na tela de login o unico
      // desfecho util para o usuario e "credenciais nao conferem".
      const friendly = !raw || /valid email address|Request failed/i.test(raw)
        ? "E-mail ou senha inválidos."
        : raw;
      setError(friendly);
      setLoading(false);
      passwordRef.current?.focus();
      passwordRef.current?.select();
    }
  };

  const trackCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  };

  const fieldBase =
    "flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 h-[52px] transition-all focus-within:border-primary-500 focus-within:bg-surface-container-lowest focus-within:ring-4 focus-within:ring-primary-500/12";

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      {/* ---------------------------------------------------------------
          Painel institucional (desktop)
      --------------------------------------------------------------- */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0a1122] via-[#132445] to-primary-800 text-white p-12 xl:p-16">
        <div className="absolute inset-0 legal-grid opacity-[0.16]" aria-hidden />
        <div
          className="absolute -top-40 -left-24 w-[520px] h-[520px] rounded-[999px] bg-primary-500/25 blur-[130px]"
          aria-hidden
        />
        <div
          className="absolute -bottom-48 right-0 w-[560px] h-[560px] rounded-[999px] bg-sky-400/15 blur-[140px]"
          aria-hidden
        />

        <div className="relative z-10 flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-white/12 border border-white/15 flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">account_balance</span>
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-extrabold tracking-tight">GovSistem</span>
            <span className="text-xs text-white/55">Plataforma de gestão pública</span>
          </span>
        </div>

        <div className="relative z-10 max-w-[520px]">
          <h2 className="text-[34px] xl:text-[40px] leading-[1.15] font-extrabold tracking-tight">
            A gestão do município,
            <br />
            <span className="text-primary-200">integrada e auditável.</span>
          </h2>
          <p className="mt-5 text-base text-white/65 leading-relaxed">
            Um único acesso para todos os módulos contratados pelo seu órgão, com rastreabilidade de
            ponta a ponta.
          </p>

          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map((item) => (
              <li key={item.icon} className="flex gap-4">
                <span className="mt-0.5 w-10 h-10 shrink-0 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px] text-primary-200">
                    {item.icon}
                  </span>
                </span>
                <div>
                  <p className="text-sm font-bold">{item.title}</p>
                  <p className="text-sm text-white/55 leading-relaxed mt-0.5">{item.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-white/45">
          <span className="material-symbols-outlined text-[16px]">lock</span>
          Conexão protegida por criptografia TLS
        </div>
      </aside>

      {/* ---------------------------------------------------------------
          Formulário
      --------------------------------------------------------------- */}
      <main className="relative flex flex-col min-h-screen lg:min-h-0">
        <div className="lg:hidden absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute -top-24 -left-16 w-80 h-80 rounded-[999px] bg-primary-200/40 blur-[110px]" />
          <div className="absolute -bottom-24 -right-10 w-96 h-96 rounded-[999px] bg-sky-200/40 blur-[120px]" />
        </div>

        {/* Marca no mobile */}
        <div className="lg:hidden pt-10 pb-2 flex flex-col items-center">
          <span className="w-14 h-14 rounded-2xl bg-primary-600 text-white flex items-center justify-center shadow-lg shadow-primary-600/20">
            <span className="material-symbols-outlined text-[30px]">account_balance</span>
          </span>
          <p className="mt-3 text-lg font-extrabold text-on-surface tracking-tight">GovSistem</p>
        </div>

        <div className="flex-1 flex items-center justify-center px-5 sm:px-8 py-10">
          <div className="w-full max-w-[420px]">
            <header className="mb-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary-600">
                Painel Administrativo
              </p>
              <h1 className="mt-2 text-[28px] leading-tight font-extrabold text-on-surface tracking-tight">
                Bem-vindo de volta
              </h1>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                Entre com as credenciais institucionais fornecidas pelo administrador do seu órgão.
              </p>
            </header>

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700"
              >
                <span className="material-symbols-outlined text-[20px] shrink-0">error</span>
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2"
                >
                  E-mail institucional
                </label>
                <div className={fieldBase}>
                  <span className="material-symbols-outlined text-outline text-[20px]">mail</span>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="nome@orgao.gov.br"
                    autoFocus
                    autoComplete="username"
                    aria-invalid={!!error}
                    className="flex-1 bg-transparent border-none outline-none p-0 text-sm text-on-surface focus:ring-0 placeholder:text-outline/60"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-baseline mb-2 gap-3">
                  <label
                    htmlFor="password"
                    className="text-xs font-bold text-on-surface-variant uppercase tracking-wider"
                  >
                    Senha
                  </label>
                  <Link
                    href="/login/forgot"
                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className={fieldBase}>
                  <span className="material-symbols-outlined text-outline text-[20px]">lock</span>
                  <input
                    id="password"
                    name="password"
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    onKeyUp={trackCaps}
                    onKeyDown={trackCaps}
                    onBlur={() => setCapsLock(false)}
                    placeholder="Sua senha"
                    autoComplete="current-password"
                    aria-invalid={!!error}
                    aria-describedby={capsLock ? "caps-hint" : undefined}
                    className="flex-1 bg-transparent border-none outline-none p-0 text-sm text-on-surface focus:ring-0 placeholder:text-outline/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                    className="text-outline hover:text-on-surface transition-colors rounded-lg p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
                {capsLock && (
                  <p
                    id="caps-hint"
                    className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"
                  >
                    <span className="material-symbols-outlined text-[16px]">keyboard_capslock</span>
                    Caps Lock está ativado.
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-outline-variant text-primary-600 focus:ring-primary-500 w-4 h-4"
                />
                <span className="text-sm text-on-surface-variant">Lembrar meu e-mail</span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-[52px] rounded-xl bg-primary-600 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:active:scale-100 shadow-lg shadow-primary-600/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/30"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-[999px] border-2 border-white border-t-transparent" />
                    <span>Entrando…</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no painel</span>
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-outline-variant bg-surface-container-low/70 p-3.5">
              <span className="material-symbols-outlined text-[20px] text-primary-600 shrink-0">
                shield_lock
              </span>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Nunca solicitamos sua senha por e-mail, telefone ou WhatsApp. Suas credenciais são
                pessoais e intransferíveis.{" "}
                <Link href="/seguranca" className="font-semibold text-primary-600 hover:underline">
                  Saiba mais
                </Link>
                .
              </p>
            </div>

            <p className="mt-6 text-center text-xs text-on-surface-variant">
              Problemas com o acesso?{" "}
              <Link href="/ajuda" className="font-semibold text-primary-600 hover:underline">
                Central de Ajuda
              </Link>{" "}
              ou{" "}
              <a
                href="mailto:contato@govsistem.com.br"
                className="font-semibold text-primary-600 hover:underline"
              >
                fale com o suporte
              </a>
              .
            </p>
          </div>
        </div>

        <footer className="px-5 sm:px-8 py-7 border-t border-outline-variant/70">
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 max-w-[520px] mx-auto">
            <p className="text-xs text-outline">
              &copy; {new Date().getFullYear()} GovSistem
            </p>
            <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2">
              {LEGAL_DOCS.map((doc) => (
                <Link
                  key={doc.slug}
                  href={doc.href}
                  className="text-xs text-on-surface-variant hover:text-primary-600 transition-colors"
                >
                  {doc.label}
                </Link>
              ))}
            </nav>
          </div>
        </footer>
      </main>
    </div>
  );
}

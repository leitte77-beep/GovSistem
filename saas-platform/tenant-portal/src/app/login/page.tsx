"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Radar,
  Files,
  Phone,
  HelpCircle,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-provider";

const HIGHLIGHTS = [
  {
    icon: Radar,
    title: "Seus módulos em um só acesso",
    desc: "Diário, processos, frota, documentos e atendimento sob a mesma credencial do seu órgão.",
  },
  {
    icon: ShieldCheck,
    title: "Segurança de nível público",
    desc: "Conexão criptografada e trilha de auditoria de cada ação no portal do órgão.",
  },
  {
    icon: Files,
    title: "Gestão por órgão",
    desc: "Gestores administram usuários, módulos e acessos do próprio órgão de forma isolada.",
  },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "E-mail ou senha inválidos.");
    } finally {
      setBusy(false);
    }
  };

  const fieldBase =
    "flex items-center gap-3 rounded-xl border border-[#c3c6d0] bg-[#f2f4f6] px-4 h-[52px] transition-all focus-within:border-[#2563eb] focus-within:bg-surface-container-lowest focus-within:ring-4 focus-within:ring-[#2563eb]/10";

  return (
    <div className="min-h-screen bg-[#f7f9fb] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      {/* Painel institucional (desktop) */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0a1122] via-[#132445] to-[#1e40af] text-white p-12 xl:p-16">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
          aria-hidden
        />
        <div
          className="absolute -top-40 -left-24 w-[520px] h-[520px] rounded-[999px] bg-[#3b82f6]/25 blur-[130px]"
          aria-hidden
        />
        <div
          className="absolute -bottom-48 right-0 w-[560px] h-[560px] rounded-[999px] bg-sky-400/15 blur-[140px]"
          aria-hidden
        />

        <div className="relative z-10 flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-white/12 border border-white/15 flex items-center justify-center">
            <Building2 className="text-[24px]" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-extrabold tracking-tight">GovSistem</span>
            <span className="text-xs text-white/55">Portal dos Órgãos</span>
          </span>
        </div>

        <div className="relative z-10 max-w-[520px]">
          <h2 className="text-[34px] xl:text-[40px] leading-[1.15] font-extrabold tracking-tight">
            A gestão do seu órgão,
            <br />
            <span className="text-[#bfdbfe]">integrada e auditável.</span>
          </h2>
          <p className="mt-5 text-base text-white/65 leading-relaxed">
            Acesse todos os módulos liberados para o seu órgão com segurança e rastreabilidade.
          </p>

          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex gap-4">
                  <span className="mt-0.5 w-10 h-10 shrink-0 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
                    <Icon className="text-[20px] text-[#bfdbfe]" />
                  </span>
                  <div>
                    <p className="text-sm font-bold">{item.title}</p>
                    <p className="text-sm text-white/55 leading-relaxed mt-0.5">{item.desc}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-white/45">
          <Lock className="text-[16px]" />
          Conexão protegida por criptografia TLS
        </div>
      </aside>

      {/* Formulário */}
      <main className="relative flex flex-col min-h-screen lg:min-h-0">
        <div className="lg:hidden absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute -top-24 -left-16 w-80 h-80 rounded-[999px] bg-[#bfdbfe]/40 blur-[110px]" />
          <div className="absolute -bottom-24 -right-10 w-96 h-96 rounded-[999px] bg-sky-200/40 blur-[120px]" />
        </div>

        {/* Marca no mobile */}
        <div className="lg:hidden pt-10 pb-2 flex flex-col items-center">
          <span className="w-14 h-14 rounded-2xl bg-[#2563eb] text-white flex items-center justify-center shadow-lg shadow-[#2563eb]/20">
            <Building2 className="text-[30px]" />
          </span>
          <p className="mt-3 text-lg font-extrabold text-[#191c1e] tracking-tight">GovSistem</p>
          <p className="text-xs text-[#43474f]">Portal dos Órgãos</p>
        </div>

        <div className="flex-1 flex items-center justify-center px-5 sm:px-8 py-10">
          <div className="w-full max-w-[420px]">
            <header className="mb-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2563eb]">
                Portal do Órgão
              </p>
              <h1 className="mt-2 text-[28px] leading-tight font-extrabold text-[#191c1e] tracking-tight">
                Bem-vindo de volta
              </h1>
              <p className="mt-2 text-sm text-[#43474f] leading-relaxed">
                Entre com as credenciais fornecidas pelo gestor do seu órgão.
              </p>
            </header>

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700"
              >
                <AlertCircle className="text-[20px] shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <form onSubmit={submit} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-bold text-[#43474f] uppercase tracking-wider mb-2"
                >
                  E-mail institucional
                </label>
                <div className={fieldBase}>
                  <Mail className="text-[#73777f] text-[20px] shrink-0" />
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
                    className="flex-1 bg-transparent border-none outline-none p-0 text-sm text-[#191c1e] focus:ring-0 placeholder:text-[#73777f]/60"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-baseline mb-2 gap-3">
                  <label
                    htmlFor="password"
                    className="text-xs font-bold text-[#43474f] uppercase tracking-wider"
                  >
                    Senha
                  </label>
                  <Link
                    href="/login/forgot"
                    className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8] hover:underline"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className={fieldBase}>
                  <Lock className="text-[#73777f] text-[20px] shrink-0" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="Sua senha"
                    autoComplete="current-password"
                    aria-invalid={!!error}
                    className="flex-1 bg-transparent border-none outline-none p-0 text-sm text-[#191c1e] focus:ring-0 placeholder:text-[#73777f]/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                    className="text-[#73777f] hover:text-[#191c1e] transition-colors rounded-lg p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                  >
                    {showPassword ? <EyeOff className="text-[20px]" /> : <Eye className="text-[20px]" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-[52px] rounded-xl bg-[#2563eb] text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#1d4ed8] active:scale-[0.99] transition-all disabled:opacity-60 disabled:active:scale-100 shadow-lg shadow-[#2563eb]/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2563eb]/30"
              >
                {busy ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-[999px] border-2 border-white border-t-transparent" />
                    <span>Entrando…</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no portal</span>
                    <ArrowRight className="text-[20px]" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-[#c3c6d0] bg-[#f2f4f6]/70 p-3.5">
              <ShieldCheck className="text-[20px] text-[#2563eb] shrink-0" />
              <p className="text-xs text-[#43474f] leading-relaxed">
                Nunca solicitamos sua senha por e-mail, telefone ou WhatsApp. Suas credenciais são
                pessoais e intransferíveis.
              </p>
            </div>

            <p className="mt-6 text-center text-xs text-[#43474f]">
              Problemas com o acesso?{" "}
              <a
                href="mailto:contato@govsistem.com.br"
                className="inline-flex items-center gap-1 font-semibold text-[#2563eb] hover:underline"
              >
                <HelpCircle className="text-[13px]" /> fale com o suporte
              </a>
            </p>
          </div>
        </div>

        <footer className="px-5 sm:px-8 py-7 border-t border-[#c3c6d0]/70">
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 max-w-[520px] mx-auto">
            <p className="text-xs text-[#73777f]">
              &copy; {new Date().getFullYear()} GovSistem
            </p>
            <p className="text-xs text-[#43474f]">Portal dos Órgãos</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

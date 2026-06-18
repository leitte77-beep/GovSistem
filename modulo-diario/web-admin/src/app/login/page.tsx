"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user && !new URLSearchParams(window.location.search).has("token")) {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("token")) {
      }
    }
  }, [authLoading, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Login realizado com sucesso");
      router.push("/");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-surface font-body-md">
      <header className="w-full h-20 flex justify-between items-center px-gutter max-w-container-max mx-auto bg-surface border-b border-outline-variant">
        <div className="text-headline-sm font-headline-sm font-bold text-primary">
          Diário Oficial
        </div>
        <div className="hidden md:flex items-center gap-stack-md">
          <span className="text-label-md font-label-md text-on-surface-variant">
            Portal Administrativo
          </span>
          <span className="material-symbols-outlined text-primary">help</span>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center p-gutter relative overflow-hidden" style={{ background: "linear-gradient(135deg, #f7f9fb 0%, #eceef0 100%)" }}>
        <div className="absolute top-0 right-0 w-1/3 h-full opacity-10 pointer-events-none">
          <img
            alt=""
            className="w-full h-full object-cover grayscale"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBdC2wFP8qaCqiCbMPFO6ctkBaJltbDKxYTDEcltX5-a8YcpgUlfi8qZcATb69R1u93F6jG7Mtqx0kCLbz9CvX5dZQVK7xaealociFwS0DSO6aqJnS8w-0zLBGykeywfBld1XLBu9F-FKi4wiTGHSWzQmqTbq-KZIK84P4fUfgaWogxHpYXs1Bfq7UzkOMGhfxqBKFxHlXLiGkqwPS6h6xZARD1PxpntYWwEvQWRVLXgKTWZtskKgNnIQSFMwijSdzZcyteiq5cQ-Na"
          />
        </div>

        <div className="w-full max-w-md z-10">
          <div className="bg-surface-container-lowest border border-outline-variant p-10 rounded-lg shadow-[0_12px_24px_-4px_rgba(0,27,49,0.08)]">
            <div className="text-center mb-stack-lg">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-container mb-stack-md">
                <span
                  className="material-symbols-outlined text-on-primary-container text-[32px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  account_balance
                </span>
              </div>
              <h1 className="text-headline-md font-headline-md text-primary">
                Acesso Administrativo
              </h1>
              <p className="text-body-sm font-body-sm text-on-surface-variant mt-2">
                Identifique-se para gerenciar publicações oficiais.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-stack-md">
              <div className="space-y-2">
                <label
                  className="text-label-md font-label-md text-on-surface uppercase tracking-wider"
                  htmlFor="email"
                >
                  E-mail Institucional
                </label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors">
                    mail
                  </span>
                  <input
                    className="w-full h-12 pl-12 pr-4 bg-surface-container-low border border-outline-variant text-body-md rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-outline"
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="nome@imprensa.gov.br"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label
                    className="text-label-md font-label-md text-on-surface uppercase tracking-wider"
                    htmlFor="password"
                  >
                    Senha
                  </label>
                  <a
                    className="text-label-md font-label-md text-primary-container hover:underline"
                    href="#"
                  >
                    Esqueci a senha
                  </a>
                </div>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors">
                    lock
                  </span>
                  <input
                    className="w-full h-12 pl-12 pr-12 bg-surface-container-low border border-outline-variant text-body-md rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-outline"
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <span className="material-symbols-outlined">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  className="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant"
                  id="remember"
                  type="checkbox"
                />
                <label
                  className="text-body-sm font-body-sm text-on-surface-variant"
                  htmlFor="remember"
                >
                  Lembrar neste dispositivo
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-primary text-on-primary font-headline-sm rounded-lg hover:bg-primary-container transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin">
                      progress_activity
                    </span>
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Acessar Painel</span>
                    <span className="material-symbols-outlined">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-stack-lg pt-stack-md border-t border-outline-variant flex flex-col gap-4">
              <p className="text-body-sm font-body-sm text-center text-on-surface-variant">
                Métodos alternativos de segurança
              </p>
              <button
                type="button"
                className="w-full h-12 border border-outline text-on-surface font-label-md rounded-lg flex items-center justify-center gap-3 hover:bg-surface-container-high transition-all"
              >
                <span
                  className="material-symbols-outlined text-secondary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified_user
                </span>
                <span>Entrar com Certificado Digital (e-CPF)</span>
              </button>
            </div>
          </div>

          <div className="mt-stack-md text-center">
            <p className="text-label-md font-label-md text-on-surface-variant flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[16px]">
                security
              </span>
              Conexão segura criptografada (SSL/TLS 1.3)
            </p>
          </div>
        </div>
      </main>

      <footer className="bg-surface-container-lowest border-t border-outline-variant">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-gutter py-stack-lg max-w-container-max mx-auto">
          <div className="mb-4 md:mb-0">
            <div className="text-headline-sm font-headline-sm font-bold text-primary mb-1">
              Diário Oficial
            </div>
            <p className="text-body-sm font-body-sm text-on-surface-variant">
              © 2026 Imprensa Nacional. Todos os direitos reservados.
            </p>
          </div>
          <nav className="flex flex-wrap justify-center gap-stack-md">
            <a className="text-label-md font-label-md text-on-surface-variant hover:text-primary underline transition-all duration-150" href="#">
              Sobre o Portal
            </a>
            <a className="text-label-md font-label-md text-on-surface-variant hover:text-primary underline transition-all duration-150" href="#">
              Privacidade
            </a>
            <a className="text-label-md font-label-md text-on-surface-variant hover:text-primary underline transition-all duration-150" href="#">
              Acessibilidade
            </a>
            <a className="text-label-md font-label-md text-on-surface-variant hover:text-primary underline transition-all duration-150" href="#">
              Mapa do Site
            </a>
            <a className="text-label-md font-label-md text-on-surface-variant hover:text-primary underline transition-all duration-150" href="#">
              Contato
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

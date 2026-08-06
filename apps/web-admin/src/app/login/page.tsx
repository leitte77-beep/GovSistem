"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
        <a href="https://govsistem.com.br" className="flex items-center gap-2 group" aria-label="GovSistem — voltar ao site">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-[20px]" aria-hidden="true">account_balance</span>
          </div>
          <div>
            <div className="text-headline-sm font-headline-sm font-bold text-primary leading-none">GovSistem</div>
            <div className="text-label-md font-label-md text-on-surface-variant">Portal Administrativo</div>
          </div>
        </a>
        <div className="hidden md:flex items-center gap-stack-md">
          <a
            href="mailto:contato@govsistem.com.br?subject=Suporte%20Portal%20Administrativo"
            className="text-label-md font-label-md text-on-surface-variant hover:text-primary transition-colors"
          >
            Precisa de ajuda?
          </a>
          <span className="material-symbols-outlined text-primary" aria-hidden="true">help</span>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center p-gutter relative overflow-hidden bg-[linear-gradient(135deg,#f7f9fb_0%,#eceef0_100%)]">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px,#001631 1px,transparent 0)', backgroundSize: '32px 32px' }} />

        <div className="w-full max-w-md z-10">
          <div className="bg-surface-container-lowest p-10 rounded-lg shadow-lg">
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
                  className="text-label-md font-label-md text-on-surface mb-1"
                  htmlFor="email"
                >
                  E-mail institucional
                </label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors" aria-hidden="true">
                    mail
                  </span>
                  <input
                    className="w-full h-12 pl-12 pr-4 bg-surface-container-low border border-outline-variant text-body-md rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-on-surface-variant/70"
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="nome@imprensa.gov.br"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label
                    className="text-label-md font-label-md text-on-surface mb-1"
                    htmlFor="password"
                  >
                    Senha
                  </label>
                  <a
                    className="text-label-md font-label-md text-primary-container hover:underline"
                    href="mailto:contato@govsistem.com.br?subject=Recuperação%20de%20senha"
                  >
                    Esqueci a senha
                  </a>
                </div>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors" aria-hidden="true">
                    lock
                  </span>
                  <input
                    className="w-full h-12 pl-12 pr-12 bg-surface-container-low border border-outline-variant text-body-md rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-on-surface-variant/70"
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
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="w-full h-14 bg-primary text-on-primary font-headline-sm rounded-lg hover:bg-primary-container transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin" aria-hidden="true">
                      progress_activity
                    </span>
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Acessar Painel</span>
                    <span className="material-symbols-outlined" aria-hidden="true">
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
                disabled
                className="w-full h-12 border border-outline text-on-surface/60 font-label-md rounded-lg flex items-center justify-center gap-3 hover:bg-surface-container-high transition-all disabled:cursor-not-allowed disabled:bg-surface-container"
                title="Login com certificado digital em breve"
              >
                <span
                  className="material-symbols-outlined text-secondary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  verified_user
                </span>
                <span>Entrar com Certificado Digital (em breve)</span>
              </button>
            </div>
          </div>

          <div className="mt-stack-md text-center">
            <p className="text-label-md font-label-md text-on-surface-variant flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                security
              </span>
              Conexão segura criptografada (SSL/TLS 1.3)
            </p>
          </div>
        </div>
      </main>

      <footer className="bg-surface border-t border-outline-variant">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-gutter py-stack-md max-w-container-max mx-auto">
          <div className="mb-4 md:mb-0 text-center md:text-left">
            <div className="text-headline-sm font-headline-sm font-bold text-primary mb-1">GovSistem</div>
            <p className="text-body-sm font-body-sm text-on-surface-variant">
              © {new Date().getFullYear()} GovSistem. Todos os direitos reservados.
            </p>
          </div>
          <nav className="flex flex-wrap justify-center gap-stack-md" aria-label="Rodapé">
            <a className="text-label-md font-label-md text-on-surface-variant hover:text-primary transition-colors" href="https://govsistem.com.br">
              Site institucional
            </a>
            <a className="text-label-md font-label-md text-on-surface-variant hover:text-primary transition-colors" href="mailto:contato@govsistem.com.br">
              Contato
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

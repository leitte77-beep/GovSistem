"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useCitizen } from "@/lib/citizen";
import { getOrgNome, getOrgSlug } from "@/lib/org";
import OrgSelector from "@/components/OrgSelector";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useCitizen();
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [orgNome, setOrgNome] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  const atualizarOrg = () => {
    setOrgSlug(getOrgSlug());
    setOrgNome(getOrgNome());
  };

  useEffect(() => {
    atualizarOrg();
    window.addEventListener("org:changed", atualizarOrg);
    return () => window.removeEventListener("org:changed", atualizarOrg);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgSlug) {
      toast.error("Selecione o seu município");
      return;
    }
    setLoading(true);
    try {
      await login(orgSlug, email, senha);
      toast.success("Login realizado");
      router.push("/painel");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-gutter py-12">
      <h1 className="text-headline-lg font-headline-lg text-primary">Entrar</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Acesse para peticionar e acompanhar seus processos.
      </p>

      {!orgSlug && (
        <div className="mt-6 bg-surface-container-lowest rounded-lg border border-outline-variant p-4">
          <OrgSelector />
        </div>
      )}

      {orgSlug && (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="text-body-sm text-on-surface-variant">
            Órgão: <span className="text-on-surface font-medium">{orgNome || orgSlug}</span>{" "}
            <Link href="/" className="text-primary hover:underline">trocar</Link>
          </div>

          <div>
            <label htmlFor="email" className="text-label-md font-label-md text-on-surface block mb-1">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="senha" className="text-label-md font-label-md text-on-surface block mb-1">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="w-full h-12 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>

          <p className="text-body-sm text-on-surface-variant text-center">
            Ainda não tem conta?{" "}
            <Link href="/cadastro" className="text-primary hover:underline">Cadastre-se</Link>
          </p>
        </form>
      )}
    </div>
  );
}

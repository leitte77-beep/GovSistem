"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { getOrgNome, getOrgSlug } from "@/lib/org";
import OrgSelector from "@/components/OrgSelector";

export default function CadastroPage() {
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [orgNome, setOrgNome] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [aceite, setAceite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [concluido, setConcluido] = useState(false);

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
    if (!aceite) {
      toast.error("Você precisa aceitar o termo de uso");
      return;
    }
    setSubmitting(true);
    try {
      await api.registrarCidadao({
        org_slug: orgSlug,
        nome,
        email,
        cpf_cnpj: cpfCnpj,
        senha,
        telefone: telefone || undefined,
        aceite_termo: true,
      });
      setConcluido(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no cadastro");
    } finally {
      setSubmitting(false);
    }
  };

  if (concluido) {
    return (
      <div className="max-w-md mx-auto px-gutter py-12">
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-8 text-center">
          <span className="material-symbols-outlined text-[48px] text-secondary" aria-hidden="true">how_to_reg</span>
          <h1 className="mt-4 text-headline-md font-headline-md">Cadastro recebido</h1>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Seu cadastro está em análise. Após a aprovação do órgão, você poderá entrar e peticionar.
          </p>
          <Link href="/login" className="mt-6 inline-flex items-center gap-2 h-11 px-5 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-gutter py-12">
      <h1 className="text-headline-lg font-headline-lg text-primary">Criar conta</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Cadastro próprio, sem gov.br. Após aprovação do órgão você poderá peticionar.
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
            <label htmlFor="nome" className="text-label-md font-label-md text-on-surface block mb-1">Nome completo</label>
            <input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)}
              className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary" />
          </div>

          <div>
            <label htmlFor="email" className="text-label-md font-label-md text-on-surface block mb-1">E-mail</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary" />
          </div>

          <div>
            <label htmlFor="cpf" className="text-label-md font-label-md text-on-surface block mb-1">CPF ou CNPJ</label>
            <input id="cpf" required value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)}
              placeholder="Somente números"
              className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary" />
          </div>

          <div>
            <label htmlFor="telefone" className="text-label-md font-label-md text-on-surface block mb-1">Telefone (opcional)</label>
            <input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)}
              className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary" />
          </div>

          <div>
            <label htmlFor="senha" className="text-label-md font-label-md text-on-surface block mb-1">Senha</label>
            <input id="senha" type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)}
              className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary" />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="h-4 w-4 mt-0.5" />
            <span className="text-body-sm text-on-surface-variant">
              Li e aceito o termo de uso e a política de privacidade, incluindo o tratamento de dados pessoais conforme a LGPD.
            </span>
          </label>

          <button type="submit" disabled={submitting} aria-busy={submitting}
            className="w-full h-12 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60">
            {submitting ? "Enviando…" : "Criar conta"}
          </button>

          <p className="text-body-sm text-on-surface-variant text-center">
            Já tem conta?{" "}
            <Link href="/login" className="text-primary hover:underline">Entrar</Link>
          </p>
        </form>
      )}
    </div>
  );
}

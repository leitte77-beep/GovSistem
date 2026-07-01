"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    organization_name: "",
    organization_slug: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const BASE = (process.env.NEXT_PUBLIC_API_URL || "/api/v1").replace(/\/api\/v1$/, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Erro ao cadastrar");
      }
      const data = await res.json();
      // access_token in sessionStorage (cleared on tab close) to reduce XSS exposure window.
      // refresh_token kept in localStorage for cross-tab persistence; revocable server-side.
      sessionStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);

      const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.govsistem.com.br";
      window.location.href = `${adminBase}/`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm((f) => {
      const updated = { ...f, [field]: val };
      if (field === "organization_name") {
        updated.organization_slug = val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }
      return updated;
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-surface font-body-md">
      <header className="w-full h-20 flex items-center px-gutter max-w-container-max mx-auto bg-surface border-b border-outline-variant">
        <Link href="/" className="text-headline-sm font-headline-sm font-bold text-primary">
          Diário Oficial
        </Link>
      </header>

      <main className="flex-grow flex items-center justify-center p-gutter">
        <div className="w-full max-w-lg">
          <div className="bg-surface-container-lowest border border-outline-variant p-10 rounded-lg shadow-lg">
            <div className="text-center mb-8">
              <h1 className="text-headline-md font-headline-md text-primary">
                Criar Nova Organização
              </h1>
              <p className="text-body-sm text-on-surface-variant mt-2">
                Cadastre sua prefeitura, câmara ou órgão público no Diário Oficial Eletrônico.
              </p>
            </div>

            {error && (
              <div id="form-error" role="alert" className="bg-error-container text-on-error-container p-3 rounded-lg text-sm mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="org-name" className="text-label-md font-label-md text-on-surface uppercase tracking-wider block mb-1">
                  Nome da Organização
                </label>
                <input
                  id="org-name"
                  className="w-full h-12 px-4 bg-surface-container-low border border-outline-variant text-body-md rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  value={form.organization_name}
                  onChange={updateField("organization_name")}
                  required
                  placeholder="Prefeitura Municipal de Exemplo"
                  aria-describedby={error ? "form-error" : undefined}
                />
              </div>

              <div>
                <label htmlFor="org-slug" className="text-label-md font-label-md text-on-surface uppercase tracking-wider block mb-1">
                  Slug (identificador único)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-body-sm text-outline">doeapp.com.br/</span>
                  <input
                    id="org-slug"
                    className="flex-1 h-12 px-4 bg-surface-container-low border border-outline-variant text-body-md rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    value={form.organization_slug}
                    onChange={(e) => setForm((f) => ({ ...f, organization_slug: e.target.value }))}
                    required
                    placeholder="exemplo-municipio"
                    aria-describedby={error ? "form-error" : undefined}
                  />
                </div>
              </div>

              <hr className="border-outline-variant" />

              <div>
                <label htmlFor="admin-name" className="text-label-md font-label-md text-on-surface uppercase tracking-wider block mb-1">
                  Nome do Administrador
                </label>
                <input
                  id="admin-name"
                  className="w-full h-12 px-4 bg-surface-container-low border border-outline-variant text-body-md rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  value={form.admin_name}
                  onChange={updateField("admin_name")}
                  required
                  placeholder="João Silva"
                  aria-describedby={error ? "form-error" : undefined}
                />
              </div>

              <div>
                <label htmlFor="admin-email" className="text-label-md font-label-md text-on-surface uppercase tracking-wider block mb-1">
                  Email do Administrador
                </label>
                <input
                  id="admin-email"
                  className="w-full h-12 px-4 bg-surface-container-low border border-outline-variant text-body-md rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  type="email"
                  value={form.admin_email}
                  onChange={(e) => setForm((f) => ({ ...f, admin_email: e.target.value }))}
                  required
                  placeholder="admin@exemplo.gov.br"
                  aria-describedby={error ? "form-error" : undefined}
                />
              </div>

              <div>
                <label htmlFor="admin-password" className="text-label-md font-label-md text-on-surface uppercase tracking-wider block mb-1">
                  Senha
                </label>
                <input
                  id="admin-password"
                  className="w-full h-12 px-4 bg-surface-container-low border border-outline-variant text-body-md rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  type="password"
                  value={form.admin_password}
                  onChange={(e) => setForm((f) => ({ ...f, admin_password: e.target.value }))}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  aria-describedby={error ? "form-error" : undefined}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-primary text-on-primary font-headline-sm rounded-lg hover:bg-primary-container transition-all active:scale-[0.98] shadow-md disabled:opacity-60"
              >
                {loading ? "Cadastrando..." : "Criar Conta"}
              </button>
            </form>

            <p className="text-center text-body-sm text-on-surface-variant mt-6">
              Já tem conta?{" "}
              <a
                href={`${process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.govsistem.com.br"}/login`}
                className="text-primary hover:underline"
              >
                Fazer login
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, LogOut } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { useAuth } from "@/lib/auth-provider";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { ctx, loading, noTenant, logout } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!loading) setChecked(true);
  }, [loading]);

  useEffect(() => {
    if (checked && !ctx && !noTenant) router.replace("/login");
  }, [checked, ctx, noTenant, router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-on-surface">
        Carregando...
      </div>
    );
  }

  if (noTenant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6" style={{ backgroundColor: "#002b54" }}>
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white">
          <Building2 size={28} />
        </span>
        <h1 className="mb-2 text-2xl font-semibold text-white">Sem organização vinculada</h1>
        <p className="mb-6 max-w-md text-center text-sm text-white/70">
          A sua conta não está vinculada a nenhum órgão ativo. Para acessar os módulos,
          entre em contato com o gestor do seu órgão para vincular seu acesso.
        </p>
        <button
          onClick={logout}
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
        >
          <LogOut size={16} /> Sair
        </button>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-on-surface">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      <div className="flex min-h-screen flex-col lg:ml-64" style={{ paddingTop: "3.5rem" }}>
        <main className="flex-1">
          <div className="mx-auto max-w-[1200px] px-gutter py-8">{children}</div>
        </main>
        <footer className="flex h-12 shrink-0 items-center justify-between border-t border-outline-variant bg-surface px-gutter text-xs text-on-surface-variant">
          <div>© {new Date().getFullYear()} GovSistem. Todos os direitos reservados.</div>
          <div className="flex items-center gap-6">
            <a className="transition-colors hover:text-tertiary" href="#">Termos de Uso</a>
            <a className="transition-colors hover:text-tertiary" href="#">Privacidade</a>
            <a className="transition-colors hover:text-tertiary" href="#">Ajuda</a>
          </div>
        </footer>
      </div>
    </div>
  );
}

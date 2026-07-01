"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Spinner from "@/components/ui/Spinner";

function AppLayoutInner({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const redirected = useRef(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user && pathname !== "/login" && !redirected.current) {
      redirected.current = true;
      router.replace("/login");
    }
  }, [loading, user, pathname, router]);

  // Fecha o menu lateral ao navegar (no celular o drawer some após clicar).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background"
      style={{ "--sidebar-width": "16rem", "--header-height": "3.5rem" } as React.CSSProperties}
    >
      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <Header title={title} onMenuClick={() => setMobileOpen(true)} />
      <div
        className="flex flex-col min-h-screen lg:ml-[var(--sidebar-width)]"
        style={{ paddingTop: "var(--header-height)" }}
      >
        <main className="flex-1">
          <div className="max-w-[1200px] mx-auto px-gutter py-stack-lg">
            {children}
          </div>
        </main>
        <footer className="h-12 bg-surface border-t border-outline-variant flex items-center justify-between px-gutter text-label-md text-on-surface-variant shrink-0">
          <div>© 2024 GovSistem. Todos os direitos reservados.</div>
          <div className="flex items-center gap-6">
            <a className="hover:text-[#001631] transition-colors" href="#">Termos de Uso</a>
            <a className="hover:text-[#001631] transition-colors" href="#">Privacidade</a>
            <a className="hover:text-[#001631] transition-colors" href="#">Ajuda</a>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function AppLayout({ children, title }: { children: React.ReactNode; title: string }) {
  return <AppLayoutInner title={title}>{children}</AppLayoutInner>;
}

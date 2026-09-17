"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/ui/Sidebar";
import { Topbar } from "@/components/ui/Topbar";
import { CommandPalette } from "@/components/CommandPalette";
import { homeDoPerfil, perfilDoUsuario } from "@/lib/perfil";
import { useRealtime } from "@/lib/realtime";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  // Mantém o stream aberto durante toda a sessão; um único EventSource por aba.
  useRealtime();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const conteudoRef = useRef<HTMLElement>(null);

  // Acessibilidade (§107, §201): ao trocar de tela, o foco vai para o conteúdo,
  // para que quem usa teclado ou leitor de tela não recomece do menu.
  useEffect(() => {
    if (pathname !== "/login" && user) conteudoRef.current?.focus();
  }, [pathname, user]);

  // Atalho global "N" abre a nova demanda (§219), exceto quando se está
  // digitando em um campo.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() !== "n") return;
      const alvo = e.target as HTMLElement | null;
      const tag = alvo?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || alvo?.isContentEditable) return;
      e.preventDefault();
      router.push("/demandas?nova=1");
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [router]);

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.push("/login");
      return;
    }
    // Cada perfil abre no painel que corresponde ao seu trabalho: quem não
    // coordena processos não precisa passar pelo dashboard de coordenação.
    if (!loading && user && pathname === "/") {
      const destino = homeDoPerfil(perfilDoUsuario(user.permissions ?? []));
      if (destino !== "/") router.replace(destino);
    }
  }, [loading, user, pathname, router]);

  if (pathname === "/login") return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-blue-700 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <Sidebar
        user={user}
        pathname={pathname}
        onLogout={logout}
        open={sidebarOpen}
        onClose={(open) => setSidebarOpen(open ?? false)}
      />
      <div className="min-h-screen lg:ml-64">
        <Topbar user={user} />
        <main id="conteudo" ref={conteudoRef} tabIndex={-1} className="p-8 focus:outline-none">
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}

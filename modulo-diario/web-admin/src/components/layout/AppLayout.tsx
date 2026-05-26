"use client";

import { useState, useEffect } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { getToken } from "@/lib/api";
import { cn } from "@/lib/utils";

const SAAS_FRONTEND_URL = process.env.NEXT_PUBLIC_SAAS_FRONTEND_URL || "http://localhost:9002";

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
}

function NoAccessScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-50">
          <BookOpen className="h-7 w-7 text-primary-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">Diario Oficial</h1>
        <p className="mt-1 text-sm text-gray-500">Modulo de Publicacao Eletronica</p>
        <p className="mt-6 text-sm text-gray-600">
          O login neste modulo e feito exclusivamente atraves do painel principal.
        </p>
        <a
          href={SAAS_FRONTEND_URL + "/login"}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Ir para o login
        </a>
      </div>
    </div>
  );
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    setHasToken(!!getToken());
  }, []);

  if (hasToken === null) {
    return <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600" />
    </div>;
  }
  if (!hasToken) return <NoAccessScreen />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((prev) => !prev)} />
      <div className={cn("transition-all duration-300", sidebarCollapsed ? "ml-16" : "ml-60")}>
        <Header title={title} onMenuClick={() => setSidebarCollapsed((prev) => !prev)} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

const PLATFORM_LOGIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_LOGIN_URL || "https://admin.govsistem.com.br/login";

export default function LoginPage() {
  const { user, loading } = useAuth();

  // Se tem token na URL, está tentando bootstrap via SSO — não redireciona
  useEffect(() => {
    if (!loading && !user) window.location.replace(PLATFORM_LOGIN_URL);
  }, [loading, user]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        <h1 className="text-lg font-semibold text-gray-900">Acessando Gestão de Recursos</h1>
        <p className="mt-1 text-sm text-gray-500">Redirecionando para o login seguro do GovSistem…</p>
      </div>
    </main>
  );
}

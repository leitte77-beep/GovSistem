"use client";

import { useAuth } from "@/lib/auth";

export function RequirePermission({
  perms,
  children,
}: {
  perms: string | string[];
  children: React.ReactNode;
}) {
  const { hasPermission, loading } = useAuth();
  if (loading) return null;
  const lista = Array.isArray(perms) ? perms : [perms];
  if (!lista.some((p) => hasPermission(p))) {
    return (
      <div className="rounded-card border border-surface-border bg-white p-8 text-center">
        <p className="text-body text-text-body">Você não tem permissão para acessar esta área.</p>
      </div>
    );
  }
  return <>{children}</>;
}

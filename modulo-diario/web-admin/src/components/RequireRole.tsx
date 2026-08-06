"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth-context";

export default function RequireRole({
  roles,
  children,
}: {
  roles: string[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const allowed = user?.roles?.some((r) => roles.includes(r.name)) ?? false;

  useEffect(() => {
    if (!loading && user && !allowed) {
      toast.error("Acesso restrito a administradores");
      router.replace("/");
    }
  }, [loading, user, allowed, router]);

  if (loading || !user || !allowed) return null;

  return <>{children}</>;
}

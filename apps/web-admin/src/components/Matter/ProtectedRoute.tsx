"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { SAAS_URL } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      window.location.replace(SAAS_URL);
    }
  }, [loading, user]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

"use client";

import { useEffect } from "react";
import { SAAS_URL } from "@/lib/api";

export default function LoginPage() {
  useEffect(() => {
    window.location.replace(SAAS_URL);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-body-md text-on-surface-variant">
        Redirecionando para o portal de acesso...
      </p>
    </div>
  );
}

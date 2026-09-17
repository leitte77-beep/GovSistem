"use client";

import { AuthProvider } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { RegistrarPwa } from "@/components/RegistrarPwa";
import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
      <Toaster position="top-right" />
      <RegistrarPwa />
    </AuthProvider>
  );
}

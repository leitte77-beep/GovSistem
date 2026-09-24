"use client";

import { AuthProvider } from "@/lib/auth";
import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toaster position="top-right" toastOptions={{ style: { fontSize: "14px" } }} />
    </AuthProvider>
  );
}

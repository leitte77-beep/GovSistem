import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-provider";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "GovSistem — Portal dos Órgãos",
  description: "Acesso aos módulos e administração do órgão.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

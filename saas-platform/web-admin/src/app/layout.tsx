import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/lib/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "GovSistem - Admin",
  description: "Plataforma GovSistem de Gestao de Modulos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}

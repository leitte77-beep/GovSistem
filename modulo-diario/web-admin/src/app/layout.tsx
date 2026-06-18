import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://doe-admin.govsistem.com.br"),
  title: "DOE Admin - Diário Oficial Eletrônico",
  description: "Painel de administração do Sistema de Diário Oficial Eletrônico",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-background text-on-surface antialiased">
        <AuthProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: { fontSize: "0.875rem" },
            }}
          />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

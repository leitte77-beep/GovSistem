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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-blue-700 focus:ring-2 focus:ring-blue-600"
        >
          Pular para o conteúdo
        </a>
        <AuthProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: { fontSize: "0.875rem" },
            }}
          />
          <div id="main-content" tabIndex={-1} className="outline-none">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}

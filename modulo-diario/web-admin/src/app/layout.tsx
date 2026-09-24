import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://doe-admin.govsistem.com.br"),
  title: "DOE Admin - Diário Oficial Eletrônico",
  description: "Painel de administração do Sistema de Diário Oficial Eletrônico",
};

export const viewport: Viewport = {
  themeColor: "#0B2440",
  width: "device-width",
  initialScale: 1,
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
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-on-primary"
        >
          Pular para o conteúdo
        </a>
        <AuthProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                fontSize: "0.875rem",
                borderRadius: "0.75rem",
                border: "1px solid #E4E7EC",
                background: "#FFFFFF",
                color: "#101828",
                boxShadow: "0 8px 24px rgba(16, 24, 40, 0.12)",
              },
              success: { iconTheme: { primary: "#0B8A54", secondary: "#FFFFFF" } },
              error: { iconTheme: { primary: "#D92D20", secondary: "#FFFFFF" } },
            }}
          />
          <div id="main-content" tabIndex={-1} className="outline-none">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}

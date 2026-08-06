import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import AccessibilityProvider from "@/components/AccessibilityProvider";
import { OrgProvider } from "@/lib/org-context";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://diario.govsistem.com.br"),
  title: "Diário Oficial Eletrônico | Portal de Consulta Pública",
  description:
    "Portal público do Sistema de Diário Oficial Eletrônico — consulte edições, busque matérias e verifique autenticidade.",
  openGraph: {
    title: "Diário Oficial Eletrônico",
    description:
      "Consulte edições, busque matérias e verifique a autenticidade dos documentos oficiais.",
    url: "https://diario.govsistem.com.br",
    siteName: "Diário Oficial Eletrônico",
    locale: "pt_BR",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-background text-on-surface antialiased min-h-screen flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
        >
          Pular para conteúdo principal
        </a>
        <AccessibilityProvider>
          <OrgProvider>
            <Navbar />
            <main id="main-content" role="main" className="flex-1">
              {children}
            </main>
            <Footer />
          </OrgProvider>
        </AccessibilityProvider>
      </body>
    </html>
  );
}

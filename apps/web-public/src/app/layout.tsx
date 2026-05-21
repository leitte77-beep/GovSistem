import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import AccessibilityProvider from "@/components/AccessibilityProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diário Oficial Eletrônico | Portal de Consulta Pública",
  description: "Portal público do Sistema de Diário Oficial Eletrônico — consulte edições, busque matérias e verifique autenticidade.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
      </head>
      <body className="bg-background text-on-surface antialiased min-h-screen flex flex-col">
        <AccessibilityProvider>
          <Navbar />
          <main className="flex-1">
            {children}
          </main>
          <Footer />
        </AccessibilityProvider>
      </body>
    </html>
  );
}

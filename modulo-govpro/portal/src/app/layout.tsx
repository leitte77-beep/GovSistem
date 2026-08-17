import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import { CitizenProvider } from "@/lib/citizen";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Processo Eletrônico - Portal do Cidadão",
  description: "Consulte processos, peticione e acompanhe seus requerimentos junto à administração pública.",
};

export const viewport: Viewport = {
  themeColor: "#001631",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="bg-background text-on-surface antialiased">
        <CitizenProvider>
          <Toaster
            position="top-right"
            toastOptions={{ duration: 3500, style: { fontSize: "0.875rem" } }}
          />
          <div className="min-h-screen flex flex-col">
            <PublicHeader />
            <main className="flex-1">{children}</main>
            <PublicFooter />
          </div>
        </CitizenProvider>
      </body>
    </html>
  );
}

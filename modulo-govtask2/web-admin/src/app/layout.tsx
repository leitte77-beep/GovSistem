import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";

import { Casca } from "@/components/casca/Casca";
import { LimparServiceWorker } from "@/components/LimparServiceWorker";
import { SessaoProvider } from "@/lib/sessao";
import { SetoresProvider } from "@/lib/setores";
import { SCRIPT_TEMA } from "@/lib/tema";
import { TempoRealProvider } from "@/lib/tempoReal";
import { display, mono, sans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "GovTask — Gabinete digital",
  description:
    "O Assessor encaminha, os departamentos devolvem e o Prefeito acompanha cada obra e aquisição em tempo real.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GovTask", statusBarStyle: "default" },
  icons: { icon: "/favicon.ico", apple: "/icone-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1521" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <LimparServiceWorker />
        <SessaoProvider>
          <SetoresProvider>
            <TempoRealProvider>
              <Casca>{children}</Casca>
            </TempoRealProvider>
          </SetoresProvider>
        </SessaoProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            className: "!bg-brand-900 !text-white !rounded-xl !text-sm !shadow-pop",
          }}
        />
      </body>
    </html>
  );
}

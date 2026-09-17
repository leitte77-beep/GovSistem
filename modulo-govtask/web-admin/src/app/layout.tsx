import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "GovTask - Gestão de Demandas",
  description: "Gestão estratégica de demandas, tarefas, projetos e acompanhamento governamental.",
  manifest: "/manifest.json",
  applicationName: "GovTask",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "GovTask" },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

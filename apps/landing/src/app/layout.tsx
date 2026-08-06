import type { Metadata, Viewport } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import "./globals.css";

const SITE_URL = "https://govsistem.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "GovSistem — Tecnologia para o Setor Público",
    template: "%s | GovSistem",
  },
  description:
    "Soluções inteligentes para gestão pública: ChatGov com atendimento por WhatsApp e Diário Oficial Eletrônico com assinatura digital ICP-Brasil.",
  keywords: [
    "govsistem",
    "chatgov",
    "diário oficial",
    "gestão pública",
    "whatsapp governo",
    "assinatura digital",
    "ICP-Brasil",
    "transparência",
  ],
  authors: [{ name: "GovSistem" }],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "GovSistem — Tecnologia para o Setor Público",
    description:
      "Soluções inteligentes para gestão pública: ChatGov e Diário Oficial Eletrônico.",
    url: SITE_URL,
    siteName: "GovSistem",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GovSistem — Tecnologia para o Setor Público",
    description:
      "Soluções inteligentes para gestão pública: ChatGov e Diário Oficial Eletrônico.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "GovSistem",
  url: SITE_URL,
  description:
    "Plataforma SaaS para o setor público com ChatGov (atendimento via WhatsApp) e Diário Oficial Eletrônico com assinatura digital ICP-Brasil.",
  email: "contato@govsistem.com.br",
  areaServed: "BR",
  knowsAbout: [
    "Atendimento ao cidadão",
    "Diário Oficial Eletrônico",
    "Assinatura digital ICP-Brasil",
    "LGPD",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="bg-background text-on-surface antialiased min-h-screen flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-primary-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-600"
        >
          Pular para conteúdo principal
        </a>
        <Navbar />
        <main id="main-content" role="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}

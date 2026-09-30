import type { Metadata, Viewport } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "GovFrota Motorista",
  description: "Abastecimentos e ocorrências de veículos — GovFrota Motorista.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GovFrota Motorista",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  // O Chrome considera obsoleta a meta só da Apple (appleWebApp.capable).
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#1D4ED8",
};

export default function MotoristaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Script id="pwa-register" strategy="afterInteractive">
        {`if ('serviceWorker' in navigator) {
          window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js').catch(function () {});
          });
        }`}
      </Script>
    </>
  );
}

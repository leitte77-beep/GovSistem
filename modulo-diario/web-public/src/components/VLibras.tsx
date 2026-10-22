"use client";

import Script from "next/script";

declare global {
  interface Window {
    VLibras?: { Widget: new (url: string) => unknown };
  }
}

/**
 * Tradutor de Libras do governo federal (VLibras), recomendado pelo eMAG.
 * Marcação copiada do snippet oficial; o widget procura estes atributos `vw`.
 */
export default function VLibras() {
  return (
    <>
      {/* @ts-expect-error atributos customizados exigidos pelo widget */}
      <div vw="" className="enabled no-print">
        <div vw-access-button="" className="active" />
        <div vw-plugin-wrapper="">
          <div className="vw-plugin-top-wrapper" />
        </div>
      </div>
      <Script
        src="https://vlibras.gov.br/app/vlibras-plugin.js"
        strategy="lazyOnload"
        onLoad={() => {
          if (window.VLibras) new window.VLibras.Widget("https://vlibras.gov.br/app");
        }}
      />
    </>
  );
}

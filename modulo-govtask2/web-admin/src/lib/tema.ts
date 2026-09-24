"use client";

/** Tema claro/escuro. A escolha fica no aparelho; sem escolha, segue o sistema. */

import { useEffect, useState } from "react";

export type Tema = "light" | "dark";
const CHAVE = "govtask_tema";

/**
 * Script que roda antes da pintura para não piscar o tema errado. Na
 * impressão (e no "salvar como PDF") força o tema claro.
 */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CHAVE}");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t);var a;window.addEventListener("beforeprint",function(){a=document.documentElement.getAttribute("data-theme");document.documentElement.setAttribute("data-theme","light")});window.addEventListener("afterprint",function(){if(a)document.documentElement.setAttribute("data-theme",a)})}catch(e){}})();`;

export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>("light");

  useEffect(() => {
    const atual = document.documentElement.getAttribute("data-theme");
    setTema(atual === "dark" ? "dark" : "light");
  }, []);

  function alternar() {
    const novo: Tema = tema === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      /* navegação privada: vale só nesta aba */
    }
    setTema(novo);
  }

  return [tema, alternar];
}

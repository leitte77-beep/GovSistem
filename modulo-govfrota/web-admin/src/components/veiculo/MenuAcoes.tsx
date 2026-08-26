"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export interface MenuAcao {
  key: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  cor?: "default" | "danger";
}

const MARGEM = 8;

/**
 * Menu de ações (⋮/⋯) renderizado via Portal em document.body.
 *
 * Isso o torna imune a `overflow`/`overflow-x-auto`/`overflow-hidden` dos
 * containers da tabela e do card — o menu nunca é cortado. O posicionamento é
 * calculado via getBoundingClientRect, detectando espaço disponível para abrir
 * para cima ou para baixo e alinhando à direita (evita sair da viewport).
 */
export function MenuAcoes({ acoes }: { acoes: MenuAcao[] }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const medir = useCallback(() => {
    const botao = botaoRef.current;
    const menu = menuRef.current;
    if (!botao || !menu) return;
    const rect = botao.getBoundingClientRect();
    const menuH = menu.offsetHeight;
    const menuW = menu.offsetWidth;

    // Vertical: abre para baixo; se não couber, abre para cima.
    let top: number;
    const espacoAbaixo = window.innerHeight - rect.bottom - MARGEM;
    const espacoAcima = rect.top - MARGEM;
    if (menuH > espacoAbaixo && menuH <= espacoAcima) {
      top = rect.top - menuH - 4;
    } else {
      top = rect.bottom + 4;
    }

    // Horizontal: alinha à direita (end) e mantém dentro da viewport.
    let left = rect.right - menuW;
    if (left < MARGEM) left = MARGEM;
    if (left + menuW > window.innerWidth - MARGEM) left = window.innerWidth - menuW - MARGEM;

    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (aberto) medir();
  }, [aberto, medir]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const reposicionar = () => medir();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposicionar, true);
      window.removeEventListener("resize", reposicionar);
    };
  }, [aberto, medir]);

  // Navegação por teclado dentro do menu (setas / Home / End / Tab).
  function navegarTeclado(e: React.KeyboardEvent) {
    const itens = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (itens.length === 0) return;
    const idx = itens.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      itens[(idx + 1) % itens.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itens[(idx - 1 + itens.length) % itens.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      itens[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itens[itens.length - 1].focus();
    }
  }

  const classeItem = (cor?: string) =>
    `flex w-full items-center gap-2 px-3 py-2 text-body-sm text-left hover:bg-surface-bg ${
      cor === "danger" ? "text-[#B42318]" : "text-text-body"
    }`;

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Ações"
        className="btn btn-ghost btn-sm px-2"
        onClick={() => setAberto((a) => !a)}
      >
        <MoreHorizontal size={18} />
      </button>

      {aberto &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Overlay: fecha ao clicar fora */}
            <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
            <div
              ref={menuRef}
              role="menu"
              aria-label="Ações do veículo"
              onKeyDown={navegarTeclado}
              style={{
                position: "fixed",
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                visibility: pos ? "visible" : "hidden",
              }}
              className="z-50 w-56 rounded-card border border-surface-border bg-white py-1 shadow-elevated"
            >
              {acoes.map((a) =>
                a.href ? (
                  <Link
                    key={a.key}
                    href={a.href}
                    role="menuitem"
                    className={classeItem(a.cor)}
                    onClick={() => setAberto(false)}
                  >
                    {a.icon} {a.label}
                  </Link>
                ) : (
                  <button
                    key={a.key}
                    type="button"
                    role="menuitem"
                    className={classeItem(a.cor)}
                    onClick={() => {
                      setAberto(false);
                      a.onClick?.();
                    }}
                  >
                    {a.icon} {a.label}
                  </button>
                )
              )}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

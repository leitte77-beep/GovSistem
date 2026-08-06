import { useCallback, useEffect, useRef } from "react";

/**
 * Prende o foco dentro do container enquanto aberto, restaura ao fechar e
 * trata Tab/Shift+Tab e Esc. Usado por Modal e SlideOver (§5 acessibilidade).
 */
export function usePrenderFoco(
  aberto: boolean,
  aoFechar: () => void,
): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  const anteriormenteFocado = useRef<HTMLElement | null>(null);

  const focaveis = useCallback((): HTMLElement[] => {
    if (!ref.current) return [];
    return Array.from(
      ref.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    anteriormenteFocado.current = document.activeElement as HTMLElement | null;

    // Foca o primeiro elemento focável ou o container.
    const t = window.setTimeout(() => {
      const alvos = focaveis();
      (alvos[0] ?? ref.current)?.focus();
    }, 0);

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        aoFechar();
        return;
      }
      if (e.key !== "Tab") return;
      const alvos = focaveis();
      if (alvos.length === 0) {
        e.preventDefault();
        return;
      }
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      const ativo = document.activeElement as HTMLElement;
      if (e.shiftKey && ativo === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", aoTeclar, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", aoTeclar, true);
      anteriormenteFocado.current?.focus?.();
    };
  }, [aberto, aoFechar, focaveis]);

  return ref;
}

import { useEffect, useRef } from 'react';

const SELETOR_FOCAVEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Diálogos podem abrir outros diálogos. Só o que está no topo deve reagir a
// Tab/Escape; os anteriores mantêm seu acionador para restaurar depois.
const pilhaDeModais = [];

function elementosFocaveis(container) {
  return Array.from(container.querySelectorAll(SELETOR_FOCAVEL)).filter((elemento) =>
    elemento.getAttribute('aria-hidden') !== 'true' && elemento.getClientRects().length > 0
  );
}

/** Mantém o foco dentro do diálogo e o devolve ao acionador quando ele fecha. */
export function useModalFocus(dialogRef, onClose, initialFocusRef, focusKey, enabled = true) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return undefined;
    const focoAnterior = document.activeElement;
    pilhaDeModais.push(dialogRef);
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const alvo = initialFocusRef?.current || elementosFocaveis(dialog)[0] || dialog;
      alvo.focus({ preventScroll: true });
    });

    const onKeyDown = (evento) => {
      if (pilhaDeModais[pilhaDeModais.length - 1] !== dialogRef) return;
      if (evento.key === 'Escape') {
        evento.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (evento.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focaveis = elementosFocaveis(dialog);
      if (focaveis.length === 0) {
        evento.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && (document.activeElement === primeiro || !dialog.contains(document.activeElement))) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (document.activeElement === ultimo || !dialog.contains(document.activeElement))) {
        evento.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      const indice = pilhaDeModais.lastIndexOf(dialogRef);
      if (indice >= 0) pilhaDeModais.splice(indice, 1);
      if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected) {
        focoAnterior.focus({ preventScroll: true });
      }
    };
  }, [dialogRef, initialFocusRef, enabled]);

  // Alguns fluxos substituem o conteúdo do diálogo (carregando → formulário
  // → sucesso) sem desmontar o componente. Cada tela nova também recebe foco.
  useEffect(() => {
    if (!enabled || focusKey === undefined) return undefined;
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      (initialFocusRef?.current || elementosFocaveis(dialog)[0] || dialog).focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [dialogRef, initialFocusRef, focusKey, enabled]);
}

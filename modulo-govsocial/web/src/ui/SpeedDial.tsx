import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";

type SpeedDialAction = {
  id: string;
  label: string;
  icon: string;
  to: string;
  permission?: boolean;
};

type SpeedDialProps = {
  actions: SpeedDialAction[];
  ariaLabel?: string;
};

export function SpeedDial({ actions, ariaLabel }: SpeedDialProps) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  const visiveis = actions.filter((a) => a.permission !== false);

  const fechar = useCallback(() => {
    setAberto(false);
  }, []);

  useEffect(() => {
    if (aberto) {
      const t = setTimeout(() => {
        const primeiro =
          containerRef.current?.querySelector<HTMLAnchorElement>("a[href]");
        primeiro?.focus();
      }, 60);
      return () => clearTimeout(t);
    }
    fabRef.current?.focus();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        fechar();
        return;
      }

      if (e.key !== "Tab") return;

      const focaveis = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

      if (focaveis.length === 0) {
        e.preventDefault();
        return;
      }

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];

      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, fechar]);

  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        fechar();
      }
    }

    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto, fechar]);

  if (visiveis.length === 0) return null;

  return (
    <>
      <style>{`@keyframes sd-fade-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div
        ref={containerRef}
        className="nao-imprimir fixed bottom-24 right-6 z-50 flex flex-col items-end"
      >
        {aberto && (
          <div className="flex flex-col items-end gap-3 mb-4">
            {visiveis.map((acao, i) => (
              <Link
                key={acao.id}
                to={acao.to}
                className={clsx(
                  "flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-surface shadow-lg",
                  "border border-outline-variant/30",
                  "hover:bg-surface-container-lowest hover:border-primary/40",
                  "focus-visible:outline-focus",
                  "transition-[background-color,border-color] duration-200",
                )}
                style={{
                  animation: `sd-fade-up 200ms ${i * 60}ms ease-out forwards`,
                  opacity: 0,
                }}
                onClick={fechar}
              >
                <span className="font-label-md text-ink whitespace-nowrap">
                  {acao.label}
                </span>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined !text-[20px]">
                    {acao.icon}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <button
          ref={fabRef}
          type="button"
          onClick={() => setAberto((v) => !v)}
          className={clsx(
            "w-16 h-16 gradient-primary text-on-primary rounded-2xl",
            "shadow-2xl shadow-primary/40 flex items-center justify-center",
            "hover:scale-110 active:scale-95",
            "transition-all duration-300",
            "focus-visible:outline-focus",
          )}
          aria-expanded={aberto}
          aria-label={
            aberto ? (ariaLabel ?? "Fechar menu") : (ariaLabel ?? "Ações rápidas")
          }
        >
          <span
            className={clsx(
              "material-symbols-outlined !text-[32px] select-none",
              "transition-transform duration-300",
            )}
            style={aberto ? { transform: "rotate(45deg)" } : undefined}
          >
            add
          </span>
        </button>
      </div>
    </>
  );
}

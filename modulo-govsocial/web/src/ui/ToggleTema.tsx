import { useTema } from "@/tema/ThemeProvider";
import { Sun, Moon } from "lucide-react";

export function ToggleTema() {
  const { modo, resolvido, alternar } = useTema();

  const ehEscuro = resolvido === "escuro";

  const rotuloModo: Record<string, string> = {
    claro: "claro",
    escuro: "escuro",
    sistema: "automático",
  };

  const ariaLabel = `Tema: ${rotuloModo[modo] ?? modo}. Ativar tema ${ehEscuro ? "claro" : "escuro"}`;

  return (
    <button
      onClick={alternar}
      aria-pressed={ehEscuro}
      aria-label={ariaLabel}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-soft hover:bg-surface-container motion-safe:transition-colors focus-visible:outline-focus"
    >
      {ehEscuro ? (
        <Moon aria-hidden className="h-4 w-4" />
      ) : (
        <Sun aria-hidden className="h-4 w-4" />
      )}
      <span className="hidden md:inline text-xs">
        {ehEscuro ? "Escuro" : "Claro"}
      </span>
    </button>
  );
}

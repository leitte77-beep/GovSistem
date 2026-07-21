import { useTema } from "@/tema/ThemeProvider";
import { Sun, Moon, Monitor } from "lucide-react";

const ICONES: Record<string, typeof Sun> = {
  claro: Sun,
  escuro: Moon,
  sistema: Monitor,
};

const ROTULOS: Record<string, string> = {
  claro: "Tema claro",
  escuro: "Tema escuro",
  sistema: "Automático (sistema)",
};

export function ToggleTema() {
  const { modo, alternar } = useTema();
  const Icone = ICONES[modo] || Monitor;

  return (
    <button
      onClick={alternar}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-soft hover:bg-surface-container transition-colors"
      title={ROTULOS[modo]}
      aria-label={`Tema atual: ${ROTULOS[modo]}. Clique para alternar.`}
    >
      <Icone className="h-4 w-4" />
      <span className="hidden md:inline text-xs">{ROTULOS[modo]}</span>
    </button>
  );
}

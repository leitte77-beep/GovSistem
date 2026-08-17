import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type TemaModo = "claro" | "escuro" | "sistema";

interface ThemeContextValue {
  modo: TemaModo;
  resolvido: "claro" | "escuro";
  definirModo: (modo: TemaModo) => void;
  alternar: () => void;
}

const STORAGE_KEY = "govsocial-tema";
const DARK_CLASS = "escuro";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveSystemPreference(): "claro" | "escuro" {
  if (typeof window === "undefined") return "claro";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

function applyTheme(resolved: "claro" | "escuro") {
  const root = document.documentElement;
  root.setAttribute("data-tema", resolved);
  if (resolved === "escuro") {
    root.classList.add(DARK_CLASS);
  } else {
    root.classList.remove(DARK_CLASS);
  }
}

function loadStoredMode(): TemaModo {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "claro" || stored === "escuro" || stored === "sistema") return stored;
  } catch {
    // localStorage indisponível, usar default
  }
  return "sistema";
}

function resolveMode(modo: TemaModo): "claro" | "escuro" {
  if (modo === "sistema") return resolveSystemPreference();
  return modo;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [modo, setModoState] = useState<TemaModo>(loadStoredMode);

  const resolvido = resolveMode(modo);

  useEffect(() => {
    applyTheme(resolvido);
  }, [resolvido]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (modo === "sistema") {
        applyTheme(resolveMode("sistema"));
        setModoState("sistema");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [modo]);

  const definirModo = useCallback((novoModo: TemaModo) => {
    setModoState(novoModo);
    try { localStorage.setItem(STORAGE_KEY, novoModo); } catch {
      // localStorage indisponível
    }
    applyTheme(resolveMode(novoModo));
  }, []);

  const alternar = useCallback(() => {
    const ciclo: TemaModo[] = ["claro", "escuro", "sistema"];
    const idx = ciclo.indexOf(modo);
    definirModo(ciclo[(idx + 1) % ciclo.length]);
  }, [modo, definirModo]);

  return (
    <ThemeContext.Provider value={{ modo, resolvido, definirModo, alternar }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTema() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTema deve ser usado dentro de ThemeProvider");
  return ctx;
}

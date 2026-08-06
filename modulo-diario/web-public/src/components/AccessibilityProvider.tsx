"use client";

import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";

type FontSize = "normal" | "large" | "xlarge";

type AccessibilityState = {
  fontSize: FontSize;
  highContrast: boolean;
  grayscale: boolean;
  invertColors: boolean;
  highlightLinks: boolean;
  textSpacing: boolean;
  stopAnimations: boolean;
};

type AccessibilityContextType = AccessibilityState & {
  setFontSize: (size: FontSize) => void;
  toggleHighContrast: () => void;
  toggleGrayscale: () => void;
  toggleInvertColors: () => void;
  toggleHighlightLinks: () => void;
  toggleTextSpacing: () => void;
  toggleStopAnimations: () => void;
  resetAll: () => void;
};

const STORAGE_KEY = "doe-accessibility";

function loadState(): AccessibilityState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState, ...JSON.parse(raw) };
  } catch {}
  return defaultState;
}

function saveState(state: AccessibilityState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const defaultState: AccessibilityState = {
  fontSize: "normal",
  highContrast: false,
  grayscale: false,
  invertColors: false,
  highlightLinks: false,
  textSpacing: false,
  stopAnimations: false,
};

const AccessibilityContext = createContext<AccessibilityContextType | null>(null);

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility must be used within AccessibilityProvider");
  return ctx;
}

function applyClasses(state: AccessibilityState) {
  const root = document.documentElement;
  root.classList.remove(
    "a11y-font-large", "a11y-font-xlarge",
    "a11y-high-contrast", "a11y-grayscale",
    "a11y-invert-colors", "a11y-highlight-links",
    "a11y-text-spacing", "a11y-stop-animations",
  );
  if (state.fontSize === "large") root.classList.add("a11y-font-large");
  if (state.fontSize === "xlarge") root.classList.add("a11y-font-xlarge");
  if (state.highContrast) root.classList.add("a11y-high-contrast");
  if (state.grayscale) root.classList.add("a11y-grayscale");
  if (state.invertColors) root.classList.add("a11y-invert-colors");
  if (state.highlightLinks) root.classList.add("a11y-highlight-links");
  if (state.textSpacing) root.classList.add("a11y-text-spacing");
  if (state.stopAnimations) root.classList.add("a11y-stop-animations");
}

export default function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessibilityState>(defaultState);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = loadState();
    setState(initial);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      applyClasses(state);
      saveState(state);
    }
  }, [state, mounted]);

  const update = useCallback((partial: Partial<AccessibilityState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const value: AccessibilityContextType = {
    ...state,
    setFontSize: (fontSize: FontSize) => update({ fontSize }),
    toggleHighContrast: () => update({ highContrast: !state.highContrast }),
    toggleGrayscale: () => update({ grayscale: !state.grayscale }),
    toggleInvertColors: () => update({ invertColors: !state.invertColors }),
    toggleHighlightLinks: () => update({ highlightLinks: !state.highlightLinks }),
    toggleTextSpacing: () => update({ textSpacing: !state.textSpacing }),
    toggleStopAnimations: () => update({ stopAnimations: !state.stopAnimations }),
    resetAll: () => setState(defaultState),
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

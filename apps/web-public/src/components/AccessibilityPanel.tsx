"use client";

import { useAccessibility } from "./AccessibilityProvider";
import { useState } from "react";

type Tool = {
  key: string;
  icon: string;
  label: string;
  active: boolean;
  toggle: () => void;
  type?: "toggle" | "cycle";
};

export default function AccessibilityPanel() {
  const a11y = useAccessibility();
  const [open, setOpen] = useState(false);

  const fontIcon =
    a11y.fontSize === "normal"
      ? "text_fields"
      : a11y.fontSize === "large"
        ? "text_increase"
        : "format_size";

  const fontLabel =
    a11y.fontSize === "normal"
      ? "Fonte normal"
      : a11y.fontSize === "large"
        ? "Fonte grande"
        : "Fonte extra grande";

  const tools: Tool[] = [
    {
      key: "font",
      icon: fontIcon,
      label: fontLabel,
      active: a11y.fontSize !== "normal",
      toggle: () => {
        const next =
          a11y.fontSize === "normal"
            ? "large"
            : a11y.fontSize === "large"
              ? "xlarge"
              : "normal";
        a11y.setFontSize(next);
      },
      type: "cycle",
    },
    {
      key: "contrast",
      icon: "contrast",
      label: "Alto Contraste",
      active: a11y.highContrast,
      toggle: a11y.toggleHighContrast,
    },
    {
      key: "grayscale",
      icon: "blur_on",
      label: "Escala de Cinza",
      active: a11y.grayscale,
      toggle: a11y.toggleGrayscale,
    },
    {
      key: "invert",
      icon: "invert_colors",
      label: "Inverter Cores",
      active: a11y.invertColors,
      toggle: a11y.toggleInvertColors,
    },
    {
      key: "links",
      icon: "link",
      label: "Destacar Links",
      active: a11y.highlightLinks,
      toggle: a11y.toggleHighlightLinks,
    },
    {
      key: "spacing",
      icon: "line_weight",
      label: "Espaçamento",
      active: a11y.textSpacing,
      toggle: a11y.toggleTextSpacing,
    },
    {
      key: "animations",
      icon: "motion_photos_off",
      label: "Parar Animações",
      active: a11y.stopAnimations,
      toggle: a11y.toggleStopAnimations,
    },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200 rounded-full"
        aria-label="Acessibilidade"
        title="Acessibilidade"
      >
        <span className="material-symbols-outlined">accessibility_new</span>
        {tools.some((t) => t.active) && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-secondary rounded-full" />
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="fixed right-4 top-24 z-50 w-72 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl p-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-headline-sm font-headline-sm text-primary">
                Acessibilidade
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-on-surface-variant hover:text-primary rounded-full"
                aria-label="Fechar"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-2">
              {tools.map((tool) => (
                <button
                  key={tool.key}
                  onClick={tool.toggle}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                    tool.active
                      ? "bg-primary-container text-on-primary-container"
                      : "hover:bg-surface-container-low text-on-surface-variant"
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">
                    {tool.icon}
                  </span>
                  <span className="text-label-md font-label-md flex-1">
                    {tool.label}
                  </span>
                  {tool.type !== "cycle" && (
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        tool.active
                          ? "border-primary bg-primary"
                          : "border-outline"
                      }`}
                    >
                      {tool.active && (
                        <span className="material-symbols-outlined text-on-primary text-sm">
                          check
                        </span>
                      )}
                    </span>
                  )}
                  {tool.type === "cycle" && (
                    <span className="text-label-md font-label-md text-outline">
                      {a11y.fontSize === "normal"
                        ? "100%"
                        : a11y.fontSize === "large"
                          ? "150%"
                          : "200%"}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                a11y.resetAll();
              }}
              className="w-full mt-4 py-2.5 border border-outline-variant rounded-lg text-label-md font-label-md text-on-surface-variant hover:bg-surface-container-low transition-all"
            >
              Resetar todas as opções
            </button>
          </div>
        </>
      )}
    </>
  );
}

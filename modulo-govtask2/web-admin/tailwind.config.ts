import type { Config } from "tailwindcss";

/**
 * Tokens visuais do GovTask.
 *
 * Paleta "mesa de despacho": verde-pinho como marca e ação, latão para a
 * fase que está na sua mão, neutros frios no fundo. Estados são nomeados
 * pelo significado, nunca pela cor literal.
 */
/** Cor como token: o valor vive em globals.css e muda com o tema. */
const v = (nome: string) => `rgb(var(--c-${nome}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        paper: v("paper"),
        elevated: v("elevated"),
        // Dourado claro para texto sobre a faixa verde: igual nos dois temas.
        ouro: v("ouro"),
        line: { DEFAULT: v("line"), strong: v("line-strong") },
        ink: {
          DEFAULT: v("ink"),
          soft: v("ink-soft"),
          muted: v("ink-muted"),
          faint: v("ink-faint"),
        },
        brand: {
          DEFAULT: v("brand"),
          50: v("brand-50"),
          100: v("brand-100"),
          200: v("brand-200"),
          600: v("brand-600"),
          700: v("brand-700"),
          800: v("brand-800"),
          900: v("brand-900"),
        },
        brass: {
          DEFAULT: v("brass"),
          50: v("brass-50"),
          100: v("brass-100"),
          600: v("brass-600"),
          700: v("brass-700"),
        },
        estado: {
          andamento: v("andamento"),
          externo: v("externo"),
          concluido: v("concluido"),
          atrasado: v("atrasado"),
          cancelado: v("cancelado"),
          info: v("info"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "16px",
        btn: "10px",
        field: "10px",
        pill: "999px",
      },
      boxShadow: {
        card: "var(--sombra-card)",
        pop: "var(--sombra-pop)",
        brilho: "0 0 0 4px rgb(var(--c-brand) / .12)",
        rail: "inset 0 0 0 1px rgba(255,255,255,.06)",
      },
      // Alguns tons de transparência fora da escala padrão, para nuances
      // finas de foco e trilha.
      opacity: { 8: "0.08", 15: "0.15", 35: "0.35", 45: "0.45" },
      keyframes: {
        "fade-subir": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulsar: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".45", transform: "scale(.85)" },
        },
        brilhar: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
        "entrar-baixo": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-subir": "fade-subir .35s ease-out both",
        pulsar: "pulsar 1.8s ease-in-out infinite",
        brilhar: "brilhar 1.6s linear infinite",
        "entrar-baixo": "entrar-baixo .25s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1D5BD6",
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D5BD6",
          800: "#1E40AF",
          900: "#1E3A8A",
        },
        navy: {
          DEFAULT: "#0E1B2E",
          light: "#16263E",
          muted: "#C7D0DC",
        },
        surface: {
          bg: "#F8F9FF",
          card: "#FFFFFF",
          border: "#E4E7EC",
          dim: "#CBDbF5",
          bright: "#F8F9FF",
          "container-lowest": "#FFFFFF",
          "container-low": "#EFF4FF",
          container: "#E3ECFF",
          "container-high": "#D7E4FB",
          "container-highest": "#CBDbF5",
          "on-surface": "#181C22",
          "on-surface-variant": "#424750",
        },
        text: {
          title: "#181C22",
          body: "#424750",
          subtle: "#737781",
        },
        outline: {
          DEFAULT: "#737781",
          variant: "#C3C6D1",
        },
        "on-primary": "#FFFFFF",
        "primary-container": "#D9E2FF",
        "on-primary-container": "#001944",
        secondary: {
          DEFAULT: "#555F71",
          container: "#D9E3F8",
          "on-container": "#121C2B",
        },
        "on-secondary": "#FFFFFF",
        success: {
          DEFAULT: "#106D34",
          container: "#9DF6B3",
          "on-container": "#00210B",
        },
        "on-success": "#FFFFFF",
        warning: {
          DEFAULT: "#805600",
          container: "#FFDD9A",
          "on-container": "#291800",
        },
        "on-warning": "#FFFFFF",
        error: {
          DEFAULT: "#BA1A1A",
          container: "#FFDAD6",
          "on-container": "#410002",
        },
        "on-error": "#FFFFFF",
        sidebar: "#151E2F",
        status: {
          rascunho: "#667085",
          andamento: "#1D5BD6",
          aguardando: "#805600",
          concluido: "#106D34",
          atrasado: "#BA1A1A",
          suspenso: "#424750",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "h1": ["30px", { lineHeight: "38px", fontWeight: "600" }],
        "h2": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "h3": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "body": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "meta": ["12px", { lineHeight: "16px", fontWeight: "400" }],
        "label": ["14px", { lineHeight: "20px", fontWeight: "500" }],
      },
      borderRadius: {
        card: "8px",
        btn: "8px",
        pill: "999px",
      },
      boxShadow: {
        card: "0px 1px 2px 0px rgba(0, 0, 0, 0.05), 0px 1px 3px 0px rgba(0, 0, 0, 0.10)",
        elevated: "0px 4px 12px rgba(0, 0, 0, 0.12)",
      },
      spacing: {
        "4.5": "1.125rem",
        "18": "4.5rem",
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a" },
        tertiary: "#001633",
        "on-surface-variant": "#43474f",
        outline: "#73777f",
        "on-surface": "#191c1e",
        "outline-variant": "#c3c6d0",
        "primary-container": "#002b54",
        background: "#f7f9fb",
        "on-background": "#191c1e",
        "surface-container-low": "#f2f4f6",
        "surface-container-lowest": "#ffffff",
        "surface-container": "#eceef0",
        "surface-container-high": "#e6e8ea",
        "surface-container-highest": "#e0e3e5",
        "on-primary": "#ffffff",
        sidebar: { DEFAULT: "#002b54", hover: "#1e293b", active: "#1e3a8a" },
        gov: {
          navy: "#0f2447",
          blue: "#004ac6",
          sky: "#eef4ff",
          ink: "#1a2033",
          muted: "#737686",
        },
      },
      borderRadius: {
        lg: "0.25rem",
        xl: "0.5rem",
      },
      spacing: {
        gutter: "1.5rem",
        "stack-lg": "3rem",
        "container-max": "1200px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "body-sm": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
        "headline-sm": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
      },
    },
  },
  plugins: [],
};
export default config;

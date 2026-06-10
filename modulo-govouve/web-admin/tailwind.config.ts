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
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
        },
        surface: {
          bg: "#F6F7F9",
          card: "#FFFFFF",
          border: "#E4E7EC",
        },
        text: {
          title: "#101828",
          body: "#475467",
          subtle: "#98A2B3",
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
        card: "10px",
        btn: "8px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.06)",
        elevated: "0 4px 12px rgba(16, 24, 40, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;

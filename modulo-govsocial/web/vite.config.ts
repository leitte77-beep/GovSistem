import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Prefixo de rota. Embutido na shell do GovSocial: "/assistencia-social/".
  // Standalone (subdomínio próprio): "/". Configurável por VITE_BASE_PATH.
  const BASE = env.VITE_BASE_PATH || "/assistencia-social/";

  return {
    base: BASE,
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 7401,
      // Em dev sem MSW, encaminha /api para a API real do módulo.
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
    build: {
      // Orçamento de bundle inicial ≤ 250 KB gzip: split por rota + vendor.
      chunkSizeWarningLimit: 260,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            query: ["@tanstack/react-query"],
          },
        },
      },
    },
  };
});

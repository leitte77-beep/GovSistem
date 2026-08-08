import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

/**
 * Gera `dist/build-info.json` no fim do build (sem segredos):
 * commit, árvore limpa/suja, versão do package.json, horário UTC,
 * hash do lockfile e hash do openapi — vincula o artefato ao fonte.
 */
function buildInfo(env: Record<string, string>): Plugin {
  return {
    name: "govsocial-build-info",
    apply: "build",
    closeBundle() {
      const sha = (caminho: string): string | null => {
        if (!existsSync(caminho)) return null;
        return createHash("sha256").update(readFileSync(caminho)).digest("hex").slice(0, 16);
      };
      // O CI pode injetar o commit via env (VITE_GIT_COMMIT/VITE_GIT_DIRTY);
      // localmente tenta ler do git. Sem git (ex.: build dentro do Docker),
      // fica "desconhecido" — o CI é quem vincula artefato ao fonte.
      let commit = env.VITE_GIT_COMMIT ?? "desconhecido";
      let dirty = env.VITE_GIT_DIRTY === "true";
      if (!env.VITE_GIT_COMMIT) {
        try {
          commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
          dirty =
            execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] })
              .toString()
              .trim()
              .length > 0;
        } catch {
          // Sem repositório git no ambiente de build — mantém "desconhecido".
        }
      }
      let versao = "0.0.0";
      try {
        versao = JSON.parse(readFileSync("package.json", "utf8")).version ?? versao;
      } catch {
        // package.json ausente — mantém o default.
      }
      const info = {
        commit,
        dirty,
        versao,
        build_utc: new Date().toISOString(),
        hash_lockfile: sha("package-lock.json"),
      };
      mkdirSync("dist", { recursive: true });
      writeFileSync("dist/build-info.json", JSON.stringify(info, null, 2) + "\n");
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Prefixo de rota. Embutido na shell do GovSocial: "/assistencia-social/".
  // Standalone (subdomínio próprio): "/". Configurável por VITE_BASE_PATH.
  const BASE = env.VITE_BASE_PATH || "/assistencia-social/";

  return {
    base: BASE,
    plugins: [react(), buildInfo(env)],
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

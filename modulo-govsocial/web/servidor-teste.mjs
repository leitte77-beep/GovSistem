import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const RAIZ = new URL("./dist/", import.meta.url).pathname;
const PORTA = Number(process.env.GOVSOCIAL_E2E_URL?.match(/:(\d+)/)?.[1]) || 4174;
const TIPOS = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

http
  .createServer(async (req, res) => {
    try {
      let caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
      // espelha o alias do nginx de produção: /assets/v3/* e /assets/v2/* servem o MESMO /assets/*
      if (caminho.startsWith("/assets/v3/") || caminho.startsWith("/assets/v2/")) caminho = "/assets/" + caminho.split("/").slice(3).join("/");
      const alvo = path.normalize(path.join(RAIZ, caminho));
      let info;
      try {
        info = await stat(alvo);
      } catch {
        info = null;
      }
      if (info && info.isFile()) {
        const corpo = await readFile(alvo);
        res.writeHead(200, { "Content-Type": TIPOS[path.extname(alvo)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
        res.end(corpo);
        return;
      }
      // fallback SPA (try_files ... /index.html)
      const idx = await readFile(path.join(RAIZ, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(idx);
    } catch (erro) {
      res.writeHead(500);
      res.end(String(erro));
    }
  })
  .listen(PORTA, "127.0.0.1", () => console.log(`servidor de teste em http://127.0.0.1:${PORTA}`));

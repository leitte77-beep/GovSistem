import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// A URL da API nunca fica fixada no código: vem de VITE_GOVINFRA_API_URL,
// gravado por scripts/resolve-ports.mjs a cada inicialização.
const apiUrl = process.env.VITE_GOVINFRA_API_URL || 'http://127.0.0.1:44101';
const saasApiTarget = process.env.VITE_SAAS_API_TARGET || 'http://127.0.0.1:9009';
const porta = Number(process.env.VITE_GOVINFRA_PORT || 44001);

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: porta,
    host: '127.0.0.1',
    proxy: {
      '/api': { target: apiUrl, changeOrigin: true },
      // Login de desenvolvimento: autentica direto na API da plataforma.
      '/saas-api': {
        target: saasApiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/saas-api/, ''),
      },
    },
  },
  preview: { port: porta, host: '127.0.0.1' },
  build: { outDir: 'dist', sourcemap: false },
});

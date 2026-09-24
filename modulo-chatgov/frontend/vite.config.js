import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3050';
const saasProxyTarget = process.env.VITE_SAAS_API_TARGET || 'http://localhost:9009';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': proxyTarget,
      '/socket.io': {
        target: proxyTarget,
        ws: true,
      },
      '/media': proxyTarget,
      '/saas-api': {
        target: saasProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/saas-api/, ''),
      },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Mantém todas as dependências em um único chunk de vendor para
          // preservar a ordem de inicialização. Separar react/react-dom de
          // bibliotecas que dependem dele (ex.: lucide-react) causa erro de
          // "Cannot access 'X' before initialization" por dependência circular
          // entre chunks.
          if (id.includes('node_modules')) {
            // xlsx é pesado e só usado sob demanda (exportar Excel) — chunk próprio,
            // carregado apenas quando o usuário clica em "Excel" (não bloqueia o boot).
            if (id.includes('xlsx')) return 'xlsx';
            return 'vendor';
          }
        },
      },
    },
  },
});

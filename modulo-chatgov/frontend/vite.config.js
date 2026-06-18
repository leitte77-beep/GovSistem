import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3050',
      '/socket.io': {
        target: 'http://localhost:3050',
        ws: true,
      },
      '/media': 'http://localhost:3050',
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
            return 'vendor';
          }
        },
      },
    },
  },
});

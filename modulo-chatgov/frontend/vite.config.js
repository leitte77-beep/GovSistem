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
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: {
    include: [
      '@pierre/trees/react',
      '@pierre/diffs',
      '@pierre/diffs/react',
      '@pierre/diffs/worker',
      '@pierre/diffs/worker/worker.js',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4310', ws: true } },
  },
});

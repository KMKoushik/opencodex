import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: { input: fileURLToPath(new URL('./src/main/index.ts', import.meta.url)) },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: fileURLToPath(new URL('./src/preload/index.ts', import.meta.url)),
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
      },
    },
  },
  renderer: {
    root: fileURLToPath(new URL('../web', import.meta.url)),
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: 'http://127.0.0.1:4310' } },
    },
    build: {
      outDir: fileURLToPath(new URL('./out/renderer', import.meta.url)),
      minify: true,
      rollupOptions: { input: fileURLToPath(new URL('../web/index.html', import.meta.url)) },
    },
  },
});

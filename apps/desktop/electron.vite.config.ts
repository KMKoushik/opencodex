import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    // ws has JS/Node fallbacks. Keep optional native addons out of the Electron bundle;
    // Vite's dev resolver otherwise hoists missing-peer errors outside ws's try/catch.
    define: {
      'process.env.WS_NO_BUFFER_UTIL': '"1"',
      'process.env.WS_NO_UTF_8_VALIDATE': '"1"',
    },
    build: {
      externalizeDeps: false,
      commonjsOptions: { ignore: ['bufferutil', 'utf-8-validate'] },
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
    build: {
      outDir: fileURLToPath(new URL('./out/renderer', import.meta.url)),
      minify: true,
      rollupOptions: { input: fileURLToPath(new URL('../web/index.html', import.meta.url)) },
    },
  },
});

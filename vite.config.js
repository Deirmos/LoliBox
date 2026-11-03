import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'renderer',
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'renderer/index.html'),
        tray: path.resolve(__dirname, 'renderer/tray.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'renderer'),
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Electron loads the built renderer from disk, so asset paths must be relative.
export default defineConfig({
  root: 'src',
  base: './',
  publicDir: false,
  plugins: [react()],
  build: { assetsDir: 'bundle', outDir: '../renderer-dist', emptyOutDir: true, target: 'chrome130' },
});

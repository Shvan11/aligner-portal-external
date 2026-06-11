import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: true,
  },
  server: {
    // NOT 5173: a stale Windows `netsh portproxy` rule (0.0.0.0:5173 → the old WSL
    // NAT IP) holds that port via iphlpsvc, and under WSL mirrored networking a
    // bind against a Windows-occupied port wedges SILENTLY — vite never errors and
    // never prints its banner, which looks exactly like "the dev server did not
    // start". (Same reason the main app's dev moved to 5273/3101.)
    port: 5180,
    // NEVER set open: true — on WSL the browser spawn (xdg-open → chrome) blocks
    // vite's startup banner the same way. Open the printed URL manually instead.
    open: false,
  },
});

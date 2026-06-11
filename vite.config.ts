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
    port: 5173,
    // NEVER set open: true — on WSL the browser spawn (xdg-open → chrome) blocks
    // vite's startup banner: the server silently listens but never prints its URL,
    // which looks exactly like "the dev server did not start". Open the printed
    // URL manually instead.
    //
    // If this port ever wedges silently again, check for a Windows-side squatter:
    // `netsh interface portproxy show all` + `netstat -ano | findstr :5173` — under
    // WSL mirrored networking a bind against a Windows-occupied port hangs instead
    // of erroring (a stale portproxy rule to the dead NAT IP did this once; deleted
    // 2026-06-12).
    open: false,
  },
});

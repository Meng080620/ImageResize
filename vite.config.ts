import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Forward same-origin /rembg/* to the local rembg server so the browser makes no
// cross-origin request (rembg sends no CORS headers and would be blocked). Strips
// the /rembg prefix; target is overridable via REMBG_TARGET. proxyTimeout is large
// because BiRefNet inference on a big product photo can take tens of seconds.
const rembgProxy = {
  '/rembg': {
    target: process.env.REMBG_TARGET || 'http://127.0.0.1:7000',
    changeOrigin: true,
    proxyTimeout: 120000,
    rewrite: (p: string) => p.replace(/^\/rembg/, ''),
  },
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: rembgProxy,
    },
    preview: {
      proxy: rembgProxy,
    },
  };
});

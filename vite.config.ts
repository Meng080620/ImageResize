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
    // Default 7001 (not rembg's usual 7000) because macOS AirPlay Receiver squats on
    // 7000 and answers 403, silently shadowing rembg. Run `rembg s --port 7001`.
    target: process.env.REMBG_TARGET || 'http://127.0.0.1:7001',
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
      proxy: rembgProxy,
    },
    preview: {
      proxy: rembgProxy,
    },
  };
});

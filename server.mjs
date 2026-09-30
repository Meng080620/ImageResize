// One Node process serves everything: the built app (dist/) and the /rembg proxy.
//   npm start            → builds, then serves on http://localhost:3000/#/app
//   PORT=8080 npm start  → different port
//   REMBG_TARGET=http://127.0.0.1:7001  → where /rembg/* is forwarded (optional rembg server)
// No dependencies — plain node:http.
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const REMBG = new URL(process.env.REMBG_TARGET || 'http://127.0.0.1:7001');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);

// /rembg/* → rembg server, with the prefix stripped. Same-origin, so no CORS.
function proxyRembg(req, res) {
  const upstream = (REMBG.protocol === 'https:' ? httpsRequest : httpRequest)({
    hostname: REMBG.hostname, port: REMBG.port, method: req.method,
    path: req.url.replace(/^\/rembg/, '') || '/',
    headers: { ...req.headers, host: REMBG.host },
  }, (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); });
  upstream.setTimeout(120_000, () => upstream.destroy(new Error('rembg timeout')));
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('rembg unavailable'); });
  req.pipe(upstream);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html'); // SPA fallback
  const ext = extname(file);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    // Vite fingerprints everything under /assets, so it can be cached forever.
    'Cache-Control': file.includes(`${ROOT}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gzip) headers['Content-Encoding'] = 'gzip';
  res.writeHead(200, headers);
  const stream = createReadStream(file);
  stream.on('error', () => res.end());
  (gzip ? stream.pipe(createGzip()) : stream).pipe(res);
}

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('dist/ not found — run `npm run build` first (or just `npm start`).');
  process.exit(1);
}

createServer((req, res) => {
  if (req.url.startsWith('/rembg/') || req.url === '/rembg') return proxyRembg(req, res);
  serveStatic(req, res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Image Resize → http://localhost:${PORT}/#/app   (rembg proxy → ${REMBG.origin})`);
});

# Smart Image Resizer

Browser-based product-image editor for e-commerce: resize to store-ready sizes, remove
backgrounds with AI, upscale low-res shots, and batch-export — all client-side by default,
with an optional local AI server for the hardest cutouts. No images are uploaded to any
third party.

## Features

- **Resize & crop** to common aspect ratios (1:1, 4:3, 3:4, 16:9, custom) and store sizes.
- **AI background removal** with a quality cascade (see [below](#background-removal)):
  **rembg / BiRefNet** (best, local) → **ISNet** (in-browser fallback) → edge detection.
- **AI upscale** 2× / 4× via ESRGAN (UpscalerJS + TF.js) — rescues low-res photos.
- **Batch export** to ZIP, plus a multi-size / multi-format export modal (PNG / JPEG / WEBP).
- **Accounts & premium gating** via Supabase; AI features are premium.
- **100% local processing** — ISNet/ESRGAN run in the browser via WebGPU/WASM; rembg runs
  on your own machine. Images never touch a third-party server.

## Tech stack

React 19 · TypeScript · Vite · Tailwind · Supabase (auth) · Stripe (payments) ·
`@imgly/background-removal` (ISNet ONNX) · UpscalerJS/TF.js (ESRGAN) · rembg/BiRefNet (optional).

## Getting started

**Prerequisites:** Node.js 18+.

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run dev               # → http://localhost:3000/#/app
```

### Environment (`.env`)

| Var | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | for auth | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | for auth | Supabase anon key |
| `REMBG_TARGET` | optional | where the dev proxy forwards `/rembg` (default `http://127.0.0.1:7000`) |
| `VITE_REMBG_URL` | optional | override the in-app rembg base (default same-origin `/rembg`) |

Without Supabase configured the app still runs, but login is disabled. Premium access is
granted to emails in `ADMIN_EMAILS` (`src/lib/supabase.ts`) — see [Known gaps](#known-gaps).

## Background removal

Background removal runs as a cascade (`removeImageBackground` in `src/utils/imageProcessor.ts`):

1. **rembg / BiRefNet** (primary, if running) — far better on the hardest case,
   white-on-white products, where the in-browser model loses the edges.
2. **ISNet** (in-browser ONNX) — automatic fallback; with colour-restore + interior-solidify
   post-passes to avoid washout and translucent glossy surfaces.
3. **Edge detection** — last-resort for degenerate ISNet results.

The app talks to rembg over a **same-origin `/rembg` path** (proxied by Vite in dev /
Caddy in prod), so there's no CORS or Private-Network-Access blocking.

### Optional: enable rembg/BiRefNet locally (recommended for white products)

```bash
pip install "rembg[cli]" onnxruntime      # onnxruntime is a separate dep in rembg 2.x
rembg s --port 7001                        # NOTE: port 7000 is macOS AirPlay — use 7001
REMBG_TARGET=http://127.0.0.1:7001 npm run dev
```

The app auto-detects it (a `GET /rembg/api/remove` probe → 422) and routes removals through
BiRefNet, falling back to ISNet silently if the server is down.

## Scripts

```bash
npm run dev       # dev server on :3000
npm run build     # production build → dist/
npm run preview   # serve the production build (also proxies /rembg)
npm run lint      # tsc --noEmit (type check)
npm run test      # vitest
```

## Architecture

```
src/
  Root.tsx                 route shell: landing → app → admin (hash routing)
  context/
    EditorContext.tsx      thin composition layer, exposes useEditor()
    useUIState.ts          viewMode, toast, zoom, grid, drag
    useProcessingState.ts  bg removal + AI upscale
    useExportState.ts      ZIP / single download, export sizing
    AuthContext.tsx        Supabase session + premium gating
  hooks/
    useImageProcessor.ts   debounced preview pipeline over a worker pool
  utils/
    imageProcessor.ts      resize, bg-removal cascade, upscale, worker pool
  workers/imageWorker.ts   off-main-thread canvas renders (cached)
  components/              editor/ · layout/ · landing/ · auth/ · admin/
deploy/                    Docker + Caddy config to self-host rembg + the SPA
```

State: server state in Supabase; processing/UI state in the context hooks above; blob URLs
owned by `revokeImageUrls()` on remove/clear.

## Testing

Pure logic is unit-tested with Vitest (`src/utils/imageProcessor.test.ts`) — sizing,
URL-revoke guards, and the bg-removal pure cores (colour composite, opaque fraction,
interior solidify). Runs in the node env, no canvas needed.

```bash
npm run test
```

## Deployment

`deploy/` self-hosts the SPA + rembg in two containers (rembg with BiRefNet pre-baked, Caddy
serving the build and proxying `/rembg`). Targets **Oracle Cloud Free Tier** (ARM) — $0 to run.
See [`deploy/README.md`](deploy/README.md).

## Known gaps

- **Stripe webhook is not implemented** — `startCheckout()` works, but nothing upgrades
  `profiles.plan` after payment, so only `ADMIN_EMAILS` currently get premium. See the TODO
  in `src/lib/stripe.ts`.
- rembg only auto-works in `dev`/`preview` (the proxy runs there). A static prod deploy needs
  the `deploy/` Caddy route (or `VITE_REMBG_URL`) to reach a hosted rembg.

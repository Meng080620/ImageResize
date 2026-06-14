# Deploy: rembg (BiRefNet) + SPA on Oracle Cloud Free Tier

Runs the whole app — the static SPA **and** the BiRefNet background-removal server —
on one always-free Oracle Ampere (ARM) box. Total cost: **$0**. Images never leave
your server.

## What's here
| File | Role |
|---|---|
| `Dockerfile.rembg` | rembg + `onnxruntime`, BiRefNet **pre-baked** so the first request is fast |
| `Caddyfile` | serves `dist/` and proxies `/rembg/*` → rembg (same-origin ⇒ no CORS) |
| `docker-compose.yml` | wires rembg + Caddy, health check, auto-restart |

The app already calls `/rembg/api/remove` (see `REMBG_BASE` in
`src/utils/imageProcessor.ts`), so **no app code changes** — Caddy fills the role the
Vite dev proxy plays locally. ISNet stays the in-browser fallback if rembg is down.

## One-time: create the free box
1. Oracle Cloud → **Always Free** → Compute instance → shape **VM.Standard.A1.Flex**
   (Ampere ARM; up to 4 OCPU / 24 GB are free). Ubuntu 22.04.
2. In the instance's subnet security list, allow ingress **80** and **443**.
3. SSH in, install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker
   ```

## Deploy
```bash
git clone <your-repo> && cd ImageResize

# 1. Build the SPA (needs Node; or build locally and scp the dist/ folder up)
npm ci && npm run build           # → ./dist

# 2. Bring up rembg + Caddy
cd deploy
SITE_ADDRESS=cutouts.example.com docker compose up -d --build
#   …or omit SITE_ADDRESS to serve plain HTTP on the box's public IP.
```
First build downloads the BiRefNet weights into the image (a few minutes, once).

## Verify
```bash
# rembg reachable through Caddy (422 = route exists, healthy)
curl -s -o /dev/null -w "%{http_code}\n" https://cutouts.example.com/rembg/api/remove   # → 422

# real cutout
curl -F file=@switch.png \
  "https://cutouts.example.com/rembg/api/remove?model=birefnet-general" -o out.png
```
In the app, Remove BG should show `200 POST /rembg/api/remove?model=birefnet-general`
in the network tab and no CORS errors.

## Notes
- **Port:** the container binds `:7000` internally — fine on Linux. (The `:7001` dance is
  a macOS-only thing: port 7000 is AirPlay Receiver on macOS, not on the server.)
- **Scale:** one CPU box does ~1 img/s with BiRefNet. If batch exports lag, add replicas
  (`docker compose up -d --scale rembg=3`) — Caddy round-robins. Move to a GPU shape only
  if you measure that you need it.
- **HTTPS:** with a real `SITE_ADDRESS` domain, Caddy auto-provisions a Let's Encrypt cert.
  IP-only stays HTTP — fine for testing, but set a domain before sending real traffic
  (the app itself is served here too, so HTTPS protects the whole thing).

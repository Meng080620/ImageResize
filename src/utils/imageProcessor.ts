import { ResizeSettings, UploadedImage } from '../types';
import type { WorkerMessage, WorkerResponse } from '../workers/imageWorker';

/**
 * Pool size. Each worker owns its own OffscreenCanvas(es), so concurrency trades
 * throughput against memory. Capped at 4: a 1000² RGBA canvas is ~4MB and the
 * worker allocates several transient canvases per job, so an unbounded pool sized
 * to a 16-core machine would OOM on a 100-image batch. 4 saturates a typical
 * batch without the memory blowup — tune only after profiling a real workload.
 */
const POOL_SIZE = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 4));

interface PoolJob {
  batchId: string;
  message: WorkerMessage;
  transfer: Transferable[];
  resolve: (url: string) => void;
  reject: (err: Error) => void;
  onWarn?: (msg: string) => void;
}

/**
 * Round-robin-ish pool that dispatches each job to an idle worker and queues the
 * rest. A single worker serialized the whole batch on every settings change; the
 * pool lets `navigator.hardwareConcurrency` jobs run in parallel.
 *
 * `cancelBatch(batchId)` drains queued-but-not-yet-dispatched jobs for that batch.
 * In-flight jobs (already sent to a worker) cannot be interrupted — they are
 * lightweight canvas renders and finish quickly. Only preview batches use batchId;
 * export jobs pass '' to opt out of cancellation.
 */
class ImageWorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: PoolJob[] = [];
  private busyWith = new Map<Worker, PoolJob>();

  private ensureSpawned() {
    if (this.workers.length > 0) return;
    for (let i = 0; i < POOL_SIZE; i++) {
      const worker = new Worker(new URL('../workers/imageWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handleDone(worker, e.data);
      worker.onerror = () => {
        const job = this.busyWith.get(worker);
        if (job) { job.reject(new Error('Image worker crashed')); this.release(worker); }
      };
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  private handleDone(worker: Worker, msg: WorkerResponse) {
    const job = this.busyWith.get(worker);
    if (job) {
      if (msg.type === 'DONE') {
        msg.warnings?.forEach(w => job.onWarn?.(w));
        job.resolve(URL.createObjectURL(msg.blob));
      } else if (msg.type === 'WARN') {
        job.onWarn?.(msg.warning);
        // WARN is not a terminal message — wait for DONE/ERROR
        return;
      } else {
        job.reject(new Error(msg.error));
      }
    }
    this.release(worker);
  }

  private release(worker: Worker) {
    this.busyWith.delete(worker);
    this.idle.push(worker);
    this.pump();
  }

  private pump() {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.busyWith.set(worker, job);
      worker.postMessage(job.message, job.transfer);
    }
  }

  run(message: WorkerMessage, transfer: Transferable[], batchId = '', onWarn?: (msg: string) => void): Promise<string> {
    this.ensureSpawned();
    return new Promise((resolve, reject) => {
      this.queue.push({ batchId, message, transfer, resolve, reject, onWarn });
      this.pump();
    });
  }

  /** Remove queued (not yet dispatched) jobs for a batch and reject them. */
  cancelBatch(batchId: string) {
    if (!batchId) return;
    const removed: PoolJob[] = [];
    this.queue = this.queue.filter(j => {
      if (j.batchId === batchId) { removed.push(j); return false; }
      return true;
    });
    removed.forEach(j => j.reject(new Error('batch_cancelled')));
  }

  /** Drain the queue, reject all pending jobs, and terminate every worker. */
  teardown() {
    // In-flight jobs too: their worker is about to be terminated and would never reply.
    this.busyWith.forEach(j => j.reject(new Error('worker_pool_teardown')));
    this.queue.forEach(j => j.reject(new Error('worker_pool_teardown')));
    this.queue = [];
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.idle = [];
    this.busyWith.clear();
  }
}

let pool: ImageWorkerPool | null = null;
function getPool(): ImageWorkerPool {
  if (!pool) {
    pool = new ImageWorkerPool();
    window.addEventListener('beforeunload', () => pool?.teardown(), { once: true });
  }
  return pool;
}

/**
 * Whether a stale `processedUrl` is safe to revoke. Guards the two ways a revoke
 * would blank a live image: (1) only `blob:` URLs are ours to free — sample
 * products use remote http URLs; (2) never free a URL still referenced as the
 * image's original or as its freshly-produced replacement.
 */
export function shouldRevokeProcessedUrl(oldUrl: string, originalUrl: string, newUrl: string): boolean {
  if (!oldUrl.startsWith('blob:')) return false;
  if (oldUrl === originalUrl) return false;
  if (oldUrl === newUrl) return false;
  return true;
}

/** Revokes a stale processed object URL if and only if it's safe to. */
export function revokeProcessedUrl(oldUrl: string, originalUrl: string, newUrl: string) {
  if (shouldRevokeProcessedUrl(oldUrl, originalUrl, newUrl)) URL.revokeObjectURL(oldUrl);
}

/** Frees every object URL an image holds when it leaves the queue (remove/clear). */
export function revokeImageUrls(img: Pick<UploadedImage, 'originalUrl' | 'processedUrl' | 'cutoutUrl' | 'upscaledUrl'>) {
  const { originalUrl, processedUrl, cutoutUrl, upscaledUrl } = img;
  // The processed preview is a derived blob; only free it if it isn't aliasing
  // a source URL we still own (original / cutout / upscaled).
  if (
    processedUrl.startsWith('blob:') &&
    processedUrl !== originalUrl &&
    processedUrl !== cutoutUrl &&
    processedUrl !== upscaledUrl
  ) {
    URL.revokeObjectURL(processedUrl);
  }
  if (cutoutUrl && cutoutUrl.startsWith('blob:')) URL.revokeObjectURL(cutoutUrl);
  if (upscaledUrl && upscaledUrl.startsWith('blob:')) URL.revokeObjectURL(upscaledUrl);
  if (originalUrl.startsWith('blob:')) URL.revokeObjectURL(originalUrl);
}

/**
 * The source the resize pipeline should draw from. Precedence:
 *   1. transparent cutout, when background removal is active;
 *   2. AI-upscaled version, when upscaling is active;
 *   3. the pristine original.
 * Cutout wins because it's normally computed *from* the upscaled source (see
 * EditorContext.handleRemoveBackground), so it already carries the upscale.
 * Keeping all three lets both "remove background" and "upscale" be
 * non-destructive, independently undoable toggles.
 */
export function effectiveSourceUrl(
  img: Pick<UploadedImage, 'originalUrl' | 'cutoutUrl' | 'bgRemoved' | 'upscaledUrl' | 'upscaled'>,
): string {
  if (img.bgRemoved && img.cutoutUrl) return img.cutoutUrl;
  if (img.upscaled && img.upscaledUrl) return img.upscaledUrl;
  return img.originalUrl;
}

/**
 * Runs client-side background removal (ISNet via ONNX, no server). Returns a blob
 * URL for a transparent PNG. `isnet_fp16` halves the model download vs full ISNet
 * at near-identical quality — the right trade for a browser-delivered model.
 * The model (~40MB) is fetched once from the imgly CDN and cached by the browser.
 *
 * The library (ONNX runtime, ~400KB JS) is dynamically imported so it stays out
 * of the initial bundle — users who never remove a background never download it.
 *
 * `onProgress` reports 0–100 and a coarse stage: 'download' while the model is
 * being fetched (the slow first-run cost), 'process' during inference.
 *
 * imgly fires the raw callback once *per asset* (the model ships as several files
 * plus the wasm runtime), each with its own current/total. Reporting those in
 * isolation makes the percentage fill, reset to 0 for the next file, and fill
 * again — janky and non-monotonic. So we aggregate the download phase by summing
 * bytes across every asset seen so far and clamp it monotonic, yielding one smooth
 * 0→100. The process phase is a single key, reported directly.
 */
export type BgStage = 'download' | 'process';

/**
 * Prefer the WebGPU backend when the browser exposes it — ISNet inference on the
 * GPU is ~4–10× faster than the WASM-SIMD CPU path, which is what turns a large
 * "remove background — all" batch from minutes into something tolerable. We feature-
 * detect rather than force 'gpu' because the library won't fall back on its own,
 * and Safari/older Chromium lack `navigator.gpu`. CPU stays the safe default.
 */
function pickBgDevice(): 'cpu' | 'gpu' {
  return typeof navigator !== 'undefined' && 'gpu' in navigator ? 'gpu' : 'cpu';
}

export type BgModel = 'isnet' | 'isnet_fp16' | 'isnet_quint8';

export const BG_MODEL_MAP: Record<'fast' | 'balanced' | 'quality', BgModel> = {
  fast: 'isnet_quint8',
  balanced: 'isnet_fp16',
  quality: 'isnet',
};

// rembg model names — mapped from quality setting
// birefnet-general is the best model for product photography including white-on-white
const REMBG_MODEL_MAP: Record<'fast' | 'balanced' | 'quality', string> = {
  fast:     'u2netp',
  balanced: 'u2net',
  quality:  'birefnet-general',
};

// Same-origin path proxied to the local rembg server by Vite (server.proxy in
// vite.config.ts) so the browser never makes a cross-origin request. A direct
// fetch to http://127.0.0.1:7000 is blocked by CORS (rembg sends no
// Access-Control-Allow-Origin) and, on an HTTPS deploy, by Private Network Access.
// Routing through the app's own origin sidesteps both. Override with VITE_REMBG_URL
// to point at a CORS-enabled rembg directly (e.g. a reverse proxy that adds headers).
const REMBG_BASE = import.meta.env.VITE_REMBG_URL || '/rembg';
let rembgAvailable: boolean | null = null; // cached after first probe

async function probeRembg(): Promise<boolean> {
  if (rembgAvailable !== null) return rembgAvailable;
  try {
    // GET the remove route with no params: rembg replies 422 (route exists but the
    // required file/url is missing) when it's up, without running any inference.
    // HEAD is unreliable — rembg 2.x returns 404 for it. We accept only the statuses
    // a real rembg returns; anything else (e.g. macOS AirPlay on :7000 answers 403,
    // a dead proxy target answers 5xx, a missing route 404) counts as unavailable.
    const res = await fetch(`${REMBG_BASE}/api/remove`, {
      method: 'GET',
      signal: AbortSignal.timeout(800),
    });
    rembgAvailable = [200, 405, 422].includes(res.status);
  } catch {
    rembgAvailable = false;
  }
  return rembgAvailable;
}

/**
 * Sends the image to a local rembg HTTP server via the same-origin /rembg proxy.
 * rembg uses BiRefNet / U2Net models — significantly better than ISNet for
 * difficult cases like white-on-white products. Runs fully locally (no cloud).
 *
 * To start the server:
 *   pip install "rembg[cli]"
 *   rembg s --port 7000
 * The Vite proxy then forwards /rembg/* → http://127.0.0.1:7000 (configurable via
 * the REMBG_TARGET env var). For a production static deploy, point your host
 * (nginx/Caddy) at the same /rembg path or set VITE_REMBG_URL.
 */
async function removeBackgroundViaRembg(
  srcUrl: string,
  rembgModel: string,
  onProgress?: (pct: number, stage: BgStage) => void,
): Promise<string> {
  onProgress?.(10, 'process');
  const imgBlob = await (await fetch(srcUrl)).blob();
  const form = new FormData();
  form.append('file', imgBlob, 'image.png');

  onProgress?.(30, 'process');
  const res = await fetch(`${REMBG_BASE}/api/remove?model=${rembgModel}`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw Object.assign(new Error(`rembg error ${res.status}`), { status: res.status });
  onProgress?.(90, 'process');

  const resultBlob = await res.blob();
  onProgress?.(100, 'process');
  return URL.createObjectURL(resultBlob);
}

/**
 * Boost contrast + saturation before ISNet inference.
 * White products on white backgrounds have near-zero luminance contrast — ISNet
 * sees ambiguous boundaries. contrast(1.4) brightness(0.95) makes the shadow
 * gradients at the product edge visible to the model without burning highlights.
 * The enhanced image is used as inference input only and is revoked immediately after.
 */
/**
 * Sample a 5×5 patch at each corner and return the average perceived brightness
 * (0–255) of the 100 sampled pixels. Used to distinguish white studio backgrounds
 * from coloured or dark backgrounds before choosing a CSS filter.
 */
function sampleCornersAvg(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number): number {
  const PATCH = 5;
  const corners = [
    [0, 0], [w - PATCH, 0], [0, h - PATCH], [w - PATCH, h - PATCH],
  ] as const;
  let total = 0;
  let count = 0;
  for (const [cx, cy] of corners) {
    const { data } = ctx.getImageData(cx, cy, PATCH, PATCH);
    for (let i = 0; i < data.length; i += 4) {
      // Perceived luminance (Rec 601)
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count++;
    }
  }
  return count > 0 ? total / count : 128;
}

async function preprocessForBgRemoval(srcUrl: string): Promise<string> {
  try {
    const img = await createImageBitmap(await (await fetch(srcUrl)).blob());
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d')!;

    // Draw without filter first so we can sample the actual pixel values.
    ctx.drawImage(img, 0, 0);
    const avgBrightness = sampleCornersAvg(ctx, img.width, img.height);

    // White/near-white studio background (avg > 240): boosting contrast would
    // amplify JPEG block artifacts and make the model see false edges. Instead
    // lift saturation only — colour pops relative to the white ground.
    // Dark/coloured background: full contrast+brightness+saturation push helps
    // the model resolve the shadowed product boundary.
    const filter = avgBrightness > 240
      ? 'saturate(2.0) brightness(0.98)'
      : 'contrast(1.4) brightness(0.95) saturate(1.2)';

    ctx.filter = filter;
    ctx.drawImage(img, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return URL.createObjectURL(blob);
  } catch {
    return srcUrl; // graceful no-op if OffscreenCanvas unavailable
  }
}

/**
 * Clean up the raw ISNet alpha mask with two canvas passes:
 *
 * Pass 1 — erode: kill semi-transparent "fringe" pixels that sit next to
 *   fully-transparent neighbors. These are background colour bleeding through
 *   the edge — they look like a coloured halo on the cut-out subject.
 *
 * Pass 2 — feather: smooth the remaining edge alphas with a 1-px box blur
 *   so the subject doesn't look hard-clipped after removal.
 *
 * Skipped on images > 3 000 px on either side to keep the main-thread cost
 * bounded (<~150 ms for a 2 000 × 2 000 px cut-out on a modern machine).
 */
async function refineAlphaEdges(blobUrl: string): Promise<string> {
  const img = await loadImage(blobUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  if (w > 3000 || h > 3000) return blobUrl; // skip — too large for main-thread pixel loop

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return blobUrl;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const src = imageData.data;
  const out = new Uint8ClampedArray(src); // copy so pass-2 reads pass-1 output

  // Pass 1: erode — zero out fringe pixels (semi-transparent with a transparent neighbour).
  // Only touch the alpha channel; RGB is preserved for pass-2 feathering reference.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const a = src[i + 3];
      if (a > 10 && a < 245) {
        const minNeighbour = Math.min(
          src[((y - 1) * w + x) * 4 + 3],
          src[((y + 1) * w + x) * 4 + 3],
          src[(y * w + x - 1)    * 4 + 3],
          src[(y * w + x + 1)    * 4 + 3],
        );
        if (minNeighbour < 10) out[i + 3] = 0;
      }
    }
  }

  // Pass 2: feather — 1-px box blur on remaining edge alphas so the cutout
  // blends softly rather than clipping hard.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const a = out[i + 3];
      if (a > 0 && a < 255) {
        out[i + 3] = Math.round((
          out[((y - 1) * w + x) * 4 + 3] +
          out[((y + 1) * w + x) * 4 + 3] +
          out[(y * w + x - 1)    * 4 + 3] +
          out[(y * w + x + 1)    * 4 + 3] +
          a * 2
        ) / 6);
      }
    }
  }

  ctx.putImageData(new ImageData(out, w, h), 0, 0);
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : blobUrl), 'image/png');
  });
}

/**
 * Sobel edge detection + BFS mask for white-on-white products.
 *
 * Simple threshold flood fill fails when the product face is nearly the same
 * luminance as the background. This approach instead:
 *   1. Computes Sobel gradient magnitude (detects the shadow/depth edge around the product)
 *   2. Dilates those edges to close small gaps
 *   3. BFS-floods from all 4 image edges, stopping at the dilated edge contour
 *   4. Everything the BFS cannot reach = inside the product = opaque
 *
 * Works on blank white products because the shadow at the perimeter creates a
 * detectable gradient even with near-zero luminance contrast in the flat region.
 */
async function removeBackgroundViaEdges(srcUrl: string): Promise<string> {
  try {
    const img = await createImageBitmap(await (await fetch(srcUrl)).blob());
    const { width, height } = img;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // Slight blur before Sobel to suppress JPEG block artifacts as false edges
    ctx.filter = 'blur(1px)';
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);

    // Grayscale (Rec 601)
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++)
      gray[i] = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];

    // Sobel gradient magnitude
    const edges = new Float32Array(width * height);
    let maxEdge = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const tl = gray[(y-1)*width+(x-1)], tc = gray[(y-1)*width+x], tr = gray[(y-1)*width+(x+1)];
        const ml = gray[y*width+(x-1)],                                 mr = gray[y*width+(x+1)];
        const bl = gray[(y+1)*width+(x-1)], bc = gray[(y+1)*width+x],  br = gray[(y+1)*width+(x+1)];
        const gx = -tl - 2*ml - bl + tr + 2*mr + br;
        const gy = -tl - 2*tc - tr + bl + 2*bc + br;
        const mag = Math.sqrt(gx*gx + gy*gy);
        edges[y*width+x] = mag;
        if (mag > maxEdge) maxEdge = mag;
      }
    }

    // Threshold at 8% of max edge — catches subtle shadow edges without JPEG noise
    const threshold = maxEdge * 0.08;
    const edgeMask = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++)
      edgeMask[i] = edges[i] > threshold ? 1 : 0;

    // Dilate edge mask by 3px to close gaps at corner transitions
    const dilated = new Uint8Array(width * height);
    const R = 3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let found = 0;
        outer: for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const ny = y+dy, nx = x+dx;
            if (ny>=0 && ny<height && nx>=0 && nx<width && edgeMask[ny*width+nx]) { found=1; break outer; }
          }
        }
        dilated[y*width+x] = found;
      }
    }

    // BFS from all edges: flood "outside" region, stopped by dilated edges
    const isOutside = new Uint8Array(width * height);
    const queue: number[] = [];
    const enqueue = (x: number, y: number) => {
      if (x<0||x>=width||y<0||y>=height) return;
      const idx = y*width+x;
      if (isOutside[idx] || dilated[idx]) return;
      isOutside[idx] = 1;
      queue.push(x, y);
    };
    for (let x=0; x<width; x++) { enqueue(x,0); enqueue(x,height-1); }
    for (let y=0; y<height; y++) { enqueue(0,y); enqueue(width-1,y); }
    while (queue.length) {
      const y = queue.pop()!; const x = queue.pop()!;
      enqueue(x+1,y); enqueue(x-1,y); enqueue(x,y+1); enqueue(x,y-1);
    }

    // Write alpha: outside=0, inside=255
    ctx.filter = 'none';
    ctx.drawImage(img, 0, 0);
    const out = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < width * height; i++)
      out.data[i*4+3] = isOutside[i] ? 0 : 255;

    ctx.putImageData(out, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return URL.createObjectURL(blob);
  } catch {
    return srcUrl;
  }
}

/**
 * After white-background flood fill, JPEG compression leaves dark artifact pixels
 * at the product boundary that the flood fill correctly keeps (they're < threshold)
 * but they're encoding noise, not real product surface.
 * This pass finds opaque pixels that are suspiciously dark AND surrounded mostly
 * by transparent pixels, then removes them.
 */
async function cleanBoundaryArtifacts(url: string): Promise<string> {
  try {
    const img = await createImageBitmap(await (await fetch(url)).blob());
    const { width, height } = img;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;
    const out = new Uint8ClampedArray(d);
    const R = 4;

    for (let y = R; y < height - R; y++) {
      for (let x = R; x < width - R; x++) {
        const i = (y * width + x) * 4;
        if (d[i + 3] < 128) continue; // already transparent

        // Only target dark pixels — real white product surface is bright
        const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (brightness > 200) continue;

        // Count how many neighbors are transparent
        let transparentCount = 0, total = 0;
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const ni = ((y + dy) * width + (x + dx)) * 4;
            total++;
            if (d[ni + 3] < 128) transparentCount++;
          }
        }

        // Dark pixel mostly surrounded by transparent = JPEG artifact, remove it
        if (transparentCount / total > 0.35) out[i + 3] = 0;
      }
    }

    ctx.putImageData(new ImageData(out, width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}

/**
 * Threshold-based background removal for white/near-white studio backgrounds.
 * BFS from all 4 edges removes connected near-white pixels (R,G,B > threshold).
 * Much faster and more accurate than ISNet for white-on-white products because it
 * follows exact pixel boundaries rather than relying on learned contrast features.
 */
async function removeWhiteBackground(srcUrl: string, threshold = 238): Promise<string> {
  const img = await createImageBitmap(await (await fetch(srcUrl)).blob());
  const { width, height } = img;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const isNearWhite = (i: number) =>
    d[i] > threshold && d[i + 1] > threshold && d[i + 2] > threshold;

  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    if (!isNearWhite(idx * 4)) return;
    visited[idx] = 1;
    queue.push(x, y);
  };

  for (let x = 0; x < width; x++) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 0; y < height; y++) { enqueue(0, y); enqueue(width - 1, y); }

  while (queue.length) {
    const y = queue.pop()!;
    const x = queue.pop()!;
    enqueue(x + 1, y); enqueue(x - 1, y);
    enqueue(x, y + 1); enqueue(x, y - 1);
  }

  for (let idx = 0; idx < width * height; idx++) {
    if (visited[idx]) d[idx * 4 + 3] = 0;
  }

  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return URL.createObjectURL(blob);
}

/**
 * Flood-fill from all 4 edges to identify "true background" transparent pixels,
 * then restore any transparent pixel NOT reachable from the edges (internal holes).
 *
 * ISNet treats dark cavities (USB ports, pin holes, gaps between legs) as
 * background because they share the same near-black colour. A BFS from every
 * edge pixel flags all reachable transparent regions as true background;
 * unreachable transparent pixels are internal voids that belong to the subject
 * and are restored to a neutral mid-gray (fully opaque).
 */
async function fillInternalHoles(cutoutUrl: string): Promise<string> {
  try {
    const img = await createImageBitmap(await (await fetch(cutoutUrl)).blob());
    const { width, height } = img;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const alpha = imageData.data;

    const isBackground = new Uint8Array(width * height);
    const queue: number[] = [];

    const enqueue = (x: number, y: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const i = y * width + x;
      if (isBackground[i] || alpha[i * 4 + 3] > 10) return;
      isBackground[i] = 1;
      queue.push(x, y);
    };

    for (let x = 0; x < width; x++) { enqueue(x, 0); enqueue(x, height - 1); }
    for (let y = 0; y < height; y++) { enqueue(0, y); enqueue(width - 1, y); }

    while (queue.length) {
      const y = queue.pop()!;
      const x = queue.pop()!;
      enqueue(x + 1, y); enqueue(x - 1, y);
      enqueue(x, y + 1); enqueue(x, y - 1);
    }

    for (let i = 0; i < width * height; i++) {
      if (!isBackground[i] && alpha[i * 4 + 3] < 10) {
        alpha[i * 4]     = 200;
        alpha[i * 4 + 1] = 200;
        alpha[i * 4 + 2] = 200;
        alpha[i * 4 + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return URL.createObjectURL(blob);
  } catch {
    return cutoutUrl; // graceful no-op
  }
}

/**
 * Canvas wrapper around `solidifyInteriorAlpha` — reads the cutout's pixels, hard-
 * fills the enclosed interior to opaque, writes it back. Superset of
 * `fillInternalHoles` (it also closes translucent interiors), used on the ISNet path.
 */
async function solidifyInterior(cutoutUrl: string): Promise<string> {
  try {
    const img = await createImageBitmap(await (await fetch(cutoutUrl)).blob());
    const { width, height } = img;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const solid = solidifyInteriorAlpha(imageData.data, width, height);
    ctx.putImageData(new ImageData(solid, width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return URL.createObjectURL(blob);
  } catch {
    return cutoutUrl; // graceful no-op
  }
}

/**
 * Morphological close (dilate then erode) on the alpha channel.
 * Fills small gaps or leaks left by the flood fill on blank white products
 * where the plate surface bleeds into the background mask.
 * radius=6 handles typical 1–3px boundary leaks without visibly expanding the shape.
 */
async function morphologicalClose(url: string, radius = 6): Promise<string> {
  try {
    const img = await createImageBitmap(await (await fetch(url)).blob());
    const { width, height } = img;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3];

    // Dilate — expand opaque regions to fill gaps
    const dilated = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let max = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height)
              max = Math.max(max, alpha[ny * width + nx]);
          }
        }
        dilated[y * width + x] = max;
      }
    }

    // Erode — shrink back, removes noise outside real edges
    const closed = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let min = 255;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height)
              min = Math.min(min, dilated[ny * width + nx]);
          }
        }
        closed[y * width + x] = min;
      }
    }

    for (let i = 0; i < width * height; i++) data[i * 4 + 3] = closed[i];
    ctx.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}

/**
 * Pure core of the colour-restore step. Both buffers are RGBA of equal length.
 * Returns a NEW buffer that keeps the RGB of `original` and the alpha of `mask`.
 *
 * Why this exists: the ISNet path boosts contrast/saturation before inference
 * (`preprocessForBgRemoval`) to sharpen the subject boundary, but imgly returns the
 * cutout of that *enhanced* image — so a white product comes back washed-out, its
 * groove/shading detail blown to flat white. We only ever wanted the model's alpha;
 * the colours must come from the untouched source. Array-only so it's testable in
 * the node test env (no canvas).
 */
export function compositeOriginalRgbWithMaskAlpha(
  original: Uint8ClampedArray,
  mask: Uint8ClampedArray,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(original.length);
  for (let i = 0; i < original.length; i += 4) {
    out[i]     = original[i];      // R — from the real source
    out[i + 1] = original[i + 1];  // G
    out[i + 2] = original[i + 2];  // B
    out[i + 3] = mask[i + 3];      // A — from the model's cutout
  }
  return out;
}

/**
 * Fraction of pixels in an RGBA buffer that are meaningfully opaque (alpha > 16).
 * Used to detect a degenerate ISNet result: if the model removed essentially the
 * whole image (fraction ≈ 0) it failed to find the subject — the white-on-white
 * case — and we fall back to edge detection. Pure/array-only for testing.
 */
export function maskOpaqueFraction(buf: Uint8ClampedArray): number {
  const total = buf.length / 4;
  if (total === 0) return 0;
  let opaque = 0;
  for (let i = 3; i < buf.length; i += 4) {
    if (buf[i] > 16) opaque++;
  }
  return opaque / total;
}

/**
 * Solidify the interior of a cutout. ISNet assigns partial alpha to bright,
 * low-contrast surfaces (a glossy white button face, a chrome bezel) because they
 * read as low-confidence foreground against a white ground — the subject comes out
 * translucent and looks faded over any non-white background. Products are opaque by
 * definition, so: flood the true background inward from the border (alpha < `knee`),
 * then force every pixel the flood *cannot* reach — the enclosed interior — fully
 * opaque, keeping its restored RGB. Genuinely-empty holes (alpha < 10, no real
 * colour) get a neutral grey fill, matching the old `fillInternalHoles` behaviour.
 *
 * Pure/array-only so the load-bearing flood logic is testable without a canvas.
 * Tradeoff: this hard-fills interiors, so it's right for hard-edged product photos,
 * not for genuinely semi-transparent subjects (glass, smoke) — which this tool
 * doesn't target.
 */
export function solidifyInteriorAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  knee = 16,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const n = width * height;
  const isBackground = new Uint8Array(n);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = y * width + x;
    if (isBackground[i] || data[i * 4 + 3] >= knee) return; // stop at confident foreground
    isBackground[i] = 1;
    stack.push(x, y);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  for (let i = 0; i < n; i++) {
    if (isBackground[i]) {
      out[i * 4 + 3] = 0;                       // border-connected → clean background
    } else if (data[i * 4 + 3] < 255) {
      out[i * 4 + 3] = 255;                     // enclosed interior → fully opaque
      if (data[i * 4 + 3] < 10) {               // empty hole with no real colour
        out[i * 4] = 200; out[i * 4 + 1] = 200; out[i * 4 + 2] = 200;
      }                                          // else keep the restored RGB
    }
  }
  return out;
}

/**
 * Canvas wrapper around `compositeOriginalRgbWithMaskAlpha`: paints `originalUrl`
 * at the mask's resolution so the two pixel grids align, then swaps in the mask's
 * alpha. Result is a PNG cutout with the model's edge but the original's true colour.
 */
async function reapplyOriginalColors(
  maskBlob: Blob,
  originalUrl: string,
): Promise<{ url: string; opaqueFraction: number }> {
  const [maskBmp, origBmp] = await Promise.all([
    createImageBitmap(maskBlob),
    createImageBitmap(await (await fetch(originalUrl)).blob()),
  ]);
  const w = maskBmp.width;
  const h = maskBmp.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(origBmp, 0, 0, w, h);
  const orig = ctx.getImageData(0, 0, w, h);

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(maskBmp, 0, 0);
  const mask = ctx.getImageData(0, 0, w, h);

  const composited = compositeOriginalRgbWithMaskAlpha(orig.data, mask.data);
  ctx.putImageData(new ImageData(composited, w, h), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { url: URL.createObjectURL(blob), opaqueFraction: maskOpaqueFraction(mask.data) };
}

/**
 * Below this opaque fraction we treat an ISNet result as degenerate: the model
 * removed essentially the entire image because it couldn't find the subject — the
 * white-on-white failure. Only then do we fall back to edge detection.
 */
const DEGENERATE_MASK_THRESHOLD = 0.02;

/**
 * Sobel/BFS edge-detection pipeline for white-on-white products: cutout → fill
 * internal holes → refine edges. Brittle (a gap in the white-on-white outer
 * contour lets the border flood leak in and gut the product face), so it is no
 * longer the primary path — only a fallback when ISNet returns nothing.
 */
async function runEdgePipeline(
  srcUrl: string,
  onProgress?: (percent: number, stage: BgStage) => void,
): Promise<string> {
  onProgress?.(20, 'process');
  const edgeCutout = await removeBackgroundViaEdges(srcUrl);
  onProgress?.(60, 'process');
  const filled = await fillInternalHoles(edgeCutout);
  if (filled !== edgeCutout) URL.revokeObjectURL(edgeCutout);
  onProgress?.(80, 'process');
  const refined = await refineAlphaEdges(filled);
  if (refined !== filled) URL.revokeObjectURL(filled);
  onProgress?.(100, 'process');
  return refined;
}

// ── BiRefNet in the browser (transformers.js + WebGPU) ───────────────────────
// The MIT-licensed BiRefNet model run fully on-device — the same quality that
// fixed white-on-white products, but with NO server, NO uploads, and NO per-image
// cost (unlike fal.ai). The ~490MB fp16 weights download once and are cached by the
// browser; subsequent runs are instant. Only used on the 'quality' setting when
// WebGPU is available — on CPU/WASM a model this size is impractical.
interface BiRefNetBundle {
  // Loosely typed: transformers.js classes are resolved at runtime via dynamic import.
  model: (inputs: { input_image: unknown }) => Promise<{ output_image: BiRefTensor }>;
  processor: (image: unknown) => Promise<{ pixel_values: unknown }>;
  fromURL: (url: string) => Promise<BiRefImage>;
  fromTensor: (t: BiRefTensor) => BiRefImage;
}
interface BiRefTensor { sigmoid(): BiRefTensor; mul(n: number): BiRefTensor; to(dtype: string): BiRefTensor; [i: number]: BiRefTensor; }
interface BiRefImage { width: number; height: number; data: Uint8Array; channels: number; resize(w: number, h: number): BiRefImage; }

let birefnetBundle: Promise<BiRefNetBundle> | null = null;

function loadBiRefNetWeb(onProgress?: (pct: number, stage: BgStage) => void): Promise<BiRefNetBundle> {
  if (!birefnetBundle) {
    birefnetBundle = (async () => {
      const tf = await import('@huggingface/transformers');
      const { AutoModel, AutoProcessor, RawImage } = tf as unknown as {
        AutoModel: { from_pretrained: (id: string, opts: Record<string, unknown>) => Promise<unknown> };
        AutoProcessor: { from_pretrained: (id: string) => Promise<unknown> };
        RawImage: { fromURL: (u: string) => Promise<BiRefImage>; fromTensor: (t: BiRefTensor) => BiRefImage };
      };
      const ID = 'onnx-community/BiRefNet-ONNX';
      const model = await AutoModel.from_pretrained(ID, {
        dtype: 'fp16',
        device: 'webgpu',
        progress_callback: (p: { status?: string; progress?: number }) => {
          if (p.status === 'progress' && typeof p.progress === 'number') onProgress?.(Math.round(p.progress), 'download');
        },
      });
      const processor = await AutoProcessor.from_pretrained(ID);
      return {
        model: model as BiRefNetBundle['model'],
        processor: processor as BiRefNetBundle['processor'],
        fromURL: RawImage.fromURL,
        fromTensor: RawImage.fromTensor,
      };
    })();
    birefnetBundle.catch(() => { birefnetBundle = null; }); // let a failed load retry
  }
  return birefnetBundle;
}

async function removeBackgroundViaBiRefNetWeb(
  srcUrl: string,
  onProgress?: (pct: number, stage: BgStage) => void,
): Promise<string> {
  const { model, processor, fromURL, fromTensor } = await loadBiRefNetWeb(onProgress);
  onProgress?.(40, 'process');
  const image = await fromURL(srcUrl);
  const { pixel_values } = await processor(image);
  const { output_image } = await model({ input_image: pixel_values });
  onProgress?.(80, 'process');
  // output_image[0] is the single-channel alpha matte logits → sigmoid → 0–255 → image size
  const mask = fromTensor(output_image[0].sigmoid().mul(255).to('uint8')).resize(image.width, image.height);
  const url = await compositeGrayMaskAsAlpha(srcUrl, mask.data, mask.channels);
  onProgress?.(100, 'process');
  return url;
}

// Apply a grayscale alpha matte (resized to the source's dimensions) as the alpha
// channel over the ORIGINAL RGB — same idea as the ISNet colour-restore.
async function compositeGrayMaskAsAlpha(srcUrl: string, mask: Uint8Array, channels: number): Promise<string> {
  const img = await createImageBitmap(await (await fetch(srcUrl)).blob());
  const w = img.width, h = img.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = mask[i * channels];
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return URL.createObjectURL(blob);
}

export async function removeImageBackground(
  srcUrl: string,
  onProgress?: (percent: number, stage: BgStage) => void,
  model: BgModel = 'isnet',
  bgQuality: 'fast' | 'balanced' | 'quality' = 'quality',
): Promise<string> {
  // Try rembg local server first — BiRefNet/U2Net handle white-on-white and
  // complex edges far better than browser-side ISNet. If the server is not
  // running, fall through to the existing client-side pipeline transparently.
  const useRembg = await probeRembg();
  if (useRembg) {
    try {
      return await removeBackgroundViaRembg(srcUrl, REMBG_MODEL_MAP[bgQuality], onProgress);
    } catch (e) {
      console.warn('[rembg] server call failed, falling back to client pipeline:', e);
      // Only write the server off when it looks down (network error / bad gateway). A 4xx or
      // 500 is usually about this one image and shouldn't disable BiRefNet for the session.
      const status = (e as { status?: number }).status;
      if (status === undefined || status >= 502) rembgAvailable = false;
    }
  }

  // Quality mode on a WebGPU browser → BiRefNet on-device (best edges on white-on-white,
  // free, no uploads). Falls through to ISNet if it fails or the model can't load.
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
  if (bgQuality === 'quality' && hasWebGPU) {
    try {
      return await removeBackgroundViaBiRefNetWeb(srcUrl, onProgress);
    } catch (e) {
      console.warn('[birefnet-web] failed, falling back to ISNet:', e);
    }
  }

  // ISNet (DIS salient-object model) — the fallback / lighter path for fast & balanced
  // modes (40–80MB vs BiRefNet's ~490MB) and when WebGPU/BiRefNet is unavailable. It
  // returns a complete silhouette where the hand-rolled Sobel/BFS edge path leaks
  // through the low-contrast outer contour. Edge detection stays a last resort for the
  // degenerate case where ISNet removes essentially everything (DEGENERATE_MASK_THRESHOLD).
  const { removeBackground } = await import('@imgly/background-removal');

  // Step 1: boost contrast so ISNet sees a sharper subject/background boundary.
  const enhancedUrl = await preprocessForBgRemoval(srcUrl);
  const usedEnhanced = enhancedUrl !== srcUrl;

  const downloads = new Map<string, { current: number; total: number }>();
  let lastDownloadPct = 0;
  let lastReported = -1; // skip duplicate integer percents to cut re-renders

  const report = (pct: number, stage: BgStage) => {
    if (!onProgress) return;
    if (pct === lastReported && stage === 'download') return;
    lastReported = pct;
    onProgress(pct, stage);
  };

  let blob: Blob;
  try {
    blob = await removeBackground(enhancedUrl, {
      model,
      device: pickBgDevice(),  // WebGPU when available, else CPU — see pickBgDevice
      proxyToWorker: true,     // keeps UI responsive during batch
      output: { format: 'image/png' },
      progress: onProgress
        ? (key, current, total) => {
            if (key.startsWith('fetch')) {
              downloads.set(key, { current, total });
              let sumC = 0, sumT = 0;
              for (const d of downloads.values()) { sumC += d.current; sumT += d.total; }
              if (sumT > 0) {
                lastDownloadPct = Math.max(lastDownloadPct, Math.round((sumC / sumT) * 100));
                report(Math.min(lastDownloadPct, 100), 'download');
              }
            } else if (total > 0) {
              lastReported = -1;
              report(Math.round((current / total) * 100), 'process');
            }
          }
        : undefined,
    });
  } finally {
    if (usedEnhanced) URL.revokeObjectURL(enhancedUrl);
  }

  // Step 2: restore true colours. `blob` is the cutout of the contrast-boosted
  // image; swap its RGB back to the original source so the subject isn't washed out,
  // keeping only the model's alpha. Everything downstream runs on the colour-correct
  // version. `opaqueFraction` tells us whether ISNet actually found a subject.
  const { url: coloredUrl, opaqueFraction } = await reapplyOriginalColors(blob, srcUrl);

  // ISNet removed essentially the whole image → it failed to find the subject
  // (white-on-white). Fall back to edge detection for this one case.
  if (opaqueFraction < DEGENERATE_MASK_THRESHOLD) {
    URL.revokeObjectURL(coloredUrl);
    return runEdgePipeline(srcUrl, onProgress);
  }

  // Step 3: solidify the interior. ISNet leaves bright low-contrast surfaces (glossy
  // white faces, chrome) semi-transparent; this hard-fills everything enclosed by the
  // silhouette to opaque (and fills true holes), so the subject isn't faded. Superset
  // of fillInternalHoles.
  const filledUrl = await solidifyInterior(coloredUrl);
  if (filledUrl !== coloredUrl) URL.revokeObjectURL(coloredUrl);

  // Step 4: erode fringe pixels and feather edges on the corrected alpha mask.
  const refinedUrl = await refineAlphaEdges(filledUrl);
  if (refinedUrl !== filledUrl) URL.revokeObjectURL(filledUrl);
  return refinedUrl;
}

/**
 * Client-side AI super-resolution (ESRGAN-slim via UpscalerJS + TF.js, no server).
 * Returns a blob URL for the enlarged PNG. Used to rescue low-res product photos
 * that would otherwise go blurry when naively stretched to the 855/1000/1200px
 * export sizes.
 *
 * UpscalerJS, its model, and the whole of TF.js (~1MB+) are dynamically imported
 * so they stay out of the initial bundle — same lazy-load discipline as
 * `removeImageBackground`. A user who never upscales never pays the download.
 *
 * `patchSize` tiles the image through the GPU so a large photo doesn't OOM WebGL;
 * `padding` overlaps the tiles to hide seams. `onProgress` maps the library's
 * 0..1 tiling progress to 0–100.
 *
 * The model variant is selected by `factor`: esrgan-slim ships dedicated 2x/4x
 * weights (a 4x model, not 2x applied twice), so quality holds at 4x.
 */
export async function upscaleImage(
  srcUrl: string,
  factor: 2 | 4,
  onProgress?: (percent: number) => void,
  onAbortReady?: (abort: () => void) => void,
): Promise<string> {
  const [{ default: Upscaler }, modelMod] = await Promise.all([
    import('upscaler'),
    factor === 4 ? import('@upscalerjs/esrgan-slim/4x') : import('@upscalerjs/esrgan-slim/2x'),
  ]);

  const img = await loadImage(srcUrl);
  const upscaler = new Upscaler({ model: modelMod.default });
  onAbortReady?.(() => upscaler.abort());

  try {
    const result = await upscaler.upscale(img, {
      patchSize: 64,
      padding: 2,
      progress: (amount: number) => onProgress?.(Math.min(100, Math.round(amount * 100))),
    });

    const dataUrl = result.startsWith('data:') ? result : `data:image/png;base64,${result}`;
    const blob = await (await fetch(dataUrl)).blob();
    return URL.createObjectURL(blob);
  } finally {
    await upscaler.dispose();
  }
}

/**
 * `name` minus its extension, plus `ext` — made unique within `used` by appending
 * " (2)", " (3)"… so files with the same base name (e.g. from different folders)
 * don't overwrite each other in a ZIP. Case-insensitive, since most filesystems are.
 */
export function uniqueFileName(name: string, ext: string, used: Set<string>): string {
  const base = name.replace(/\.[^.]+$/, '') || name;
  let candidate = `${base}.${ext}`;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base} (${n}).${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Loads an image from an Object URL
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Computes the correct physical dimensions for the target output
 */
export function computeTargetDims(
  settings: Pick<ResizeSettings, 'aspectRatioType' | 'customWidth' | 'customHeight'>,
  targetSize: number | 'preview'
): { width: number; height: number } {
  if (targetSize === 'preview') {
    switch (settings.aspectRatioType) {
      case '1:1': return { width: 800, height: 800 };
      case '4:3': return { width: 800, height: 600 };
      case '3:4': return { width: 600, height: 800 };
      case '16:9': return { width: 800, height: 450 };
      default: return {
        width: Number(settings.customWidth) || 800,
        height: Number(settings.customHeight) || 800,
      };
    }
  }

  const size = targetSize;
  switch (settings.aspectRatioType) {
    case '1:1': return { width: size, height: size };
    case '4:3': return { width: size, height: Math.round((size * 3) / 4) };
    case '3:4': return { width: Math.round((size * 3) / 4), height: size };
    case '16:9': return { width: size, height: Math.round((size * 9) / 16) };
    default: {
      const customW = Number(settings.customWidth) || 800;
      const customH = Number(settings.customHeight) || 800;
      return customW > customH
        ? { width: size, height: Math.round((size * customH) / customW) }
        : { width: Math.round((size * customW) / customH), height: size };
    }
  }
}

/**
 * Creates a processed image based on user configuration using a Web Worker
 */
export async function processImageOnCanvas(
  img: HTMLImageElement,
  settings: ResizeSettings,
  outputWidth: number,
  outputHeight: number,
  batchId = '',
  onWarn?: (msg: string) => void,
  imageId = '',
): Promise<string> {
  const id = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  // cacheKey: stable per image+source so the worker can cache trim/CoM results.
  // Uses imageId + the img src (a blob URL that changes when the effective source changes).
  const cacheKey = imageId ? `${imageId}_${img.src}` : id;
  const isPreview = batchId.startsWith('preview-');
  const bitmap = await createImageBitmap(img);
  return getPool().run(
    { type: 'PROCESS', id, cacheKey, isPreview, bitmap, settings, outputWidth, outputHeight },
    [bitmap],
    batchId,
    onWarn,
  );
}

/** Cancel all queued preview jobs for a batch (called when settings change mid-batch). */
export function cancelProcessingBatch(batchId: string) {
  getPool().cancelBatch(batchId);
}

/** Terminate all workers and reject pending jobs. Exposed for testing and explicit cleanup. */
export function teardownWorkerPool() {
  pool?.teardown();
  pool = null;
}

/**
 * Downloads a data URL
 */
export function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

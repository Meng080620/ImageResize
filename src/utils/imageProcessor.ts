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
  message: WorkerMessage;
  transfer: Transferable[];
  resolve: (url: string) => void;
  reject: (err: Error) => void;
}

/**
 * Round-robin-ish pool that dispatches each job to an idle worker and queues the
 * rest. A single worker serialized the whole batch on every settings change; the
 * pool lets `navigator.hardwareConcurrency` jobs run in parallel.
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
      // Module-load / uncaught worker failure: fail the in-flight job rather than hang.
      worker.onerror = () => {
        const job = this.busyWith.get(worker);
        if (job) {
          job.reject(new Error('Image worker crashed'));
          this.release(worker);
        }
      };
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  private handleDone(worker: Worker, msg: WorkerResponse) {
    const job = this.busyWith.get(worker);
    if (job) {
      if (msg.type === 'DONE') job.resolve(URL.createObjectURL(msg.blob));
      else job.reject(new Error(msg.error));
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

  run(message: WorkerMessage, transfer: Transferable[]): Promise<string> {
    this.ensureSpawned();
    return new Promise((resolve, reject) => {
      this.queue.push({ message, transfer, resolve, reject });
      this.pump();
    });
  }
}

let pool: ImageWorkerPool | null = null;
function getPool(): ImageWorkerPool {
  if (!pool) pool = new ImageWorkerPool();
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

export async function removeImageBackground(
  srcUrl: string,
  onProgress?: (percent: number, stage: BgStage) => void,
): Promise<string> {
  const { removeBackground } = await import('@imgly/background-removal');

  const downloads = new Map<string, { current: number; total: number }>();
  let lastDownloadPct = 0;
  let lastReported = -1; // skip duplicate integer percents to cut re-renders

  const report = (pct: number, stage: BgStage) => {
    if (!onProgress) return;
    if (pct === lastReported && stage === 'download') return;
    lastReported = pct;
    onProgress(pct, stage);
  };

  const blob = await removeBackground(srcUrl, {
    model: 'isnet_fp16',
    device: pickBgDevice(),     // WebGPU when available, else CPU — see pickBgDevice
    proxyToWorker: true,        // run inference off the main thread so the UI stays responsive during a batch
    output: { format: 'image/png' },
    progress: onProgress
      ? (key, current, total) => {
          if (key.startsWith('fetch')) {
            downloads.set(key, { current, total });
            let sumC = 0, sumT = 0;
            for (const d of downloads.values()) { sumC += d.current; sumT += d.total; }
            if (sumT > 0) {
              // A newly-discovered asset can briefly shrink the ratio; clamp monotonic.
              lastDownloadPct = Math.max(lastDownloadPct, Math.round((sumC / sumT) * 100));
              report(Math.min(lastDownloadPct, 100), 'download');
            }
          } else if (total > 0) {
            lastReported = -1; // entering process phase: allow the first 0% through
            report(Math.round((current / total) * 100), 'process');
          }
        }
      : undefined,
  });
  return URL.createObjectURL(blob);
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
): Promise<string> {
  const [{ default: Upscaler }, modelMod] = await Promise.all([
    import('upscaler'),
    factor === 4 ? import('@upscalerjs/esrgan-slim/4x') : import('@upscalerjs/esrgan-slim/2x'),
  ]);

  const img = await loadImage(srcUrl);
  const upscaler = new Upscaler({ model: modelMod.default });

  try {
    const result = await upscaler.upscale(img, {
      patchSize: 64,
      padding: 2,
      progress: (amount: number) => onProgress?.(Math.min(100, Math.round(amount * 100))),
    });

    // upscale() returns a base64 data URL by default; normalize then materialize
    // a blob URL so the rest of the pipeline treats it like every other source.
    const dataUrl = result.startsWith('data:') ? result : `data:image/png;base64,${result}`;
    const blob = await (await fetch(dataUrl)).blob();
    return URL.createObjectURL(blob);
  } finally {
    // Free the TF.js tensors/model this instance allocated; the lazy chunk stays
    // cached, but the GPU memory must be released or repeated upscales leak it.
    await upscaler.dispose();
  }
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
  outputHeight: number
): Promise<string> {
  const id = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Convert HTMLImageElement to ImageBitmap so we can pass it to the worker
  const bitmap = await createImageBitmap(img);

  // Transfer the bitmap ownership to the worker for performance.
  return getPool().run(
    { type: 'PROCESS', id, bitmap, settings, outputWidth, outputHeight },
    [bitmap]
  );
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

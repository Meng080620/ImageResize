import { ResizeSettings } from '../types';
import type { WorkerMessage, WorkerResponse } from '../workers/imageWorker';

// Initialize a singleton Web Worker
let workerInstance: Worker | null = null;
const workerQueue: Record<string, { resolve: (url: string) => void, reject: (err: Error) => void }> = {};

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('../workers/imageWorker.ts', import.meta.url), { type: 'module' });
    workerInstance.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'DONE') {
        const url = URL.createObjectURL(msg.blob);
        workerQueue[msg.id]?.resolve(url);
        delete workerQueue[msg.id];
      } else if (msg.type === 'ERROR') {
        workerQueue[msg.id]?.reject(new Error(msg.error));
        delete workerQueue[msg.id];
      }
    };
  }
  return workerInstance;
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
  const worker = getWorker();
  const id = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Convert HTMLImageElement to ImageBitmap so we can pass it to the worker
  const bitmap = await createImageBitmap(img);

  return new Promise((resolve, reject) => {
    workerQueue[id] = { resolve, reject };
    worker.postMessage(
      { type: 'PROCESS', id, bitmap, settings, outputWidth, outputHeight } as WorkerMessage,
      [bitmap] // Transfer the bitmap ownership to the worker for performance
    );
  });
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

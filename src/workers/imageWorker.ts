/// <reference lib="webworker" />
import { ResizeSettings } from '../types';

export type WorkerMessage =
  | { type: 'PROCESS'; id: string; cacheKey: string; isPreview: boolean; bitmap: ImageBitmap; settings: ResizeSettings; outputWidth: number; outputHeight: number; }
  | { type: 'CLEANUP' };

export type WorkerResponse =
  | { type: 'DONE'; id: string; blob: Blob; warnings?: string[] }
  | { type: 'ERROR'; id: string; error: string }
  | { type: 'WARN'; id: string; warning: string };

// Per-image caches keyed by cacheKey (imageId + source URL). These avoid
// re-running the expensive trim and center-of-mass scans on every preview
// re-render when only shadow/color/format settings change.
const trimCache   = new Map<string, OffscreenCanvas | null>();
const comCache    = new Map<string, { dx: number; dy: number }>();
const shadowCache = new Map<string, OffscreenCanvas>(); // key: cacheKey + shadow settings hash

const MAX_CACHE = 30; // evict oldest when over this many entries
function evictIfNeeded(map: Map<string, unknown>) {
  if (map.size > MAX_CACHE) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
}

function getBorderAverageColor(bitmap: ImageBitmap): string {
  const size = 50;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  if (!ctx) return '#ffffff';

  ctx.drawImage(bitmap, 0, 0, size, size);
  try {
    const data = ctx.getImageData(0, 0, size, size).data;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    const borderPixels: number[] = [];
    
    for (let x = 0; x < size; x++) { borderPixels.push(x, 0); borderPixels.push(x, size - 1); }
    for (let y = 1; y < size - 1; y++) { borderPixels.push(0, y); borderPixels.push(size - 1, y); }

    for (let i = 0; i < borderPixels.length; i += 2) {
      const px = borderPixels[i];
      const py = borderPixels[i + 1];
      const index = (py * size + px) * 4;
      
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      if (a > 100) {
        rSum += r; gSum += g; bSum += b; count++;
      }
    }

    if (count === 0) return '#ffffff';
    const rAvg = Math.round(rSum / count);
    const gAvg = Math.round(gSum / count);
    const bAvg = Math.round(bSum / count);
    const toHex = (c: number) => { const hex = c.toString(16); return hex.length === 1 ? '0' + hex : hex; };
    return `#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`;
  } catch (e) {
    return '#ffffff';
  }
}

function getCenterOfMassOffset(bitmap: ImageBitmap | OffscreenCanvas): { dx: number, dy: number } {
  // A quick low-res scan to find the visual center of gravity
  const size = 100;
  const scaleX = bitmap.width / size;
  const scaleY = bitmap.height / size;

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('getCenterOfMassOffset: getContext returned null (OOM?)');
  ctx.drawImage(bitmap, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  let sumX = 0, sumY = 0, totalWeight = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const alpha = data[idx + 3];
      // Exclude near-white backgrounds from center calculation
      const r = data[idx]; const g = data[idx + 1]; const b = data[idx + 2];
      const isWhite = r >= 240 && g >= 240 && b >= 240 && alpha > 240;
      
      if (alpha > 20 && !isWhite) {
        // Use alpha as weight
        sumX += x * alpha;
        sumY += y * alpha;
        totalWeight += alpha;
      }
    }
  }

  if (totalWeight === 0) return { dx: 0, dy: 0 }; // Default to center

  const centerX = sumX / totalWeight;
  const centerY = sumY / totalWeight;
  
  // Return the offset from the true center of the image back to the center of mass
  const trueCenterX = size / 2;
  const trueCenterY = size / 2;

  // We want to shift the image by this amount to center its mass
  return {
    dx: (trueCenterX - centerX) * scaleX,
    dy: (trueCenterY - centerY) * scaleY
  };
}

function getTrimmedCanvas(bitmap: ImageBitmap): OffscreenCanvas | null {
  const maxDetectionSize = 600;
  const scale = Math.min(1, maxDetectionSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('getTrimmedCanvas: getContext returned null (OOM?)');
  ctx.drawImage(bitmap, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const { data } = imgData;
  
  let minX = w, minY = h, maxX = 0, maxY = 0;
  let anyContentDetected = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], alpha = data[idx + 3];
      const isTransparent = alpha < 12;
      const isWhite = r >= 248 && g >= 248 && b >= 248 && alpha > 240;

      if (!isTransparent && !isWhite) {
        anyContentDetected = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!anyContentDetected || minX > maxX || minY > maxY) return null;

  const origX = Math.max(0, Math.floor(minX / scale));
  const origY = Math.max(0, Math.floor(minY / scale));
  const origWidth = Math.min(bitmap.width - origX, Math.ceil((maxX - minX + 1) / scale));
  const origHeight = Math.min(bitmap.height - origY, Math.ceil((maxY - minY + 1) / scale));

  if (origWidth <= 2 || origHeight <= 2) return null;

  const croppedCanvas = new OffscreenCanvas(origWidth, origHeight);
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) throw new Error('getTrimmedCanvas: getContext (crop) returned null (OOM?)');

  croppedCtx.drawImage(
    bitmap, 
    origX, origY, origWidth, origHeight,
    0, 0, origWidth, origHeight
  );

  return croppedCanvas;
}

function hasEnhancement(s: ResizeSettings): boolean {
  return s.brightness !== 100 || s.contrast !== 100 || s.saturation !== 100 || s.sharpen > 0;
}

/**
 * Unsharp mask via a 3×3 sharpen convolution. Run on the draw-sized product
 * canvas (≤ output size), so cost stays bounded even on a 4000px source.
 * Alpha is preserved untouched so cutouts keep clean edges.
 */
function applyUnsharpMask(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount <= 0 || w < 3 || h < 3) return;
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data, d = out.data;
  const center = 1 + 4 * amount;
  const side = -amount;
  const stride = w * 4;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const idx = i + c;
        const left = x > 0 ? s[idx - 4] : s[idx];
        const right = x < w - 1 ? s[idx + 4] : s[idx];
        const up = y > 0 ? s[idx - stride] : s[idx];
        const down = y < h - 1 ? s[idx + stride] : s[idx];
        const v = s[idx] * center + (left + right + up + down) * side;
        d[idx] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      d[i + 3] = s[i + 3]; // keep original alpha
    }
  }
  ctx.putImageData(out, 0, 0);
}

/**
 * Renders the product into a draw-sized canvas with quality enhancement applied:
 * brightness/contrast/saturation via the native (GPU) canvas filter, then a
 * sharpen pass. Only the product is enhanced — never the background or shadow.
 */
function renderEnhancedProduct(
  source: ImageBitmap | OffscreenCanvas,
  w: number,
  h: number,
  settings: ResizeSettings,
  quality: ImageSmoothingQuality = 'high',
): OffscreenCanvas {
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  const canvas = new OffscreenCanvas(cw, ch);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('renderEnhancedProduct: getContext returned null (OOM?)');

  const filters: string[] = [];
  if (settings.brightness !== 100) filters.push(`brightness(${settings.brightness}%)`);
  if (settings.contrast !== 100) filters.push(`contrast(${settings.contrast}%)`);
  if (settings.saturation !== 100) filters.push(`saturate(${settings.saturation}%)`);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = quality;
  if (filters.length > 0 && 'filter' in ctx) ctx.filter = filters.join(' ');
  ctx.drawImage(source, 0, 0, cw, ch);
  ctx.filter = 'none';

  applyUnsharpMask(ctx, cw, ch, settings.sharpen / 100);
  return canvas;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  
  if (msg.type === 'PROCESS') {
    try {
      const { cacheKey, isPreview, bitmap, settings, outputWidth, outputHeight } = msg;
      const smoothingQuality: ImageSmoothingQuality = isPreview ? 'medium' : 'high';

      const canvas = new OffscreenCanvas(outputWidth, outputHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('PROCESS: getContext returned null — out of GPU/canvas memory');

      // 1. Background
      if (settings.bgStyle === 'transparent') {
        ctx.clearRect(0, 0, outputWidth, outputHeight);
      } else if (settings.bgStyle === 'solid') {
        ctx.fillStyle = settings.backgroundColor;
        ctx.fillRect(0, 0, outputWidth, outputHeight);
      } else if (settings.bgStyle === 'auto') {
        ctx.fillStyle = getBorderAverageColor(bitmap);
        ctx.fillRect(0, 0, outputWidth, outputHeight);
      } else if (settings.bgStyle === 'blurred') {
        ctx.save();
        const bgScale = Math.max(outputWidth / bitmap.width, outputHeight / bitmap.height);
        const bgW = bitmap.width * bgScale * 1.2;
        const bgH = bitmap.height * bgScale * 1.2;
        const bgX = (outputWidth - bgW) / 2;
        const bgY = (outputHeight - bgH) / 2;

        ctx.drawImage(bitmap, bgX, bgY, bgW, bgH);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(0, 0, outputWidth, outputHeight);

        if ('filter' in ctx) {
          ctx.filter = 'blur(15px)';
          ctx.drawImage(bitmap, bgX, bgY, bgW, bgH);
          ctx.filter = 'none';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.fillRect(0, 0, outputWidth, outputHeight);
        }
        ctx.restore();
      }

      // 2. Trim — cached: result depends only on the source bitmap pixels, not on
      //    color/shadow/format settings, so we skip the pixel scan on repeat renders.
      let sourceElement: ImageBitmap | OffscreenCanvas = bitmap;
      const warnings: string[] = [];
      if (settings.trimProductMargins) {
        if (!trimCache.has(cacheKey)) {
          const trimmed = getTrimmedCanvas(bitmap);
          trimCache.set(cacheKey, trimmed);
          evictIfNeeded(trimCache);
        }
        const cached = trimCache.get(cacheKey);
        if (cached) {
          sourceElement = cached;
        } else {
          warnings.push('Trim margins found no product content — using the full image.');
        }
      }

      // 3. Center of mass (Auto-Center) — cached for the same reason as trim.
      let centerDx = 0;
      let centerDy = 0;
      if (settings.autoCenter) {
        if (!comCache.has(cacheKey)) {
          const offset = getCenterOfMassOffset(sourceElement);
          comCache.set(cacheKey, offset);
          evictIfNeeded(comCache);
        }
        const cached = comCache.get(cacheKey)!;
        centerDx = cached.dx;
        centerDy = cached.dy;
      }

      // 4. Coordinates
      const paddingPx = (settings.padding / 100) * Math.min(outputWidth, outputHeight);
      const availableWidth = outputWidth - paddingPx * 2;
      const availableHeight = outputHeight - paddingPx * 2;

      let drawW = sourceElement.width;
      let drawH = sourceElement.height;
      let drawX = paddingPx;
      let drawY = paddingPx;

      if (settings.fitMode === 'contain') {
        const imgRatio = sourceElement.width / sourceElement.height;
        const canvasRatio = availableWidth / availableHeight;
        const isSmallerThanBox = sourceElement.width < availableWidth && sourceElement.height < availableHeight;
        if (isSmallerThanBox && !settings.upscaleSmallImages) {
          drawW = sourceElement.width; drawH = sourceElement.height;
        } else {
          if (imgRatio > canvasRatio) { drawW = availableWidth; drawH = availableWidth / imgRatio; } 
          else { drawH = availableHeight; drawW = availableHeight * imgRatio; }
        }
      } else if (settings.fitMode === 'cover') {
        const imgRatio = sourceElement.width / sourceElement.height;
        const canvasRatio = availableWidth / availableHeight;
        const isSmallerThanBox = sourceElement.width < availableWidth && sourceElement.height < availableHeight;
        if (isSmallerThanBox && !settings.upscaleSmallImages) {
          drawW = sourceElement.width; drawH = sourceElement.height;
        } else {
          if (imgRatio > canvasRatio) { drawH = availableHeight; drawW = availableHeight * imgRatio; } 
          else { drawW = availableWidth; drawH = availableWidth / imgRatio; }
        }
      } else if (settings.fitMode === 'stretch') {
        const isSmallerThanBox = sourceElement.width < availableWidth && sourceElement.height < availableHeight;
        if (isSmallerThanBox && !settings.upscaleSmallImages) {
          drawW = sourceElement.width; drawH = sourceElement.height;
        } else {
          drawW = availableWidth; drawH = availableHeight;
        }
      }

      // Apply Center of Mass ratio to drawing box
      const scaleToDrawW = drawW / sourceElement.width;
      const scaleToDrawH = drawH / sourceElement.height;

      let alignX = paddingPx + (availableWidth - drawW) / 2 + (centerDx * scaleToDrawW);
      let alignY = paddingPx + (availableHeight - drawH) / 2 + (centerDy * scaleToDrawH);

      if (settings.alignment === 'top') alignY = paddingPx;
      else if (settings.alignment === 'bottom') alignY = outputHeight - paddingPx - drawH;
      else if (settings.alignment === 'left') alignX = paddingPx;
      else if (settings.alignment === 'right') alignX = outputWidth - paddingPx - drawW;

      drawX = alignX;
      drawY = alignY;

      ctx.save();
      if (settings.fitMode === 'cover') {
        const clipPath = new Path2D();
        clipPath.rect(paddingPx, paddingPx, availableWidth, availableHeight);
        ctx.clip(clipPath);
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = smoothingQuality;

      // 5. Shadows
      if (settings.shadowType && settings.shadowType !== 'none') {
        let blur = 0, offsetX = 0, offsetY = 0, opacity = 0.2, spread = 0;
        let placement: 'outset' | 'inset' = 'outset';
        let color = settings.shadowColor || '#000000';

        if (settings.shadowType === 'soft') { blur = 15; offsetY = 8; opacity = 0.15; }
        else if (settings.shadowType === 'medium') { blur = 25; offsetY = 15; opacity = 0.25; }
        else if (settings.shadowType === 'hard') { blur = 2; offsetX = 5; offsetY = 10; opacity = 0.40; }
        else if (settings.shadowType === 'glow') { blur = 20; opacity = 0.35; }
        else if (settings.shadowType === 'custom') {
          blur = settings.shadowBlur; offsetX = settings.shadowOffsetX; offsetY = settings.shadowOffsetY;
          opacity = settings.shadowOpacity; spread = settings.shadowSpread; placement = settings.shadowPlacement;
        }

        let r = 0, g = 0, b = 0;
        const cleanHex = color.replace('#', '');
        if (cleanHex.length === 3) {
          r = parseInt(cleanHex[0]+cleanHex[0], 16);
          g = parseInt(cleanHex[1]+cleanHex[1], 16);
          b = parseInt(cleanHex[2]+cleanHex[2], 16);
        } else if (cleanHex.length === 6) {
          r = parseInt(cleanHex.substring(0, 2), 16);
          g = parseInt(cleanHex.substring(2, 4), 16);
          b = parseInt(cleanHex.substring(4, 6), 16);
        }
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
          warnings.push(`Invalid shadow color "${color}" — falling back to black.`);
          r = 0; g = 0; b = 0;
        }

        if (placement === 'inset') {
          ctx.save();
          ctx.beginPath(); ctx.rect(0, 0, outputWidth, outputHeight); ctx.clip();
          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${opacity})`; ctx.shadowBlur = blur;
          ctx.shadowOffsetX = offsetX; ctx.shadowOffsetY = offsetY;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          ctx.beginPath();
          ctx.rect(-1000, -1000, outputWidth + 2000, outputHeight + 2000);
          const insetSpread = Math.max(0, spread);
          ctx.rect(insetSpread, insetSpread, outputWidth - insetSpread * 2, outputHeight - insetSpread * 2);
          ctx.fill('evenodd');
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = opacity;
          if ('filter' in ctx) ctx.filter = `blur(${blur}px)`;

          // Allocate at draw size, not source size — avoids OOM on large/upscaled images.
          // Cache the silhouette keyed by source + shadow color so changing only blur/offset
          // (which are applied via canvas state, not by re-drawing) reuses the cached canvas.
          const silW = Math.max(1, Math.ceil(drawW));
          const silH = Math.max(1, Math.ceil(drawH));
          const silKey = `${cacheKey}_sil_${r}_${g}_${b}_${silW}_${silH}`;
          let silhouetteCanvas = shadowCache.get(silKey);
          if (!silhouetteCanvas) {
            silhouetteCanvas = new OffscreenCanvas(silW, silH);
            const sCtx = silhouetteCanvas.getContext('2d');
            if (!sCtx) throw new Error('shadow silhouette: getContext returned null (OOM?)');
            sCtx.drawImage(sourceElement, 0, 0, silW, silH);
            sCtx.globalCompositeOperation = 'source-in';
            sCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            sCtx.fillRect(0, 0, silW, silH);
            shadowCache.set(silKey, silhouetteCanvas);
            evictIfNeeded(shadowCache);
          }

          ctx.drawImage(silhouetteCanvas, drawX + offsetX - spread, drawY + offsetY - spread, drawW + spread * 2, drawH + spread * 2);
          ctx.restore();
        }
      }

      if (hasEnhancement(settings)) {
        const enhanced = renderEnhancedProduct(sourceElement, drawW, drawH, settings, smoothingQuality);
        ctx.drawImage(enhanced, drawX, drawY);
      } else {
        ctx.drawImage(sourceElement, drawX, drawY, drawW, drawH);
      }
      ctx.restore();

      // Convert to blob
      let mimeType = 'image/jpeg';
      if (settings.exportFormat === 'png') mimeType = 'image/png';
      else if (settings.exportFormat === 'webp') mimeType = 'image/webp';

      const blob = await canvas.convertToBlob({ type: mimeType, quality: settings.exportQuality });
      
      self.postMessage({ type: 'DONE', id: msg.id, blob, warnings: warnings.length ? warnings : undefined } as WorkerResponse);
      
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      self.postMessage({ type: 'ERROR', id: msg.id, error: message } as WorkerResponse);
    }
  } else if (msg.type === 'CLEANUP') {
    trimCache.clear();
    comCache.clear();
    shadowCache.clear();
  }
};

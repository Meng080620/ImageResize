/// <reference lib="webworker" />
import { ResizeSettings } from '../types';

export type WorkerMessage = 
  | { type: 'PROCESS'; id: string; bitmap: ImageBitmap; settings: ResizeSettings; outputWidth: number; outputHeight: number; }
  | { type: 'CLEANUP' };

export type WorkerResponse = 
  | { type: 'DONE'; id: string; blob: Blob }
  | { type: 'ERROR'; id: string; error: string };

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
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
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
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
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
  const croppedCtx = croppedCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  
  croppedCtx.drawImage(
    bitmap, 
    origX, origY, origWidth, origHeight,
    0, 0, origWidth, origHeight
  );

  return croppedCanvas;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  
  if (msg.type === 'PROCESS') {
    try {
      const { bitmap, settings, outputWidth, outputHeight } = msg;
      
      const canvas = new OffscreenCanvas(outputWidth, outputHeight);
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      
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

      // 2. Trim
      let sourceElement: ImageBitmap | OffscreenCanvas = bitmap;
      if (settings.trimProductMargins) {
        const trimmed = getTrimmedCanvas(bitmap);
        if (trimmed) sourceElement = trimmed;
      }

      // 3. Center of mass (Auto-Center)
      let centerDx = 0;
      let centerDy = 0;
      if (settings.autoCenter) {
        const offset = getCenterOfMassOffset(sourceElement);
        centerDx = offset.dx;
        centerDy = offset.dy;
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
      ctx.imageSmoothingQuality = 'high';

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
        if (cleanHex.length === 3) { r = parseInt(cleanHex[0]+cleanHex[0], 16); g = parseInt(cleanHex[1]+cleanHex[1], 16); b = parseInt(cleanHex[2]+cleanHex[2], 16); }
        else if (cleanHex.length === 6) { r = parseInt(cleanHex.substring(0, 2), 16); g = parseInt(cleanHex.substring(2, 4), 16); b = parseInt(cleanHex.substring(4, 6), 16); }

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

          const silhouetteCanvas = new OffscreenCanvas(sourceElement.width, sourceElement.height);
          const sCtx = silhouetteCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
          sCtx.drawImage(sourceElement, 0, 0);
          sCtx.globalCompositeOperation = 'source-in';
          sCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          sCtx.fillRect(0, 0, sourceElement.width, sourceElement.height);

          ctx.drawImage(silhouetteCanvas, drawX + offsetX - spread, drawY + offsetY - spread, drawW + spread * 2, drawH + spread * 2);
          ctx.restore();
        }
      }

      ctx.drawImage(sourceElement, drawX, drawY, drawW, drawH);
      ctx.restore();

      // Convert to blob
      let mimeType = 'image/jpeg';
      if (settings.exportFormat === 'png') mimeType = 'image/png';
      else if (settings.exportFormat === 'webp') mimeType = 'image/webp';

      const blob = await canvas.convertToBlob({ type: mimeType, quality: settings.exportQuality });
      
      self.postMessage({ type: 'DONE', id: msg.id, blob } as WorkerResponse);
      
    } catch (e: any) {
      self.postMessage({ type: 'ERROR', id: msg.id, error: e.message } as WorkerResponse);
    }
  }
};

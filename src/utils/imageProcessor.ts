/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResizeSettings } from '../types';

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
 * Scans the outer margins of the image to find the average edge color.
 * This color is optimal for seamless extension background filling.
 */
export function getBorderAverageColor(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  const size = 50; // Use small canvas for speed and natural smoothing
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#ffffff';

  ctx.drawImage(img, 0, 0, size, size);

  try {
    const data = ctx.getImageData(0, 0, size, size).data;
    
    // Sum pixel colors along the extreme edges: top, bottom, left, right border
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    
    const borderPixels: number[] = [];
    
    // Top & Bottom edges
    for (let x = 0; x < size; x++) {
      borderPixels.push(x, 0); // top
      borderPixels.push(x, size - 1); // bottom
    }
    // Left & Right edges
    for (let y = 1; y < size - 1; y++) {
      borderPixels.push(0, y); // left
      borderPixels.push(size - 1, y); // right
    }

    for (let i = 0; i < borderPixels.length; i += 2) {
      const px = borderPixels[i];
      const py = borderPixels[i + 1];
      const index = (py * size + px) * 4;
      
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      if (a > 100) { // skip transparent edges
        rSum += r;
        gSum += g;
        bSum += b;
        count++;
      }
    }

    if (count === 0) return '#ffffff';

    const rAvg = Math.round(rSum / count);
    const gAvg = Math.round(gSum / count);
    const bAvg = Math.round(bSum / count);

    // Convert to hex
    const toHex = (c: number) => {
      const hex = c.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`;
  } catch (e) {
    // If security block or anything, fall back to white
    return '#ffffff';
  }
}

/**
 * Trims transparent or near-white/near-solid borders from an image.
 * This ensures padding is calculated from the actual active product subject,
 * rather than any pre-existing blank spaces in the uploaded image.
 */
export function getTrimmedCanvas(img: HTMLImageElement): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  // Crop detection works best at high precision but needs to be fast.
  // Constrain detection canvas to max 600px dimension for performance.
  const maxDetectionSize = 600;
  const scale = Math.min(1, maxDetectionSize / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, w, h);
  let imgData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch (e) {
    // Cross-origin safe fallback
    return null;
  }

  const { data } = imgData;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let anyContentDetected = false;

  // Scan all pixels to find boundaries of the active subject
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const alpha = data[idx + 3];

      // A pixel is considered part of the main product if:
      // 1. It is not fully/mostly transparent (alpha >= 12)
      // 2. It is not extreme near-white (all channels above 248) if we want to trim white backdrops too
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

  // If no content is found or detection failed, return null (use original)
  if (!anyContentDetected || minX > maxX || minY > maxY) {
    return null;
  }

  // Translate back to the full original image size coordinates
  const origX = Math.max(0, Math.floor(minX / scale));
  const origY = Math.max(0, Math.floor(minY / scale));
  const origWidth = Math.min(img.width - origX, Math.ceil((maxX - minX + 1) / scale));
  const origHeight = Math.min(img.height - origY, Math.ceil((maxY - minY + 1) / scale));

  // Safeguard: Make sure the cropped box is valid and small enough to trim
  if (origWidth <= 2 || origHeight <= 2) {
    return null;
  }

  // Draw the original image cropped into a new canvas
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = origWidth;
  croppedCanvas.height = origHeight;
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) return null;

  // Draw the sub-rectangle of the original image
  croppedCtx.drawImage(
    img, 
    origX, origY, origWidth, origHeight, // source rectangle
    0, 0, origWidth, origHeight          // destination rectangle
  );

  return croppedCanvas;
}

/**
 * Creates a processed image based on user configuration settings using HTML5 Canvas
 */
export async function processImageOnCanvas(
  img: HTMLImageElement,
  settings: ResizeSettings,
  outputWidth: number,
  outputHeight: number
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2D context');

  // 1. Draw Background
  if (settings.bgStyle === 'transparent') {
    ctx.clearRect(0, 0, outputWidth, outputHeight);
  } else if (settings.bgStyle === 'solid') {
    ctx.fillStyle = settings.backgroundColor;
    ctx.fillRect(0, 0, outputWidth, outputHeight);
  } else if (settings.bgStyle === 'auto') {
    const derivedColor = getBorderAverageColor(img);
    ctx.fillStyle = derivedColor;
    ctx.fillRect(0, 0, outputWidth, outputHeight);
  } else if (settings.bgStyle === 'blurred') {
    // Render scaled/blurred image as background
    ctx.save();
    
    // Draw blurred cover as baseline background
    const bgScale = Math.max(outputWidth / img.width, outputHeight / img.height);
    const bgW = img.width * bgScale * 1.2; // slightly larger for full bleed
    const bgH = img.height * bgScale * 1.2;
    const bgX = (outputWidth - bgW) / 2;
    const bgY = (outputHeight - bgH) / 2;
    
    // Draw backdrop
    ctx.drawImage(img, bgX, bgY, bgW, bgH);
    
    // Apply soft blur overlay using SVG-like overlay or standard browser filter (if supported)
    // We can use a dark or light tint overlay to look nice
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; // light glass tint
    ctx.fillRect(0, 0, outputWidth, outputHeight);
    
    // Let's add canvas filter blur support if supported
    if ('filter' in ctx) {
      // Create temporary canvas to draw blurred version to preserve layout
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = outputWidth;
      blurCanvas.height = outputHeight;
      const blurCtx = blurCanvas.getContext('2d');
      if (blurCtx) {
        blurCtx.filter = 'blur(15px)';
        blurCtx.drawImage(img, bgX, bgY, bgW, bgH);
        blurCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        blurCtx.fillRect(0, 0, outputWidth, outputHeight);
        ctx.drawImage(blurCanvas, 0, 0);
      }
    }
    
    ctx.restore();
  }

  // Define active product element (either original image or automatically trimmed canvas)
  let sourceElement: HTMLImageElement | HTMLCanvasElement = img;
  if (settings.trimProductMargins) {
    const trimmed = getTrimmedCanvas(img);
    if (trimmed) {
      sourceElement = trimmed;
    }
  }

  // 2. Calculate coordinates for the main image layer
  const paddingPx = (settings.padding / 100) * Math.min(outputWidth, outputHeight);
  const availableWidth = outputWidth - paddingPx * 2;
  const availableHeight = outputHeight - paddingPx * 2;

  let drawW = sourceElement.width;
  let drawH = sourceElement.height;
  let drawX = paddingPx;
  let drawY = paddingPx;

  if (settings.fitMode === 'contain') {
    // Fits the entire image while preserving aspect ratio, ensuring no cropping
    const imgRatio = sourceElement.width / sourceElement.height;
    const canvasRatio = availableWidth / availableHeight;

    const isSmallerThanBox = sourceElement.width < availableWidth && sourceElement.height < availableHeight;
    if (isSmallerThanBox && !settings.upscaleSmallImages) {
      // Skip upscaling small images if option is deactivated
      drawW = sourceElement.width;
      drawH = sourceElement.height;
    } else {
      // Scale up or down to match boundaries
      if (imgRatio > canvasRatio) {
        drawW = availableWidth;
        drawH = availableWidth / imgRatio;
      } else {
        drawH = availableHeight;
        drawW = availableHeight * imgRatio;
      }
    }
  } else if (settings.fitMode === 'cover') {
    // Fills the target zone, cropping overlaps if necessary
    const imgRatio = sourceElement.width / sourceElement.height;
    const canvasRatio = availableWidth / availableHeight;

    const isSmallerThanBox = sourceElement.width < availableWidth && sourceElement.height < availableHeight;
    if (isSmallerThanBox && !settings.upscaleSmallImages) {
      drawW = sourceElement.width;
      drawH = sourceElement.height;
    } else {
      if (imgRatio > canvasRatio) {
        drawH = availableHeight;
        drawW = availableHeight * imgRatio;
      } else {
        drawW = availableWidth;
        drawH = availableWidth / imgRatio;
      }
    }
  } else if (settings.fitMode === 'stretch') {
    // Standard unrecommended fill stretching
    const isSmallerThanBox = sourceElement.width < availableWidth && sourceElement.height < availableHeight;
    if (isSmallerThanBox && !settings.upscaleSmallImages) {
      drawW = sourceElement.width;
      drawH = sourceElement.height;
    } else {
      drawW = availableWidth;
      drawH = availableHeight;
    }
  }

  // Position alignment calculations
  // Center alignment:
  let alignX = paddingPx + (availableWidth - drawW) / 2;
  let alignY = paddingPx + (availableHeight - drawH) / 2;

  // Manual alignments overrides
  if (settings.alignment === 'top') {
    alignY = paddingPx;
  } else if (settings.alignment === 'bottom') {
    alignY = outputHeight - paddingPx - drawH;
  } else if (settings.alignment === 'left') {
    alignX = paddingPx;
  } else if (settings.alignment === 'right') {
    alignX = outputWidth - paddingPx - drawW;
  }

  // Ensure canvas doesn't draw negative positions when overflowing
  drawX = alignX;
  drawY = alignY;

  // Let's draw the final image onto the canvas
  // If we have fitMode 'cover', we should mask/clip to the container boundaries
  ctx.save();
  if (settings.fitMode === 'cover') {
    // Create clipping path for the active available boundary
    const clipPath = new Path2D();
    clipPath.rect(paddingPx, paddingPx, availableWidth, availableHeight);
    ctx.clip(clipPath);
  }

  // Enabled image-smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(sourceElement, drawX, drawY, drawW, drawH);
  ctx.restore();

  // Return the data URL
  let mimeType = 'image/jpeg';
  if (settings.exportFormat === 'png') {
    mimeType = 'image/png';
  } else if (settings.exportFormat === 'webp') {
    mimeType = 'image/webp';
  }

  return canvas.toDataURL(mimeType, settings.exportQuality);
}

/**
 * Downloads a simple dataUrl asset on trigger
 */
export function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

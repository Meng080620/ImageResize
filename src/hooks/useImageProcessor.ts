import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { UploadedImage, ResizeSettings } from '../types';
import { processImageOnCanvas, loadImage, computeTargetDims, revokeProcessedUrl, effectiveSourceUrl } from '../utils/imageProcessor';

const DEBOUNCE_MS = 300;
const OVERLAY_DELAY_MS = 200;

async function processOne(img: UploadedImage, settings: ResizeSettings) {
  try {
    const imgElem = await loadImage(effectiveSourceUrl(img));
    const { width: targetW, height: targetH } = computeTargetDims(settings, 'preview');
    const processedUrl = await processImageOnCanvas(imgElem, settings, targetW, targetH);
    return { ...img, processedUrl };
  } catch (err) {
    console.error('Error processing:', err);
    return { ...img, processedUrl: img.originalUrl };
  }
}

export function useImageProcessor(
  images: UploadedImage[], 
  setImages: Dispatch<SetStateAction<UploadedImage[]>>, 
  settings: ResizeSettings,
  selectedImageId: string | null = null,
) {
  const [isProcessing, setIsProcessing] = useState(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signature of every image's *source* (original, or cutout when bg-removed).
  // The effect only ever mutates `processedUrl`, so depending on source identity
  // is loop-free yet still retriggers when a cutout appears or the toggle flips.
  const sourceKey = images.map(img => effectiveSourceUrl(img)).join('|');

  useEffect(() => {
    let active = true;

    const showOverlayLater = () => {
      overlayTimerRef.current = setTimeout(() => {
        if (active) setIsProcessing(true);
      }, OVERLAY_DELAY_MS);
    };

    const hideOverlay = () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      setIsProcessing(false);
    };

    async function updateAllProcessed() {
      if (images.length === 0) return;
      showOverlayLater();

      const results = new Map<string, UploadedImage>();
      const selected = selectedImageId ? images.find(img => img.id === selectedImageId) : null;

      if (selected) {
        const processedSelected = await processOne(selected, settings);
        if (!active) return;
        results.set(selected.id, processedSelected);
        setImages(prev => prev.map(img => {
          if (img.id !== selected.id) return img;
          revokeProcessedUrl(img.processedUrl, img.originalUrl, processedSelected.processedUrl);
          return processedSelected;
        }));
      }

      const rest = images.filter(img => img.id !== selectedImageId);
      if (rest.length > 0) {
        const processedRest = await Promise.all(rest.map(img => processOne(img, settings)));
        if (!active) return;
        processedRest.forEach(img => results.set(img.id, img));
        setImages(prev => prev.map(img => {
          const next = results.get(img.id);
          if (!next || next === img) return img;
          revokeProcessedUrl(img.processedUrl, img.originalUrl, next.processedUrl);
          return next;
        }));
      }

      hideOverlay();
    }

    const timer = setTimeout(updateAllProcessed, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, [settings, images.length, selectedImageId, sourceKey]);

  return { isProcessing };
}

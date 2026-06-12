import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { UploadedImage, ResizeSettings } from '../types';
import { processImageOnCanvas, loadImage, computeTargetDims } from '../utils/imageProcessor';

const DEBOUNCE_MS = 300;
const OVERLAY_DELAY_MS = 200;

async function processOne(img: UploadedImage, settings: ResizeSettings) {
  try {
    const imgElem = await loadImage(img.originalUrl);
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
        setImages(prev => prev.map(img => img.id === selected.id ? processedSelected : img));
      }

      const rest = images.filter(img => img.id !== selectedImageId);
      if (rest.length > 0) {
        const processedRest = await Promise.all(rest.map(img => processOne(img, settings)));
        if (!active) return;
        processedRest.forEach(img => results.set(img.id, img));
        setImages(prev => prev.map(img => results.get(img.id) ?? img));
      }

      hideOverlay();
    }

    const timer = setTimeout(updateAllProcessed, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, [settings, images.length, selectedImageId]);

  return { isProcessing };
}

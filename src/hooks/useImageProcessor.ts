import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { UploadedImage, ResizeSettings } from '../types';
import {
  processImageOnCanvas, loadImage, computeTargetDims,
  revokeProcessedUrl, effectiveSourceUrl, cancelProcessingBatch,
} from '../utils/imageProcessor';

const DEBOUNCE_MS = 300;
const OVERLAY_DELAY_MS = 200;

async function processOne(
  img: UploadedImage,
  settings: ResizeSettings,
  batchId: string,
): Promise<{ result: UploadedImage; blobUrl: string | null }> {
  try {
    const imgElem = await loadImage(effectiveSourceUrl(img));
    const { width: targetW, height: targetH } = computeTargetDims(settings, 'preview');
    const processedUrl = await processImageOnCanvas(imgElem, settings, targetW, targetH, batchId, undefined, img.id);
    // Return both so the caller can revoke on cancel
    const blobUrl = processedUrl.startsWith('blob:') ? processedUrl : null;
    return { result: { ...img, processedUrl }, blobUrl };
  } catch (err) {
    // batch_cancelled is expected — re-throw so caller can distinguish
    if (err instanceof Error && err.message === 'batch_cancelled') throw err;
    console.error('Error processing:', err);
    return { result: { ...img, processedUrl: img.originalUrl }, blobUrl: null };
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

  // Monotonic batch ID: incremented each time the effect fires so we can cancel
  // queued (not yet dispatched) jobs from the previous batch.
  const batchCounter = useRef(0);

  const sourceKey = images.map(img => effectiveSourceUrl(img)).join('|');

  useEffect(() => {
    let active = true;
    const batchId = `preview-${++batchCounter.current}`;
    // Blob URLs created by this batch that haven't been committed to state yet
    const ownedUrls = new Set<string>();

    const showOverlayLater = () => {
      overlayTimerRef.current = setTimeout(() => {
        if (active) setIsProcessing(true);
      }, OVERLAY_DELAY_MS);
    };

    const hideOverlay = () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      setIsProcessing(false);
    };

    // Snapshot images at schedule time — avoids reading a stale closure if
    // the images array reference changes before the debounce fires.
    const imageSnapshot = images.slice();

    async function updateAllProcessed() {
      if (imageSnapshot.length === 0) return;
      showOverlayLater();

      const selected = selectedImageId
        ? imageSnapshot.find(img => img.id === selectedImageId)
        : null;

      // Process selected image first (visible, needs to feel instant)
      if (selected) {
        try {
          const { result, blobUrl } = await processOne(selected, settings, batchId);
          if (blobUrl) ownedUrls.add(blobUrl);
          if (!active) return;
          ownedUrls.delete(blobUrl ?? ''); // committed — no longer need to revoke
          setImages(prev => prev.map(img => {
            if (img.id !== selected.id) return img;
            revokeProcessedUrl(img.processedUrl, img.originalUrl, result.processedUrl);
            return result;
          }));
        } catch (e) {
          if (!active) return; // batch_cancelled — cleanup will handle URL revoke
        }
      }

      // Process the rest in parallel (background queue items)
      const rest = imageSnapshot.filter(img => img.id !== selectedImageId);
      if (rest.length > 0) {
        const settled = await Promise.allSettled(
          rest.map(img => processOne(img, settings, batchId))
        );
        if (!active) return;

        const results = new Map<string, UploadedImage>();
        settled.forEach((s, i) => {
          if (s.status === 'fulfilled') {
            const { result, blobUrl } = s.value;
            if (blobUrl) ownedUrls.add(blobUrl);
            ownedUrls.delete(blobUrl ?? ''); // committed
            results.set(rest[i].id, result);
          }
        });

        if (!active) return;

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
      // Cancel queued jobs in the pool so workers aren't wasted on stale work
      cancelProcessingBatch(batchId);
      // Revoke any blob URLs that were created but never committed to state
      ownedUrls.forEach(url => URL.revokeObjectURL(url));
      ownedUrls.clear();
    };
  // imageSnapshot is derived from images at schedule time; images.length + sourceKey
  // as deps ensures we reschedule when content changes without depending on the full array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, images.length, selectedImageId, sourceKey]);

  return { isProcessing };
}

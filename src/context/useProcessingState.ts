import { useState, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { UploadedImage } from '../types';
import { removeImageBackground, upscaleImage, BG_MODEL_MAP } from '../utils/imageProcessor';
import { useLocalStorage } from '../hooks/useLocalStorage';

export function useProcessingState(
  images: UploadedImage[],
  setImages: Dispatch<SetStateAction<UploadedImage[]>>,
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void,
) {
  // — Background removal —
  const [bgProcessingIds, setBgProcessingIds] = useState<Set<string>>(new Set());
  const [bgProgress, setBgProgress] = useState<number | null>(null);
  const [bgStage, setBgStage] = useState<'download' | 'process' | null>(null);
  const [bgBatch, setBgBatch] = useState<{ done: number; total: number } | null>(null);
  const [bgQuality, setBgQuality] = useLocalStorage<'fast' | 'balanced' | 'quality'>('ir_bg_quality', 'quality');
  const bgCancelledRef = useRef(false);

  const isBgProcessing = useCallback((id: string) => bgProcessingIds.has(id), [bgProcessingIds]);

  const handleCancelBgRemoval = useCallback(() => {
    bgCancelledRef.current = true;
    setBgProcessingIds(new Set());
    setBgProgress(null);
    setBgStage(null);
    setBgBatch(null);
    showToast('Background removal cancelled.', 'info');
  }, [showToast]);

  // NOTE: does NOT reset bgCancelledRef — callers own that to avoid the race where
  // a cancel fired between the batch-loop guard check and this function starting.
  const computeCutout = useCallback(async (id: string, srcUrl: string) => {
    setBgProcessingIds(prev => new Set(prev).add(id));
    setBgProgress(0);
    try {
      const cutoutUrl = await removeImageBackground(srcUrl, (pct, stage) => {
        setBgProgress(pct);
        setBgStage(stage);
      }, BG_MODEL_MAP[bgQuality], bgQuality);
      if (!bgCancelledRef.current) {
        setImages(prev => prev.map(img => {
          if (img.id !== id) return img;
          if (img.cutoutUrl && img.cutoutUrl.startsWith('blob:')) URL.revokeObjectURL(img.cutoutUrl);
          return { ...img, cutoutUrl, bgRemoved: true };
        }));
      } else if (cutoutUrl.startsWith('blob:')) {
        URL.revokeObjectURL(cutoutUrl); // result of a cancelled run — nothing owns it
      }
    } finally {
      setBgProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      if (!bgCancelledRef.current) {
        setBgProgress(null);
        setBgStage(null);
      }
    }
  }, [setImages, bgQuality]);

  const handleRemoveBackground = useCallback(async (id: string) => {
    const target = images.find(img => img.id === id);
    if (!target || bgProcessingIds.has(id)) return;

    if (target.cutoutUrl) {
      setImages(prev => prev.map(img => img.id === id ? { ...img, bgRemoved: !img.bgRemoved } : img));
      showToast(target.bgRemoved ? 'Background restored.' : 'Background removed.', target.bgRemoved ? 'info' : 'success');
      return;
    }

    const modelSizeHint = bgQuality === 'fast' ? '~20MB' : bgQuality === 'quality' ? '~80MB' : '~40MB';
    showToast(`Removing background — first run downloads the model (${modelSizeHint})…`, 'info');
    bgCancelledRef.current = false;
    try {
      const bgSource = target.upscaled && target.upscaledUrl ? target.upscaledUrl : target.originalUrl;
      await computeCutout(id, bgSource);
      if (!bgCancelledRef.current) showToast('Background removed.', 'success');
    } catch (e) {
      if (bgCancelledRef.current) return; // the cancel handler already told the user
      console.error('[bg-removal]', e);
      showToast('Background removal failed.', 'error');
    }
  }, [images, bgProcessingIds, setImages, showToast, computeCutout, bgQuality]);

  // Batch: sequential inference; images that already have a cutout are re-enabled up front.
  const handleRemoveBackgroundAll = useCallback(async () => {
    if (bgBatch || bgProcessingIds.size > 0) return;

    setImages(prev => prev.map(img => img.cutoutUrl ? { ...img, bgRemoved: true } : img));

    const pending = images.filter(img => !img.cutoutUrl);
    if (pending.length === 0) {
      showToast('All backgrounds already removed.', 'info');
      return;
    }

    bgCancelledRef.current = false;
    setBgBatch({ done: 0, total: pending.length });
    showToast(`Removing backgrounds for ${pending.length} image(s)…`, 'info');
    let failed = 0;
    for (const img of pending) {
      if (bgCancelledRef.current) break;
      try {
        const src = img.upscaled && img.upscaledUrl ? img.upscaledUrl : img.originalUrl;
        await computeCutout(img.id, src);
      } catch (e) {
        failed++;
      } finally {
        if (!bgCancelledRef.current)
          setBgBatch(prev => prev ? { ...prev, done: prev.done + 1 } : prev);
      }
    }
    if (!bgCancelledRef.current) {
      setBgBatch(null);
      showToast(failed > 0 ? `Done — ${failed} failed.` : 'Removed backgrounds for all images.', failed > 0 ? 'error' : 'success');
    }
  }, [images, bgBatch, bgProcessingIds, setImages, showToast, computeCutout]);

  // — AI upscaling —
  const [upscaleProcessingIds, setUpscaleProcessingIds] = useState<Set<string>>(new Set());
  const [upscaleProgress, setUpscaleProgress] = useState<number | null>(null);
  const upscaleAbortRef = useRef<(() => void) | null>(null);
  const upscaleCancelledRef = useRef(false);

  const isUpscaling = useCallback((id: string) => upscaleProcessingIds.has(id), [upscaleProcessingIds]);

  const handleCancelUpscale = useCallback(() => {
    upscaleCancelledRef.current = true;
    upscaleAbortRef.current?.();
    upscaleAbortRef.current = null;
    setUpscaleProcessingIds(new Set());
    setUpscaleProgress(null);
    showToast('Upscale cancelled.', 'info');
  }, [showToast]);

  const computeUpscale = useCallback(async (id: string, srcUrl: string, factor: 2 | 4) => {
    setUpscaleProcessingIds(prev => new Set(prev).add(id));
    setUpscaleProgress(0);
    try {
      const upscaledUrl = await upscaleImage(
        srcUrl, factor, setUpscaleProgress,
        (abort) => { upscaleAbortRef.current = abort; },
      );
      if (upscaleCancelledRef.current) {
        URL.revokeObjectURL(upscaledUrl); // finished despite the cancel — discard it
        return;
      }
      setImages(prev => prev.map(img => {
        if (img.id !== id) return img;
        if (img.upscaledUrl && img.upscaledUrl.startsWith('blob:')) URL.revokeObjectURL(img.upscaledUrl);
        return { ...img, upscaledUrl, upscaled: true };
      }));
    } finally {
      upscaleAbortRef.current = null;
      setUpscaleProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setUpscaleProgress(null);
    }
  }, [setImages]);

  const handleUpscale = useCallback(async (id: string, factor: 2 | 4) => {
    const target = images.find(img => img.id === id);
    if (!target || upscaleProcessingIds.has(id)) return;

    if (target.upscaledUrl) {
      setImages(prev => prev.map(img => img.id === id ? { ...img, upscaled: !img.upscaled } : img));
      showToast(target.upscaled ? 'Upscale removed.' : 'Upscale restored.', target.upscaled ? 'info' : 'success');
      return;
    }

    showToast('Upscaling — first run downloads the AI model…', 'info');
    upscaleCancelledRef.current = false;
    try {
      await computeUpscale(id, target.originalUrl, factor);
      if (!upscaleCancelledRef.current) showToast(`Upscaled ${factor}×.`, 'success');
    } catch (e) {
      if (upscaleCancelledRef.current) return; // aborting rejects the run — not a failure
      console.error('[upscale]', e);
      showToast('Upscale failed.', 'error');
    }
  }, [images, upscaleProcessingIds, setImages, showToast, computeUpscale]);

  return {
    isBgProcessing, bgProgress, bgStage, bgBatch, bgQuality, setBgQuality,
    handleRemoveBackground, handleRemoveBackgroundAll, handleCancelBgRemoval,
    isUpscaling, upscaleProgress,
    handleUpscale, handleCancelUpscale,
  };
}

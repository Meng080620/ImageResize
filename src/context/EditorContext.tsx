import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import JSZip from 'jszip';
import { UploadedImage, ResizeSettings, ASPECT_RATIOS } from '../types';
import { processImageOnCanvas, loadImage, computeTargetDims, downloadDataUrl, removeImageBackground, upscaleImage, effectiveSourceUrl } from '../utils/imageProcessor';
import { getSampleProducts } from '../utils/sampleImages';
import { useImageQueue } from '../hooks/useImageQueue';
import { useImageProcessor } from '../hooks/useImageProcessor';

const DEFAULT_SETTINGS: ResizeSettings = {
  aspectRatioType: '1:1',
  customWidth: 1000,
  customHeight: 1000,
  fitMode: 'contain',
  padding: 10,
  backgroundColor: '#ffffff',
  bgStyle: 'solid',
  alignment: 'center',
  exportFormat: 'jpeg',
  exportQuality: 0.90,
  upscaleSmallImages: true,
  trimProductMargins: true,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpen: 0,
  autoCenter: false,
  shadowType: 'none',
  shadowPlacement: 'outset',
  shadowSpread: 0,
  shadowBlur: 15,
  shadowOffsetX: 0,
  shadowOffsetY: 8,
  shadowOpacity: 0.20,
  shadowColor: '#000000',
};

interface EditorContextType {
  images: UploadedImage[];
  setImages: React.Dispatch<React.SetStateAction<UploadedImage[]>>;
  selectedImageId: string | null;
  setSelectedImageId: React.Dispatch<React.SetStateAction<string | null>>;
  settings: ResizeSettings;
  setSettings: React.Dispatch<React.SetStateAction<ResizeSettings>>;
  
  viewMode: 'split' | 'single' | 'grid';
  setViewMode: React.Dispatch<React.SetStateAction<'split' | 'single' | 'grid'>>;
  currentTab: 'editor' | 'sandbox';
  setCurrentTab: React.Dispatch<React.SetStateAction<'editor' | 'sandbox'>>;
  isPreviewOpen: boolean;
  setIsPreviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  modalBg: 'checkerboard' | 'white' | 'gray' | 'dark' | 'cream';
  setModalBg: React.Dispatch<React.SetStateAction<'checkerboard' | 'white' | 'gray' | 'dark' | 'cream'>>;
  showAlignmentGrid: boolean;
  setShowAlignmentGrid: React.Dispatch<React.SetStateAction<boolean>>;
  previewZoom: number;
  setPreviewZoom: React.Dispatch<React.SetStateAction<number>>;
  
  isProcessing: boolean;
  isZipping: boolean;
  toast: { message: string; type: 'success' | 'info' | 'error' } | null;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  dragActive: boolean;
  setDragActive: React.Dispatch<React.SetStateAction<boolean>>;
  
  exportSizeSelection: '300' | '600' | '855' | '1000' | '1200' | 'custom' | 'preview';
  setExportSizeSelection: React.Dispatch<React.SetStateAction<'300' | '600' | '855' | '1000' | '1200' | 'custom' | 'preview'>>;
  customExportSizeInput: number;
  setCustomExportSizeInput: React.Dispatch<React.SetStateAction<number>>;

  selectedImage: UploadedImage | null;
  activeExportSize: number | 'preview';
  imagesAnalysis: any[];
  stats: any;
  selectedImageAnalysis: any;

  handleFiles: (fileList: FileList) => void;
  handleRemoveImage: (id: string, e: React.MouseEvent) => void;
  handleClearAll: () => void;
  handleLoadSingleTestProduct: () => void;
  handleOpenBigPreviewHero: () => void;
  handleNextImage: () => void;
  handlePrevImage: () => void;
  handleResetSettings: () => void;
  handleRemoveBackground: (id: string) => void;
  handleRemoveBackgroundAll: () => void;
  isBgProcessing: (id: string) => boolean;
  bgProgress: number | null;        // 0–100 for the active removal, null when idle
  bgStage: 'download' | 'process' | null;
  bgBatch: { done: number; total: number } | null; // set while a batch removal runs
  handleUpscale: (id: string, factor: 2 | 4) => void;
  isUpscaling: (id: string) => boolean;
  upscaleProgress: number | null;   // 0–100 for the active upscale, null when idle
  handleDownloadSingle: () => void;
  handleDownloadZipWithSize: (targetSize: number | 'preview') => void;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  moveImage: (fromIndex: number, toIndex: number) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ResizeSettings>(DEFAULT_SETTINGS);
  
  const [viewMode, setViewMode] = useState<'split' | 'single' | 'grid'>('split');
  const [currentTab, setCurrentTab] = useState<'editor' | 'sandbox'>('editor');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [modalBg, setModalBg] = useState<'checkerboard' | 'white' | 'gray' | 'dark' | 'cream'>('checkerboard');
  const [showAlignmentGrid, setShowAlignmentGrid] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  
  const [isZipping, setIsZipping] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const [exportSizeSelection, setExportSizeSelection] = useState<'300' | '600' | '855' | '1000' | '1200' | 'custom' | 'preview'>('855');
  const [customExportSizeInput, setCustomExportSizeInput] = useState<number>(1500);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => prev?.message === message ? null : prev);
    }, 4500);
  }, []);

  const queue = useImageQueue(showToast);
  const { images, setImages, selectedImageId } = queue;

  const { isProcessing } = useImageProcessor(images, setImages, settings, selectedImageId);

  const handleOpenBigPreviewHero = () => {
    if (!selectedImageId) queue.handleLoadSingleTestProduct();
    setIsPreviewOpen(true);
  };

  const handleResetSettings = () => setSettings(DEFAULT_SETTINGS);

  // Background removal runs client-side and is expensive, so it's an explicit,
  // non-destructive toggle: compute the transparent cutout once, then flip
  // `bgRemoved` on/off without recomputing. The original is never discarded.
  const [bgProcessingIds, setBgProcessingIds] = useState<Set<string>>(new Set());
  const [bgProgress, setBgProgress] = useState<number | null>(null);
  const [bgStage, setBgStage] = useState<'download' | 'process' | null>(null);
  const [bgBatch, setBgBatch] = useState<{ done: number; total: number } | null>(null);
  const isBgProcessing = useCallback((id: string) => bgProcessingIds.has(id), [bgProcessingIds]);

  // Compute the cutout for one image, reporting progress. Throws on failure so
  // callers (single vs batch) decide how to surface it.
  const computeCutout = useCallback(async (id: string, srcUrl: string) => {
    setBgProcessingIds(prev => new Set(prev).add(id));
    setBgProgress(0);
    try {
      const cutoutUrl = await removeImageBackground(srcUrl, (pct, stage) => {
        setBgProgress(pct);
        setBgStage(stage);
      });
      setImages(prev => prev.map(img => img.id === id ? { ...img, cutoutUrl, bgRemoved: true } : img));
    } finally {
      setBgProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setBgProgress(null);
      setBgStage(null);
    }
  }, [setImages]);

  const handleRemoveBackground = useCallback(async (id: string) => {
    const target = images.find(img => img.id === id);
    if (!target || bgProcessingIds.has(id)) return;

    // Already have a cutout — just toggle which source the pipeline reads. No recompute.
    if (target.cutoutUrl) {
      setImages(prev => prev.map(img => img.id === id ? { ...img, bgRemoved: !img.bgRemoved } : img));
      showToast(target.bgRemoved ? 'Background restored.' : 'Background removed.', target.bgRemoved ? 'info' : 'success');
      return;
    }

    showToast('Removing background — first run downloads the model (~40MB)…', 'info');
    try {
      // Compose on the upscaled source when present so "upscale → remove bg"
      // yields a hi-res cutout. The reverse order (remove bg → upscale) also
      // works; it's just driven from the upscale handler instead.
      const bgSource = target.upscaled && target.upscaledUrl ? target.upscaledUrl : target.originalUrl;
      await computeCutout(id, bgSource);
      showToast('Background removed.', 'success');
    } catch (e) {
      showToast('Background removal failed.', 'error');
    }
  }, [images, bgProcessingIds, setImages, showToast, computeCutout]);

  // Batch: remove background for every image. The ~24MB model downloads once,
  // then images are processed sequentially (parallel inference would thrash
  // memory and the single ONNX session). Images that already have a cutout are
  // just re-enabled. One failure is skipped so the rest still complete.
  const handleRemoveBackgroundAll = useCallback(async () => {
    if (bgBatch || bgProcessingIds.size > 0) return;

    // Re-enable any cutouts we already have, up front.
    setImages(prev => prev.map(img => img.cutoutUrl ? { ...img, bgRemoved: true } : img));

    const pending = images.filter(img => !img.cutoutUrl);
    if (pending.length === 0) {
      showToast('All backgrounds already removed.', 'info');
      return;
    }

    setBgBatch({ done: 0, total: pending.length });
    showToast(`Removing backgrounds for ${pending.length} image(s)…`, 'info');
    let failed = 0;
    for (const img of pending) {
      try {
        await computeCutout(img.id, img.originalUrl);
      } catch (e) {
        failed++;
      } finally {
        setBgBatch(prev => prev ? { ...prev, done: prev.done + 1 } : prev);
      }
    }
    setBgBatch(null);
    showToast(failed > 0 ? `Done — ${failed} failed.` : 'Removed backgrounds for all images.', failed > 0 ? 'error' : 'success');
  }, [images, bgBatch, bgProcessingIds, setImages, showToast, computeCutout]);

  // AI upscaling mirrors background removal: an explicit, non-destructive toggle.
  // Compute the enlarged version once, then flip `upscaled` on/off for free.
  // v1 is per-image only (no batch — TF.js inference is heavy; revisit if needed).
  const [upscaleProcessingIds, setUpscaleProcessingIds] = useState<Set<string>>(new Set());
  const [upscaleProgress, setUpscaleProgress] = useState<number | null>(null);
  const isUpscaling = useCallback((id: string) => upscaleProcessingIds.has(id), [upscaleProcessingIds]);

  const computeUpscale = useCallback(async (id: string, srcUrl: string, factor: 2 | 4) => {
    setUpscaleProcessingIds(prev => new Set(prev).add(id));
    setUpscaleProgress(0);
    try {
      const upscaledUrl = await upscaleImage(srcUrl, factor, setUpscaleProgress);
      setImages(prev => prev.map(img => img.id === id ? { ...img, upscaledUrl, upscaled: true } : img));
    } finally {
      setUpscaleProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setUpscaleProgress(null);
    }
  }, [setImages]);

  const handleUpscale = useCallback(async (id: string, factor: 2 | 4) => {
    const target = images.find(img => img.id === id);
    if (!target || upscaleProcessingIds.has(id)) return;

    // Already upscaled at some factor — just toggle which source the pipeline reads.
    if (target.upscaledUrl) {
      setImages(prev => prev.map(img => img.id === id ? { ...img, upscaled: !img.upscaled } : img));
      showToast(target.upscaled ? 'Upscale removed.' : 'Upscale restored.', target.upscaled ? 'info' : 'success');
      return;
    }

    showToast('Upscaling — first run downloads the AI model…', 'info');
    try {
      await computeUpscale(id, target.originalUrl, factor);
      showToast(`Upscaled ${factor}×.`, 'success');
    } catch (e) {
      showToast('Upscale failed.', 'error');
    }
  }, [images, upscaleProcessingIds, setImages, showToast, computeUpscale]);

  const activeExportSize = useMemo(() => {
    if (exportSizeSelection === 'preview') return 'preview';
    if (exportSizeSelection === 'custom') return customExportSizeInput;
    return Number(exportSizeSelection);
  }, [exportSizeSelection, customExportSizeInput]);

  const handleDownloadSingle = async () => {
    const selectedImage = images.find(img => img.id === selectedImageId);
    if (!selectedImage) return;
    const format = settings.exportFormat;
    const saveName = `${selectedImage.name.substring(0, selectedImage.name.lastIndexOf('.')) || selectedImage.name}.${format}`;
    try {
      const imgElem = await loadImage(effectiveSourceUrl(selectedImage));
      const { width, height } = computeTargetDims(settings, activeExportSize);
      const url = await processImageOnCanvas(imgElem, settings, width, height);
      downloadDataUrl(url, saveName);
      showToast(`Downloaded: ${saveName}`, 'success');
    } catch (e) {
      showToast('Error exporting image.', 'error');
    }
  };

  const handleDownloadZipWithSize = async (targetSize: number | 'preview') => {
    if (images.length === 0) return;
    setIsZipping(true);
    const zip = new JSZip();
    try {
      for (const item of images) {
        const imgElem = await loadImage(effectiveSourceUrl(item));
        const { width, height } = computeTargetDims(settings, targetSize);
        const processedUrl = await processImageOnCanvas(imgElem, settings, width, height);
        const blob = await (await fetch(processedUrl)).blob();
        const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
        zip.file(`${baseName}.${settings.exportFormat}`, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `exported_images.zip`;
      link.click();
      showToast('Exported ZIP archive!', 'success');
    } catch (e) {
      showToast('Error packaging ZIP.', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  const selectedImage = useMemo(() => images.find(img => img.id === selectedImageId) || null, [images, selectedImageId]);

  const imagesAnalysis = useMemo(() => {
    return images.map(img => {
      const issues = [];
      if (img.width < 500 || img.height < 500) issues.push('Low resolution');
      const ratio = img.width / img.height;
      if (ratio > 2.2 || ratio < 0.45) issues.push('Extreme aspect ratio');
      return { ...img, issues, hasIssue: issues.length > 0, isDone: !!img.processedUrl && img.processedUrl !== img.originalUrl };
    });
  }, [images]);

  const stats = useMemo(() => {
    const totalDone = imagesAnalysis.filter(x => x.isDone).length;
    const totalIssues = imagesAnalysis.filter(x => x.hasIssue).length;
    return { total: imagesAnalysis.length, totalDone, totalIssues, hasIssue: totalIssues > 0 };
  }, [imagesAnalysis]);

  const selectedImageAnalysis = useMemo(() => selectedImage ? imagesAnalysis.find(x => x.id === selectedImage.id) : null, [imagesAnalysis, selectedImage]);

  return (
    <EditorContext.Provider value={{
      ...queue,
      settings, setSettings,
      viewMode, setViewMode, currentTab, setCurrentTab, isPreviewOpen, setIsPreviewOpen,
      modalBg, setModalBg, showAlignmentGrid, setShowAlignmentGrid, previewZoom, setPreviewZoom,
      isProcessing, isZipping, toast, showToast,
      exportSizeSelection, setExportSizeSelection, customExportSizeInput, setCustomExportSizeInput,
      selectedImage, activeExportSize, imagesAnalysis, stats, selectedImageAnalysis,
      handleOpenBigPreviewHero, handleResetSettings,
      handleRemoveBackground, handleRemoveBackgroundAll, isBgProcessing,
      bgProgress, bgStage, bgBatch,
      handleUpscale, isUpscaling, upscaleProgress,
      handleDownloadSingle, handleDownloadZipWithSize
    }}>
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditor must be used within an EditorProvider');
  return context;
};

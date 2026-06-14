import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import { UploadedImage, ResizeSettings, ImageAnalysis } from '../types';
import { effectiveSourceUrl } from '../utils/imageProcessor';
import { getSampleProducts } from '../utils/sampleImages';
import { useImageQueue } from '../hooks/useImageQueue';
import { useImageProcessor } from '../hooks/useImageProcessor';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useUIState } from './useUIState';
import { useProcessingState } from './useProcessingState';
import { useExportState } from './useExportState';

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

  viewMode: 'split' | 'single' | 'grid' | 'slider';
  setViewMode: React.Dispatch<React.SetStateAction<'split' | 'single' | 'grid' | 'slider'>>;
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
  imagesAnalysis: ImageAnalysis[];
  stats: { total: number; totalDone: number; totalIssues: number; hasIssue: boolean };
  selectedImageAnalysis: ImageAnalysis | null;

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
  bgProgress: number | null;
  bgStage: 'download' | 'process' | null;
  bgBatch: { done: number; total: number } | null;
  bgQuality: 'fast' | 'balanced' | 'quality';
  setBgQuality: React.Dispatch<React.SetStateAction<'fast' | 'balanced' | 'quality'>>;
  handleCancelBgRemoval: () => void;
  handleCancelUpscale: () => void;
  handleUpscale: (id: string, factor: 2 | 4) => void;
  isUpscaling: (id: string) => boolean;
  upscaleProgress: number | null;
  handleDownloadSingle: () => void;
  handleDownloadZipWithSize: (targetSize: number | 'preview') => void;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  moveImage: (fromIndex: number, toIndex: number) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useLocalStorage<ResizeSettings>('ir_settings', DEFAULT_SETTINGS);

  const ui = useUIState();
  const { showToast } = ui;

  const queue = useImageQueue(showToast);
  const { images, setImages, selectedImageId } = queue;

  const { isProcessing } = useImageProcessor(images, setImages, settings, selectedImageId);

  const processing = useProcessingState(images, setImages, showToast);
  const exportState = useExportState(images, selectedImageId, settings, showToast);

  const handleOpenBigPreviewHero = useCallback(() => {
    if (!selectedImageId) queue.handleLoadSingleTestProduct();
    ui.setIsPreviewOpen(true);
  }, [selectedImageId, queue, ui]);

  const handleResetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), [setSettings]);

  const selectedImage = useMemo(
    () => images.find(img => img.id === selectedImageId) ?? null,
    [images, selectedImageId],
  );

  const imagesAnalysis = useMemo(() => images.map(img => {
    const issues: string[] = [];
    if (img.width < 500 || img.height < 500) issues.push('Low resolution');
    const ratio = img.width / img.height;
    if (ratio > 2.2 || ratio < 0.45) issues.push('Extreme aspect ratio');
    return { ...img, issues, hasIssue: issues.length > 0, isDone: !!img.processedUrl && img.processedUrl !== img.originalUrl };
  }), [images]);

  const stats = useMemo(() => {
    const totalDone = imagesAnalysis.filter(x => x.isDone).length;
    const totalIssues = imagesAnalysis.filter(x => x.hasIssue).length;
    return { total: imagesAnalysis.length, totalDone, totalIssues, hasIssue: totalIssues > 0 };
  }, [imagesAnalysis]);

  const selectedImageAnalysis = useMemo(
    () => selectedImage ? imagesAnalysis.find(x => x.id === selectedImage.id) ?? null : null,
    [imagesAnalysis, selectedImage],
  );

  const value = useMemo<EditorContextType>(() => ({
    ...queue,
    settings, setSettings,
    ...ui,
    isProcessing, ...exportState,
    selectedImage, imagesAnalysis, stats, selectedImageAnalysis,
    handleOpenBigPreviewHero, handleResetSettings,
    ...processing,
  }), [
    queue, settings, setSettings,
    ui, isProcessing, exportState,
    selectedImage, imagesAnalysis, stats, selectedImageAnalysis,
    handleOpenBigPreviewHero, handleResetSettings,
    processing,
  ]);

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditor must be used within an EditorProvider');
  return context;
};

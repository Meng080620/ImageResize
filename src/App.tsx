/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Upload, 
  Download, 
  Trash2, 
  Sparkles, 
  Check, 
  RotateCcw, 
  Grid, 
  Sliders, 
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  Maximize2,
  Minimize2,
  FileArchive,
  Layers,
  HelpCircle,
  Scale,
  SlidersHorizontal,
  ChevronRight,
  RefreshCw,
  Plus,
  Crop,
  AlertTriangle,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';

import { UploadedImage, ResizeSettings, ASPECT_RATIOS, AspectRatioType, FitMode, BackgroundStyle } from './types';
import { processImageOnCanvas, loadImage, getBorderAverageColor, downloadDataUrl } from './utils/imageProcessor';
import { getSampleProducts } from './utils/sampleImages';

// Initial e-commerce focused default settings
const DEFAULT_SETTINGS: ResizeSettings = {
  aspectRatioType: '1:1',
  customWidth: 1000,
  customHeight: 1000,
  fitMode: 'contain',
  padding: 10, // 10% padding
  backgroundColor: '#ffffff', // Standard white
  bgStyle: 'solid',
  alignment: 'center',
  exportFormat: 'jpeg',
  exportQuality: 0.90,
  upscaleSmallImages: true,
  trimProductMargins: true,
};

export default function App() {
  const [images, setImages] = React.useState<UploadedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<ResizeSettings>(DEFAULT_SETTINGS);
  
  // View mode controls
  const [viewMode, setViewMode] = React.useState<'split' | 'single' | 'grid'>('split');
  const [currentTab, setCurrentTab] = React.useState<'editor' | 'sandbox'>('editor');
  
  // Dynamic status/UI state
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isZipping, setIsZipping] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [dragActive, setDragActive] = React.useState(false);

  // Customizable dynamic batch export options
  const [exportSizeSelection, setExportSizeSelection] = React.useState<'300' | '600' | '855' | '1000' | '1200' | 'custom' | 'preview'>('855');
  const [customExportSizeInput, setCustomExportSizeInput] = React.useState<number>(1500);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Onboarding starts clean. Use "Load Samples" helper button on the empty state if needed.

  // 2. Clear toast helper
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => prev?.message === message ? null : prev);
    }, 4500);
  };

  // 3. Process the current single image URL or trigger batch updates
  const handleProcessImage = async (img: UploadedImage, currentSettings: ResizeSettings): Promise<string> => {
    try {
      const imgElem = await loadImage(img.originalUrl);
      
      // Calculate dimensions based on Settings
      let targetW = 800;
      let targetH = 800;

      if (currentSettings.aspectRatioType === '1:1') {
        targetW = 800; targetH = 800;
      } else if (currentSettings.aspectRatioType === '4:3') {
        targetW = 800; targetH = 600;
      } else if (currentSettings.aspectRatioType === '3:4') {
        targetW = 600; targetH = 800;
      } else if (currentSettings.aspectRatioType === '16:9') {
        targetW = 800; targetH = 450;
      } else {
        targetW = Number(currentSettings.customWidth) || 800;
        targetH = Number(currentSettings.customHeight) || 800;
      }

      const resultUrl = await processImageOnCanvas(imgElem, currentSettings, targetW, targetH);
      return resultUrl;
    } catch (err) {
      console.error('Error processing:', err);
      return img.originalUrl;
    }
  };

  // Re-run processing whenever settings or active list change
  useEffect(() => {
    let active = true;
    
    async function updateAllProcessed() {
      if (images.length === 0) return;
      setIsProcessing(true);
      
      const updatedImages = await Promise.all(
        images.map(async (img) => {
          const processedUrl = await handleProcessImage(img, settings);
          return { ...img, processedUrl };
        })
      );

      if (active) {
        // Prevent infinite state loops by diffing URLs
        const hasChanges = updatedImages.some((img, idx) => img.processedUrl !== images[idx]?.processedUrl);
        if (hasChanges) {
          setImages(updatedImages);
        }
        setIsProcessing(false);
      }
    }

    const timer = setTimeout(() => {
      updateAllProcessed();
    }, 150); // slight debounce

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [settings, images.length]); // Minimize triggers to avoid feedback loops

  // 4. File input handlers
  const handleFiles = (fileList: FileList) => {
    const newUploads: UploadedImage[] = [];
    
    Array.from(fileList).forEach(file => {
      if (!file.type.startsWith('image/')) {
        showToast(`Discarded ${file.name}. Only images are supported.`, 'error');
        return;
      }

      const originalUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const id = `uploaded-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const newItem: UploadedImage = {
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          originalUrl,
          processedUrl: originalUrl, // processed temporarily is original until canvas kicks in
          width: img.width,
          height: img.height,
          aspectRatio: img.width / img.height,
        };
        
        setImages(prev => {
          const next = [...prev, newItem];
          if (next.length === 1 || !selectedImageId) {
            setSelectedImageId(newItem.id);
          }
          return next;
        });
      };
      img.src = originalUrl;
    });

    showToast('Imported product images successfully!', 'success');
  };

  // Drag and drop handlers
  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const selectedImage = useMemo(() => {
    return images.find(img => img.id === selectedImageId) || null;
  }, [images, selectedImageId]);

  const activeExportSize = useMemo(() => {
    if (exportSizeSelection === 'preview') return 'preview';
    if (exportSizeSelection === 'custom') return customExportSizeInput;
    return Number(exportSizeSelection);
  }, [exportSizeSelection, customExportSizeInput]);

  // Derived image analysis including resolution metrics and warnings
  const imagesAnalysis = useMemo(() => {
    return images.map(img => {
      const itemIssues: string[] = [];
      
      // Check for low resolution
      if (img.width < 500 || img.height < 500) {
        if (img.width < 300 || img.height < 300) {
          itemIssues.push(`Critical: Very low resolution (${img.width}x${img.height}px) - below 300px width/height standards.`);
        } else {
          itemIssues.push(`Warning: Low resolution (${img.width}x${img.height}px) - recommended min 500px.`);
        }
      }
      
      // Check for extreme aspect ratio (extremely wide/tall)
      const ratio = img.width / img.height;
      if (ratio > 2.2) {
        itemIssues.push("Extreme landscape format: product might look narrow with oversized padding blank space.");
      } else if (ratio < 0.45) {
        itemIssues.push("Extreme portrait format: product might look narrow with oversized padding blank space.");
      }

      const isDone = !!img.processedUrl && img.processedUrl !== img.originalUrl;

      return {
        ...img,
        issues: itemIssues,
        hasIssue: itemIssues.length > 0,
        isDone
      };
    });
  }, [images]);

  // General batch statistics 
  const stats = useMemo(() => {
    const total = imagesAnalysis.length;
    const totalDone = imagesAnalysis.filter(x => x.isDone).length;
    const totalIssues = imagesAnalysis.filter(x => x.hasIssue).length;

    return {
      total,
      totalDone,
      totalIssues,
      hasIssue: totalIssues > 0
    };
  }, [imagesAnalysis]);

  const selectedImageAnalysis = useMemo(() => {
    if (!selectedImage) return null;
    return imagesAnalysis.find(x => x.id === selectedImage.id) || null;
  }, [imagesAnalysis, selectedImage]);

  // Remove single image
  const handleRemoveImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setImages(prev => {
      const next = prev.filter(img => img.id !== id);
      if (selectedImageId === id) {
        setSelectedImageId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
    showToast('Removed item from queue.', 'info');
  };

  // Clear all images
  const handleClearAll = () => {
    setImages([]);
    setSelectedImageId(null);
    showToast('Workspace cleared.', 'info');
  };

  // Reset default settings
  const handleResetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    showToast('Reset modifications to standard recommendations.', 'info');
  };

  // Download single image
  const handleDownloadSingle = () => {
    if (!selectedImage) return;
    const format = settings.exportFormat;
    const cleanName = selectedImage.name.substring(0, selectedImage.name.lastIndexOf('.')) || selectedImage.name;
    const saveName = `${cleanName}.${format}`;
    downloadDataUrl(selectedImage.processedUrl, saveName);
    showToast(`Downloaded: ${saveName}`, 'success');
  };

  // Batch download ZIP with custom output dimension
  const handleDownloadZipWithSize = async (targetSize: number | 'preview') => {
    if (images.length === 0) return;
    setIsZipping(true);
    const zip = new JSZip();

    try {
      const sizeLabel = targetSize === 'preview' ? 'Active App Preset' : `${targetSize}x${targetSize}px`;
      showToast(`Compiling uniform e-commerce assets at ${sizeLabel}...`, 'info');
      
      // Resolve all items onto ZIP
      for (let i = 0; i < images.length; i++) {
        const item = images[i];
        
        // Load original HTML image
        const imgElem = await loadImage(item.originalUrl);
        
        // Calculate target dimensions matching requested size boundary
        let targetW = 800;
        let targetH = 800;
        
        if (targetSize === 'preview') {
          if (settings.aspectRatioType === '1:1') {
            targetW = 800; targetH = 800;
          } else if (settings.aspectRatioType === '4:3') {
            targetW = 800; targetH = 600;
          } else if (settings.aspectRatioType === '3:4') {
            targetW = 600; targetH = 800;
          } else if (settings.aspectRatioType === '16:9') {
            targetW = 800; targetH = 450;
          } else {
            targetW = Number(settings.customWidth) || 800;
            targetH = Number(settings.customHeight) || 800;
          }
        } else {
          // Calculate dimension for specified standard target bound (855 or 300)
          // keeping the aspect ratio aligned!
          if (settings.aspectRatioType === '1:1') {
            targetW = targetSize;
            targetH = targetSize;
          } else if (settings.aspectRatioType === '4:3') {
            targetW = targetSize;
            targetH = Math.round(targetSize * 3 / 4);
          } else if (settings.aspectRatioType === '3:4') {
            targetW = Math.round(targetSize * 3 / 4);
            targetH = targetSize;
          } else if (settings.aspectRatioType === '16:9') {
            targetW = targetSize;
            targetH = Math.round(targetSize * 9 / 16);
          } else {
            // Custom ratio scaling
            const customW = Number(settings.customWidth) || 800;
            const customH = Number(settings.customHeight) || 800;
            if (customW > customH) {
              targetW = targetSize;
              targetH = Math.round(targetSize * customH / customW);
            } else {
              targetH = targetSize;
              targetW = Math.round(targetSize * customW / customH);
            }
          }
        }

        // Run full image processing at perfect output dimensions scale to prevent artifacts!
        const processedUrl = await processImageOnCanvas(imgElem, settings, targetW, targetH);
        
        // Convert data URL to Blob
        const res = await fetch(processedUrl);
        const blob = await res.blob();
        
        const format = settings.exportFormat;
        const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
        // Output format naming - keep original name with new format extension
        zip.file(`${baseName}.${format}`, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      
      const fileLabel = targetSize === 'preview' ? 'standard' : `${targetSize}px`;
      link.download = `woocommerce_uniform_products_${fileLabel}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast(`Exported all processed images at ${sizeLabel} inside a single ZIP archive!`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Error packaging images into ZIP archive.', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadZip = () => handleDownloadZipWithSize('preview');

  return (
    <div className="min-h-screen bg-[#fafaf9] text-gray-800 font-sans flex flex-col selection:bg-blue-100 antialiased">
      
      {/* Dynamic Toast Notifications */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 shadow-xl rounded-xl border border-gray-100 overflow-hidden"
          >
            <div className={`p-4 flex items-center gap-3 backdrop-blur-md ${
              toast.type === 'success' ? 'bg-white/95 text-green-700 border-l-4 border-l-green-500' :
              toast.type === 'error' ? 'bg-white/95 text-red-700 border-l-4 border-l-red-500' :
              'bg-white/95 text-blue-700 border-l-4 border-l-blue-500'
            }`}>
              {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
              {toast.type === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
              {toast.type === 'info' && <Sparkles className="w-5 h-5 text-blue-500" />}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern High-End Top Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center">
            <Layers className="w-6 h-6" id="logo-icon" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-semibold text-xl tracking-tight text-gray-900">Smart Image Resize PRO</h1>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-mono text-[10px] font-semibold rounded-full uppercase tracking-wider border border-blue-100">WooCommerce/Shopify</span>
            </div>
            <p className="text-xs text-gray-500">Produce perfectly aligned, uniform catalog images without stretching or quality loss</p>
          </div>
        </div>

        {/* Tab & Mode Switchers */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentTab('editor')}
            id="tab-editor"
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'editor' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Studio Workspace
          </button>
          <button 
            onClick={() => setCurrentTab('sandbox')}
            id="tab-sandbox"
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'sandbox' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            E-Commerce Storefront Grid Simulation
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        
        {/* Onboarding info line for WooCommerce resizing */}
        <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex gap-3">
            <span className="text-2xl mt-0.5 sm:mt-0">💡</span>
            <div>
              <p className="text-sm font-medium text-blue-900">How "Smart Uniform Fit" improves sales</p>
              <p className="text-xs text-blue-700/80">E-commerce storefronts require identical thumbnail shapes. Normal crops chop off products, while stretched photos look amateurish. This tool locks matching boundaries and nests them smoothly inside identical bounds.</p>
            </div>
          </div>
          <button 
            onClick={() => setCurrentTab('sandbox')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800 transition-colors bg-white hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 shadow-sm cursor-pointer whitespace-nowrap"
          >
            See Before vs After →
          </button>
        </div>

        {currentTab === 'editor' ? (
          /* ========================================================== */
          /*   TAB 1: STUDIO WORKSPACE                                   */
          /* ========================================================== */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* COLUMN A (Lg: 3 cols) - Product List / Queue */}
            <section className="lg:col-span-3 bg-white border border-gray-100 rounded-2xl p-4 flex flex-col shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-gray-50 mb-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-gray-500" />
                  <h2 className="font-semibold text-sm text-gray-900">Queue ({images.length})</h2>
                </div>
                {images.length > 0 && (
                  <button 
                    onClick={handleClearAll}
                    id="btn-clear-all"
                    className="text-xs text-red-500 hover:text-red-700 font-medium cursor-pointer transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* DRAG AND DROP ZONE */}
              <div
                onDragEnter={onDrag}
                onDragOver={onDrag}
                onDragLeave={onDrag}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                id="dropzone"
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-blue-500 bg-blue-50/50' 
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                } mb-4`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                />
                <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-gray-700">Upload Product Images</p>
                <p className="text-[10px] text-gray-400 mt-1">Drag and drop or search directory</p>
              </div>

              {/* PREMIUM QUALITY STATUS DASHBOARD CONTROLS */}
              {images.length > 0 && (
                <div className="mb-4 p-3 bg-gray-50/60 border border-gray-100 rounded-2xl flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                      Catalog Status Engine
                    </div>
                    {isProcessing && (
                      <span className="text-[9px] font-bold text-blue-600 animate-pulse bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                        Processing...
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-3 gap-1.5">
                    {/* Metric 1: Total */}
                    <div className="bg-white px-2 py-1.5 rounded-xl border border-gray-100 text-center flex flex-col items-center">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Total</span>
                      <span className="text-sm font-black text-gray-800 leading-none mt-1">{stats.total}</span>
                    </div>
                    
                    {/* Metric 2: Done */}
                    <div className="bg-white px-2 py-1.5 rounded-xl border border-gray-200 text-center flex flex-col items-center">
                      <span className="text-[9px] font-bold text-green-600 uppercase tracking-tight">Done</span>
                      <div className="flex items-center gap-1 mt-1">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        <span className="text-sm font-black text-green-700 leading-none">{stats.totalDone}</span>
                      </div>
                    </div>

                    {/* Metric 3: Issues */}
                    <div className={`px-2 py-1.5 rounded-xl border text-center flex flex-col items-center transition-all ${
                      stats.totalIssues > 0 
                        ? 'bg-amber-50/80 border-amber-200 text-amber-900 animate-pulse'
                        : 'bg-white border-gray-200 text-gray-400 opacity-60'
                    }`}>
                      <span className={`text-[9px] font-bold uppercase tracking-tight ${stats.totalIssues > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                        Issues
                      </span>
                      <div className="flex items-center gap-1 mt-1">
                        {stats.totalIssues > 0 ? (
                          <AlertTriangle className="w-3 h-3 text-amber-500 animate-bounce" />
                        ) : (
                          <CheckCircle className="w-3 h-3 text-gray-300" />
                        )}
                        <span className={`text-sm font-black leading-none ${stats.totalIssues > 0 ? 'text-amber-800' : 'text-gray-400'}`}>
                          {stats.totalIssues}
                        </span>
                      </div>
                    </div>
                  </div>

                  {stats.totalIssues > 0 && (
                    <div className="text-[9px] text-amber-700 bg-amber-50/40 p-2 rounded-lg border border-amber-100/50 leading-snug flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        Quality issues found. Adjust <strong>upscale settings</strong> or increase <strong>Product Padding</strong> to fit these items correctly!
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* QUEUE SCROLL CONTAINER */}
              <div className="flex-1 overflow-y-auto max-h-[460px] pr-1 flex flex-col gap-2">
                {images.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50/80 flex items-center justify-center mb-3">
                      <Sparkles className="w-6 h-6 text-blue-500" />
                    </div>
                    <h3 className="text-xs font-bold text-gray-800">E-Commerce Queue Empty</h3>
                    <p className="text-[10px] text-gray-400 mt-1 max-w-[200px] leading-relaxed">
                      Handcrafted catalog items with simulated background transparent margins.
                    </p>
                    
                    <button 
                      onClick={() => {
                        const samples = getSampleProducts();
                        setImages(samples.map((s, idx) => ({
                          id: `sample-${idx}`,
                          name: s.name,
                          type: 'image/png',
                          size: 15420,
                          originalUrl: s.url,
                          processedUrl: s.url,
                          width: s.width,
                          height: s.height,
                          aspectRatio: s.width / s.height
                        })));
                        setSelectedImageId('sample-0');
                        showToast('Handcrafted retail sandbox samples loaded!', 'success');
                      }}
                      className="mt-4 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98]"
                    >
                      ✨ Load Samples
                    </button>
                  </div>
                ) : (
                  imagesAnalysis.map((img) => {
                    const isSelected = img.id === selectedImageId;
                    return (
                      <div
                        key={img.id}
                        onClick={() => setSelectedImageId(img.id)}
                        className={`group relative p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected 
                            ? 'bg-blue-50/40 border-blue-200 shadow-sm' 
                            : 'border-gray-100 bg-white hover:bg-gray-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-12 h-12 rounded-lg bg-gray-50 flex-shrink-0 relative overflow-hidden flex items-center justify-center border border-gray-100">
                            {/* Original Thumbnail Mini */}
                            <img 
                              src={img.originalUrl} 
                              alt="Thumbnail" 
                              className="max-w-full max-h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-medium text-gray-800 truncate pr-4">{img.name}</p>
                            <span className="font-mono text-[9px] text-gray-400 block mt-0.5 whitespace-nowrap">
                              {img.width} × {img.height} ({img.aspectRatio > 1.05 ? 'Wide' : img.aspectRatio < 0.95 ? 'Tall' : 'Square'})
                            </span>
                            
                            {/* Done & Issue counter badges */}
                            {img.hasIssue && (
                              <span className="inline-flex items-center gap-1 mt-1 text-[8px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                {img.issues.length} {img.issues.length === 1 ? 'Notice' : 'Notices'}
                              </span>
                            )}
                            {img.isDone && !img.hasIssue && (
                              <span className="inline-flex items-center gap-1 mt-1 text-[8px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100">
                                <Check className="w-2.5 h-2.5 text-green-500 shrink-0" />
                                Uniform Bound Ready
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Trash Button */}
                        <button
                          onClick={(e) => handleRemoveImage(img.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 transition-all cursor-pointer"
                          title="Remove image"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        
                        {/* Selector check indicator */}
                        {isSelected && (
                          <span className="absolute right-2 bottom-2 w-2 h-2 rounded-full bg-blue-600 block group-hover:hidden" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* QUICK STATISTICS BAR */}
              {images.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 bg-gray-50/50 -mx-4 -mb-4 p-4 rounded-b-2xl">
                  <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium font-sans">
                    <span>Export File Extension:</span>
                    <span className="uppercase text-gray-700 font-bold">{settings.exportFormat}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium mt-1">
                    <span>Target Catalog Aspect:</span>
                    <span className="text-gray-700 font-bold">{ASPECT_RATIOS[settings.aspectRatioType]?.label || 'Custom'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium mt-1">
                    <span>Checked Queue Done:</span>
                    <span className="text-gray-700 font-bold">{stats.totalDone} / {stats.total} processed</span>
                  </div>
                </div>
              )}
            </section>

            {/* COLUMN B (Lg: 6 cols) - Active Canvas Studio View */}
            <section className="lg:col-span-6 bg-white border border-gray-100 rounded-2xl p-5 flex flex-col shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-gray-50 mb-4">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-gray-500" />
                  <h2 className="font-semibold text-sm text-gray-900">Dual Studio Inspector</h2>
                </div>
                
                {/* Visualizer mode selections */}
                <div className="flex items-center bg-gray-100 p-1 rounded-xl">
                  <button
                    onClick={() => setViewMode('split')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      viewMode === 'split' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Compare Fit
                  </button>
                  <button
                    onClick={() => setViewMode('single')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      viewMode === 'single' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Processed Render
                  </button>
                </div>
              </div>

              {selectedImage ? (
                <div className="flex-1 flex flex-col justify-between">
                  
                  {/* CENTRAL MAIN CANVAS CONTAINER */}
                  <div className="flex-1 bg-gray-50 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[360px] md:min-h-[440px] border border-gray-100 relative overflow-hidden">
                    
                    {/* If processing preview is computing */}
                    {isProcessing && (
                      <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center backdrop-blur-[1px]">
                        <div className="flex flex-col items-center gap-2.5">
                          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                          <span className="text-xs font-semibold text-gray-600">Recomputing uniform borders...</span>
                        </div>
                      </div>
                    )}
                    
                    {/* VIEW MODE A: Side-by-Side Compare */}
                    {viewMode === 'split' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-full max-w-[560px]">
                        {/* Original side */}
                        <div className="flex flex-col h-full bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                          <div className="p-2 border-b border-gray-50 flex items-center justify-between bg-red-50/20">
                            <div className="flex items-center gap-1.5 ">
                              <XCircle className="w-4 h-4 text-red-500" />
                              <span className="text-xs font-semibold text-red-600">Original (Various Shapes)</span>
                            </div>
                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono">
                              {selectedImage.width}×{selectedImage.height}
                            </span>
                          </div>
                          <div className="flex-1 p-4 flex items-center justify-center bg-gray-50/50">
                            <div className="relative shadow-md max-w-full max-h-[220px] rounded overflow-hidden flex items-center justify-center bg-white border border-gray-100">
                              <img 
                                src={selectedImage.originalUrl} 
                                alt="Before Resize" 
                                className="max-w-full max-h-[190px] object-contain block"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          </div>
                          <div className="p-2 text-center text-[10px] text-gray-400 border-t border-gray-50">
                            Un-aligned boundaries disrupt grid alignment
                          </div>
                        </div>

                        {/* Processed side */}
                        <div className="flex flex-col h-full bg-white rounded-xl border border-blue-100 overflow-hidden shadow-sm">
                          <div className="p-2 border-b border-blue-50 flex items-center justify-between bg-blue-50/25">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-xs font-semibold text-blue-700">Uniform Fitted Bounds</span>
                            </div>
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">
                              {settings.aspectRatioType === 'custom' 
                                ? `${settings.customWidth}×${settings.customHeight}`
                                : settings.aspectRatioType === '1:1' ? '800×800' 
                                : settings.aspectRatioType === '4:3' ? '800×600'
                                : settings.aspectRatioType === '3:4' ? '600×800' : '800×450'}
                            </span>
                          </div>
                          <div className="flex-1 p-4 flex items-center justify-center checkerboard-bg relative">
                            <div 
                              className="relative shadow-md max-w-full max-h-[220px] overflow-hidden flex items-center justify-center border border-gray-200"
                              style={{ 
                                aspectRatio: settings.aspectRatioType === 'custom'
                                  ? `${settings.customWidth}/${settings.customHeight}`
                                  : settings.aspectRatioType.replace(':', '/')
                              }}
                            >
                              <img 
                                src={selectedImage.processedUrl} 
                                alt="Processed Uniform Preview" 
                                className="w-full h-full object-contain block"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          </div>
                          <div className="p-2 text-center text-[10px] text-blue-600 border-t border-blue-50 bg-blue-50/5 font-semibold">
                            Fitted seamlessly via padding bounds!
                          </div>
                        </div>
                      </div>
                    )}

                    {/* VIEW MODE B: Pure Single Canvas Live Stream */}
                    {viewMode === 'single' && (
                      <div className="w-full flex-1 flex flex-col items-center justify-center">
                        <p className="text-xs font-medium text-gray-550 mb-2">Processed Canvas Output Inspector:</p>
                        
                        <div className="relative w-full h-[320px] md:h-[380px] flex items-center justify-center p-4">
                          <div 
                            className="relative shadow-lg border border-gray-200 rounded max-w-full max-h-full overflow-hidden checkerboard-bg select-none"
                            style={{ 
                              aspectRatio: settings.aspectRatioType === 'custom'
                                ? `${settings.customWidth}/${settings.customHeight}`
                                : settings.aspectRatioType.replace(':', '/'),
                              height: '100%'
                            }}
                          >
                            <img 
                              src={selectedImage.processedUrl} 
                              alt="Large Render" 
                              className="max-w-full max-h-full object-contain block m-auto"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SELECTION PRODUCT QUALITY STATS & WARNINGS ENGINE */}
                  {selectedImageAnalysis?.hasIssue ? (
                    <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex flex-col gap-1 text-xs text-amber-950">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600 animate-pulse" />
                        <span>E-Commerce Catalog Alert ({selectedImageAnalysis.issues.length})</span>
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px] font-medium text-amber-800">
                        {selectedImageAnalysis.issues.map((issue, i) => (
                          <li key={i}>{issue}</li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-amber-700 leading-normal mt-1 border-t border-amber-200/50 pt-1.5 font-medium">
                        💡 <strong>Improvement Action:</strong> The processed output canvas has automatically padded the borders to make it identical to other catalog items! Consider enabling <strong>"Trim margins"</strong> or increasing resolution if output lacks clarity.
                      </p>
                    </div>
                  ) : selectedImage && (
                    <div className="mt-4 p-2.5 bg-green-50/50 border border-green-100 rounded-xl flex items-center gap-2 text-[11px] font-medium text-green-800">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      <span>High quality e-commerce asset verified: Dimensions and ratio fit cleanly into identical WooCommerce dimensions.</span>
                    </div>
                  )}

                  {/* BOTTOM ACTION BUTTONS FOR THE SELECTED CANVAS IMAGE */}
                  <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <p className="text-[11px] text-gray-400">Selected Product Asset:</p>
                      <p className="text-xs font-medium text-gray-800 max-w-[280px] md:max-w-[340px] truncate">{selectedImage.name}</p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        onClick={handleDownloadSingle}
                        className="flex-1 sm:flex-none px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Single
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-2xl py-20 text-gray-400">
                  <ImageIcon className="w-12 h-12 stroke-[1] mb-3 text-gray-300" />
                  <p className="font-semibold text-sm">Workspace Active Slate is Blank</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-[260px] text-center">Please upload product photos or select one from the Left Hand Queue side</p>
                </div>
              )}
            </section>

            {/* COLUMN C (Lg: 3 cols) - Control Adjuster Sidebar */}
            <section className="lg:col-span-3 bg-white border border-gray-100 rounded-2xl p-4 flex flex-col shadow-sm gap-5">
              
              {/* Header section with Reset */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <h2 className="font-semibold text-sm text-gray-900">Format & Canvas</h2>
                </div>
                <button 
                  onClick={handleResetSettings}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
                  title="Reset configurations"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* ASPECT RATIOS SELECTOR */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5 text-gray-400" />
                  Target Uniform Shape
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(ASPECT_RATIOS) as AspectRatioType[]).map((type) => {
                    const preset = ASPECT_RATIOS[type];
                    const active = settings.aspectRatioType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setSettings(prev => ({ ...prev, aspectRatioType: type }))}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                          active 
                            ? 'bg-blue-50/40 border-blue-500 shadow-sm ring-1 ring-blue-600' 
                            : 'bg-white border-gray-100 hover:bg-gray-50/50'
                        }`}
                      >
                        <p className="text-xs font-bold text-gray-800">{type === 'custom' ? 'Custom' : type}</p>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{preset.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* CUSTOM ASPECT RATIO SELECTIONS */}
                {settings.aspectRatioType === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 mt-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <span className="text-[10px] text-gray-500 font-semibold block mb-0.5">Width (px)</span>
                      <input 
                        type="number" 
                        value={settings.customWidth}
                        onChange={(e) => setSettings(p => ({ ...p, customWidth: Math.max(10, Number(e.target.value)) }))}
                        className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-xs text-gray-700 outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 font-semibold block mb-0.5">Height (px)</span>
                      <input 
                        type="number" 
                        value={settings.customHeight}
                        onChange={(e) => setSettings(p => ({ ...p, customHeight: Math.max(10, Number(e.target.value)) }))}
                        className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-xs text-gray-700 outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* FIT MODE PRESETS (Highlighting Contain) */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
                  <span>Smart Align fitting</span>
                  <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-semibold border border-green-100">No Crop Active</span>
                </label>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, fitMode: 'contain' }))}
                    className={`p-2.5 rounded-xl border text-left flex items-start justify-between cursor-pointer transition-all ${
                      settings.fitMode === 'contain'
                        ? 'bg-white border-green-500 shadow-sm ring-1 ring-green-600'
                        : 'bg-white border-gray-100 hover:bg-gray-50/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1 text-xs font-bold text-gray-800">
                        <span>Pure Contain (Fit Frame)</span>
                        <span className="text-[9px] bg-green-600 text-white px-1 py-0.2 rounded font-mono">OK</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Fits entire product inside boundaries using safe padding. Never crops details.</p>
                    </div>
                    <CheckCircle className={`w-4 h-4 flex-shrink-0 ml-2 ${settings.fitMode === 'contain' ? 'text-green-600' : 'text-gray-300'}`} />
                  </button>

                  <button
                    onClick={() => setSettings(prev => ({ ...prev, fitMode: 'cover' }))}
                    className={`p-2.5 rounded-xl border text-left flex items-start justify-between cursor-pointer transition-all ${
                      settings.fitMode === 'cover'
                        ? 'bg-white border-blue-500 shadow-sm ring-1 ring-blue-600'
                        : 'bg-white border-gray-100 hover:bg-gray-50/50'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold text-gray-700">Cover & Crop (Zoom Fill)</div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Fills bounds completely. Parts that exceed aspect ratio will be cropped off.</p>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full border border-gray-300 mt-1 flex-shrink-0" />
                  </button>

                  <button
                    onClick={() => setSettings(prev => ({ ...prev, fitMode: 'stretch' }))}
                    className={`p-2.5 rounded-xl border text-left flex items-start justify-between cursor-pointer transition-all ${
                      settings.fitMode === 'stretch'
                        ? 'bg-red-50/20 border-red-500 shadow-sm ring-1 ring-red-600'
                        : 'bg-white border-gray-100 hover:bg-gray-50/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1 text-xs font-semibold text-red-700">
                        <span>Stretched Distortion</span>
                        <span className="text-[9px] bg-red-600 text-white px-1 py-0.2 rounded font-mono">BAD</span>
                      </div>
                      <p className="text-[10px] text-red-400 mt-0.5">Forces image to stretch, skewing your photos. Distorts product dimensions.</p>
                    </div>
                    <XCircle className={`w-4 h-4 flex-shrink-0 ml-2 ${settings.fitMode === 'stretch' ? 'text-red-500' : 'text-gray-300'}`} />
                  </button>
                </div>
              </div>

              {/* DYNAMIC PADDING SLIDER */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs font-semibold text-gray-700">
                  <span>Adjust Product Padding Space</span>
                  <span className="font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded text-[11px]">{settings.padding}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="40" 
                  value={settings.padding}
                  onChange={(e) => setSettings(p => ({ ...p, padding: Number(e.target.value) }))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <span className="text-[9px] text-gray-400">Adjusts the padding space/margins inside the full box to keep the product centered.</span>
              </div>

              {/* TRIM MARGINS TOGGLE */}
              <div className="flex flex-col gap-2 p-3 bg-white border border-gray-200 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5 cursor-pointer">
                      <Crop className="w-3.5 h-3.5 text-blue-600" />
                      Trim Transparency & Margins
                    </label>
                    <span className="text-[10px] text-gray-400 font-medium">Auto-aligns actual product shape edges</span>
                  </div>
                  <button
                    onClick={() => {
                      setSettings(p => ({ ...p, trimProductMargins: !p.trimProductMargins }));
                      showToast(
                        !settings.trimProductMargins 
                          ? 'Activated: Smart padding directly from the raw product object boundaries.' 
                          : 'Deactivated: Standard full image file margins used.', 
                        'info'
                      );
                    }}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.trimProductMargins ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.trimProductMargins ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <div className="bg-blue-50/45 rounded-xl p-2.5 border border-blue-100/50">
                  <p className="text-[10px] text-blue-900 leading-normal font-medium">
                    ✨ <strong>Already removed background?</strong> Active! This reads actual transparent png pixels, crops empty spaces, and applies padding space <em>directly from your product contents</em>, not the background whitespace.
                  </p>
                </div>
              </div>

              {/* UPSCALE SMALL IMAGES OPTIONS */}
              <div className="flex flex-col gap-2.5 p-3.5 bg-gradient-to-br from-blue-50 to-blue-50/20 border border-blue-200 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-blue-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                    Auto Big Fill Uniform
                  </label>
                  <span className="text-[9px] font-bold uppercase bg-blue-600 text-white px-1.5 py-0.5 rounded-full shadow-sm">
                    {settings.upscaleSmallImages && settings.padding === 0 && settings.fitMode === 'cover' 
                      ? 'Full Box Cover'
                      : settings.upscaleSmallImages 
                        ? 'Padded Uniform' 
                        : 'Original Size'}
                  </span>
                </div>
                
                <div className="flex flex-col gap-1.5 mt-1">
                  <button
                    onClick={() => {
                      setSettings(p => ({ 
                        ...p, 
                        upscaleSmallImages: true,
                        fitMode: 'cover',
                        padding: 0
                      }));
                      showToast('Configured to Full Box Cover Mode. Images will zoom-fill the entire box bounds with 0 margins.', 'success');
                    }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold cursor-pointer transition-all duration-200 flex items-center justify-between ${
                      settings.upscaleSmallImages && settings.padding === 0 && settings.fitMode === 'cover'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15' 
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-150'
                    }`}
                  >
                    <span>⚡ Set Full Box Cover (No backgrounds)</span>
                    <CheckCircle className={`w-3.5 h-3.5 ${
                      settings.upscaleSmallImages && settings.padding === 0 && settings.fitMode === 'cover' ? 'text-white' : 'text-gray-300'
                    }`} />
                  </button>

                  <button
                    onClick={() => {
                      setSettings(p => ({ 
                        ...p, 
                        upscaleSmallImages: true,
                        fitMode: 'contain',
                        padding: 10
                      }));
                      showToast('Configured to Padded Uniform Fit. Images scale safely with 10% breathing padding.', 'success');
                    }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold cursor-pointer transition-all duration-200 flex items-center justify-between ${
                      settings.upscaleSmallImages && (settings.padding > 0 || settings.fitMode === 'contain')
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15' 
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-150'
                    }`}
                  >
                    <span>🌸 Padded Uniform Fit (With margins)</span>
                    <CheckCircle className={`w-3.5 h-3.5 ${
                      settings.upscaleSmallImages && (settings.padding > 0 || settings.fitMode === 'contain') ? 'text-white' : 'text-gray-300'
                    }`} />
                  </button>

                  <button
                    onClick={() => {
                      setSettings(p => ({ ...p, upscaleSmallImages: false }));
                      showToast('Deactivated auto upscale. Small images remain at native size.', 'info');
                    }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold cursor-pointer transition-all duration-200 flex items-center justify-between ${
                      !settings.upscaleSmallImages 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    <span>⚙️ Keep Original (No stretching)</span>
                    <CheckCircle className={`w-3.5 h-3.5 ${!settings.upscaleSmallImages ? 'text-white' : 'text-gray-300'}`} />
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 leading-normal font-medium">
                  {settings.upscaleSmallImages && settings.padding === 0 && settings.fitMode === 'cover' ? (
                    <span>✨ <strong className="text-blue-900">Active - Set Full Box:</strong> Main product image automatically fills the entire box frame completely, ignoring backgrounds. Perfect for filled photography.</span>
                  ) : settings.upscaleSmallImages ? (
                    <span>🌸 <strong className="text-blue-900">Active - Padded Fit:</strong> Scales images up to maximum uniform size, keeping custom breathing margins from box edges so items correspond beautifully.</span>
                  ) : (
                    <span>⚠️ <strong className="text-gray-700">Inactive:</strong> Small product photos keep their native resolution inside outer bounding frame.</span>
                  )}
                </p>
              </div>

              {/* AESTHETIC BACKGROUND OPTION */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Canvas Filling Background Style</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['solid', 'auto', 'blurred', 'transparent'] as BackgroundStyle[]).map((style) => {
                    const active = settings.bgStyle === style;
                    const labels: Record<BackgroundStyle, string> = {
                      solid: 'Solid Color',
                      auto: 'Edge Match AI',
                      blurred: 'Blurred Fit',
                      transparent: 'Alpha Guard'
                    };
                    return (
                      <button
                        key={style}
                        onClick={() => setSettings(p => ({ ...p, bgStyle: style }))}
                        className={`p-2 rounded-xl text-xs font-semibold border cursor-pointer text-center transition-all ${
                          active 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                            : 'bg-white border-gray-100 hover:bg-gray-50'
                        }`}
                      >
                        {labels[style]}
                      </button>
                    );
                  })}
                </div>

                {/* Background color color picker for Solid */}
                {settings.bgStyle === 'solid' && (
                  <div className="flex items-center gap-2 mt-2 p-2 bg-gray-50 rounded-xl border border-gray-100">
                    <input 
                      type="color" 
                      value={settings.backgroundColor}
                      onChange={(e) => setSettings(p => ({ ...p, backgroundColor: e.target.value }))}
                      className="w-10 h-7 rounded-md border border-gray-300 cursor-pointer bg-white"
                    />
                    <input 
                      type="text" 
                      value={settings.backgroundColor}
                      onChange={(e) => setSettings(p => ({ ...p, backgroundColor: e.target.value }))}
                      className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                )}
                
                {/* Visualizer detail for auto border alignment */}
                {settings.bgStyle === 'auto' && (
                  <p className="text-[10px] text-green-700 bg-green-50 p-2 rounded-xl border border-green-200 mt-1">
                    ✨ <strong>Smart Boundary Scanner:</strong> Evaluates the outer frame margins. Matches custom gray/beige background sweeps dynamically.
                  </p>
                )}
              </div>

              {/* EXPORT OPTIONS */}
              <div className="flex flex-col gap-2 pt-3 border-t border-gray-50">
                <label className="text-xs font-semibold text-gray-700">Export Parameters</label>
                <div className="grid grid-cols-3 gap-1">
                  {['jpeg', 'png', 'webp'].map((fmt) => {
                    const active = settings.exportFormat === fmt;
                    return (
                      <button
                        key={fmt}
                        onClick={() => setSettings(p => ({ ...p, exportFormat: fmt as any }))}
                        className={`py-1.5 rounded-lg text-xs font-semibold border cursor-pointer uppercase text-center transition-all ${
                          active 
                            ? 'bg-gray-800 text-white border-gray-800 shadow-sm' 
                            : 'bg-white border-gray-100 hover:bg-gray-50'
                        }`}
                      >
                        {fmt}
                      </button>
                    );
                  })}
                </div>

                {settings.exportFormat !== 'png' && (
                  <div className="mt-2">
                    <div className="flex justify-between items-center text-[11px] text-gray-500">
                      <span>Compression Quality:</span>
                      <span className="font-mono">{Math.round(settings.exportQuality * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="1.0" 
                      step="0.05"
                      value={settings.exportQuality}
                      onChange={(e) => setSettings(p => ({ ...p, exportQuality: Number(e.target.value) }))}
                      className="w-full h-1 accent-gray-800 cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* MASS EXPORT BUTTONS */}
              <div className="mt-3 flex flex-col gap-3">
                <div className="text-[11px] font-extrabold text-blue-900 uppercase tracking-widest">Batch Export Options:</div>
                
                {/* Size Selection Presets */}
                <div className="flex flex-col gap-2 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-[10px] text-gray-500 font-bold block">Target Export Boundary:</span>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { val: '300', label: '300px' },
                      { val: '600', label: '600px' },
                      { val: '855', label: '855px' },
                      { val: '1000', label: '1000px' },
                      { val: '1200', label: '1200px' },
                      { val: 'preview', label: 'Workspace' },
                      { val: 'custom', label: 'Custom' },
                    ].map((sz) => {
                      const active = exportSizeSelection === sz.val;
                      return (
                        <button
                          key={sz.val}
                          onClick={() => setExportSizeSelection(sz.val as any)}
                          className={`py-1 rounded text-[10px] font-bold border cursor-pointer text-center transition-all ${
                            active 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                          } ${sz.val === 'custom' || sz.val === 'preview' ? 'col-span-2' : 'col-span-1'}`}
                        >
                          {sz.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Dimensions fields */}
                  {exportSizeSelection === 'custom' && (
                    <div className="mt-1.5 p-2.5 bg-white rounded-lg border border-gray-200 flex flex-col gap-2 shadow-sm">
                      <div className="flex justify-between items-center text-[10px] text-gray-500">
                        <span className="font-bold">Custom Pixel Dimension:</span>
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            min="100" 
                            max="4000"
                            value={customExportSizeInput}
                            onChange={(e) => setCustomExportSizeInput(Math.min(4000, Math.max(100, Number(e.target.value) || 100)))}
                            className="w-14 bg-gray-50 border border-gray-300 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-800 text-center focus:border-blue-500 outline-none"
                          />
                          <span>px</span>
                        </div>
                      </div>
                      <input 
                        type="range" 
                        min="100" 
                        max="3000" 
                        step="50"
                        value={customExportSizeInput}
                        onChange={(e) => setCustomExportSizeInput(Number(e.target.value))}
                        className="w-full h-1 accent-blue-600 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* Master Interactive Downloader Button */}
                <button
                  onClick={() => handleDownloadZipWithSize(activeExportSize)}
                  id="btn-zip-download-v2"
                  disabled={images.length === 0 || isZipping}
                  className={`py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-blue-500/15 cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                    isZipping ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                >
                  {isZipping ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileArchive className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isZipping 
                      ? 'Compiling and Packaging ZIP...' 
                      : `Download Batch Uniform ZIP (${activeExportSize === 'preview' ? 'Workspace' : `${activeExportSize}px`})`
                    }
                  </span>
                </button>
                
                <div className="bg-gray-50/50 rounded-xl p-2.5 border border-gray-100 text-[10px] text-gray-500 leading-relaxed font-semibold">
                  💡 <strong>Dimensions Legend:</strong><br />
                  🚀 <strong>300px - 600px</strong>: Lightweight storefront listing thumbnails.<br />
                  🚀 <strong>855px - 1000px</strong>: WooCommerce & Shopify high definition standards.<br />
                  🚀 <strong>1200px+</strong>: Extra crisp product zooming details.
                </div>
              </div>

            </section>

          </div>
        ) : (
          /* ========================================================== */
          /*   TAB 2: E-COMMERCE SIMULATION SANDBOX                      */
          /* ========================================================== */
          <div className="bg-white border border-gray-100 rounded-3xl p-6 md:p-8 flex flex-col shadow-sm gap-8">
            
            <div className="max-w-3xl">
              <h2 className="font-display font-semibold text-2xl tracking-tight text-gray-900">WooCommerce Storefront Sandbox Simulator</h2>
              <p className="text-sm text-gray-500 mt-1">
                Visualizing how different native aspect ratios behave inside a standard product catalog grid. Stretched/unaligned margins look sloppy and unaligned, while our padded Smart Bounds create identical, beautiful grids.
              </p>
            </div>

            {/* QUICK SANDBOX CONTROLS TO ADJUST BOX & PADDING SEAMLESSLY AT ONCE */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 flex flex-col lg:flex-row items-center justify-between gap-6">
              <div className="flex-1 w-full">
                <div className="flex justify-between items-center text-xs font-semibold text-blue-900 mb-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-600" />
                    <span>Adjust Product Padding Space (Margins inside the Full Box):</span>
                  </div>
                  <span className="font-mono text-blue-700 bg-white border border-blue-100 px-2 py-0.5 rounded text-[11px] font-bold shadow-sm">{settings.padding}% Padding</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="40" 
                  value={settings.padding}
                  onChange={(e) => setSettings(p => ({ ...p, padding: Number(e.target.value) }))}
                  className="w-full h-2 rounded-lg bg-gray-200 accent-blue-600 cursor-pointer"
                />
                <p className="text-[10px] text-blue-500 mt-2 font-medium">
                  → Enforces matching box sizes for all images. Drag this slider to dynamically test and adjust the internal padding for all product thumbnails instantly!
                </p>
              </div>

              <div className="flex-shrink-0 w-full lg:w-auto">
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-500 font-bold mb-1 uppercase tracking-wider">Configure Full Box Aspect:</span>
                  <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-xl border border-gray-205">
                    {(['1:1', '4:3', '3:4'] as AspectRatioType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => setSettings(p => ({ ...p, aspectRatioType: type }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          settings.aspectRatioType === type 
                            ? 'bg-white text-blue-700 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
                        }`}
                      >
                        {type === '1:1' ? 'Square Box (1:1)' : type === '4:3' ? 'Wide Box (4:3)' : 'Tall Box (3:4)'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* COMPARATIVE GRIDS SIDE BY SIDE - DIRECT RENDER */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              
              {/* LEFT GRID: RED CROSS - UNSECURED DIVERSE BOUNDS */}
              <div className="border border-red-100 bg-red-50/10 rounded-2xl p-5 flex flex-col shadow-sm">
                
                {/* Header Info */}
                <div className="flex items-start justify-between pb-4 border-b border-red-100/50 mb-5">
                  <div className="flex gap-3">
                    <div className="p-2 bg-red-100 text-red-700 rounded-xl flex-shrink-0">
                      <XCircle className="w-5 h-5" id="cross-badge" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-red-900">Before: Wild Raw Aspect Ratios</h3>
                      <p className="text-xs text-red-700/80">Default images stretching, collapsing, or causing catalog grids to jump heights unevenly.</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-red-100 text-red-800 font-mono text-[9px] font-bold rounded">UNALIGNED</span>
                </div>

                {/* Simulated Webpage - Shop Listing Grid with varying aspect ratios */}
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-inner">
                  
                  {/* Web navbar card mock */}
                  <div className="flex items-center justify-between gap-3 text-xs text-gray-400 bg-gray-50/50 p-2.5 rounded-lg border border-gray-100 mb-4 select-none">
                    <span className="text-[10px] bg-gray-300 w-2.5 h-2.5 rounded-full block" />
                    <div className="flex gap-3 font-medium text-[9px]">
                      <span>Shop</span>
                      <span>Category</span>
                      <span>Cart (0)</span>
                    </div>
                  </div>

                  {/* PRODUCTS GRID */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {images.map((img, idx) => (
                      <div key={`bad-item-${img.id}`} className="flex flex-col bg-white rounded-lg border border-gray-200 p-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-300">
                        {/* THE UNREGULATED CONTAINER: Height jumps or crops because aspect ratios mismatch! */}
                        <div className="bg-[#f0f0ee] rounded flex items-center justify-center p-1 relative overflow-hidden h-36">
                          
                          {/* SKEWED OR BADLY SIZED PRODUCT */}
                          <img 
                            src={img.originalUrl} 
                            alt="Bad size" 
                            className="max-h-full max-w-full block"
                            style={{ 
                              // Simulating the distortion effect if user selects stretching, or cropped-cut layout
                              ...(idx % 3 === 0 ? { objectFit: 'fill', width: '100%', height: '100%' } : { objectFit: 'contain' })
                            }}
                            referrerPolicy="no-referrer"
                          />

                          {/* Red Warning Overlay */}
                          <div className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm">
                            <XCircle className="w-3 h-3" />
                          </div>
                        </div>

                        {/* Title & Metadata (Notice aligning issues) */}
                        <div className="mt-2 text-left">
                          <p className="text-[10px] font-bold text-gray-800 line-clamp-1">{img.name.replace('.png', '').replace('.jpg', '')}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] font-mono font-bold text-red-600">Raw {img.aspectRatio > 1.2 ? 'Wide' : img.aspectRatio < 0.8 ? 'Tall' : 'Square'}</span>
                            <span className="text-[10px] font-bold text-gray-900">$124.00</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 text-center text-[10px] text-red-500 font-semibold select-none">
                     Rows jump heights, photos look stretched, and products get truncated.
                  </div>
                </div>

              </div>
              
              {/* RIGHT GRID: GREEN CHECKMARK - SMART UNIFORM RESIZING */}
              <div className="border border-green-200 bg-green-50/15 rounded-2xl p-5 flex flex-col shadow-sm">
                
                {/* Header Info */}
                <div className="flex items-start justify-between pb-4 border-b border-green-200/50 mb-5">
                  <div className="flex gap-3">
                    <div className="p-2 bg-green-100 text-green-700 rounded-xl flex-shrink-0">
                      <Check className="w-5 h-5" id="check-badge" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-green-900">After: Smart Image Resize Pro output</h3>
                      <p className="text-xs text-green-700/80">Every single listing shares exactly the same dimensions (1:1 aspect) without pixel stretching.</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-green-100 text-green-800 font-mono text-[9px] font-bold rounded">UNIFORM</span>
                </div>

                {/* Simulated Webpage - Shop Listing Grid with unified aspect ratios */}
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-inner">
                  
                  {/* Web navbar card mock */}
                  <div className="flex items-center justify-between gap-3 text-xs text-gray-400 bg-gray-50/50 p-2.5 rounded-lg border border-gray-100 mb-4 select-none">
                    <p className="flex items-center gap-1.5 font-bold text-green-700 text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse block" />
                      WooCommerce Live Storefront View
                    </p>
                    <div className="flex gap-3 font-medium text-[9px]">
                      <span>Shop</span>
                      <span>Category</span>
                      <span>Cart (0)</span>
                    </div>
                  </div>

                  {/* PRODUCTS GRID - PERFECT HARMONY */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {images.map((img) => (
                      <div key={`good-item-${img.id}`} className="flex flex-col bg-white rounded-lg border border-gray-100 p-2 shadow-[0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-md transition-all duration-300">
                        
                        {/* UNIFORM ASPECT RATIO BOX: Perfect fit, padding border matches, aspect ratio is uniform! */}
                        <div 
                          className="bg-[#fcfbf9] rounded overflow-hidden relative border border-gray-50 flex items-center justify-center w-full"
                          style={{
                            aspectRatio: settings.aspectRatioType === 'custom'
                              ? `${settings.customWidth}/${settings.customHeight}`
                              : settings.aspectRatioType.replace(':', '/')
                          }}
                        >
                          <img 
                            src={img.processedUrl} 
                            alt="Uniform smart size" 
                            className="w-full h-full object-contain block"
                            referrerPolicy="no-referrer"
                          />

                          {/* Green Pass Indicator */}
                          <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5 shadow-sm">
                            <Check className="w-3 h-3" />
                          </div>
                        </div>

                        {/* Title & Metadata */}
                        <div className="mt-2 text-left">
                          <p className="text-[10px] font-bold text-gray-800 line-clamp-1">{img.name.replace('.png', '').replace('.jpg', '')}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] font-medium text-gray-400 font-mono">1:1 Uniform Fit</span>
                            <span className="text-[10px] font-bold text-gray-900">$124.00</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 text-center text-[10px] text-green-700 font-semibold select-none">
                    ✨ Pixel perfect rows, balanced white space, zero distortion, zero cut-offs.
                  </div>
                </div>

              </div>

            </div>

            {/* LOWER STATS AND COMPARATIVE FOOTER */}
            <div className="bg-[#fcfbf9] p-4 rounded-2xl border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-left">
                <p className="text-xs font-bold text-gray-800">Ready to migrate your raw WooCommerce catalogs?</p>
                <p className="text-[11px] text-gray-500">Modify sizes dynamically via studio sliders. All changes propagate in real-time inside the Storefront layout sandbox.</p>
              </div>
              <button
                onClick={() => setCurrentTab('editor')}
                className="px-4 py-2 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 transition-all cursor-pointer shadow-sm flex items-center gap-1"
              >
                Go back to Workspace Studio <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        )}

      </main>

      {/* Aesthetic humanized minimalist footer */}
      <footer className="bg-white border-t border-gray-100/80 py-6 mt-12 px-6">
        <div className="max-w-[1440px] w-full mx-auto flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-400 gap-3">
          <p>© 2026 Smart Image Resize PRO. Made for WooCommerce, Shopify, and e-commerce growth.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-gray-600">No Image Uploaded Server-side (100% Secure Client Canvas)</span>
            <span>•</span>
            <span className="hover:text-gray-600">Resolution Optimized</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

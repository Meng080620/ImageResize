import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Download, Maximize2, Upload, Layers } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { MultiExportModal } from './MultiExportModal';
import { Button } from '../../catalyst-ui-kit/typescript/button';
import { getSampleImages } from '../../utils/sampleImages';

const fade = { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const };

export const PreviewArea: React.FC = () => {
  const {
    selectedImage, isProcessing,
    viewMode, setViewMode, settings, handleDownloadSingle,
    handleOpenBigPreviewHero,
    handleFiles, onDrag, onDrop, dragActive, images, setImages, setSelectedImageId,
  } = useEditor();
  const [multiExportOpen, setMultiExportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSamples = () => {
    const items = getSampleImages();
    setImages(items);
    setSelectedImageId(items[0].id);
  };

  if (!selectedImage) {
    // Nothing selected. With an empty queue this is the primary dropzone; with images
    // queued (none selected) it just prompts to pick one.
    const empty = images.length === 0;
    return (
      <motion.section
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrop}
        className={`order-1 lg:order-2 lg:col-span-6 border border-dashed rounded-xl p-6 flex flex-col shadow-lg items-center justify-center min-h-[360px] lg:min-h-0 lg:h-[calc(100vh-100px)] lg:sticky lg:top-[80px] transition-colors ${
          dragActive ? 'border-blue-500/60 bg-blue-500/10' : 'border-line-strong bg-surface'
        }`}
      >
        <input
          type="file" ref={fileInputRef} multiple accept="image/*" className="hidden"
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
        />
        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
          <Upload className="w-6 h-6 text-blue-400" />
        </div>
        <h2 className="font-display font-semibold text-lg text-content">
          {empty ? 'Drop your product images here' : 'Select an image to edit'}
        </h2>
        <p className="text-xs text-faint mt-2 max-w-[320px] text-center leading-relaxed">
          {empty
            ? 'Resize, remove backgrounds and export store-ready images. Everything runs in your browser — nothing is uploaded.'
            : 'Pick an image from the queue to preview and adjust it.'}
        </p>
        {empty && (
          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-md transition-colors duration-200"
            >
              Browse files
            </button>
            <button
              onClick={loadSamples}
              className="px-4 py-2 bg-elevated hover:bg-hover text-content font-medium text-xs rounded-md transition-colors duration-200"
            >
              Try samples
            </button>
          </div>
        )}
        {empty && <p className="text-[10px] text-faint mt-4">JPG, PNG, WEBP — multiple files supported</p>}
      </motion.section>
    );
  }

  return (
    <section className="order-1 lg:order-2 lg:col-span-6 bg-surface border border-line rounded-xl p-5 flex flex-col shadow-lg lg:h-[calc(100vh-100px)] lg:overflow-y-auto lg:sticky lg:top-[80px]">
      <div className="flex items-center justify-between pb-3 border-b border-line mb-4 flex-wrap gap-2">
        <h2 className="font-semibold text-sm text-content">Inspector</h2>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenBigPreviewHero}
            aria-label="Expand preview to fullscreen"
            className="px-3 py-1.5 bg-elevated hover:bg-hover text-muted rounded-md text-xs font-medium transition-colors duration-200 flex items-center gap-1.5"
          >
            <Maximize2 className="w-3 h-3" />
            Expand
          </button>

          <div className="flex items-center bg-base p-1 rounded-md border border-line relative" role="group" aria-label="Preview view mode">
            {(['split', 'slider', 'single'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                aria-label={`${mode === 'split' ? 'Split' : mode === 'slider' ? 'Compare before/after' : 'Single'} view`}
                aria-pressed={viewMode === mode}
                title={mode === 'slider' ? 'Drag the handle to compare original vs processed' : undefined}
                className={`relative px-3 py-1 rounded text-xs font-medium transition-colors duration-200 z-10 ${
                  viewMode === mode ? 'text-content' : 'text-faint hover:text-muted'
                }`}
              >
                {viewMode === mode && (
                  <motion.div
                    layoutId="viewModePill"
                    className="absolute inset-0 bg-elevated rounded shadow-sm"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative">
                  {mode === 'split' ? 'Split' : mode === 'slider' ? 'Compare' : 'Single'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <div className="flex-1 bg-base rounded-lg p-4 flex flex-col items-center justify-center min-h-[400px] border border-line relative overflow-hidden checkerboard">
          <AnimatePresence>
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-base/30 z-10 flex items-center justify-center backdrop-blur-[2px] pointer-events-none"
              >
                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>
          
          <AnimatePresence mode="wait">
            <motion.div
              key={`${selectedImage.id}-${viewMode}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={fade}
              className="w-full h-full flex items-center justify-center"
            >
              {viewMode === 'slider' ? (
                <div className="w-full rounded-lg overflow-hidden flex flex-col gap-2">
                  <p className="text-[10px] text-faint text-center">Drag the handle to compare original vs processed</p>
                  {/* Explicit height: the slider's images are object-contain with no
                      intrinsic height, so an h-full chain collapses to 0 (the box only
                      has min-height, not a definite height). A concrete height fixes it. */}
                  <div className="h-[380px]">
                    <BeforeAfterSlider
                      before={selectedImage.originalUrl}
                      after={selectedImage.processedUrl}
                      beforeLabel="Original"
                      afterLabel="Processed"
                      afterCheckerboard
                    />
                  </div>
                </div>
              ) : viewMode === 'split' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-full max-w-[600px]">
                  <div className="flex flex-col h-full bg-surface rounded-lg border border-line overflow-hidden">
                    <div className="p-2 border-b border-line flex items-center justify-between bg-elevated">
                      <span className="text-xs font-medium text-muted">Original</span>
                      <span className="text-xs text-faint font-mono">{selectedImage.width}×{selectedImage.height}</span>
                    </div>
                    <div className="flex-1 p-4 flex items-center justify-center">
                      <img src={selectedImage.originalUrl} alt="Original" className="max-w-full max-h-[220px] object-contain" />
                    </div>
                  </div>

                  <div className="flex flex-col h-full bg-surface rounded-lg border border-blue-500/20 overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                    <div className="p-2 border-b border-line flex items-center justify-between bg-elevated">
                      <span className="text-xs font-medium text-blue-400">Processed</span>
                      <span className="text-xs text-faint font-mono">{settings.aspectRatioType}</span>
                    </div>
                    <div className="flex-1 p-4 flex items-center justify-center checkerboard relative">
                      <div 
                        className="relative max-w-full max-h-[220px] overflow-hidden flex items-center justify-center border border-line-strong"
                        style={{ 
                          aspectRatio: settings.aspectRatioType === 'custom' ? `${settings.customWidth}/${settings.customHeight}` : settings.aspectRatioType.replace(':', '/')
                        }}
                      >
                        <AnimatePresence mode="wait">
                          <motion.img
                            key={selectedImage.id}
                            src={selectedImage.processedUrl}
                            alt="Processed"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="w-full h-full object-contain"
                          />
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center p-4">
                  <div 
                    className="relative max-w-full max-h-full overflow-hidden border border-line-strong"
                    style={{ 
                      aspectRatio: settings.aspectRatioType === 'custom' ? `${settings.customWidth}/${settings.customHeight}` : settings.aspectRatioType.replace(':', '/'),
                      height: '100%'
                    }}
                  >
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={selectedImage.id}
                        src={selectedImage.processedUrl}
                        alt="Render"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="max-w-full max-h-full object-contain m-auto"
                      />
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedImage.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col"
            >
              <p className="text-xs text-faint">Selected</p>
              <p className="text-xs font-medium text-content max-w-[280px] truncate">{selectedImage.name}</p>
            </motion.div>
          </AnimatePresence>
          <div className="flex flex-wrap items-center gap-2">
            <Button outline onClick={handleDownloadSingle} className="!text-xs !items-center">
              <Download data-slot="icon" />
              Download
            </Button>
            <Button color="blue" onClick={() => setMultiExportOpen(true)} title="Export multiple sizes & formats at once" className="!text-xs !items-center">
              <Layers data-slot="icon" />
              Multi-Export
            </Button>
          </div>
        </div>
      </div>

      <MultiExportModal open={multiExportOpen} onClose={() => setMultiExportOpen(false)} />
    </section>
  );
};

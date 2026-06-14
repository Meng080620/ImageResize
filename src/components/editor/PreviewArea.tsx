import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Download, Maximize2, Image as ImageIcon, Layers } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { BeforeAfterSlider } from '../landing/BeforeAfterSlider';
import { MultiExportModal } from './MultiExportModal';

const fade = { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const };

export const PreviewArea: React.FC = () => {
  const {
    selectedImage, isProcessing,
    viewMode, setViewMode, settings, handleDownloadSingle,
    handleOpenBigPreviewHero, handleLoadSingleTestProduct
  } = useEditor();
  const [multiExportOpen, setMultiExportOpen] = useState(false);

  if (!selectedImage) {
    return (
      <motion.section
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="lg:col-span-6 bg-surface border border-line rounded-xl p-5 flex flex-col shadow-lg items-center justify-center min-h-[500px]"
      >
        <ImageIcon className="w-12 h-12 text-faint mb-4" />
        <p className="font-medium text-sm text-muted">Workspace is Empty</p>
        <p className="text-xs text-faint mt-2 max-w-[280px] text-center">
          Select an image from the queue or load a test product to begin editing.
        </p>
        <button
          onClick={handleLoadSingleTestProduct}
          className="mt-6 px-4 py-2 bg-elevated hover:bg-hover text-content font-medium text-xs rounded-md transition-colors duration-200"
        >
          Load Test Product
        </button>
      </motion.section>
    );
  }

  return (
    <section className="lg:col-span-6 bg-surface border border-line rounded-xl p-5 flex flex-col shadow-lg">
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

        <div className="mt-4 pt-4 border-t border-line flex items-center justify-between gap-3">
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadSingle}
              className="px-3 py-2 bg-elevated text-content rounded-md text-xs font-medium hover:bg-hover transition-colors duration-200 flex items-center gap-1.5 border border-line-strong"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={() => setMultiExportOpen(true)}
              title="Export multiple sizes & formats at once"
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold transition-colors duration-200 flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5" />
              Multi-Export
            </button>
          </div>
        </div>
      </div>

      <MultiExportModal open={multiExportOpen} onClose={() => setMultiExportOpen(false)} />
    </section>
  );
};

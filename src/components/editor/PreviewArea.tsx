import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Download, Maximize2, Image as ImageIcon } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';

const fade = { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const };

export const PreviewArea: React.FC = () => {
  const { 
    selectedImage, isProcessing, 
    viewMode, setViewMode, settings, handleDownloadSingle,
    handleOpenBigPreviewHero, handleLoadSingleTestProduct
  } = useEditor();

  if (!selectedImage) {
    return (
      <motion.section
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="lg:col-span-6 bg-[#18181b] border border-white/5 rounded-xl p-5 flex flex-col shadow-lg items-center justify-center min-h-[500px]"
      >
        <ImageIcon className="w-12 h-12 text-zinc-700 mb-4" />
        <p className="font-medium text-sm text-zinc-300">Workspace is Empty</p>
        <p className="text-xs text-zinc-500 mt-2 max-w-[280px] text-center">
          Select an image from the queue or load a test product to begin editing.
        </p>
        <button
          onClick={handleLoadSingleTestProduct}
          className="mt-6 px-4 py-2 bg-[#27272a] hover:bg-[#3f3f46] text-zinc-100 font-medium text-xs rounded-md transition-colors duration-200"
        >
          Load Test Product
        </button>
      </motion.section>
    );
  }

  return (
    <section className="lg:col-span-6 bg-[#18181b] border border-white/5 rounded-xl p-5 flex flex-col shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4 flex-wrap gap-2">
        <h2 className="font-semibold text-sm text-zinc-100">Inspector</h2>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenBigPreviewHero}
            className="px-3 py-1.5 bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 rounded-md text-xs font-medium transition-colors duration-200 flex items-center gap-1.5"
          >
            <Maximize2 className="w-3 h-3" />
            Expand
          </button>

          <div className="flex items-center bg-[#09090b] p-1 rounded-md border border-white/5 relative">
            {(['split', 'single'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`relative px-3 py-1 rounded text-xs font-medium transition-colors duration-200 z-10 ${
                  viewMode === mode ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {viewMode === mode && (
                  <motion.div
                    layoutId="viewModePill"
                    className="absolute inset-0 bg-[#27272a] rounded shadow-sm"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative">{mode === 'split' ? 'Split' : 'Single'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <div className="flex-1 bg-[#09090b] rounded-lg p-4 flex flex-col items-center justify-center min-h-[400px] border border-white/5 relative overflow-hidden checkerboard-bg-dark">
          <AnimatePresence>
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-[#09090b]/30 z-10 flex items-center justify-center backdrop-blur-[2px] pointer-events-none"
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
              {viewMode === 'split' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-full max-w-[600px]">
                  <div className="flex flex-col h-full bg-[#18181b] rounded-lg border border-white/5 overflow-hidden">
                    <div className="p-2 border-b border-white/5 flex items-center justify-between bg-zinc-900">
                      <span className="text-xs font-medium text-zinc-400">Original</span>
                      <span className="text-xs text-zinc-500 font-mono">{selectedImage.width}×{selectedImage.height}</span>
                    </div>
                    <div className="flex-1 p-4 flex items-center justify-center">
                      <img src={selectedImage.originalUrl} alt="Original" className="max-w-full max-h-[220px] object-contain" />
                    </div>
                  </div>

                  <div className="flex flex-col h-full bg-[#18181b] rounded-lg border border-blue-500/20 overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                    <div className="p-2 border-b border-white/5 flex items-center justify-between bg-zinc-900">
                      <span className="text-xs font-medium text-blue-400">Processed</span>
                      <span className="text-xs text-zinc-500 font-mono">{settings.aspectRatioType}</span>
                    </div>
                    <div className="flex-1 p-4 flex items-center justify-center checkerboard-bg-dark relative">
                      <div 
                        className="relative max-w-full max-h-[220px] overflow-hidden flex items-center justify-center border border-white/10"
                        style={{ 
                          aspectRatio: settings.aspectRatioType === 'custom' ? `${settings.customWidth}/${settings.customHeight}` : settings.aspectRatioType.replace(':', '/')
                        }}
                      >
                        <AnimatePresence mode="wait">
                          <motion.img
                            key={selectedImage.processedUrl}
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
                    className="relative max-w-full max-h-full overflow-hidden border border-white/10"
                    style={{ 
                      aspectRatio: settings.aspectRatioType === 'custom' ? `${settings.customWidth}/${settings.customHeight}` : settings.aspectRatioType.replace(':', '/'),
                      height: '100%'
                    }}
                  >
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={selectedImage.processedUrl}
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

        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedImage.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col"
            >
              <p className="text-xs text-zinc-500">Selected</p>
              <p className="text-xs font-medium text-zinc-200 max-w-[280px] truncate">{selectedImage.name}</p>
            </motion.div>
          </AnimatePresence>
          <button
            onClick={handleDownloadSingle}
            className="px-4 py-2 bg-zinc-800 text-zinc-100 rounded-md text-xs font-medium hover:bg-zinc-700 transition-colors duration-200 flex items-center gap-2 border border-white/10"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>
    </section>
  );
};

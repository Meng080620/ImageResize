import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, Sparkles, X } from 'lucide-react';
import { EditorProvider, useEditor } from './context/EditorContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { SettingsPanel } from './components/layout/SettingsPanel';
import { PreviewArea } from './components/editor/PreviewArea';
import { SandboxView } from './components/sandbox/SandboxView';

interface AppContentProps {
  onBackToLanding: () => void;
}

const AppContent: React.FC<AppContentProps> = ({ onBackToLanding }) => {
  const { currentTab, toast, isPreviewOpen, setIsPreviewOpen, selectedImage, settings, modalBg, showAlignmentGrid, setShowAlignmentGrid, previewZoom, setPreviewZoom } = useEditor();

  return (
    <div className="min-h-screen bg-base text-content font-sans flex flex-col selection:bg-blue-500/30 antialiased">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 shadow-lg rounded-lg border border-line-strong overflow-hidden"
          >
            <div className={`p-3.5 flex items-center gap-3 backdrop-blur-xl ${
              toast.type === 'success' ? 'bg-surface/95 text-green-400 border-l-2 border-l-green-500' :
              toast.type === 'error' ? 'bg-surface/95 text-red-400 border-l-2 border-l-red-500' :
              'bg-surface/95 text-blue-400 border-l-2 border-l-blue-500'
            }`}>
              {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
              {toast.type === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
              {toast.type === 'info' && <Sparkles className="w-4 h-4 text-blue-500" />}
              <span className="text-xs font-medium">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Header onBackToLanding={onBackToLanding} />

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        <AnimatePresence mode="wait">
          {currentTab === 'editor' ? (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start relative"
            >
              <Sidebar />
              <PreviewArea />
              <SettingsPanel />
            </motion.div>
          ) : (
            <motion.div
              key="sandbox"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              <SandboxView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-line py-6 mt-12 px-6">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-faint gap-3">
          <p>© 2026 Image Resize. Client-side processing only.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-muted transition-colors">100% Secure</span>
            <span>•</span>
            <span className="hover:text-muted transition-colors">Fast Render</span>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {isPreviewOpen && selectedImage && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-hidden"
          >
            <div className="absolute inset-0 cursor-default" onClick={() => setIsPreviewOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
              className="bg-surface rounded-xl overflow-hidden shadow-2xl border border-line-strong max-w-5xl w-full flex flex-col z-10 relative"
            >
              <div className="flex items-center justify-between p-4 px-6 border-b border-line bg-base">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-blue-500/10 text-blue-500 rounded-md">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-content tracking-tight">Expanded Preview</h3>
                    <p className="text-[10px] text-faint">{selectedImage.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="p-1.5 hover:bg-elevated rounded-md text-muted hover:text-content transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 flex flex-col bg-base">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={showAlignmentGrid} onChange={(e) => setShowAlignmentGrid(e.target.checked)}
                      className="w-3.5 h-3.5 rounded bg-track accent-blue-500 border-line-strong"
                      aria-label="Toggle alignment grid lines"
                    />
                    <span className="text-muted text-xs font-medium">Grid Lines</span>
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-faint">Zoom</span>
                    <input
                      type="range" min="50" max="150" value={previewZoom} onChange={(e) => setPreviewZoom(Number(e.target.value))}
                      className="w-24 h-1.5 rounded-lg bg-track accent-blue-500"
                      aria-label={`Preview zoom: ${previewZoom}%`}
                    />
                    <span className="text-muted w-8 text-right">{previewZoom}%</span>
                  </div>
                </div>

                <div className="w-full flex justify-center items-center py-4">
                  <div
                    className={`relative transition-all rounded-lg overflow-hidden flex items-center justify-center border border-line-strong ${
                      modalBg === 'checkerboard' ? 'checkerboard' : ''
                    }`}
                    style={{
                      aspectRatio: settings.aspectRatioType === 'custom' ? `${settings.customWidth}/${settings.customHeight}` : settings.aspectRatioType.replace(':', '/'),
                      transform: `scale(${previewZoom / 100})`,
                      height: '500px',
                      backgroundColor: modalBg === 'white' ? '#ffffff' : modalBg === 'gray' ? '#f3f4f6' : modalBg === 'cream' ? '#fdfbf7' : modalBg === 'dark' ? '#111827' : undefined,
                    }}
                  >
                    {showAlignmentGrid && (
                      <div className="absolute inset-0 pointer-events-none z-10 border border-blue-500/20">
                        <div className="absolute inset-x-0 top-1/4 border-b border-dashed border-blue-500/20" />
                        <div className="absolute inset-x-0 top-2/4 border-b border-dashed border-blue-500/30" />
                        <div className="absolute inset-x-0 top-3/4 border-b border-dashed border-blue-500/20" />
                        <div className="absolute inset-y-0 left-1/4 border-r border-dashed border-blue-500/20" />
                        <div className="absolute inset-y-0 left-2/4 border-r border-dashed border-blue-500/30" />
                        <div className="absolute inset-y-0 left-3/4 border-r border-dashed border-blue-500/20" />
                      </div>
                    )}
                    <img src={selectedImage.processedUrl} alt="" className="max-w-full max-h-full object-contain m-auto" />
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface AppProps {
  onBackToLanding: () => void;
}

export default function App({ onBackToLanding }: AppProps) {
  return (
    <EditorProvider>
      <AppContent onBackToLanding={onBackToLanding} />
    </EditorProvider>
  );
}

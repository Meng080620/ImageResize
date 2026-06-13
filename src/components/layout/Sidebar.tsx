import React, { useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Trash2, Image as ImageIcon, FileArchive, RefreshCw, GripVertical } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { getSampleProducts } from '../../utils/sampleImages';

const spring = { type: 'spring' as const, stiffness: 500, damping: 35, mass: 0.8 };

export const Sidebar: React.FC = () => {
  const { 
    images, setImages, selectedImageId, setSelectedImageId, 
    handleFiles, handleRemoveImage, handleClearAll, moveImage,
    dragActive, onDrag, onDrop, stats, imagesAnalysis,
    exportSizeSelection, setExportSizeSelection, customExportSizeInput, setCustomExportSizeInput,
    handleDownloadZipWithSize, isZipping, activeExportSize,
  } = useEditor();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const orderedItems = useMemo(() => {
    if (dragIndex === null || overIndex === null || dragIndex === overIndex) return imagesAnalysis;
    const items = [...imagesAnalysis];
    const [removed] = items.splice(dragIndex, 1);
    items.splice(overIndex, 0, removed);
    return items;
  }, [imagesAnalysis, dragIndex, overIndex]);

  const loadSamples = () => {
    const samples = getSampleProducts();
    const newItems = samples.map((s, idx) => ({
      id: `sample-${idx}`,
      name: s.name, type: 'image/png', size: 15420,
      originalUrl: s.url, processedUrl: s.url,
      width: s.width, height: s.height, aspectRatio: s.width / s.height
    }));
    setImages(newItems);
    setSelectedImageId(newItems[0].id);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      moveImage(dragIndex, overIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <aside className="lg:col-span-3 bg-surface border border-line rounded-xl p-4 flex flex-col shadow-lg h-[calc(100vh-100px)] sticky top-[80px]">
      <div className="flex items-center justify-between pb-3 border-b border-line mb-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-muted" />
          <h2 className="font-semibold text-sm text-content">Queue ({images.length})</h2>
        </div>
        {images.length > 0 && (
          <button 
            onClick={handleClearAll}
            className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors duration-200"
          >
            Clear All
          </button>
        )}
      </div>

      <motion.div
        onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        animate={{
          borderColor: dragActive ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.1)',
          backgroundColor: dragActive ? 'rgba(59,130,246,0.08)' : 'rgba(39,39,42,0)',
          scale: dragActive ? 1.01 : 1,
        }}
        transition={{ duration: 0.2 }}
        className="border border-dashed rounded-xl p-4 text-center cursor-pointer mb-4 shrink-0 hover:border-line-strong hover:bg-elevated/50"
      >
        <input 
          type="file" ref={fileInputRef}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          multiple accept="image/*" className="hidden" 
        />
        <Upload className="w-5 h-5 text-muted mx-auto mb-2" />
        <p className="text-xs font-medium text-muted">Upload Images</p>
      </motion.div>

      <AnimatePresence mode="popLayout">
        {images.length > 0 && (
          <motion.div
            key="stats"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="mb-4 flex gap-2 shrink-0 overflow-hidden"
          >
            <div className="flex-1 bg-elevated/50 px-3 py-2 rounded-lg border border-line flex items-center justify-between">
              <span className="text-xs text-muted">Total</span>
              <motion.span
                key={stats.total}
                initial={{ scale: 1.2, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-sm font-semibold text-content"
              >
                {stats.total}
              </motion.span>
            </div>
            <div className="flex-1 bg-elevated/50 px-3 py-2 rounded-lg border border-line flex items-center justify-between">
              <span className="text-xs text-muted">Done</span>
              <motion.span
                key={stats.totalDone}
                initial={{ scale: 1.2, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-sm font-semibold text-green-400"
              >
                {stats.totalDone}
              </motion.span>
            </div>
            {stats.totalIssues > 0 && (
              <div className="flex-1 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20 flex items-center justify-between">
                <span className="text-xs text-red-400">Issues</span>
                <span className="text-sm font-semibold text-red-400">{stats.totalIssues}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 min-h-0 scroll-smooth">
        {images.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center py-10 text-center h-full"
          >
            <p className="text-xs text-faint mt-2 max-w-[200px] leading-relaxed">
              Upload your product images to get started.
            </p>
            <button 
              onClick={loadSamples}
              className="mt-4 px-4 py-2 bg-elevated hover:bg-hover text-content font-medium text-xs rounded-md transition-colors duration-200"
            >
              Load Samples
            </button>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {orderedItems.map((img, index) => {
              const isSelected = img.id === selectedImageId;
              const isDragging = dragIndex !== null && imagesAnalysis[dragIndex]?.id === img.id;
              return (
                <motion.div
                  key={img.id}
                  layout
                  layoutId={img.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: isDragging ? 0.5 : 1, x: 0, scale: isDragging ? 1.02 : 1 }}
                  exit={{ opacity: 0, x: -12, transition: { duration: 0.15 } }}
                  transition={spring}
                  draggable
                  onDragStart={() => setDragIndex(imagesAnalysis.findIndex(i => i.id === img.id))}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const targetIndex = imagesAnalysis.findIndex(i => i.id === img.id);
                    if (dragIndex !== null && targetIndex !== dragIndex) setOverIndex(targetIndex);
                  }}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelectedImageId(img.id)}
                  className={`group relative p-2 rounded-lg border cursor-pointer flex items-center justify-between ${
                    isSelected 
                      ? 'bg-blue-500/10 border-blue-500/30' 
                      : 'border-line bg-elevated/30 hover:bg-elevated/80'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden pointer-events-none">
                    <GripVertical className="w-3 h-3 text-faint shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    <div className="w-10 h-10 rounded bg-surface flex-shrink-0 relative overflow-hidden flex items-center justify-center border border-line">
                      <img src={img.originalUrl} alt="" className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-medium text-content truncate pr-4">{img.name}</p>
                      <span className="text-[10px] text-faint block mt-0.5 whitespace-nowrap">
                        {img.width} × {img.height}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleRemoveImage(img.id, e)}
                    title="Delete image"
                    aria-label={`Delete ${img.name}`}
                    className="opacity-60 group-hover:opacity-100 p-1.5 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {images.length > 0 && (
          <motion.div
            key="export"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25 }}
            className="mt-4 pt-4 border-t border-line shrink-0 flex flex-col gap-3"
          >
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted font-medium block">Batch Export Dimension:</span>
              <div className="grid grid-cols-4 gap-1">
                {['300', '600', '855', '1000', '1200', 'preview', 'custom'].map((sz) => {
                  const active = exportSizeSelection === sz;
                  return (
                    <button
                      key={sz}
                      onClick={() => setExportSizeSelection(sz as typeof exportSizeSelection)}
                      className={`py-1 rounded text-xs font-medium border cursor-pointer transition-all duration-200 ${
                        active 
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
                          : 'bg-elevated border-line text-muted hover:text-content'
                      } ${sz === 'custom' || sz === 'preview' ? 'col-span-2' : 'col-span-1'}`}
                    >
                      {sz === 'preview' ? 'Canvas' : sz === 'custom' ? 'Custom' : `${sz}px`}
                    </button>
                  );
                })}
              </div>
              
              <AnimatePresence>
                {exportSizeSelection === 'custom' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 mt-1 overflow-hidden"
                  >
                    <input 
                      type="number" value={customExportSizeInput}
                      onChange={(e) => setCustomExportSizeInput(Number(e.target.value))}
                      className="w-full bg-surface border border-line-strong rounded px-2 py-1 text-xs text-content outline-none focus:border-blue-500 transition-colors duration-200"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={() => handleDownloadZipWithSize(activeExportSize)}
              disabled={isZipping}
              className={`py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs shadow-md transition-all duration-200 flex items-center justify-center gap-2 ${
                isZipping ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isZipping ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
              {isZipping ? 'Packaging...' : `Export ZIP (${activeExportSize === 'preview' ? 'Canvas' : `${activeExportSize}px`})`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
};

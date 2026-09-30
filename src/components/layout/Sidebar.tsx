import React, { useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Image as ImageIcon, FileArchive, RefreshCw, GripVertical, AlertTriangle, X, Lightbulb, Plus, Layers } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { MultiExportModal } from '../editor/MultiExportModal';
import { Button } from '../../catalyst-ui-kit/typescript/button';
import { Input } from '../../catalyst-ui-kit/typescript/input';

const spring = { type: 'spring' as const, stiffness: 500, damping: 35, mass: 0.8 };

export const Sidebar: React.FC = () => {
  const {
    images, setImages, selectedImageId, setSelectedImageId,
    handleFiles, handleRemoveImage, handleClearAll, moveImage,
    dragActive, onDrag, onDrop, stats, imagesAnalysis,
    exportSizeSelection, setExportSizeSelection, customExportSizeInput, setCustomExportSizeInput,
    handleDownloadZipWithSize, isZipping, activeExportSize, isProcessing,
    handleRemoveBackground, handleUpscale, isBgProcessing, isUpscaling,
  } = useEditor();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [showIssuesPanel, setShowIssuesPanel] = useState(false);
  const [tipsHidden, setTipsHidden] = useState(false);
  const [batchExportOpen, setBatchExportOpen] = useState(false);

  const issueGroups = useMemo(() => {
    const groups: Record<string, typeof imagesAnalysis> = {};
    for (const img of imagesAnalysis) {
      for (const issue of img.issues) {
        if (!groups[issue]) groups[issue] = [];
        groups[issue].push(img);
      }
    }
    return groups;
  }, [imagesAnalysis]);

  const recommendations = useMemo(() => {
    if (images.length === 0) return [];
    const tips: { id: 'bg' | 'upscale'; title: string; hint: string; actionLabel: string }[] = [];
    const hasBgNotRemoved = images.some(img => !img.bgRemoved);
    const lowResCount = imagesAnalysis.filter(img => img.issues.includes('Low resolution')).length;
    if (hasBgNotRemoved) tips.push({
      id: 'bg',
      title: 'Remove Background',
      hint: 'AI strips the backdrop — select an image then click Apply.',
      actionLabel: 'Apply to selected',
    });
    if (lowResCount > 0) tips.push({
      id: 'upscale',
      title: `${lowResCount} image${lowResCount > 1 ? 's are' : ' is'} low-res`,
      hint: 'AI sharpens before export — select an image then click Apply.',
      actionLabel: 'Upscale 2× selected',
    });
    return tips.slice(0, 2);
  }, [images, imagesAnalysis]);

  const orderedItems = useMemo(() => {
    if (dragIndex === null || overIndex === null || dragIndex === overIndex) return imagesAnalysis;
    const items = [...imagesAnalysis];
    const [removed] = items.splice(dragIndex, 1);
    items.splice(overIndex, 0, removed);
    return items;
  }, [imagesAnalysis, dragIndex, overIndex]);

  const handleDragEnd = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      moveImage(dragIndex, overIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <aside className="order-2 lg:order-1 lg:col-span-3 bg-surface border border-line rounded-xl p-4 flex flex-col shadow-lg lg:h-[calc(100vh-100px)] lg:sticky lg:top-[80px]">
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

      <input
        type="file" ref={fileInputRef}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
        multiple accept="image/*" className="hidden"
      />

      <motion.button
        onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full mb-3 shrink-0 flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed transition-colors text-xs font-medium ${
          dragActive
            ? 'border-blue-500/60 bg-blue-500/10 text-blue-400'
            : 'border-line text-faint hover:text-muted hover:border-line-strong hover:bg-elevated/40'
        }`}
      >
        <Plus className="w-3.5 h-3.5" /> {images.length === 0 ? 'Add Images' : 'Add More Images'}
      </motion.button>

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
              <button
                onClick={() => setShowIssuesPanel(v => !v)}
                className="flex-1 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20 flex items-center justify-between hover:bg-red-500/20 transition-colors cursor-pointer"
              >
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Issues
                </span>
                <span className="text-sm font-semibold text-red-400">{stats.totalIssues}</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {recommendations.length > 0 && !tipsHidden && (
          <motion.div
            key="tips"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-3 shrink-0 overflow-hidden"
          >
            <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-blue-400 flex items-center gap-1.5">
                  <Lightbulb className="w-3 h-3" /> Recommended
                </span>
                <button onClick={() => setTipsHidden(true)} className="text-faint hover:text-muted transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex flex-col divide-y divide-blue-500/10">
                {recommendations.map(tip => {
                  const busy =
                    tip.id === 'bg'      ? (selectedImageId ? isBgProcessing(selectedImageId) : false) :
                    (selectedImageId ? isUpscaling(selectedImageId) : false);

                  const onAction = () => {
                    if (tip.id === 'bg' && selectedImageId)      handleRemoveBackground(selectedImageId);
                    if (tip.id === 'upscale' && selectedImageId) handleUpscale(selectedImageId, 2);
                  };

                  const needsSelection = (tip.id === 'bg' || tip.id === 'upscale') && !selectedImageId;

                  return (
                    <div key={tip.id} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-content">{tip.title}</p>
                        <p className="text-[10px] text-faint mt-0.5 leading-relaxed">
                          {needsSelection ? 'Select an image from the queue first.' : tip.hint}
                        </p>
                      </div>
                      <button
                        onClick={onAction}
                        disabled={busy || needsSelection}
                        className="shrink-0 mt-0.5 px-2 py-1 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {busy ? '…' : tip.actionLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIssuesPanel && stats.totalIssues > 0 && (
          <motion.div
            key="issues-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-3 overflow-hidden shrink-0"
          >
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">Issues Found</span>
                <button onClick={() => setShowIssuesPanel(false)} className="text-faint hover:text-muted transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
              {Object.entries(issueGroups).map(([issue, imgs]) => (
                <div key={issue} className="flex flex-col gap-1">
                  <span className="text-[10px] text-red-400/80 font-medium">{issue}</span>
                  <div className="flex flex-col gap-0.5 pl-2 border-l border-red-500/20">
                    {imgs.map(img => (
                      <button
                        key={img.id}
                        onClick={() => { setSelectedImageId(img.id); setShowIssuesPanel(false); }}
                        className="text-[10px] text-faint hover:text-content text-left truncate transition-colors"
                        title={img.name}
                      >
                        {img.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 min-h-0 max-h-80 lg:max-h-none scroll-smooth">
        {images.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center py-10 text-center h-full"
          >
            <p className="text-xs text-faint max-w-[200px] leading-relaxed">
              Your images will appear here.
            </p>
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
                  onDragStart={() => {
                    const idx = imagesAnalysis.findIndex(i => i.id === img.id);
                    if (idx !== -1) setDragIndex(idx);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const targetIndex = imagesAnalysis.findIndex(i => i.id === img.id);
                    if (dragIndex !== null && targetIndex !== -1 && targetIndex !== dragIndex) setOverIndex(targetIndex);
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
                      {img.hasIssue && (
                        <span
                          title={img.issues.join(' · ')}
                          className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-400 border border-surface pointer-events-none"
                        />
                      )}
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
          <>
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
                    className="flex flex-col gap-1 mt-1 overflow-hidden"
                  >
                    <Input
                      type="number" value={customExportSizeInput} min={1} max={10000}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        const clamped = Math.max(1, Math.min(10000, Math.round(raw)));
                        setCustomExportSizeInput(clamped);
                      }}
                      onBlur={(e) => {
                        const raw = Number(e.target.value);
                        if (!raw || raw < 1) setCustomExportSizeInput(1);
                        else if (raw > 10000) setCustomExportSizeInput(10000);
                      }}
                      className="[&_input]:!py-1 [&_input]:!px-2 [&_input]:!text-xs [&_input]:!leading-5"
                      aria-label="Custom export size in pixels (1–10000)"
                    />
                    {(customExportSizeInput < 1 || customExportSizeInput > 10000) && (
                      <p className="text-xs text-red-400">Must be 1–10000 px</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {(
              <div className="flex flex-col gap-1.5">
                <Button
                  color="blue"
                  onClick={() => handleDownloadZipWithSize(activeExportSize)}
                  disabled={isZipping || isProcessing}
                  className="w-full !text-xs !items-center"
                >
                  {isZipping || isProcessing ? <RefreshCw data-slot="icon" className="animate-spin" /> : <FileArchive data-slot="icon" />}
                  {isZipping ? 'Packaging...' : isProcessing ? 'Processing...' : `Export ZIP (${activeExportSize === 'preview' ? 'Canvas' : `${activeExportSize}px`})`}
                </Button>
                <Button
                  color="purple"
                  onClick={() => setBatchExportOpen(true)}
                  disabled={isZipping || isProcessing || images.length === 0}
                  className="w-full !text-xs !items-center"
                >
                  <Layers data-slot="icon" />
                  Multi-Size Batch Export
                </Button>
              </div>
            )}
          </motion.div>
          <MultiExportModal
            open={batchExportOpen}
            onClose={() => setBatchExportOpen(false)}
            mode="batch"
          />
          </>
        )}
      </AnimatePresence>
    </aside>
  );
};

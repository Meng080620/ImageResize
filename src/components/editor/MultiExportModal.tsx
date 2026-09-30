import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Download, Loader2, Check, Package, Layers, Image as ImageIcon } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { processImageOnCanvas, loadImage, computeTargetDims, effectiveSourceUrl, uniqueFileName } from '../../utils/imageProcessor';
import { Dialog } from '../../catalyst-ui-kit/typescript/dialog';
import { Input } from '../../catalyst-ui-kit/typescript/input';
import { Select } from '../../catalyst-ui-kit/typescript/select';

// ── Types ─────────────────────────────────────────────────────────────────────

type ExportFormat = 'jpeg' | 'png' | 'webp';
type ExportSize   = '300' | '600' | '855' | '1000' | '1200' | 'custom';
export type ExportMode = 'single' | 'batch';

interface ExportVariant {
  id: string;
  size: ExportSize;
  customSize: number;
  format: ExportFormat;
}

interface VariantStatus {
  state: 'idle' | 'processing' | 'done' | 'error';
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SIZE_OPTIONS: { value: ExportSize; label: string }[] = [
  { value: '300',    label: '300 px'  },
  { value: '600',    label: '600 px'  },
  { value: '855',    label: '855 px'  },
  { value: '1000',   label: '1000 px' },
  { value: '1200',   label: '1200 px' },
  { value: 'custom', label: 'Custom'  },
];

const FORMAT_OPTIONS: ExportFormat[] = ['jpeg', 'png', 'webp'];

const QUICK_PRESETS: (ExportVariant & { label: string })[] = [
  { id: 'p1', size: '1200', customSize: 1200, format: 'jpeg', label: 'Full 1200px JPEG'   },
  { id: 'p2', size: '855',  customSize: 855,  format: 'jpeg', label: 'Std 855px JPEG'     },
  { id: 'p3', size: '600',  customSize: 600,  format: 'webp', label: 'Thumb 600px WEBP'   },
  { id: 'p4', size: '300',  customSize: 300,  format: 'jpeg', label: 'Micro 300px JPEG'   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId() {
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function resolveSize(v: ExportVariant): number {
  return v.size === 'custom' ? v.customSize : Number(v.size);
}

function variantLabel(v: ExportVariant): string {
  const px = v.size === 'custom' ? `${v.customSize}px` : `${v.size}px`;
  return `${px} · ${v.format.toUpperCase()}`;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface MultiExportModalProps {
  open: boolean;
  onClose: () => void;
  mode?: ExportMode;
}

export const MultiExportModal: React.FC<MultiExportModalProps> = ({
  open, onClose, mode = 'single',
}) => {
  const { selectedImage, images, settings, showToast } = useEditor();

  const [variants, setVariants] = useState<ExportVariant[]>([
    { id: makeId(), size: '1200', customSize: 1200, format: 'jpeg' },
    { id: makeId(), size: '600',  customSize: 600,  format: 'webp' },
  ]);
  const [statuses,    setStatuses]    = useState<Record<string, VariantStatus>>({});
  const [running,     setRunning]     = useState(false);
  const [allDone,     setAllDone]     = useState(false);
  // Batch progress
  const [batchMsg,    setBatchMsg]    = useState('');
  const [batchDone,   setBatchDone]   = useState(0);
  const [batchTotal,  setBatchTotal]  = useState(0);

  // ── Variant CRUD ─────────────────────────────────────────────────────────────

  const addVariant = () =>
    setVariants(v => [...v, { id: makeId(), size: '855', customSize: 855, format: 'jpeg' }]);

  const removeVariant = (id: string) =>
    setVariants(v => v.filter(x => x.id !== id));

  const updateVariant = (id: string, patch: Partial<ExportVariant>) =>
    setVariants(v => v.map(x => x.id === id ? { ...x, ...patch } : x));

  const applyPreset = (preset: typeof QUICK_PRESETS[0]) => {
    const exists = variants.some(v => v.size === preset.size && v.format === preset.format);
    if (!exists) setVariants(v => [...v, { id: makeId(), size: preset.size, customSize: preset.customSize, format: preset.format }]);
  };

  // ── Single-image export ───────────────────────────────────────────────────────

  const exportSingle = useCallback(async () => {
    if (!selectedImage || running) return;
    setRunning(true);
    setAllDone(false);

    const initStatus: Record<string, VariantStatus> = {};
    variants.forEach(v => { initStatus[v.id] = { state: 'idle' }; });
    setStatuses(initStatus);

    const srcUrl = effectiveSourceUrl(selectedImage);
    let anyError = false;

    for (const variant of variants) {
      setStatuses(prev => ({ ...prev, [variant.id]: { state: 'processing' } }));
      try {
        const imgElem = await loadImage(srcUrl);
        const px      = resolveSize(variant);
        const { width, height } = computeTargetDims(settings, px);
        const blobUrl = await processImageOnCanvas(imgElem, settings, width, height);

        const link = document.createElement('a');
        link.href     = blobUrl;
        link.download = `${baseName(selectedImage.name)}_${px}px.${variant.format}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 150);

        setStatuses(prev => ({ ...prev, [variant.id]: { state: 'done' } }));
      } catch (e: unknown) {
        anyError = true;
        const msg = e instanceof Error ? e.message : 'Export failed';
        setStatuses(prev => ({ ...prev, [variant.id]: { state: 'error', error: msg } }));
      }
    }

    setRunning(false);
    setAllDone(true);
    showToast(
      anyError ? 'Some exports failed.' : `Exported ${variants.length} file${variants.length !== 1 ? 's' : ''}.`,
      anyError ? 'error' : 'success',
    );
  }, [selectedImage, variants, settings, showToast, running]);

  // ── Batch export (all images × all variants → ZIP) ────────────────────────────

  const exportBatch = useCallback(async () => {
    if (images.length === 0 || running) return;
    setRunning(true);
    setAllDone(false);
    setBatchDone(0);

    const total = images.length * variants.length;
    setBatchTotal(total);

    const initStatus: Record<string, VariantStatus> = {};
    variants.forEach(v => { initStatus[v.id] = { state: 'idle' }; });
    setStatuses(initStatus);

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    let done  = 0;
    let anyError = false;
    const usedByFolder: Record<number, Set<string>> = {};

    for (const variant of variants) {
      setStatuses(prev => ({ ...prev, [variant.id]: { state: 'processing' } }));
      const px      = resolveSize(variant);
      const folder  = zip.folder(`${px}px`)!;
      const usedNames = usedByFolder[px] ??= new Set<string>();
      let variantError = false;

      for (const img of images) {
        setBatchMsg(`${img.name} → ${px}px .${variant.format}`);
        try {
          const imgElem = await loadImage(effectiveSourceUrl(img));
          const { width, height } = computeTargetDims(settings, px);
          const blobUrl = await processImageOnCanvas(imgElem, settings, width, height);
          try {
            const blob = await (await fetch(blobUrl)).blob();
            folder.file(uniqueFileName(img.name, variant.format, usedNames), blob);
          } finally {
            URL.revokeObjectURL(blobUrl);
          }
        } catch {
          anyError = true;
          variantError = true;
        }
        done++;
        setBatchDone(done);
      }

      setStatuses(prev => ({
        ...prev,
        [variant.id]: { state: variantError ? 'error' : 'done' },
      }));
    }

    // Generate and download ZIP
    setBatchMsg('Building ZIP…');
    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const zipUrl  = URL.createObjectURL(content);
      const link    = document.createElement('a');
      link.href     = zipUrl;
      link.download = `batch_export_${images.length}img_${variants.length}sizes.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(zipUrl), 150);
    } catch {
      anyError = true;
    }

    setBatchMsg('');
    setRunning(false);
    setAllDone(true);
    showToast(
      anyError
        ? 'Batch export done with some errors.'
        : `Exported ${images.length} images × ${variants.length} sizes — ZIP ready.`,
      anyError ? 'error' : 'success',
    );
  }, [images, variants, settings, showToast, running]);

  const handleExport = mode === 'batch' ? exportBatch : exportSingle;

  const reset = () => {
    setStatuses({});
    setAllDone(false);
    setBatchDone(0);
    setBatchTotal(0);
    setBatchMsg('');
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const doneCount  = Object.values(statuses).filter(s => s.state === 'done').length;
  const isSingle   = mode === 'single';
  const target     = isSingle ? selectedImage : null;
  const canExport  = isSingle ? !!selectedImage : images.length > 0;

  const progressPct = mode === 'batch' && batchTotal > 0
    ? Math.round((batchDone / batchTotal) * 100)
    : batchTotal === 0 && doneCount > 0
      ? Math.round((doneCount / variants.length) * 100)
      : 0;

  const singleProgressPct = isSingle
    ? Math.round((doneCount / variants.length) * 100)
    : 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    // Catalyst Dialog: focus trap, Escape, backdrop click and enter/exit transitions built in.
    // Closing is blocked mid-export so a stray click can't abandon a running ZIP.
    <Dialog open={open} onClose={() => { if (!running) onClose(); }} size="lg" className="!p-0 overflow-hidden flex max-h-[90vh] flex-col">

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  isSingle
                    ? 'bg-blue-500/10 border border-blue-500/20'
                    : 'bg-purple-500/10 border border-purple-500/20'
                }`}>
                  {isSingle
                    ? <Package className="w-3.5 h-3.5 text-blue-400" />
                    : <Layers className="w-3.5 h-3.5 text-purple-400" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-content">
                    {isSingle ? 'Multi-Export' : 'Batch Multi-Export'}
                  </p>
                  <p className="text-[10px] text-faint truncate max-w-[280px]">
                    {isSingle
                      ? (target ? baseName(target.name) : 'No image selected')
                      : `${images.length} image${images.length !== 1 ? 's' : ''} × ${variants.length} size${variants.length !== 1 ? 's' : ''} → ZIP`
                    }
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 text-faint hover:text-muted hover:bg-elevated rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Batch image count banner ── */}
            {!isSingle && (
              <div className="px-5 py-2.5 bg-purple-500/5 border-b border-purple-500/10 flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <p className="text-[11px] text-purple-300">
                  Will export <span className="font-bold">{images.length}</span> image{images.length !== 1 ? 's' : ''} × each size below →
                  ZIP with <span className="font-bold">{images.length * variants.length}</span> files in {variants.length} subfolder{variants.length !== 1 ? 's' : ''}.
                </p>
              </div>
            )}

            {/* ── Quick presets ── */}
            <div className="px-5 pt-3.5 pb-3 border-b border-line">
              <p className="text-[10px] text-faint font-semibold uppercase tracking-wider mb-2">Quick presets</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PRESETS.map(p => {
                  const already = variants.some(v => v.size === p.size && v.format === p.format);
                  return (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      disabled={already || running}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all disabled:cursor-not-allowed ${
                        already
                          ? 'border-green-500/30 bg-green-500/10 text-green-400'
                          : 'border-line bg-elevated text-muted hover:border-blue-500/40 hover:text-blue-400 disabled:opacity-40'
                      }`}
                    >
                      {already && <Check className="w-2.5 h-2.5 inline mr-1" />}
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Variant list ── */}
            <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2 min-h-0">
              {variants.map((v, idx) => {
                const status = statuses[v.id];
                return (
                  <motion.div
                    key={v.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.18 }}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${
                      status?.state === 'done'       ? 'border-green-500/30 bg-green-500/5'   :
                      status?.state === 'error'      ? 'border-red-500/30   bg-red-500/5'     :
                      status?.state === 'processing' ? 'border-blue-500/30  bg-blue-500/5'    :
                      'border-line bg-base'
                    }`}
                  >
                    {/* Index */}
                    <span className="text-[10px] font-bold text-faint w-4 shrink-0 text-center">{idx + 1}</span>

                    {/* Size picker */}
                    <Select
                      value={v.size}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateVariant(v.id, { size: e.target.value as ExportSize })}
                      disabled={running}
                      className="!w-auto [&_select]:!py-1 [&_select]:!text-xs [&_select]:!leading-5"
                    >
                      {SIZE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>

                    {/* Custom size input */}
                    {v.size === 'custom' && (
                      <Input
                        type="number" value={v.customSize} min={50} max={8000}
                        onChange={e => updateVariant(v.id, {
                          customSize: Math.max(50, Math.min(8000, Number(e.target.value))),
                        })}
                        disabled={running}
                        className="!w-20 [&_input]:!py-1 [&_input]:!px-2 [&_input]:!text-xs [&_input]:!leading-5"
                      />
                    )}

                    {/* Format toggle */}
                    <div className="flex items-center bg-elevated rounded-lg border border-line overflow-hidden">
                      {FORMAT_OPTIONS.map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => updateVariant(v.id, { format: fmt })}
                          disabled={running}
                          className={`px-2 py-1 text-[10px] font-bold uppercase transition-all disabled:opacity-50 ${
                            v.format === fmt ? 'bg-blue-600 text-white' : 'text-faint hover:text-muted'
                          }`}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>

                    {/* Label */}
                    <span className="flex-1 text-[10px] text-faint truncate min-w-0">{variantLabel(v)}</span>

                    {/* Status */}
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      {status?.state === 'processing' && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
                      {status?.state === 'done'       && <Check   className="w-3.5 h-3.5 text-green-400" />}
                      {status?.state === 'error'      && (
                        <span title={status.error} className="text-[10px] text-red-400 cursor-help font-bold">✕</span>
                      )}
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeVariant(v.id)}
                      disabled={running || variants.length <= 1}
                      className="p-1 text-faint hover:text-red-400 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </motion.div>
                );
              })}

              {/* Add variant */}
              <button
                onClick={addVariant}
                disabled={running || variants.length >= 10}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-line text-faint hover:border-blue-500/40 hover:text-blue-400 text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Add size
                {variants.length >= 10 && <span className="ml-auto text-[10px]">max 10</span>}
              </button>
            </div>

            {/* ── Progress bar ── */}
            {running && (
              <div className="px-5 py-2.5 border-t border-line bg-base/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-faint truncate max-w-[300px]">
                    {batchMsg || 'Exporting…'}
                  </span>
                  <span className="text-[10px] text-content font-semibold shrink-0 ml-2">
                    {mode === 'batch' ? `${batchDone}/${batchTotal}` : `${doneCount}/${variants.length}`}
                  </span>
                </div>
                <div className="h-1 bg-elevated rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${isSingle ? 'bg-blue-500' : 'bg-purple-500'}`}
                    animate={{ width: `${isSingle ? singleProgressPct : progressPct}%` }}
                    transition={{ duration: 0.25 }}
                  />
                </div>
                {!isSingle && batchTotal > 0 && (
                  <p className="text-[9px] text-faint mt-1">
                    ZIP will download automatically when done · files in /{'{size}px'}/ subfolders
                  </p>
                )}
              </div>
            )}

            {/* ── Footer ── */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-line">
              <div className="text-[10px] text-faint leading-relaxed">
                {allDone
                  ? isSingle
                    ? `${doneCount}/${variants.length} files downloaded`
                    : `ZIP downloaded · ${images.length} images × ${variants.length} sizes`
                  : isSingle
                    ? variants.map(v => variantLabel(v)).join(' · ')
                    : `${images.length} img × ${variants.length} sizes = ${images.length * variants.length} files`
                }
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {allDone && (
                  <button
                    onClick={reset}
                    className="px-3 py-2 rounded-lg border border-line text-xs text-muted hover:text-content hover:bg-elevated transition-all font-medium"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={handleExport}
                  disabled={running || variants.length === 0 || !canExport}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md ${
                    isSingle
                      ? 'bg-blue-600 hover:bg-blue-500'
                      : 'bg-purple-600 hover:bg-purple-500'
                  }`}
                >
                  {running
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting…</>
                    : isSingle
                      ? <><Download className="w-3.5 h-3.5" /> Export {variants.length} file{variants.length !== 1 ? 's' : ''}</>
                      : <><Layers   className="w-3.5 h-3.5" /> Export ZIP</>
                  }
                </button>
              </div>
            </div>

    </Dialog>
  );
};

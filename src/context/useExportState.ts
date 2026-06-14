import { useState, useMemo, useCallback } from 'react';
import { UploadedImage, ResizeSettings } from '../types';
import {
  processImageOnCanvas, loadImage, computeTargetDims, downloadDataUrl, effectiveSourceUrl,
} from '../utils/imageProcessor';
import { useLocalStorage } from '../hooks/useLocalStorage';

export function useExportState(
  images: UploadedImage[],
  selectedImageId: string | null,
  settings: ResizeSettings,
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void,
) {
  const [exportSizeSelection, setExportSizeSelection] = useLocalStorage<'300' | '600' | '855' | '1000' | '1200' | 'custom' | 'preview'>('ir_export_size', '855');
  const [customExportSizeInput, setCustomExportSizeInput] = useLocalStorage<number>('ir_custom_size', 1500);
  const [isZipping, setIsZipping] = useState(false);

  const activeExportSize = useMemo(() => {
    if (exportSizeSelection === 'preview') return 'preview' as const;
    if (exportSizeSelection === 'custom') return Math.max(1, Math.min(10000, Math.round(customExportSizeInput) || 1));
    return Number(exportSizeSelection);
  }, [exportSizeSelection, customExportSizeInput]);

  const handleDownloadSingle = useCallback(async () => {
    const selectedImage = images.find(img => img.id === selectedImageId);
    if (!selectedImage) return;
    const format = settings.exportFormat;
    const saveName = `${selectedImage.name.substring(0, selectedImage.name.lastIndexOf('.')) || selectedImage.name}.${format}`;
    try {
      const imgElem = await loadImage(effectiveSourceUrl(selectedImage));
      const { width, height } = computeTargetDims(settings, activeExportSize);
      const url = await processImageOnCanvas(imgElem, settings, width, height, '', (w) => showToast(w, 'info'), selectedImage.id);
      downloadDataUrl(url, saveName);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Downloaded: ${saveName}`, 'success');
    } catch (e) {
      showToast('Error exporting image.', 'error');
    }
  }, [images, selectedImageId, settings, activeExportSize, showToast]);

  const handleDownloadZipWithSize = useCallback(async (targetSize: number | 'preview') => {
    if (images.length === 0) return;
    setIsZipping(true);
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    let failed = 0;
    try {
      const { width, height } = computeTargetDims(settings, targetSize);
      for (const item of images) {
        let blobUrl: string | null = null;
        try {
          const imgElem = await loadImage(effectiveSourceUrl(item));
          blobUrl = await processImageOnCanvas(imgElem, settings, width, height, '', (w) => showToast(w, 'info'), item.id);
          const blob = await (await fetch(blobUrl)).blob();
          const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
          zip.file(`${baseName}.${settings.exportFormat}`, blob);
        } catch (e) {
          console.error(`[zip] failed to process "${item.name}":`, e);
          failed++;
        } finally {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
        }
      }
      if (Object.keys(zip.files).length === 0) {
        showToast('All images failed to export — nothing to zip.', 'error');
        return;
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      const zipUrl = URL.createObjectURL(content);
      link.href = zipUrl;
      link.download = `exported_images.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
      showToast(
        failed > 0 ? `Exported ZIP — ${failed} image(s) skipped due to errors.` : 'Exported ZIP archive!',
        failed > 0 ? 'info' : 'success',
      );
    } catch (e) {
      showToast('Error packaging ZIP.', 'error');
    } finally {
      setIsZipping(false);
    }
  }, [images, settings, showToast]);

  return {
    exportSizeSelection, setExportSizeSelection,
    customExportSizeInput, setCustomExportSizeInput,
    activeExportSize, isZipping,
    handleDownloadSingle, handleDownloadZipWithSize,
  };
}

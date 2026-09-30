import { useState, useCallback, type DragEvent, type MouseEvent } from 'react';
import { UploadedImage } from '../types';
import { getSampleProducts } from '../utils/sampleImages';
import { revokeImageUrls } from '../utils/imageProcessor';

export function useImageQueue(showToast: (msg: string, type?: 'success' | 'error' | 'info') => void) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = useCallback((fileList: FileList) => {
    const files = Array.from(fileList);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const rejected = files.length - imageFiles.length;
    if (rejected > 0) showToast(`Discarded ${rejected} non-image file(s).`, 'error');
    if (imageFiles.length === 0) return;

    let settled = 0, succeeded = 0;
    const onSettled = () => {
      settled++;
      if (settled === imageFiles.length && succeeded > 0) showToast(`Imported ${succeeded} image(s).`, 'success');
    };

    imageFiles.forEach(file => {
      const originalUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const newItem: UploadedImage = {
          id: `uploaded-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          originalUrl,
          processedUrl: originalUrl,
          width: img.width,
          height: img.height,
          aspectRatio: img.width / img.height,
        };
        setImages(prev => [...prev, newItem]);
        // Select the first imported image only when nothing is selected yet.
        setSelectedImageId(cur => cur ?? newItem.id);
        succeeded++;
        onSettled();
      };
      img.onerror = () => {
        URL.revokeObjectURL(originalUrl);
        onSettled();
      };
      img.src = originalUrl;
    });
  }, [showToast]);

  const onDrag = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleRemoveImage = useCallback((id: string, e: MouseEvent) => {
    e.stopPropagation();
    const removed = images.find(img => img.id === id);
    if (!removed) return;
    revokeImageUrls(removed);
    const next = images.filter(img => img.id !== id);
    setImages(next);
    setSelectedImageId(cur => (cur === id ? (next[0]?.id ?? null) : cur));
  }, [images]);

  const handleClearAll = useCallback(() => {
    images.forEach(img => revokeImageUrls(img));
    setImages([]);
    setSelectedImageId(null);
  }, [images]);

  const handleLoadSingleTestProduct = useCallback(() => {
    const s = getSampleProducts()[0];
    const newItem = {
      id: `sample-test-${Date.now()}`,
      name: s.name, type: 'image/png', size: 15420,
      originalUrl: s.url, processedUrl: s.url,
      width: s.width, height: s.height, aspectRatio: s.width / s.height
    };
    images.forEach(img => revokeImageUrls(img)); // don't leak the blob URLs we're replacing
    setImages([newItem]);
    setSelectedImageId(newItem.id);
  }, [images]);

  const handleNextImage = useCallback(() => {
    if (images.length <= 1 || !selectedImageId) return;
    const currentIndex = images.findIndex(img => img.id === selectedImageId);
    setSelectedImageId(images[(currentIndex + 1) % images.length].id);
  }, [images, selectedImageId]);

  const handlePrevImage = useCallback(() => {
    if (images.length <= 1 || !selectedImageId) return;
    const currentIndex = images.findIndex(img => img.id === selectedImageId);
    setSelectedImageId(images[(currentIndex - 1 + images.length) % images.length].id);
  }, [images, selectedImageId]);

  // Reorder functionality
  const moveImage = useCallback((fromIndex: number, toIndex: number) => {
    setImages(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }, []);

  return {
    images, setImages,
    selectedImageId, setSelectedImageId,
    dragActive, setDragActive,
    handleFiles, onDrag, onDrop,
    handleRemoveImage, handleClearAll, handleLoadSingleTestProduct,
    handleNextImage, handlePrevImage, moveImage
  };
}

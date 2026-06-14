import { useState, useRef, useCallback } from 'react';

export function useUIState() {
  const [viewMode, setViewMode] = useState<'split' | 'single' | 'grid' | 'slider'>('split');
  const [currentTab, setCurrentTab] = useState<'editor' | 'sandbox'>('editor');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [modalBg, setModalBg] = useState<'checkerboard' | 'white' | 'gray' | 'dark' | 'cream'>('checkerboard');
  const [showAlignmentGrid, setShowAlignmentGrid] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const toastId = useRef(0);
  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = ++toastId.current;
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => (prev && toastId.current === id ? null : prev));
    }, 4500);
  }, []);

  return {
    viewMode, setViewMode,
    currentTab, setCurrentTab,
    isPreviewOpen, setIsPreviewOpen,
    modalBg, setModalBg,
    showAlignmentGrid, setShowAlignmentGrid,
    previewZoom, setPreviewZoom,
    toast, showToast,
    dragActive, setDragActive,
  };
}

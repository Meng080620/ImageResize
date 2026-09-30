import React, { useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { GripVertical } from 'lucide-react';

interface Props {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** checkerboard behind the "after" side when bg is removed */
  afterCheckerboard?: boolean;
}

export const BeforeAfterSlider: React.FC<Props> = ({
  before, after, beforeLabel = 'Before', afterLabel = 'After', afterCheckerboard = false,
}) => {
  const [pos, setPos] = useState(50); // percent
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updatePos = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    setPos(pct);
  }, []);

  // All pointer events on the container — click anywhere to jump, setPointerCapture routes drag
  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updatePos(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    updatePos(e.clientX);
  };

  const onPointerUp = () => { dragging.current = false; };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden rounded-2xl cursor-col-resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* After (full width, clipped on right) */}
      <div className={`absolute inset-0 ${afterCheckerboard ? 'checkerboard' : 'bg-white'}`}>
        <img src={after} alt="after" className="w-full h-full object-contain" draggable={false} />
      </div>

      {/* Before (clips from left) */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <div className="absolute inset-0 bg-elevated">
          <img src={before} alt="before" className="w-full h-full object-contain" draggable={false} />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 text-white text-[10px] font-semibold rounded-md backdrop-blur-sm pointer-events-none">
        {beforeLabel}
      </div>
      <div className="absolute top-3 right-3 px-2 py-1 bg-black/50 text-white text-[10px] font-semibold rounded-md backdrop-blur-sm pointer-events-none">
        {afterLabel}
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-px bg-white shadow-[0_0_8px_rgba(0,0,0,0.4)]"
        style={{ left: `${pos}%` }}
      />

      {/* Handle */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 pointer-events-none"
        style={{ left: `${pos}%` }}
      >
        <motion.div
          whileHover={{ scale: 1.1 }}
          className="w-9 h-9 rounded-full bg-white shadow-xl border border-white/30 flex items-center justify-center cursor-col-resize"
        >
          <GripVertical className="w-4 h-4 text-gray-600" />
        </motion.div>
      </div>
    </div>
  );
};

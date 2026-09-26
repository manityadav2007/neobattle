'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CropRegion } from '@/lib/services';
import { Crop, RotateCcw, Maximize2, Crosshair, Check, Sparkles } from 'lucide-react';

export const DEFAULT_KILL_FEED_CROP: CropRegion = {
  x: 10,
  y: 4,
  width: 80,
  height: 28,
  unit: 'percent',
};

interface ScreenRegionCropperProps {
  imageUrl: string;
  crop: CropRegion | null;
  onChange: (crop: CropRegion | null) => void;
  disabled?: boolean;
}

type DragMode = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | null;

export const ScreenRegionCropper: React.FC<ScreenRegionCropperProps> = ({
  imageUrl,
  crop,
  onChange,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    crop: CropRegion;
  } | null>(null);

  // Active crop (if null, defaults to full frame)
  const currentCrop = crop || { x: 0, y: 0, width: 100, height: 100, unit: 'percent' };
  const isFullFrame = crop === null;

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: DragMode
  ) => {
    if (disabled || isFullFrame) return;
    e.preventDefault();
    e.stopPropagation();

    // Capture initial state
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      crop: { ...currentCrop },
    };
    setDragMode(mode);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragMode || !dragStartRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const deltaXPercent = ((e.clientX - dragStartRef.current.clientX) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - dragStartRef.current.clientY) / rect.height) * 100;

      const start = dragStartRef.current.crop;
      let newX = start.x;
      let newY = start.y;
      let newWidth = start.width;
      let newHeight = start.height;

      const minSize = 6; // minimum 6% width/height

      if (dragMode === 'move') {
        newX = Math.max(0, Math.min(100 - start.width, start.x + deltaXPercent));
        newY = Math.max(0, Math.min(100 - start.height, start.y + deltaYPercent));
      } else {
        // Horizontal adjustments
        if (dragMode.includes('w')) {
          const maxLeftShift = start.width - minSize;
          const clampedDeltaX = Math.max(-start.x, Math.min(maxLeftShift, deltaXPercent));
          newX = start.x + clampedDeltaX;
          newWidth = start.width - clampedDeltaX;
        } else if (dragMode.includes('e')) {
          const maxRightExpansion = 100 - (start.x + start.width);
          const clampedDeltaX = Math.max(minSize - start.width, Math.min(maxRightExpansion, deltaXPercent));
          newWidth = start.width + clampedDeltaX;
        }

        // Vertical adjustments
        if (dragMode.includes('n')) {
          const maxTopShift = start.height - minSize;
          const clampedDeltaY = Math.max(-start.y, Math.min(maxTopShift, deltaYPercent));
          newY = start.y + clampedDeltaY;
          newHeight = start.height - clampedDeltaY;
        } else if (dragMode.includes('s')) {
          const maxBottomExpansion = 100 - (start.y + start.height);
          const clampedDeltaY = Math.max(minSize - start.height, Math.min(maxBottomExpansion, deltaYPercent));
          newHeight = start.height + clampedDeltaY;
        }
      }

      onChange({
        x: Math.round(newX * 10) / 10,
        y: Math.round(newY * 10) / 10,
        width: Math.round(newWidth * 10) / 10,
        height: Math.round(newHeight * 10) / 10,
        unit: 'percent',
      });
    },
    [dragMode, onChange]
  );

  const handlePointerUp = useCallback(() => {
    setDragMode(null);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    if (dragMode) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [dragMode, handlePointerMove, handlePointerUp]);

  const handleResetToDefault = () => {
    onChange({ ...DEFAULT_KILL_FEED_CROP });
  };

  const handleToggleFullFrame = () => {
    if (isFullFrame) {
      onChange({ ...DEFAULT_KILL_FEED_CROP });
    } else {
      onChange(null);
    }
  };

  // Saved token / pixel ratio estimate
  const areaPercent = isFullFrame ? 100 : Math.round((currentCrop.width * currentCrop.height) / 100);
  const tokenSaving = Math.max(0, 100 - areaPercent);

  return (
    <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 shadow-xl space-y-3">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400">
            <Crop className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              Screen Region Selection
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-normal">
                {isFullFrame ? 'Full Frame' : 'Kill-Feed Crop'}
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Drag & resize to focus Gemini solely on the kill-feed banner.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleResetToDefault}
            disabled={disabled}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors"
            title="Reset crop to top kill-feed area"
          >
            <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
            Reset Selection
          </button>

          <button
            type="button"
            onClick={handleToggleFullFrame}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              isFullFrame
                ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            {isFullFrame ? 'Crop Active' : 'Full Frame (No Crop)'}
          </button>
        </div>
      </div>

      {/* Interactive Crop Canvas Viewport */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-lg bg-black select-none border border-slate-800 touch-none"
        style={{ aspectRatio: '16/9' }}
      >
        {/* Preview Frame */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Video Preview Frame"
          className="w-full h-full object-contain pointer-events-none"
          draggable={false}
        />

        {/* Shaded Backdrop Overlays (When Crop is active) */}
        {!isFullFrame && (
          <>
            {/* Top mask */}
            <div
              className="absolute left-0 right-0 top-0 bg-black/65 pointer-events-none transition-all"
              style={{ height: `${currentCrop.y}%` }}
            />
            {/* Bottom mask */}
            <div
              className="absolute left-0 right-0 bottom-0 bg-black/65 pointer-events-none transition-all"
              style={{ height: `${100 - (currentCrop.y + currentCrop.height)}%` }}
            />
            {/* Left mask */}
            <div
              className="absolute bg-black/65 pointer-events-none transition-all"
              style={{
                top: `${currentCrop.y}%`,
                left: 0,
                width: `${currentCrop.x}%`,
                height: `${currentCrop.height}%`,
              }}
            />
            {/* Right mask */}
            <div
              className="absolute bg-black/65 pointer-events-none transition-all"
              style={{
                top: `${currentCrop.y}%`,
                right: 0,
                width: `${100 - (currentCrop.x + currentCrop.width)}%`,
                height: `${currentCrop.height}%`,
              }}
            />

            {/* Draggable & Resizable Selection Rectangle */}
            <div
              className="absolute border-2 border-amber-400 bg-amber-400/10 cursor-move transition-shadow hover:shadow-lg hover:shadow-amber-500/30"
              style={{
                left: `${currentCrop.x}%`,
                top: `${currentCrop.y}%`,
                width: `${currentCrop.width}%`,
                height: `${currentCrop.height}%`,
              }}
              onPointerDown={(e) => handlePointerDown(e, 'move')}
            >
              {/* Rule of thirds faint guidelines */}
              <div className="w-full h-full relative pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>

              {/* Tag indicator */}
              <div className="absolute top-1 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500 text-black text-[10px] font-bold shadow pointer-events-none">
                <Crosshair className="w-2.5 h-2.5" />
                <span>KILL FEED AREA</span>
              </div>

              {/* 8 Resize Handles */}
              {/* Corners */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'nw')}
                className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-amber-500 rounded-sm cursor-nw-resize shadow-md hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, 'ne')}
                className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-amber-500 rounded-sm cursor-ne-resize shadow-md hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, 'sw')}
                className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-amber-500 rounded-sm cursor-sw-resize shadow-md hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, 'se')}
                className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-amber-500 rounded-sm cursor-se-resize shadow-md hover:scale-125 transition-transform"
              />

              {/* Edges */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'n')}
                className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-amber-400 rounded-full cursor-n-resize hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, 's')}
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-amber-400 rounded-full cursor-s-resize hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, 'w')}
                className="absolute top-1/2 -left-1 -translate-y-1/2 h-6 w-2 bg-amber-400 rounded-full cursor-w-resize hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, 'e')}
                className="absolute top-1/2 -right-1 -translate-y-1/2 h-6 w-2 bg-amber-400 rounded-full cursor-e-resize hover:scale-125 transition-transform"
              />
            </div>
          </>
        )}
      </div>

      {/* Coordinate & Efficiency Readout Footer */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 gap-2">
        <div className="flex items-center gap-3">
          {isFullFrame ? (
            <span className="text-slate-300">
              Full frame mode (100% video resolution sent to Gemini).
            </span>
          ) : (
            <div className="font-mono text-slate-300 flex items-center gap-2">
              <span className="text-amber-400 font-semibold">Region:</span>
              <span>X: {currentCrop.x}%</span>
              <span>•</span>
              <span>Y: {currentCrop.y}%</span>
              <span>•</span>
              <span>W: {currentCrop.width}%</span>
              <span>•</span>
              <span>H: {currentCrop.height}%</span>
            </div>
          )}
        </div>

        {!isFullFrame && (
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Reduces Gemini token payload by ~{tokenSaving}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

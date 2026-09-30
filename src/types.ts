/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UploadedImage {
  id: string;
  name: string;
  type: string;
  size: number;
  originalUrl: string; // Object URL for original image (pristine upload — never mutated)
  processedUrl: string; // Object URL for processed preview
  width: number;
  height: number;
  aspectRatio: number;
  cutoutUrl?: string;   // Transparent-background version (blob URL), computed on demand
  bgRemoved?: boolean;  // Active toggle: pipeline reads cutoutUrl. Independent of upscaled.
  upscaledUrl?: string; // AI super-resolution version (blob URL), computed on demand
  upscaled?: boolean;   // Active toggle: pipeline reads upscaledUrl (unless bgRemoved wins).
  // State machine: bgRemoved wins over upscaled in effectiveSourceUrl. Both flags can be true
  // simultaneously (cutout was computed from the upscaled source). Separate booleans are correct
  // because they represent independent "is-active" toggles while the URL fields store computed results.
}

export type AspectRatioType = '1:1' | '4:3' | '3:4' | '16:9' | 'custom';

export type FitMode = 'contain' | 'cover' | 'stretch';

export type BackgroundStyle = 'solid' | 'transparent' | 'auto' | 'blurred';

export interface ResizeSettings {
  aspectRatioType: AspectRatioType;
  customWidth: number;
  customHeight: number;
  fitMode: FitMode;
  padding: number; // percentage (0-100)
  backgroundColor: string; // solid bg color hex
  bgStyle: BackgroundStyle;
  alignment: 'center' | 'top' | 'bottom' | 'left' | 'right';
  exportFormat: 'jpeg' | 'png' | 'webp';
  exportQuality: number; // 0.1 to 1.0 (for jpeg/webp)
  upscaleSmallImages: boolean; // Scale small images up to fill full box
  trimProductMargins: boolean; // Auto trim white/transparent margins from input product image
  // Quality enhancement (applied to the product only, at draw size):
  brightness: number; // percent, 100 = unchanged
  contrast: number;   // percent, 100 = unchanged
  saturation: number; // percent, 100 = unchanged
  sharpen: number;    // 0–100 unsharp-mask amount, 0 = off
  autoCenter: boolean; // Auto-detect center of mass and align it
  shadowType: 'none' | 'soft' | 'medium' | 'hard' | 'glow' | 'custom';
  shadowPlacement: 'outset' | 'inset';
  shadowSpread: number; // -50 to 100
  shadowBlur: number; // 0 to 100
  shadowOffsetX: number; // -100 to 100
  shadowOffsetY: number; // -100 to 100
  shadowOpacity: number; // 0 to 1
  shadowColor: string; // Hex color or rgba
}

export interface ImageAnalysis extends UploadedImage {
  issues: string[];
  hasIssue: boolean;
  isDone: boolean;
}

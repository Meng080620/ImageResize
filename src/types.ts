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
  cutoutUrl?: string; // Transparent-background version (blob URL), computed on demand
  bgRemoved?: boolean; // When true, the resize pipeline reads from cutoutUrl instead of originalUrl
  upscaledUrl?: string; // AI super-resolution version (blob URL), computed on demand
  upscaled?: boolean; // When true, the pipeline reads from upscaledUrl instead of originalUrl
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

export const ASPECT_RATIOS = {
  '1:1': { label: 'Square (1:1)', ratio: 1, desc: 'WooCommerce, Shopify standard' },
  '4:3': { label: 'Standard (4:3)', ratio: 4 / 3, desc: 'Digital products, listings' },
  '3:4': { label: 'Portrait (3:4)', ratio: 3 / 4, desc: 'Fashion, clothes, apparel' },
  '16:9': { label: 'Landscape (16:9)', ratio: 16 / 9, desc: 'Banners, hero cards' },
  'custom': { label: 'Custom Dimension', ratio: 1, desc: 'Enter custom pixels' },
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UploadedImage {
  id: string;
  name: string;
  type: string;
  size: number;
  originalUrl: string; // Object URL for original image
  processedUrl: string; // Object URL for processed preview
  width: number;
  height: number;
  aspectRatio: number;
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
}

export const ASPECT_RATIOS = {
  '1:1': { label: 'Square (1:1)', ratio: 1, desc: 'WooCommerce, Shopify standard' },
  '4:3': { label: 'Standard (4:3)', ratio: 4 / 3, desc: 'Digital products, listings' },
  '3:4': { label: 'Portrait (3:4)', ratio: 3 / 4, desc: 'Fashion, clothes, apparel' },
  '16:9': { label: 'Landscape (16:9)', ratio: 16 / 9, desc: 'Banners, hero cards' },
  'custom': { label: 'Custom Dimension', ratio: 1, desc: 'Enter custom pixels' },
};

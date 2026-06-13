/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeTargetDims, shouldRevokeProcessedUrl, effectiveSourceUrl, revokeImageUrls } from './imageProcessor';
import type { ResizeSettings, UploadedImage } from '../types';

type Dims = Pick<ResizeSettings, 'aspectRatioType' | 'customWidth' | 'customHeight'>;

const dims = (
  aspectRatioType: ResizeSettings['aspectRatioType'],
  customWidth = 1000,
  customHeight = 1000
): Dims => ({ aspectRatioType, customWidth, customHeight });

describe('computeTargetDims', () => {
  // Core invariant: a single image exported at a chosen boundary must keep its
  // aspect ratio and hit that boundary — the contract bug #1 violated when the
  // size selector silently fell back to the 800px preview.
  it('1:1 export fills the full target boundary', () => {
    expect(computeTargetDims(dims('1:1'), 1200)).toEqual({ width: 1200, height: 1200 });
  });

  it('4:3 export keeps a 4:3 ratio', () => {
    expect(computeTargetDims(dims('4:3'), 1200)).toEqual({ width: 1200, height: 900 });
  });

  it('3:4 export keeps a 3:4 ratio', () => {
    expect(computeTargetDims(dims('3:4'), 1200)).toEqual({ width: 900, height: 1200 });
  });

  it('16:9 export keeps a 16:9 ratio', () => {
    expect(computeTargetDims(dims('16:9'), 1200)).toEqual({ width: 1200, height: 675 });
  });

  it('custom scales the longer edge to the target boundary', () => {
    // 2000×1000 source, longer edge → 1200, shorter edge proportional.
    expect(computeTargetDims(dims('custom', 2000, 1000), 1200)).toEqual({ width: 1200, height: 600 });
    // portrait custom: longer edge is height.
    expect(computeTargetDims(dims('custom', 1000, 2000), 1200)).toEqual({ width: 600, height: 1200 });
  });

  it('preview returns the capped base dimensions regardless of export size', () => {
    expect(computeTargetDims(dims('1:1'), 'preview')).toEqual({ width: 800, height: 800 });
    expect(computeTargetDims(dims('4:3'), 'preview')).toEqual({ width: 800, height: 600 });
    expect(computeTargetDims(dims('16:9'), 'preview')).toEqual({ width: 800, height: 450 });
  });

  it('preview falls back to 800 when custom dimensions are missing/zero', () => {
    expect(computeTargetDims(dims('custom', 0, 0), 'preview')).toEqual({ width: 800, height: 800 });
  });
});

describe('shouldRevokeProcessedUrl', () => {
  // The leak fix: every settings change mints a new processed blob URL and the
  // old one must be freed. These guards stop the free from blanking a live image.
  it('revokes a stale processed blob that is being replaced', () => {
    expect(shouldRevokeProcessedUrl('blob:old', 'blob:original', 'blob:new')).toBe(true);
  });

  it('never revokes the image original (first render: processed === original)', () => {
    // On first process, the old processedUrl is still a copy of originalUrl.
    expect(shouldRevokeProcessedUrl('blob:original', 'blob:original', 'blob:new')).toBe(false);
  });

  it('never revokes a remote (sample) URL — only blob: URLs are ours to free', () => {
    expect(shouldRevokeProcessedUrl('https://cdn/sample.png', 'https://cdn/sample.png', 'blob:new')).toBe(false);
  });

  it('skips a no-op replace where old and new are the same URL', () => {
    expect(shouldRevokeProcessedUrl('blob:same', 'blob:original', 'blob:same')).toBe(false);
  });
});

describe('effectiveSourceUrl', () => {
  // Precedence is where the non-destructive toggles compose. Getting this wrong
  // means an enabled toggle silently reads the wrong source.
  type Src = Pick<UploadedImage, 'originalUrl' | 'cutoutUrl' | 'bgRemoved' | 'upscaledUrl' | 'upscaled'>;
  const src = (o: Partial<Src> = {}): Src => ({ originalUrl: 'blob:orig', ...o });

  it('falls back to the original when nothing is toggled', () => {
    expect(effectiveSourceUrl(src())).toBe('blob:orig');
  });

  it('reads the upscaled source when upscale is on', () => {
    expect(effectiveSourceUrl(src({ upscaled: true, upscaledUrl: 'blob:up' }))).toBe('blob:up');
  });

  it('reads the cutout when background removal is on', () => {
    expect(effectiveSourceUrl(src({ bgRemoved: true, cutoutUrl: 'blob:cut' }))).toBe('blob:cut');
  });

  it('cutout wins over upscale when both are on (cutout is computed from the upscaled source)', () => {
    const img = src({ bgRemoved: true, cutoutUrl: 'blob:cut', upscaled: true, upscaledUrl: 'blob:up' });
    expect(effectiveSourceUrl(img)).toBe('blob:cut');
  });

  it('ignores a stale url when its flag is off', () => {
    expect(effectiveSourceUrl(src({ upscaled: false, upscaledUrl: 'blob:up' }))).toBe('blob:orig');
    expect(effectiveSourceUrl(src({ bgRemoved: false, cutoutUrl: 'blob:cut' }))).toBe('blob:orig');
  });
});

describe('revokeImageUrls', () => {
  afterEach(() => vi.restoreAllMocks());

  type Owned = Pick<UploadedImage, 'originalUrl' | 'processedUrl' | 'cutoutUrl' | 'upscaledUrl'>;
  const revoked = () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    return spy;
  };

  it('frees the upscaled blob along with original/processed/cutout', () => {
    const spy = revoked();
    const img: Owned = {
      originalUrl: 'blob:orig',
      processedUrl: 'blob:proc',
      cutoutUrl: 'blob:cut',
      upscaledUrl: 'blob:up',
    };
    revokeImageUrls(img);
    expect(spy.mock.calls.map(c => c[0]).sort()).toEqual(['blob:cut', 'blob:orig', 'blob:proc', 'blob:up']);
  });

  it('does not free a processed url still aliasing the upscaled source', () => {
    const spy = revoked();
    const img: Owned = {
      originalUrl: 'blob:orig',
      processedUrl: 'blob:up', // preview is showing the upscaled source directly
      upscaledUrl: 'blob:up',
    };
    revokeImageUrls(img);
    const calls = spy.mock.calls.map(c => c[0]);
    // 'blob:up' freed once (as upscaledUrl), never twice via the processed alias.
    expect(calls.filter(u => u === 'blob:up')).toHaveLength(1);
  });

  it('ignores remote (non-blob) urls', () => {
    const spy = revoked();
    revokeImageUrls({ originalUrl: 'https://cdn/o.png', processedUrl: 'https://cdn/p.png' });
    expect(spy).not.toHaveBeenCalled();
  });
});

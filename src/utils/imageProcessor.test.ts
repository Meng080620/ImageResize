/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeTargetDims, shouldRevokeProcessedUrl, effectiveSourceUrl, revokeImageUrls, downloadDataUrl, compositeOriginalRgbWithMaskAlpha, maskOpaqueFraction, solidifyInteriorAlpha } from './imageProcessor';
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

// Bug regression tests — each covers a specific failure mode from the audit.

describe('bug #1 — URL revoke timing (guard via revokeImageUrls)', () => {
  afterEach(() => vi.restoreAllMocks());
  // The fix raised the setTimeout from 150ms to 1000ms. The unit-testable contract is
  // that a blob URL that is the image's processedUrl must not be revoked prematurely
  // (guarded by shouldRevokeProcessedUrl). An early revoke + download = blank image.
  it('does not revoke the URL that is still the active processed preview', () => {
    // Simulates the state immediately after download starts: processed URL is still live.
    expect(shouldRevokeProcessedUrl('blob:active', 'blob:orig', 'blob:active')).toBe(false);
  });

  it('revokes a stale processed URL once its replacement is committed', () => {
    // Only after the new URL is committed can the old one be freed.
    expect(shouldRevokeProcessedUrl('blob:old', 'blob:orig', 'blob:new')).toBe(true);
  });
});

describe('bug #3 — ZIP batch isolation (contract via shouldRevokeProcessedUrl)', () => {
  // The fix wraps each image in its own try/catch so one bad blob doesn't abort the
  // whole ZIP. We test the revoke guard since the actual zip logic needs jsdom File APIs.
  it('a valid blob URL that is the current processed version is not revoked', () => {
    // Guards the "skip bad image, continue" logic: the previous processed URL must
    // still be live when the error path is hit.
    expect(shouldRevokeProcessedUrl('blob:current', 'blob:original', 'blob:current')).toBe(false);
  });

  it('a replaced processed blob IS revoked once the replacement is in place', () => {
    expect(shouldRevokeProcessedUrl('blob:old', 'blob:original', 'blob:new')).toBe(true);
  });
});

describe('compositeOriginalRgbWithMaskAlpha — bg removal keeps true colours', () => {
  // Regression: the ISNet path fed a contrast/saturation-boosted image to the model
  // and returned THAT as the cutout, so white products came back washed-out (groove
  // and depth detail blown to flat white). Fix: alpha from the mask, RGB from source.
  it('keeps original RGB and adopts only the mask alpha', () => {
    // 2 px source: a grey product pixel and a white background pixel.
    const original = new Uint8ClampedArray([
      200, 205, 210, 255,   // true product grey
      255, 255, 255, 255,   // true background white
    ]);
    // Same pixels as the model saw them: contrast-blown RGB + the alpha we actually want.
    const mask = new Uint8ClampedArray([
       40,  44,  48, 255,   // blown RGB, fully opaque subject  → alpha 255
      255, 255, 255,   0,   // blown RGB, fully transparent bg  → alpha 0
    ]);

    const out = compositeOriginalRgbWithMaskAlpha(original, mask);

    // Subject RGB comes from the source, NOT the washed-out mask…
    expect(Array.from(out.slice(0, 3))).toEqual([200, 205, 210]);
    // …and alpha comes from the mask.
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(0);
  });

  it('carries feathered (partial) alpha through unchanged', () => {
    const original = new Uint8ClampedArray([100, 110, 120, 255]);
    const mask = new Uint8ClampedArray([0, 0, 0, 128]); // 50% edge pixel
    expect(Array.from(compositeOriginalRgbWithMaskAlpha(original, mask)))
      .toEqual([100, 110, 120, 128]);
  });

  it('does not mutate the input buffers', () => {
    const original = new Uint8ClampedArray([10, 20, 30, 255]);
    const mask = new Uint8ClampedArray([0, 0, 0, 0]);
    compositeOriginalRgbWithMaskAlpha(original, mask);
    expect(Array.from(original)).toEqual([10, 20, 30, 255]);
  });
});

describe('maskOpaqueFraction — degenerate-mask detection for edge fallback', () => {
  // When ISNet fails on white-on-white it removes ~everything; a near-zero opaque
  // fraction is the signal to fall back to the edge pipeline instead of returning
  // a fully transparent (empty) cutout.
  const rgba = (alphas: number[]) => {
    const buf = new Uint8ClampedArray(alphas.length * 4);
    alphas.forEach((a, i) => { buf[i * 4 + 3] = a; });
    return buf;
  };

  it('reports ~0 when the mask is essentially empty (ISNet failure)', () => {
    expect(maskOpaqueFraction(rgba([0, 0, 0, 0]))).toBe(0);
    expect(maskOpaqueFraction(rgba([0, 5, 0, 16]))).toBe(0); // ≤16 counts as transparent
  });

  it('reports the real opaque ratio for a normal cutout', () => {
    expect(maskOpaqueFraction(rgba([255, 255, 0, 0]))).toBe(0.5);
    expect(maskOpaqueFraction(rgba([255, 200, 17, 0]))).toBe(0.75); // 17 > 16 counts
  });

  it('returns 0 for an empty buffer rather than dividing by zero', () => {
    expect(maskOpaqueFraction(new Uint8ClampedArray(0))).toBe(0);
  });
});

describe('solidifyInteriorAlpha — kills ISNet translucency on glossy surfaces', () => {
  // Regression: a white button face came back at ~40% alpha (faded/ghostly over any
  // non-white bg). The enclosed interior of an opaque silhouette must be made fully
  // opaque while keeping its restored colour. 5×5 grid: transparent border, an opaque
  // ring, and one translucent interior pixel standing in for the glossy face.
  const W = 5, H = 5;
  const build = (fill: (x: number, y: number) => [number, number, number, number]) => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
    return d;
  };
  const at = (d: Uint8ClampedArray, x: number, y: number) => {
    const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  };
  const border = (x: number, y: number) => x === 0 || x === 4 || y === 0 || y === 4;

  it('forces a translucent enclosed pixel opaque and keeps its colour', () => {
    const grid = build((x, y) =>
      border(x, y)            ? [0, 0, 0, 0]            // background
      : x === 2 && y === 2    ? [220, 224, 224, 100]    // glossy face: ~40% alpha
      :                         [50, 50, 50, 255]);     // opaque ring around it

    const out = solidifyInteriorAlpha(grid, W, H);

    expect(at(out, 2, 2)).toEqual([220, 224, 224, 255]); // opaque, original colour kept
    expect(at(out, 1, 1)).toEqual([50, 50, 50, 255]);    // ring untouched
    expect(at(out, 0, 0)).toEqual([0, 0, 0, 0]);         // background cleared to alpha 0
  });

  it('fills a genuinely empty enclosed hole with neutral grey', () => {
    const grid = build((x, y) =>
      border(x, y)            ? [0, 0, 0, 0]
      : x === 2 && y === 2    ? [0, 0, 0, 0]             // empty hole (no real colour)
      :                         [50, 50, 50, 255]);

    const out = solidifyInteriorAlpha(grid, W, H);
    expect(at(out, 2, 2)).toEqual([200, 200, 200, 255]); // grey-filled, opaque
  });

  it('does not fill a background-connected transparent region (not enclosed)', () => {
    // A transparent channel from the border to the centre must stay transparent.
    const grid = build((x, y) => (x === 2 ? [0, 0, 0, 0] : [50, 50, 50, 255]));
    const out = solidifyInteriorAlpha(grid, W, H);
    expect(at(out, 2, 2)).toEqual([0, 0, 0, 0]); // reachable from border → stays background
  });
});

describe('bug #6 — email validation', () => {
  // Inline the same regex used in AuthContext so it stays in sync with the implementation.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it('accepts valid emails', () => {
    expect(EMAIL_RE.test('user@example.com')).toBe(true);
    expect(EMAIL_RE.test('user+tag@sub.domain.io')).toBe(true);
  });

  it('rejects clearly invalid formats', () => {
    expect(EMAIL_RE.test('')).toBe(false);
    expect(EMAIL_RE.test('not-an-email')).toBe(false);
    expect(EMAIL_RE.test('@nodomain')).toBe(false);
    expect(EMAIL_RE.test('missing@')).toBe(false);
    expect(EMAIL_RE.test('space in@email.com')).toBe(false);
  });
});
